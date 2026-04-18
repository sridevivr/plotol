// Enrichment waterfall.
//
// For each record:
//   1. firmographics: try Apollo, fall back to Ocean.io.
//   2. tech stack: BuiltWith.
//   3. person: Proxycurl, scoped to the role title from the posting.
//
// Each call writes a TraceEntry. Misses do not throw — they degrade the
// record's confidence and downstream stages decide whether to proceed.

import { PipelineRecord, newTraceEntry } from "../types.js";
import { apolloEnrich } from "./sources/apollo.js";
import { oceanioEnrich } from "./sources/oceanio.js";
import { builtwithEnrich } from "./sources/builtwith.js";
import { proxycurlFindLeader } from "./sources/proxycurl.js";

const HEAD_OF_DATA = /head of data|vp,?\s+data|director,?\s+(of\s+)?data/i;

export async function enrichRecord(record: PipelineRecord): Promise<PipelineRecord> {
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

  // 2. tech stack
  const stackStarted = Date.now();
  const stack = await builtwithEnrich(domain);
  if (stack.ok && stack.tech_stack) {
    record.tech_stack = stack.tech_stack;
    record.trace.push(
      newTraceEntry("enrichment.tech_stack", "ok", "builtwith", {
        duration_ms: Date.now() - stackStarted,
        cost_usd: stack.cost_usd,
      }),
    );
  } else {
    record.trace.push(
      newTraceEntry("enrichment.tech_stack", "skipped", stack.reason ?? "miss"),
    );
  }

  // 3. person
  const personStarted = Date.now();
  const person = await proxycurlFindLeader(domain, HEAD_OF_DATA);
  if (person.ok && person.person) {
    record.person = person.person;
    record.trace.push(
      newTraceEntry("enrichment.person", "ok", "proxycurl", {
        duration_ms: Date.now() - personStarted,
        cost_usd: person.cost_usd,
      }),
    );
  } else {
    record.trace.push(
      newTraceEntry("enrichment.person", "skipped", person.reason ?? "miss"),
    );
  }

  return record;
}

export async function enrichAll(records: PipelineRecord[]): Promise<PipelineRecord[]> {
  // Run in parallel but cap concurrency to be polite to the upstream APIs.
  const concurrency = 5;
  const out: PipelineRecord[] = [];
  let i = 0;
  while (i < records.length) {
    const batch = records.slice(i, i + concurrency);
    const enriched = await Promise.all(batch.map(enrichRecord));
    out.push(...enriched);
    i += concurrency;
  }
  return out;
}
