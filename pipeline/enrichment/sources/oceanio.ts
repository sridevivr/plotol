// Ocean.io firmographics fallback.
//
// Stub: shape only. Activated when Apollo misses or returns low confidence.

import { Firmographics } from "../../types.js";

export interface OceanioEnrichResult {
  ok: boolean;
  firmographics?: Firmographics;
  reason?: string;
  cost_usd?: number;
}

export async function oceanioEnrich(domain: string): Promise<OceanioEnrichResult> {
  const key = process.env.OCEANIO_API_KEY;
  if (!key) return { ok: false, reason: "no_api_key" };

  // TODO(v1): wire actual HTTP call to Ocean.io's company enrichment API.
  return {
    ok: true,
    firmographics: {
      domain,
      source: "oceanio",
    },
    cost_usd: 0,
  };
}
