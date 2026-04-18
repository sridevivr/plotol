// BuiltWith labor-tech enrichment.
//
// Stub: shape only. Wire to BuiltWith's Domain API
// (https://api.builtwith.com/v21/api.json?KEY=...&LOOKUP=domain) before
// running. For the labor-intel ICP we care about workforce management
// (Kronos/UKG, Legion, Deputy, Blue Yonder), HRIS (Workday, ADP, UKG),
// scheduling, and time & attendance tools — not the data stack.

import { LaborTechStack } from "../../types.js";

export interface BuiltWithResult {
  ok: boolean;
  labor_tech_stack?: LaborTechStack;
  reason?: string;
  cost_usd?: number;
}

export async function builtwithEnrich(domain: string): Promise<BuiltWithResult> {
  const key = process.env.BUILTWITH_API_KEY;
  if (!key) return { ok: false, reason: "no_api_key" };

  // TODO(v1): wire actual HTTP call and map BuiltWith categories to
  // wfm / hris / scheduling / time_attendance.
  return {
    ok: true,
    labor_tech_stack: {
      domain,
      others: [],
      source: "builtwith",
    },
    cost_usd: 0,
  };
}
