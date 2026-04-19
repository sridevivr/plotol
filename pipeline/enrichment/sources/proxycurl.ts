// Proxycurl person resolution.
//
// Calls Proxycurl's "find by role at company" endpoint to resolve a champion
// persona at a target company.
//
//   GET https://nubela.co/proxycurl/api/find/company/role/
//        ?role=<role>&company_name=<name>&enrich_profile=enrich
//   Authorization: Bearer ${PROXYCURL_API_KEY}
//
// Cost: 2 credits for role lookup + 1 credit for enrichment = 3 per
// successful person (~$0.015). Worst case per record: roles.length * 3.
//
// Strategy:
//   - Iterate roles in priority order, stop on the first match. The first
//     role string is the most preferred persona; later strings are fallback
//     personas.
//   - The endpoint takes company_name (human-readable), NOT a domain.
//   - The waterfall passes a shared budget that this function decrements on
//     every HTTP call; once exhausted the function short-circuits with
//     reason "budget_exhausted" so a single big run cannot blow past the
//     PROXYCURL_MAX_CALLS cap.
//
// Caching is intentionally NOT implemented in v1 — a per-company cache is
// a v1.1 concern.

import { request } from "undici";
import { Person } from "../../types.js";

const ENDPOINT = "https://nubela.co/proxycurl/api/find/company/role/";
const CREDIT_USD = 0.005; // approximate; Proxycurl pricing varies by plan.
const ENRICHED_CREDITS = 3;
const LOOKUP_ONLY_CREDITS = 2;

export interface ProxycurlBudget {
  remaining: number;
}

export interface ProxycurlOptions {
  company_name: string;
  domain: string; // for trace logging only
  roles: string[];
  budget?: ProxycurlBudget;
}

export interface ProxycurlResult {
  ok: boolean;
  person?: Person;
  reason?: string;
  cost_usd?: number;
  // detail of which role(s) were tried, for trace logging.
  roles_tried?: number;
}

interface ProxycurlProfile {
  first_name?: string;
  last_name?: string;
  occupation?: string;
  public_identifier?: string;
}

interface ProxycurlResponse {
  profile?: ProxycurlProfile;
  linkedin_profile_url?: string;
}

export async function proxycurlFindLeader(opts: ProxycurlOptions): Promise<ProxycurlResult> {
  const key = process.env.PROXYCURL_API_KEY;
  if (!key) return { ok: false, reason: "no_api_key" };
  if (!opts.company_name) return { ok: false, reason: "no_company_name" };

  let creditsSpent = 0;
  let rolesTried = 0;

  for (const role of opts.roles) {
    if (opts.budget && opts.budget.remaining <= 0) {
      return {
        ok: false,
        reason: "budget_exhausted",
        cost_usd: creditsSpent * CREDIT_USD,
        roles_tried: rolesTried,
      };
    }
    if (opts.budget) opts.budget.remaining -= 1;
    rolesTried += 1;

    const url =
      `${ENDPOINT}?role=${encodeURIComponent(role)}` +
      `&company_name=${encodeURIComponent(opts.company_name)}` +
      `&enrich_profile=enrich`;

    let res;
    try {
      res = await request(url, {
        method: "GET",
        headers: { authorization: `Bearer ${key}` },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network_error";
      return {
        ok: false,
        reason: `network: ${msg}`,
        cost_usd: creditsSpent * CREDIT_USD,
        roles_tried: rolesTried,
      };
    }

    if (res.statusCode === 404) {
      // No match for this role at this company; partial credit cost.
      creditsSpent += LOOKUP_ONLY_CREDITS;
      continue;
    }
    if (res.statusCode >= 400) {
      const body = await res.body.text().catch(() => "");
      return {
        ok: false,
        reason: `http_${res.statusCode}: ${body.slice(0, 200)}`,
        cost_usd: creditsSpent * CREDIT_USD,
        roles_tried: rolesTried,
      };
    }

    let body: ProxycurlResponse;
    try {
      body = (await res.body.json()) as ProxycurlResponse;
    } catch {
      creditsSpent += LOOKUP_ONLY_CREDITS;
      continue;
    }

    creditsSpent += ENRICHED_CREDITS;
    const profile = body.profile;
    const first = profile?.first_name?.trim();
    const last = profile?.last_name?.trim();
    if (!first && !last) {
      // role lookup matched but enrichment didn't return a profile; skip.
      continue;
    }
    const fullName = [first, last].filter(Boolean).join(" ");
    const linkedinUrl = profile?.public_identifier
      ? `https://www.linkedin.com/in/${profile.public_identifier}`
      : body.linkedin_profile_url;

    const person: Person = {
      full_name: fullName,
      title: profile?.occupation ?? role,
      linkedin_url: linkedinUrl,
      source: "proxycurl",
    };

    return {
      ok: true,
      person,
      cost_usd: creditsSpent * CREDIT_USD,
      roles_tried: rolesTried,
    };
  }

  return {
    ok: false,
    reason: "no_match",
    cost_usd: creditsSpent * CREDIT_USD,
    roles_tried: rolesTried,
  };
}
