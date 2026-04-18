// Signal stage entrypoint: ingest from all configured sources, dedupe by
// domain across sources, and return a unified record set.

import { PipelineRecord } from "../types.js";
import { fetchGreenhousePostings } from "./greenhouse.js";
import { fetchLeverPostings } from "./lever.js";

export async function ingestSignals(): Promise<PipelineRecord[]> {
  const ghBoards = parseList(process.env.GREENHOUSE_BOARDS);
  const leverBoards = parseList(process.env.LEVER_BOARDS);

  const [gh, lever] = await Promise.all([
    ghBoards.length > 0 ? fetchGreenhousePostings({ boards: ghBoards }) : Promise.resolve([]),
    leverBoards.length > 0 ? fetchLeverPostings({ boards: leverBoards }) : Promise.resolve([]),
  ]);

  return dedupeByDomain([...gh, ...lever]);
}

function parseList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupeByDomain(records: PipelineRecord[]): PipelineRecord[] {
  const seen = new Set<string>();
  const out: PipelineRecord[] = [];
  for (const r of records) {
    if (seen.has(r.posting.company_domain)) continue;
    seen.add(r.posting.company_domain);
    out.push(r);
  }
  return out;
}
