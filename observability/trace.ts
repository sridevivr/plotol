// Per-record trace persistence.
//
// Appends one JSON line per record to a daily file under
// observability/traces/YYYY-MM-DD.jsonl. Each line is the full PipelineRecord
// — verbose on purpose. v1.1 will move this into DuckDB so the dashboard can
// query it.

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { PipelineRecord } from "../pipeline/types.js";

const TRACE_DIR = join(process.cwd(), "observability", "traces");

export function appendTrace(record: PipelineRecord): void {
  const day = new Date().toISOString().slice(0, 10);
  const path = join(TRACE_DIR, `${day}.jsonl`);
  if (!existsSync(dirname(path))) {
    mkdirSync(dirname(path), { recursive: true });
  }
  appendFileSync(path, JSON.stringify(record) + "\n", "utf-8");
}

// Quick aggregations for the run summary printed to stdout.
export function summarize(records: PipelineRecord[]): {
  total: number;
  with_research: number;
  with_draft: number;
  total_cost_usd: number;
  failures: { stage: string; reason: string }[];
} {
  const failures: { stage: string; reason: string }[] = [];
  let cost = 0;
  let withResearch = 0;
  let withDraft = 0;

  for (const r of records) {
    if (r.research) withResearch += 1;
    if (r.draft) withDraft += 1;
    for (const t of r.trace) {
      if (typeof t.cost_usd === "number") cost += t.cost_usd;
      if (t.status === "error" || t.status === "skipped") {
        failures.push({ stage: t.stage, reason: t.detail ?? "unknown" });
      }
    }
  }

  return {
    total: records.length,
    with_research: withResearch,
    with_draft: withDraft,
    total_cost_usd: Number(cost.toFixed(4)),
    failures,
  };
}
