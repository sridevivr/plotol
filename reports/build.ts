// Weekly static HTML report builder.
//
// Renders the top N records into a single self-contained HTML page suitable
// for hosting on Vercel. No JS, no external CSS — one file you can email.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PipelineRecord } from "../pipeline/types.js";

const OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR ?? "./reports/generated";

export async function writeReport(records: PipelineRecord[]): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(OUTPUT_DIR, day);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "index.html");
  writeFileSync(path, renderHtml(records, day), "utf-8");
  return path;
}

function renderHtml(records: PipelineRecord[], day: string): string {
  const rows = records
    .map((r, i) => renderRecord(r, i + 1))
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SignalForge — week of ${day}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 880px; margin: 2rem auto; padding: 0 1rem; }
  header { border-bottom: 1px solid #ccc; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  h1 { font-size: 1.4rem; margin: 0; }
  h2 { font-size: 1.1rem; margin: 2rem 0 0.5rem; }
  .meta { color: #666; font-size: 0.9rem; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; }
  .score { float: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .why { background: #fafafa; padding: 0.75rem; border-radius: 6px; font-size: 0.92rem; }
  pre { white-space: pre-wrap; word-wrap: break-word; background: #fafafa; padding: 0.75rem; border-radius: 6px; font-size: 0.92rem; }
  .breakdown { color: #666; font-size: 0.85rem; }
  a { color: #0a66c2; }
</style>
</head>
<body>
<header>
  <h1>SignalForge — accounts to act on this week</h1>
  <div class="meta">Generated ${day}. ${records.length} accounts ranked by composite fit score.</div>
</header>
${rows}
<footer class="meta">
  Every fact in this report is grounded to a source URL pulled from the company's job posting or public site.
  Scoring rubric is published in <code>pipeline/scoring/rubric.ts</code>.
</footer>
</body>
</html>`;
}

function renderRecord(r: PipelineRecord, rank: number): string {
  const score = r.score?.total ?? 0;
  const breakdown = r.score
    ? `ICP ${r.score.icp_fit} · timing ${r.score.timing} · signal ${r.score.signal_strength}`
    : "no score";

  const why = r.research
    ? `<div class="why"><strong>Why now:</strong> ${escape(r.research.pain_thesis)}<br>
       <strong>Reference fact:</strong> ${escape(r.research.reference_fact)} (<a href="${r.research.reference_fact_source_url}">source</a>)<br>
       <strong>Workforce planning maturity:</strong> ${r.research.workforce_planning_maturity}</div>`
    : `<div class="why"><em>Research not available — record advanced on signal + firmographics only.</em></div>`;

  const draft = r.draft
    ? `<h3>Drafted outreach</h3>
       <p><strong>Subject:</strong> ${escape(r.draft.email_subject)}</p>
       <pre>${escape(r.draft.email_body)}</pre>
       <p><strong>LinkedIn note:</strong></p>
       <pre>${escape(r.draft.linkedin_note)}</pre>`
    : `<p><em>No draft available.</em></p>`;

  const f = r.firmographics;
  const firmoMeta =
    f && (f.sector || f.location_count || f.revenue_band)
      ? `<div class="breakdown">${[
          f.sector,
          typeof f.location_count === "number" ? `${f.location_count} locations` : null,
          f.revenue_band,
        ]
          .filter(Boolean)
          .map((s) => escape(String(s)))
          .join(" · ")}</div>`
      : "";

  return `<article class="card">
  <span class="score">${score}/100</span>
  <h2>${rank}. ${escape(r.posting.company_name)} — ${escape(r.posting.role_title)}</h2>
  <div class="meta"><a href="${r.posting.source_url}">${escape(r.posting.source_url)}</a> · ${escape(r.posting.role_location ?? "")}</div>
  ${firmoMeta}
  <div class="breakdown">${breakdown}</div>
  ${why}
  ${draft}
</article>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Allow `npm run report:build` to render from the latest trace file.
if (import.meta.url === `file://${process.argv[1]}`) {
  console.error("report:build standalone not yet wired — invoked via pipeline:run for v1.");
  process.exit(0);
}
