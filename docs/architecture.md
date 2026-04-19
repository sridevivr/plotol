# Architecture

This document describes how SignalForge is wired together, the contracts
between stages, and the trade-offs taken in v1.

## Pipeline overview

```
signal -> enrichment -> research -> scoring -> personalization -> crm -> report
```

Each stage is a pure function over a typed `Record` shape (see
`pipeline/types.ts` and `pipeline/research/types.py`). A stage may add fields,
attach a `trace` entry, and emit `validators` results, but it should never
mutate fields owned by an upstream stage. This makes the pipeline replayable:
you can re-run any stage from a checkpoint.

## Stages

### 1. Signal (`pipeline/signal/`)

Three sources run in parallel and dedupe by company domain (records with an
unresolved domain are deduped by record id until enrichment fills the domain
in):

- **SEC EDGAR** (primary) — queries the free full-text-search endpoint for
  recent 10-K / 10-Q filings that mention expansion or workforce / labor
  availability, filtered to SIC code buckets for retail (5200–5990),
  manufacturing (2000–3999), and hospitality (7000–7011, 5812). Authoritative
  for the ICP: public companies above the revenue threshold, with a
  disclosure that directly indicates the buying moment.
- **Greenhouse** + **Lever** (thin coverage) — filters boards for titles in
  the `Director of Workforce Planning | VP Workforce Planning | Head of
  Workforce Planning | Director of Labor Planning/Analytics/Strategy | Director
  of Store/Retail/Field Operations | Director of Real Estate | Head of Talent
  Acquisition` set. Most $500M+ enterprises use Workday/iCIMS so the yield is
  low, but the long-tail boards that do run on Greenhouse/Lever deliver
  high-intent hits when they appear.

Why public disclosures + job boards: zero auth, fully replayable, and the
cleanest public proxy for "a multi-location operator is actively feeling
labor-planning pain."

### 2. Enrichment waterfall (`pipeline/enrichment/`)

Orchestrates three providers in a defined order:

1. **Apollo** (preferred) → firmographics, headcount, revenue band, HQ
   country. Falls back to **Ocean.io** if Apollo misses or returns low
   confidence.
2. **BuiltWith** → labor-tech stack signal (WFM platform such as Kronos/UKG
   or Legion, HRIS such as Workday or ADP, scheduling, time & attendance).
3. **Proxycurl** → resolve the specific Director of Workforce Planning (or
   adjacent champion) when present on LinkedIn. Calls the
   `find/company/role/` endpoint with `enrich_profile=enrich`, iterating a
   priority-ordered list of role strings (Director of Workforce Planning →
   VP Workforce Planning → Head of Workforce Planning → labor planning →
   store/retail ops → talent acquisition) and stopping on the first match.
   A per-run `PROXYCURL_MAX_CALLS` budget (default 50) caps total HTTP
   calls so a single ingestion can't burn the credit pool.

The waterfall emits a per-record `enrichment_trace` listing which sources hit,
which fell back, which were skipped, and the latency + cost of each call. This
trace is the single most important debugging artifact in the system.

Schema validation runs after each provider; conflicting fields are resolved by
provider priority (Apollo > Ocean.io for firmographics; first-write-wins
across non-overlapping fields).

### 3. Research agent (`pipeline/research/`)

A Python service that calls Claude. Inputs: the seed text (job posting or
EDGAR excerpt) plus the company's public context. Outputs a strict
`ResearchBrief`:

- `pain_thesis`: one sentence on the specific labor / ops pain the company
  is about to solve.
- `workforce_planning_maturity`: enum
  (`manual | spreadsheets | point_tools | enterprise_wfm | in_house_science`).
- `reference_fact`: a single concrete, citation-ready fact — ideally naming
  a number, a location, a named system, or a named challenge.

Every field carries a `source_url`. The agent is instructed to drop any field
it cannot ground. A post-call validator enforces the same rule and discards
violators rather than trusting the model.

The system prompt lives in `prompts/research_system.md` and is
version-controlled. Prompt caching is used on the system prompt.

### 4. Scoring (`pipeline/scoring/`)

A transparent, additive 0–100 rubric. Components:

- ICP fit (0–40): sector in `{retail_ecommerce, manufacturing, hospitality}`,
  `location_count ≥ 20`, revenue band ≥ $500M, HQ in North America.
- Timing (0–30): seed age, plus a reference-fact regex for expansion /
  new-site / new-facility mentions.
- Buying signal strength (0–30): low `workforce_planning_maturity`, absence
  of a detected WFM platform, presence of a data-analytics-investment signal,
  champion person resolved.

The full breakdown rides with each record. Weights are constants in
`pipeline/scoring/rubric.ts` and changes show up in PRs.

### 5. Personalization (`pipeline/personalization/`)

A second Claude call (Sonnet) that produces a 3-line email and a LinkedIn
connection note. Two ICP-specific controls in `prompts/personalization_system.md`:

- **Persona lock**: the default recipient is the Director of Workforce
  Planning (Champion). The CTA is locked to "worth 20 minutes to compare
  notes on [the platform]?"
- **Sector framing**: the prompt carries three vocabulary blocks
  (retail_ecommerce / manufacturing / hospitality) and the model selects the
  one matching `firmographics.sector`. Sector framing supplies vocabulary,
  not claims.

Hard rule, enforced by a post-call validator: every sentence must reference a
fact present in the `ResearchBrief`. Sentences without a matching grounded
fact are stripped.

### 6. CRM push (`pipeline/crm/`)

Writes Account + Contact + Opportunity to a HubSpot developer sandbox. The
schema includes a `signalforge_why` field with the reference fact and source
URLs, and a `signalforge_score_breakdown` field with the rubric components.
This means a sales rep opening the record in HubSpot can read why the system
surfaced it in 5 seconds.

### 7. Report (`reports/`)

A static HTML page generated weekly: the top 10 records, grouped by score
band, with the drafted copy and citations rendered inline. The output is
written to `reports/generated/YYYY-MM-DD/index.html` and deployed to Vercel
by the GitHub Actions cron in `.github/workflows/weekly.yml`.

## Cross-cutting

### Observability (`observability/`)

- `trace.ts`: per-stage, per-record append-only log entries. JSON Lines.
- `validators.ts`: grounding check, schema check, personalization check.

### Prompts (`prompts/`)

System prompts are markdown files, versioned in git. Each has a header with a
short description, the output schema, and the change log. Prompt edits are
PRs.

### Orchestration (`n8n/workflows/`)

The signal → enrichment → CRM path runs in n8n; the research and
personalization stages run as Python HTTP services that n8n calls. n8n
workflows are exported to JSON and committed.

The choice of n8n over Prefect/Temporal is intentional: n8n is the tool real
GTM teams reach for, and exporting the workflow JSON makes the orchestration
graph reviewable in PRs.

## Open questions / v1.1

- Move the trace store from JSONL to DuckDB so the dashboard can query it.
- Add a Slack alerter on validator failures.
- A/B subject lines (requires a sender identity that we deliberately do not
  set up in v1).
- Replay harness: deterministically re-run a record against a new prompt
  version to compare drafts.
