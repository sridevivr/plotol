// SEC EDGAR full-text search — primary signal source for the labor-intel ICP.
//
// Queries EDGAR's free full-text search endpoint for recent 10-K / 10-Q
// filings that mention expansion, workforce, or labor availability, filtered
// to SIC codes in retail, manufacturing, and hospitality. Emits one
// PipelineRecord per matching filing.
//
// Endpoint: https://efts.sec.gov/LATEST/search-index?q=...&forms=10-K,10-Q
// No auth required. SEC asks for a User-Agent with contact info on every
// request — set EDGAR_USER_AGENT in .env.

import { request } from "undici";
import { JobPosting, PipelineRecord, newTraceEntry } from "../types.js";

// SIC code prefixes that define our ICP. EDGAR search returns full codes; we
// match on the numeric prefix.
const SIC_BUCKETS: { label: string; match: (sic: string) => boolean }[] = [
  {
    label: "retail_ecommerce",
    match: (sic) => /^5[2-9]\d{2}$/.test(sic), // 5200–5999 retail trade
  },
  {
    label: "manufacturing",
    match: (sic) => /^(2\d{3}|3\d{3})$/.test(sic), // 2000–3999
  },
  {
    label: "hospitality",
    match: (sic) => sic === "7011" || sic === "5812" || /^70\d{2}$/.test(sic),
  },
];

const QUERY_TERMS = [
  '"new store openings"',
  '"facility expansion"',
  '"workforce planning"',
  '"labor availability"',
  '"staffing"',
];

const FORMS = ["10-K", "10-Q"];
const SEARCH_URL = "https://efts.sec.gov/LATEST/search-index";
const EXCERPT_LEN = 2000;

interface EdgarHit {
  _source: {
    ciks: string[];
    display_names?: string[];
    adsh: string; // accession number, e.g. "0001193125-24-123456"
    file_date: string;
    form: string;
    sics?: string[];
    file_type?: string;
  };
  _id?: string;
  highlight?: { [k: string]: string[] };
}

interface EdgarSearchResponse {
  hits?: {
    hits?: EdgarHit[];
  };
}

export interface EdgarFetchOptions {
  maxPerQuery?: number;
  userAgent?: string;
}

export async function fetchEdgarFilings(
  opts: EdgarFetchOptions = {},
): Promise<PipelineRecord[]> {
  const userAgent =
    opts.userAgent ??
    process.env.EDGAR_USER_AGENT ??
    "signalforge contact@example.com";
  const maxPerQuery = opts.maxPerQuery ?? 20;

  const records: PipelineRecord[] = [];
  const seenCiks = new Set<string>();

  for (const q of QUERY_TERMS) {
    const started = Date.now();
    const url =
      `${SEARCH_URL}?q=${encodeURIComponent(q)}` +
      `&forms=${FORMS.join(",")}` +
      `&hits=${maxPerQuery}`;
    try {
      const res = await request(url, {
        headers: { "user-agent": userAgent, accept: "application/json" },
      });
      if (res.statusCode !== 200) continue;
      const body = (await res.body.json()) as EdgarSearchResponse;
      const hits = body.hits?.hits ?? [];

      for (const hit of hits) {
        const record = hitToRecord(hit, q, started);
        if (!record) continue;
        const cik = record.id.replace(/^edgar:/, "").split(":")[0];
        if (!cik || seenCiks.has(cik)) continue;
        seenCiks.add(cik);
        records.push(record);
      }
    } catch {
      // swallow per query; other queries still run.
    }
  }

  return records;
}

function hitToRecord(hit: EdgarHit, query: string, started: number): PipelineRecord | null {
  const src = hit._source;
  const cik = src.ciks?.[0];
  if (!cik) return null;
  const company = src.display_names?.[0] ?? "";
  const companyName = company.replace(/\s*\(CIK.*\)\s*$/, "").trim() || `CIK ${cik}`;
  const sic = src.sics?.[0] ?? "";
  const bucket = SIC_BUCKETS.find((b) => b.match(sic));
  if (!bucket) return null;

  const accession = src.adsh;
  const accessionNoDashes = accession.replace(/-/g, "");
  // File_type from EDGAR is the primary exhibit; fall back to canonical form
  // index when not present.
  const primaryDoc = hit._id?.split(":")[1] ?? `${accession}-index.htm`;
  const sourceUrl = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionNoDashes}/${primaryDoc}`;

  const highlightText = Object.values(hit.highlight ?? {})
    .flat()
    .join(" ");
  const rawText = stripHtml(highlightText).slice(0, EXCERPT_LEN) || query;

  const posting: JobPosting = {
    source: "edgar",
    source_id: accession,
    source_url: sourceUrl,
    company_name: companyName,
    company_domain: "", // filled downstream by firmographics enrichment (CIK → domain)
    role_title: `${src.form} — ${query.replace(/"/g, "")}`,
    role_location: undefined,
    posted_at: toIsoDate(src.file_date),
    raw_text: rawText,
  };

  return {
    id: `edgar:${cik}:${accession}`,
    posting,
    firmographics: {
      domain: "",
      sector: bucket.label as "retail_ecommerce" | "manufacturing" | "hospitality",
      source: "edgar_sic",
      source_url: sourceUrl,
    },
    trace: [
      newTraceEntry("signal.edgar", "ok", `sic=${sic} form=${src.form} q=${query}`, {
        duration_ms: Date.now() - started,
      }),
    ],
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDate(d: string | undefined): string | undefined {
  if (!d) return undefined;
  // EDGAR returns YYYY-MM-DD; convert to a datetime string so the Zod
  // .datetime() validator on PipelineRecord accepts it.
  return `${d}T00:00:00.000Z`;
}
