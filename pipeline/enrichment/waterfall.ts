// Enrichment waterfall.
//
// For each record:
//   1. firmographics: try Apollo, fall back to Ocean.io.
//   2. labor-tech stack: BuiltWith (WFM / HRIS / scheduling).
//   3. person: Proxycurl, scoped to the workforce-planning champion.
//
// Each call writes a TraceEntry. Misses do not throw — they degrade the
// record's confidence and downstream stages decide whether to proceed.

import { PipelineRecord, newTraceEntry } from "../types.js";
import { apolloEnrich } from "./sources/apollo.js";
import { oceanioEnrich } from "./sources/oceanio.js";
import { builtwithEnrich } from "./sources/builtwith.js";
import { ProxycurlBudget, proxycurlFindLeader } from "./sources/proxycurl.js";

// Champion role candidates, in priority order. Proxycurl takes literal role
// strings (not regex). We try them top-down and stop on the first match.
const CHAMPION_ROLES = [
  "Director of Workforce Planning",
  "VP of Workforce Planning",
  "Head of Workforce Planning",
  "Director of Labor Planning",
  "Director of Store Operations",
  "Director of Retail Operations",
  "Head of Talent Acquisition",
];

export async function enrichRecord(
  record: PipelineRecord,
  budget?: ProxycurlBudget,
): Promise<PipelineRecord> {
  const domain = record.posting.company_domain;

  // 1. firmographics with fallback
  const firmoStarted = Date.now();
  const apollo = await apolloEnrich(domain);
  if (apollo.ok && apollo.firmographics) {
    record.firmographics = apollo.firmographics;
    record.trace.push(
      newTraceEntry("enrichment.firmographics", "ok", "apollo", {
        duration_ms: Date.now() - firmoStarted,
        cost_usd: apollo.cost_usd,
      }),
    );
  } else {
    const ocean = await oceanioEnrich(domain);
    if (ocean.ok && ocean.firmographics) {
      record.firmographics = ocean.firmographics;
      record.trace.push(
        newTraceEntry("enrichment.firmographics", "fallback", "oceanio", {
          duration_ms: Date.now() - firmoStarted,
          cost_usd: ocean.cost_usd,
        }),
      );
    } else {
      record.trace.push(
        newTraceEntry(
          "enrichment.firmographics",
          "skipped",
          `apollo=${apollo.reason ?? "miss"} oceanio=${ocean.reason ?? "miss"}`,
        ),
      );
    }
  }

  // 2. labor-tech stack
  const stackStarted = Date.now();
  const stack = await builtwithEnrich(domain);
  if (stack.ok && stack.labor_tech_stack) {
    record.labor_tech_stack = stack.labor_tech_stack;
    record.trace.push(
      newTraceEntry("enrichment.labor_tech_stack", "ok", "builtwith", {
        duration_ms: Date.now() - stackStarted,
        cost_usd: stack.cost_usd,
      }),
    );
  } else {
    record.trace.push(
      newTraceEntry("enrichment.labor_tech_stack", "skipped", stack.reason ?? "miss"),
    );
  }

  // 3. person
  const personStarted = Date.now();
  const person = await proxycurlFindLeader({
    company_name: record.posting.company_name,
    domain,
    roles: CHAMPION_ROLES,
    budget,
  });
  if (person.ok && person.person) {
    record.person = person.person;
    record.trace.push(
      newTraceEntry(
        "enrichment.person",
        "ok",
        `proxycurl tried=${person.roles_tried ?? "?"}`,
        {
          duration_ms: Date.now() - personStarted,
          cost_usd: person.cost_usd,
        },
      ),
    );
  } else {
    record.trace.push(
      newTraceEntry(
        "enrichment.person",
        "skipped",
        `${person.reason ?? "miss"} (tried=${person.roles_tried ?? 0})`,
        { cost_usd: person.cost_usd },
      ),
    );
  }

  return record;
}

export async function enrichAll(records: PipelineRecord[]): Promise<PipelineRecord[]> {
  // Run in parallel but cap concurrency to be polite to the upstream APIs.
  const concurrency = 5;
  const out: PipelineRecord[] = [];
  let i = 0;

  // Per-run Proxycurl call budget. Shared across every record so a single
  // pipeline run cannot exceed PROXYCURL_MAX_CALLS HTTP calls regardless of
  // how many records came out of signal.
  const budget: ProxycurlBudget = {
    remaining: Number(process.env.PROXYCURL_MAX_CALLS ?? 50),
  };

  while (i < records.length) {
    const batch = records.slice(i, i + concurrency);
    const enriched = await Promise.all(batch.map((r) => enrichRecord(r, budget)));
    out.push(...enriched);
    i += concurrency;
  }
  return out;
}
