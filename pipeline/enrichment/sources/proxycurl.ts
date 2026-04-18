// Proxycurl person resolution.
//
// Stub: shape only. Wire to Proxycurl's Person Search endpoint to find the
// specific Head-of-Data person at the target company.

import { Person } from "../../types.js";

export interface ProxycurlResult {
  ok: boolean;
  person?: Person;
  reason?: string;
  cost_usd?: number;
}

export async function proxycurlFindLeader(
  domain: string,
  titleRegex: RegExp,
): Promise<ProxycurlResult> {
  const key = process.env.PROXYCURL_API_KEY;
  if (!key) return { ok: false, reason: "no_api_key" };

  // TODO(v1): wire actual HTTP call to Proxycurl person search.
  void domain;
  void titleRegex;
  return { ok: false, reason: "not_implemented" };
}
