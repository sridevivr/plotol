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

Pulls open job postings from Greenhouse and Lever public boards. Filters to
roles matching `Head of Data | VP Data | Director of Data`. Emits one record
per matched posting, deduplicated by company domain.

Why public job boards: zero auth, fully replayable, and a clean fit signal for
the chosen play.

### 2. Enrichment waterfall (`pipeline/enrichment/`)

Orchestrates three providers in a defined order:

1. **Apollo** (preferred) → firmographics, headcount, funding stage. Falls back
   to **Ocean.io** if Apollo misses or returns low confidence.
2. **BuiltWith** → tech stack signal (data warehouse, BI tool, CDP).
3. **Proxycurl** → resolve the specific Head-of-Data person (when present on
   LinkedIn).

The waterfall emits a per-record `enrichment_trace` listing which sources hit,
which fell back, which were skipped, and the latency + cost of each call. This
trace is the single most important debugging artifact in the system.

Schema validation runs after each provider; conflicting fields are resolved by
provider priority (Apollo > Ocean.io for firmographics; first-write-wins
across non-overlapping fields).

### 3. Research agent (`pipeline/research/`)

A Python service that calls Claude. Inputs: the job posting text + the
company's website + the most recent 3 blog posts. Outputs a strict
`ResearchBrief`:

- `pain_thesis`: one sentence on what the new hire is meant to solve.
- `stack_maturity`: enum (`greenfield | piecemeal | maturing | mature`).
- `reference_fact`: a single concrete, citation-ready fact to use in outreach.

Every field carries a `source_url`. The agent is instructed to drop any field
it cannot ground. A post-call validator enforces the same rule and discards
violators rather than trusting the model.

The system prompt lives in `prompts/research_system.md` and is
version-controlled. Prompt caching is used on the system prompt.

### 4. Scoring (`pipeline/scoring/`)

A transparent, additive 0–100 rubric. Components:

- ICP fit (0–40): industry, headcount band, funding stage.
- Timing (0–30): job-post age, funding recency.
- Buying signal strength (0–30): stack maturity, role seniority, hiring manager
  is a champion-shaped persona.

The full breakdown rides with each record. Weights are constants in
`pipeline/scoring/rubric.ts` and changes show up in PRs.

### 5. Personalization (`pipeline/personalization/`)

A second Claude call (Sonnet) that produces a 3-line email and a LinkedIn
connection note. Hard rule, enforced by a post-call validator: every sentence
must reference a fact present in the `ResearchBrief`. Sentences without a
matching grounded fact are stripped.

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
