// BuiltWith tech-stack enrichment.
//
// Stub: shape only. Wire to BuiltWith's Domain API
// (https://api.builtwith.com/v21/api.json?KEY=...&LOOKUP=domain) before running.

import { TechStack } from "../../types.js";

export interface BuiltWithResult {
  ok: boolean;
  tech_stack?: TechStack;
  reason?: string;
  cost_usd?: number;
}

export async function builtwithEnrich(domain: string): Promise<BuiltWithResult> {
  const key = process.env.BUILTWITH_API_KEY;
  if (!key) return { ok: false, reason: "no_api_key" };

  // TODO(v1): wire actual HTTP call.
  return {
    ok: true,
    tech_stack: {
      domain,
      others: [],
      source: "builtwith",
    },
    cost_usd: 0,
  };
}
