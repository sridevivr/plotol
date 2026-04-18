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

const ICP_HEADCOUNT_BANDS_OK = new Set(["51-200", "201-500"]);
const ICP_FUNDING_OK = new Set(["series-a", "series-b"]);

export function scoreRecord(record: PipelineRecord): ScoreBreakdown {
  const notes: string[] = [];

  // --- ICP fit ---
  let icp = 0;
  const f = record.firmographics;
  if (f) {
    if (f.industry?.toLowerCase().includes("software")) {
      icp += 15;
      notes.push("ICP +15: software industry");
    }
    if (f.headcount_band && ICP_HEADCOUNT_BANDS_OK.has(f.headcount_band)) {
      icp += 15;
      notes.push(`ICP +15: headcount band ${f.headcount_band}`);
    }
    if (f.funding_stage && ICP_FUNDING_OK.has(f.funding_stage)) {
      icp += 10;
      notes.push(`ICP +10: stage ${f.funding_stage}`);
    }
  } else {
    notes.push("ICP +0: no firmographics");
  }
  icp = clamp(icp, 0, WEIGHTS.icp_fit_max);

  // --- Timing ---
  let timing = 0;
  if (record.posting.posted_at) {
    const ageDays = daysBetween(new Date(record.posting.posted_at), new Date());
    if (ageDays <= 14) {
      timing += 20;
      notes.push(`Timing +20: posting ${ageDays}d old`);
    } else if (ageDays <= 30) {
      timing += 10;
      notes.push(`Timing +10: posting ${ageDays}d old`);
    }
  }
  if (f?.last_funding_at) {
    const fundingAgeDays = daysBetween(new Date(f.last_funding_at), new Date());
    if (fundingAgeDays <= 180) {
      timing += 10;
      notes.push(`Timing +10: funded ${fundingAgeDays}d ago`);
    }
  }
  timing = clamp(timing, 0, WEIGHTS.timing_max);

  // --- Signal strength ---
  let signal = 0;
  const maturity = record.research?.stack_maturity;
  if (maturity === "greenfield" || maturity === "piecemeal") {
    signal += 15;
    notes.push(`Signal +15: stack maturity ${maturity}`);
  } else if (maturity === "maturing") {
    signal += 8;
    notes.push("Signal +8: stack maturing");
  }
  if (record.person) {
    signal += 10;
    notes.push("Signal +10: champion person resolved");
  }
  if (record.research) {
    signal += 5;
    notes.push("Signal +5: research brief grounded");
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
