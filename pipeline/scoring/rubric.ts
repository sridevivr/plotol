// Transparent scoring rubric.
//
// 0–100, additive. The full breakdown rides with each record so a sales user
// can see exactly why a record landed at a given score. Weights are constants
// here; changes go through PR review.

import { PipelineRecord, ScoreBreakdown } from "../types.js";

const WEIGHTS = {
  icp_fit_max: 40,
  timing_max: 30,
  signal_strength_max: 30,
} as const;

const ICP_SECTORS = new Set(["retail_ecommerce", "manufacturing", "hospitality"]);
const ICP_REVENUE_BANDS = new Set(["500m_1b", "1b_5b", "5b_plus"]);
const NA_COUNTRIES = new Set(["US", "USA", "United States", "CA", "Canada", "MX", "Mexico"]);
const LOW_MATURITY = new Set(["manual", "spreadsheets"]);
const EXPANSION_RE = /\b(new\s+(store|stores|site|sites|facility|facilities|plant|plants|property|properties|location|locations)|expansion|opening|openings)\b/i;

export function scoreRecord(record: PipelineRecord): ScoreBreakdown {
  const notes: string[] = [];

  // --- ICP fit (0–40) ---
  let icp = 0;
  const f = record.firmographics;
  if (f?.sector && ICP_SECTORS.has(f.sector)) {
    icp += 15;
    notes.push(`ICP +15: sector ${f.sector}`);
  }
  if (typeof f?.location_count === "number" && f.location_count >= 20) {
    icp += 15;
    notes.push(`ICP +15: ${f.location_count} locations`);
  }
  if (f?.revenue_band && ICP_REVENUE_BANDS.has(f.revenue_band)) {
    icp += 5;
    notes.push(`ICP +5: revenue ${f.revenue_band}`);
  }
  if (f?.hq_country && NA_COUNTRIES.has(f.hq_country)) {
    icp += 5;
    notes.push("ICP +5: North America");
  }
  if (!f) {
    notes.push("ICP +0: no firmographics");
  }
  icp = clamp(icp, 0, WEIGHTS.icp_fit_max);

  // --- Timing (0–30) ---
  let timing = 0;
  if (record.posting.posted_at) {
    const ageDays = daysBetween(new Date(record.posting.posted_at), new Date());
    if (ageDays <= 14) {
      timing += 20;
      notes.push(`Timing +20: seed ${ageDays}d old`);
    } else if (ageDays <= 30) {
      timing += 10;
      notes.push(`Timing +10: seed ${ageDays}d old`);
    }
  }
  const fact = record.research?.reference_fact ?? "";
  if (fact && EXPANSION_RE.test(fact)) {
    timing += 10;
    notes.push("Timing +10: expansion mentioned in reference fact");
  }
  timing = clamp(timing, 0, WEIGHTS.timing_max);

  // --- Signal strength (0–30) ---
  let signal = 0;
  const maturity = record.research?.workforce_planning_maturity;
  if (maturity && LOW_MATURITY.has(maturity)) {
    signal += 15;
    notes.push(`Signal +15: workforce planning ${maturity}`);
  }
  if (record.labor_tech_stack && !record.labor_tech_stack.wfm) {
    signal += 8;
    notes.push("Signal +8: no WFM platform detected");
  }
  if (f?.data_analytics_investment && f.data_analytics_investment !== "none") {
    signal += 4;
    notes.push(`Signal +4: analytics investment ${f.data_analytics_investment}`);
  }
  if (record.person) {
    signal += 3;
    notes.push("Signal +3: champion person resolved");
  }
  signal = clamp(signal, 0, WEIGHTS.signal_strength_max);

  const total = icp + timing + signal;
  return {
    icp_fit: icp,
    timing,
    signal_strength: signal,
    total,
    notes,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
