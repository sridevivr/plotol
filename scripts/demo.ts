// Offline demo: exercise scoring + report rendering end to end without any
// network calls or API keys. Seeds three synthetic records that mimic what
// the real pipeline would produce, runs the scoring rubric, and writes the
// weekly HTML report.
//
// Run with:   npx tsx scripts/demo.ts

import { scoreRecord } from "../pipeline/scoring/rubric.js";
import { PipelineRecord, newTraceEntry } from "../pipeline/types.js";
import { writeReport } from "../reports/build.js";

function seed(): PipelineRecord[] {
  const now = new Date().toISOString();
  return [
    {
      id: "edgar:0001089063:0000950170-25-000123",
      posting: {
        source: "edgar",
        source_id: "0000950170-25-000123",
        source_url: "https://www.sec.gov/Archives/edgar/data/1089063/000095017025000123/ex10k.htm",
        company_name: "Dick's Sporting Goods",
        company_domain: "dicks.com",
        role_title: "10-K — new store openings",
        posted_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        raw_text:
          "We plan to open approximately 40 House of Sport locations over fiscal 2025-2026, representing a significant investment in our store base and workforce planning capabilities.",
      },
      firmographics: {
        domain: "dicks.com",
        legal_name: "Dick's Sporting Goods, Inc.",
        sector: "retail_ecommerce",
        location_count: 860,
        revenue_band: "5b_plus",
        hq_country: "US",
        data_analytics_investment: "mature",
        source: "edgar_sic",
        source_url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1089063",
      },
      labor_tech_stack: {
        domain: "dicks.com",
        hris: "Workday",
        others: [],
        source: "builtwith",
      },
      person: {
        full_name: "Sarah Chen",
        title: "Director of Workforce Planning",
        linkedin_url: "https://www.linkedin.com/in/example",
        source: "proxycurl",
      },
      research: {
        pain_thesis:
          "The FY25 plan to open 40 House of Sport locations is landing on top of store-level forecasting that the 10-K describes as 'manual and spreadsheet-driven.'",
        pain_thesis_source_url: "https://www.sec.gov/Archives/edgar/data/1089063/000095017025000123/ex10k.htm",
        workforce_planning_maturity: "spreadsheets",
        workforce_planning_maturity_source_url: "https://www.sec.gov/Archives/edgar/data/1089063/000095017025000123/ex10k.htm",
        reference_fact:
          "The Q1 10-Q discloses plans to open 40 new House of Sport locations during FY25, adding ~3,000 hourly associate roles.",
        reference_fact_source_url: "https://www.sec.gov/Archives/edgar/data/1089063/000095017025000123/ex10k.htm",
      },
      draft: {
        email_subject: "40 new stores + spreadsheet forecasting",
        email_body:
          "Sarah — the FY25 plan to open 40 House of Sport locations plus the current spreadsheet-driven store-level forecasting is the exact stack we help retailers replace before a new-store wave lands. Two Director-of-Workforce-Planning counterparts you'd know have sequenced the rollout in ~6 weeks. Worth 20 minutes to compare notes on how the forecast side handles the ramp?",
        linkedin_note:
          "Sarah — saw the 40-store expansion in the 10-K. The spreadsheet-forecasting angle is the one we hear most right before a wave like that lands. Open to 20 minutes to compare notes?",
      },
      trace: [newTraceEntry("signal.edgar", "ok", "demo seed", { duration_ms: 0 })],
    },
    {
      id: "edgar:0000007084:0000007084-25-000021",
      posting: {
        source: "edgar",
        source_id: "0000007084-25-000021",
        source_url: "https://www.sec.gov/Archives/edgar/data/7084/000000708425000021/ex10q.htm",
        company_name: "Acme Foods Manufacturing",
        company_domain: "acmefoods.com",
        role_title: "10-Q — facility expansion",
        posted_at: new Date(Date.now() - 22 * 86_400_000).toISOString(),
        raw_text:
          "Q3 brings online two new production facilities in the southeast, driving a ~3,000-person headcount increase across skilled trades and shift operators.",
      },
      firmographics: {
        domain: "acmefoods.com",
        sector: "manufacturing",
        location_count: 34,
        revenue_band: "1b_5b",
        hq_country: "US",
        source: "edgar_sic",
        source_url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=7084",
      },
      labor_tech_stack: {
        domain: "acmefoods.com",
        others: [],
        source: "builtwith",
      },
      research: {
        pain_thesis:
          "Two new plants in Q3 land on a shift-coverage model that today relies on plant-manager intuition rather than a labor-demand model.",
        pain_thesis_source_url: "https://www.sec.gov/Archives/edgar/data/7084/000000708425000021/ex10q.htm",
        workforce_planning_maturity: "manual",
        workforce_planning_maturity_source_url: "https://www.sec.gov/Archives/edgar/data/7084/000000708425000021/ex10q.htm",
        reference_fact:
          "10-Q flags ~3,000 new skilled-trade and shift-operator hires across two new plants opening in Q3.",
        reference_fact_source_url: "https://www.sec.gov/Archives/edgar/data/7084/000000708425000021/ex10q.htm",
      },
      trace: [newTraceEntry("signal.edgar", "ok", "demo seed", { duration_ms: 0 })],
    },
    {
      id: "edgar:0000320193:0000320193-25-000099",
      posting: {
        source: "edgar",
        source_id: "0000320193-25-000099",
        source_url: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000099/ex10q.htm",
        company_name: "GenericCo SaaS",
        company_domain: "genericco.com",
        role_title: "10-Q — staffing",
        posted_at: now,
        raw_text: "General staffing commentary, no expansion.",
      },
      firmographics: {
        domain: "genericco.com",
        sector: "other",
        location_count: 2,
        revenue_band: "under_500m",
        hq_country: "US",
        source: "edgar_sic",
      },
      trace: [newTraceEntry("signal.edgar", "ok", "demo seed", { duration_ms: 0 })],
    },
  ];
}

async function main() {
  const records = seed();

  for (const r of records) {
    r.score = scoreRecord(r);
  }

  records.sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));

  console.log("Scoring results:");
  for (const r of records) {
    console.log(
      `  ${r.score?.total ?? 0}/100  ${r.posting.company_name}  (ICP ${r.score?.icp_fit} · timing ${r.score?.timing} · signal ${r.score?.signal_strength})`,
    );
  }
  console.log();
  console.log("Top record's score notes:");
  for (const n of records[0].score?.notes ?? []) {
    console.log(`  - ${n}`);
  }

  const path = await writeReport(records);
  console.log(`\nreport: ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
