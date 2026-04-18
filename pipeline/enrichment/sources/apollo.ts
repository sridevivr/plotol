// Apollo firmographics enrichment.
//
// Stub: shape only. Wire to Apollo's organizations enrichment endpoint
// (https://api.apollo.io/v1/organizations/enrich?domain=...) before running.

import { Firmographics } from "../../types.js";

export interface ApolloEnrichResult {
  ok: boolean;
  firmographics?: Firmographics;
  reason?: string;
  cost_usd?: number;
}

export async function apolloEnrich(domain: string): Promise<ApolloEnrichResult> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return { ok: false, reason: "no_api_key" };

  // TODO(v1): wire actual HTTP call to Apollo's organization enrichment API.
  // Returning a deterministic stub so downstream stages can be exercised end
  // to end without burning credits.
  return {
    ok: true,
    firmographics: {
      domain,
      legal_name: undefined,
      industry: undefined,
      headcount: undefined,
      headcount_band: undefined,
      funding_stage: "unknown",
      source: "apollo",
    },
    cost_usd: 0,
  };
}
