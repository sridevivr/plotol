// Greenhouse public job board ingestion.
//
// Greenhouse exposes a public JSON board per company at
// https://boards-api.greenhouse.io/v1/boards/<board_token>/jobs?content=true
// No auth required. We pull all open jobs for the configured boards, filter
// for workforce-planning and multi-location ops titles, and emit one
// PipelineRecord per match.
//
// Boards to scan come from the GREENHOUSE_BOARDS env var (comma-separated
// board tokens). Greenhouse is a thin coverage source for this ICP — most
// $500M+ enterprises use Workday/iCIMS — so EDGAR is the primary signal
// source. See pipeline/signal/edgar.ts.

import { request } from "undici";
import { JobPosting, PipelineRecord, newTraceEntry } from "../types.js";

const TARGET_TITLES = [
  /director,?\s+(of\s+)?workforce\s+planning\b/i,
  /vp,?\s+workforce\s+planning\b/i,
  /head\s+of\s+workforce\s+planning\b/i,
  /director,?\s+(of\s+)?labor\s+(planning|analytics|strategy)\b/i,
  /director,?\s+(of\s+)?(store|retail|field)\s+operations\b/i,
  /director,?\s+(of\s+)?real\s+estate\b/i,
  /head\s+of\s+talent\s+acquisition\b/i,
];

interface GreenhouseJob {
  id: number;
  absolute_url: string;
  title: string;
  updated_at: string;
  location?: { name?: string };
  content?: string;
  company_name?: string;
}

interface GreenhouseListResponse {
  jobs: GreenhouseJob[];
}

export interface GreenhouseFetchOptions {
  boards: string[];
}

export async function fetchGreenhousePostings(
  opts: GreenhouseFetchOptions,
): Promise<PipelineRecord[]> {
  const records: PipelineRecord[] = [];

  for (const board of opts.boards) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;
    const started = Date.now();

    try {
      const res = await request(url);
      if (res.statusCode !== 200) {
        // Skip board on non-200; do not throw — one bad board should not kill the run.
        continue;
      }
      const body = (await res.body.json()) as GreenhouseListResponse;
      const matched = body.jobs.filter((j) => TARGET_TITLES.some((re) => re.test(j.title)));

      for (const job of matched) {
        const posting = toJobPosting(board, job);
        if (!posting) continue;
        records.push({
          id: `gh:${board}:${job.id}`,
          posting,
          trace: [
            newTraceEntry("signal.greenhouse", "ok", `board=${board} job=${job.id}`, {
              duration_ms: Date.now() - started,
            }),
          ],
        });
      }
    } catch (err) {
      // swallow; the run continues with the other boards. The trace would be
      // attached at a higher level if we had a per-board record skeleton.
      // intentionally no console.log here; observability layer owns logging.
    }
  }

  return dedupeByDomain(records);
}

function toJobPosting(board: string, job: GreenhouseJob): JobPosting | null {
  const domain = inferDomain(job, board);
  if (!domain) return null;
  return {
    source: "greenhouse",
    source_id: String(job.id),
    source_url: job.absolute_url,
    company_name: job.company_name ?? board,
    company_domain: domain,
    role_title: job.title,
    role_location: job.location?.name,
    posted_at: job.updated_at,
    raw_text: stripHtml(job.content ?? ""),
  };
}

// Best-effort domain inference. Greenhouse does not expose the company
// website in the public board response, so v1 falls back to using the board
// token as the apex when no better signal exists. The enrichment stage will
// canonicalize domains via the firmographics provider.
function inferDomain(_job: GreenhouseJob, board: string): string {
  return `${board}.com`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
