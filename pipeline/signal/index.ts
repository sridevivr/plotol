// Signal stage entrypoint: ingest from all configured sources, dedupe by
// domain across sources, and return a unified record set.

import { PipelineRecord } from "../types.js";
import { fetchGreenhousePostings } from "./greenhouse.js";
import { fetchLeverPostings } from "./lever.js";
import { fetchEdgarFilings } from "./edgar.js";

export async function ingestSignals(): Promise<PipelineRecord[]> {
  const ghBoards = parseList(process.env.GREENHOUSE_BOARDS);
  const leverBoards = parseList(process.env.LEVER_BOARDS);
  const edgarEnabled = (process.env.EDGAR_ENABLED ?? "true") === "true";

  const [gh, lever, edgar] = await Promise.all([
    ghBoards.length > 0 ? fetchGreenhousePostings({ boards: ghBoards }) : Promise.resolve([]),
    leverBoards.length > 0 ? fetchLeverPostings({ boards: leverBoards }) : Promise.resolve([]),
    edgarEnabled ? fetchEdgarFilings() : Promise.resolve([]),
  ]);

  // EDGAR records arrive with an empty company_domain (to be filled by
  // enrichment via CIK lookup). Dedupe keeps the first occurrence per
  // non-empty domain; EDGAR records with empty domain pass through unharmed
  // and are de-duped by record id upstream.
  return dedupeByDomainOrId([...gh, ...lever, ...edgar]);
}

function parseList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupeByDomainOrId(records: PipelineRecord[]): PipelineRecord[] {
  const seenDomains = new Set<string>();
  const seenIds = new Set<string>();
  const out: PipelineRecord[] = [];
  for (const r of records) {
    const dom = r.posting.company_domain;
    if (dom) {
      if (seenDomains.has(dom)) continue;
      seenDomains.add(dom);
    } else {
      if (seenIds.has(r.id)) continue;
      seenIds.add(r.id);
    }
    out.push(r);
  }
  return out;
}
