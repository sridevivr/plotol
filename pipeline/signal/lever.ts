// Lever public job board ingestion.
//
// Lever exposes a public JSON board per company at
// https://api.lever.co/v0/postings/<company>?mode=json
// No auth required.

import { request } from "undici";
import { JobPosting, PipelineRecord, newTraceEntry } from "../types.js";

const TARGET_TITLES = [
  /head of data\b/i,
  /vp,?\s+data\b/i,
  /vice president,?\s+data\b/i,
  /director,?\s+(of\s+)?data\b/i,
];

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt: number;
  categories?: { location?: string; team?: string };
  description?: string;
  descriptionPlain?: string;
}

export interface LeverFetchOptions {
  boards: string[];
}

export async function fetchLeverPostings(opts: LeverFetchOptions): Promise<PipelineRecord[]> {
  const records: PipelineRecord[] = [];

  for (const board of opts.boards) {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`;
    const started = Date.now();
    try {
      const res = await request(url);
      if (res.statusCode !== 200) continue;
      const body = (await res.body.json()) as LeverPosting[];
      const matched = body.filter((p) => TARGET_TITLES.some((re) => re.test(p.text)));

      for (const p of matched) {
        const posting = toJobPosting(board, p);
        records.push({
          id: `lever:${board}:${p.id}`,
          posting,
          trace: [
            newTraceEntry("signal.lever", "ok", `board=${board} job=${p.id}`, {
              duration_ms: Date.now() - started,
            }),
          ],
        });
      }
    } catch {
      // swallow per board; continue.
    }
  }
  return dedupeByDomain(records);
}

function toJobPosting(board: string, p: LeverPosting): JobPosting {
  return {
    source: "lever",
    source_id: p.id,
    source_url: p.hostedUrl,
    company_name: board,
    company_domain: `${board}.com`,
    role_title: p.text,
    role_location: p.categories?.location,
    posted_at: new Date(p.createdAt).toISOString(),
    raw_text: (p.descriptionPlain ?? p.description ?? "").replace(/\s+/g, " ").trim(),
  };
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
