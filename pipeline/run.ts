// End-to-end pipeline driver.
//
// Stages:
//   1. signal     — Greenhouse + Lever postings -> records
//   2. enrichment — waterfall over firmographics + tech-stack + person
//   3. research   — call Python research service per record (HTTP)
//   4. scoring    — transparent rubric over each record
//   5. personalization — call Python draft service per record (HTTP)
//   6. crm        — push to HubSpot sandbox
//   7. report     — emit a static weekly HTML
//
// The research and personalization steps call the Python service over HTTP
// (default http://localhost:8000). When that service is not running, the
// stages are skipped and traced; downstream stages handle the missing fields.

import "dotenv/config";
import { request } from "undici";
import { ingestSignals } from "./signal/index.js";
import { enrichAll } from "./enrichment/waterfall.js";
import { scoreRecord } from "./scoring/rubric.js";
import { pushRecord } from "./crm/hubspot.js";
import { PipelineRecord, newTraceEntry } from "./types.js";
import { writeReport } from "../reports/build.js";
import { appendTrace } from "../observability/trace.js";

const PYTHON_SVC = process.env.SIGNALFORGE_PY_URL ?? "http://localhost:8000";

async function main() {
  const t0 = Date.now();

  console.log("[1/7] signal: ingesting postings");
  const ingested = await ingestSignals();
  console.log(`      ${ingested.length} candidate postings`);

  console.log("[2/7] enrichment: running waterfall");
  const enriched = await enrichAll(ingested);

  console.log("[3/7] research: calling agent");
  const researched = await Promise.all(enriched.map(callResearch));

  console.log("[4/7] scoring");
  for (const r of researched) {
    r.score = scoreRecord(r);
  }

  console.log("[5/7] personalization: drafting outreach");
  const drafted = await Promise.all(researched.map(callPersonalization));

  // Sort by score, top 10 advance to CRM + report.
  drafted.sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
  const top = drafted.slice(0, 10);

  console.log(`[6/7] crm: pushing ${top.length} records to HubSpot`);
  for (const r of top) {
    await pushRecord(r);
  }

  console.log("[7/7] report: writing weekly HTML");
  const reportPath = await writeReport(top);
  console.log(`      wrote ${reportPath}`);

  // Persist the full trace for every record (observability layer).
  for (const r of drafted) {
    appendTrace(r);
  }

  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function callResearch(r: PipelineRecord): Promise<PipelineRecord> {
  const started = Date.now();
  try {
    const res = await request(`${PYTHON_SVC}/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ record: r }),
    });
    if (res.statusCode !== 200) {
      r.trace.push(newTraceEntry("research", "skipped", `http ${res.statusCode}`));
      return r;
    }
    const body = (await res.body.json()) as {
      research?: PipelineRecord["research"];
      cost_usd?: number;
    };
    if (body.research) r.research = body.research;
    r.trace.push(
      newTraceEntry("research", "ok", undefined, {
        duration_ms: Date.now() - started,
        cost_usd: body.cost_usd,
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    r.trace.push(newTraceEntry("research", "skipped", msg));
  }
  return r;
}

async function callPersonalization(r: PipelineRecord): Promise<PipelineRecord> {
  if (!r.research) {
    r.trace.push(newTraceEntry("personalization", "skipped", "no research brief"));
    return r;
  }
  const started = Date.now();
  try {
    const res = await request(`${PYTHON_SVC}/personalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ record: r }),
    });
    if (res.statusCode !== 200) {
      r.trace.push(newTraceEntry("personalization", "skipped", `http ${res.statusCode}`));
      return r;
    }
    const body = (await res.body.json()) as {
      draft?: PipelineRecord["draft"];
      cost_usd?: number;
    };
    if (body.draft) r.draft = body.draft;
    r.trace.push(
      newTraceEntry("personalization", "ok", undefined, {
        duration_ms: Date.now() - started,
        cost_usd: body.cost_usd,
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    r.trace.push(newTraceEntry("personalization", "skipped", msg));
  }
  return r;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
