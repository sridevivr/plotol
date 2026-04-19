// Read-only probe for the Proxycurl person-finder.
//
// Usage:
//   PROXYCURL_API_KEY=... npx tsx scripts/probe-proxycurl.ts "Dick's Sporting Goods"
//
// Prints the resolved person (or the reason no match was found) plus the
// number of role lookups tried and the approximate cost. Useful for
// confirming the API key works and for spot-checking a target before a full
// pipeline run.

import "dotenv/config";
import { proxycurlFindLeader } from "../pipeline/enrichment/sources/proxycurl.js";

const CHAMPION_ROLES = [
  "Director of Workforce Planning",
  "VP of Workforce Planning",
  "Head of Workforce Planning",
  "Director of Labor Planning",
  "Director of Store Operations",
  "Director of Retail Operations",
  "Head of Talent Acquisition",
];

async function main() {
  const company = process.argv[2];
  if (!company) {
    console.error('usage: tsx scripts/probe-proxycurl.ts "<company name>"');
    process.exit(1);
  }

  const result = await proxycurlFindLeader({
    company_name: company,
    domain: "",
    roles: CHAMPION_ROLES,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
