# SignalForge

> An open-source, end-to-end GTM (go-to-market) engine. Ingest a buying signal,
> enrich the account through a waterfall of data sources, research it with an
> AI agent, score fit, draft outreach copy, and push a clean record to your
> CRM — then publish a weekly report of "the 10 accounts to act on this week."

SignalForge is a runnable reference implementation of the modern GTM stack:
n8n for orchestration, Claude for research and personalization, a transparent
scoring rubric, and a HubSpot developer sandbox as the system of record. It is
opinionated, narrow, and shipped — not a framework.

---

## The play

The reference pipeline targets one specific signal:

> **Series A–B B2B SaaS companies that just posted a "Head of Data / VP Data /
> Director of Data" role on Greenhouse or Lever.**

Why this signal: a first senior data hire is a high-intent moment. Budget has
been allocated, the data stack is about to be assessed, and the buyer profile
is identifiable from a public posting. It is small enough to build well and
sharp enough to demonstrate every stage of the pipeline doing real work.

You can swap the signal — that is the point of the modular layout — but the
default play is the one above and the weekly report is generated against it.

---

## Architecture

```
              ┌──────────────────┐
              │  signal sources  │  Greenhouse + Lever job boards
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │  waterfall       │  Apollo / Ocean.io → BuiltWith → Proxycurl
              │  enrichment      │  with fallback + per-source trace
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │  research agent  │  Claude Sonnet, grounded to source URLs
              │  (Python)        │  no ungrounded fields written
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │  scoring rubric  │  transparent 0–100, published weights
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │  personalization │  3-line email + LinkedIn note,
              │  (Python)        │  every line tied to a grounded fact
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │  CRM push        │  HubSpot sandbox, clean schema, "why" field
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │  weekly report   │  static HTML on Vercel, 10 accounts/week
              └──────────────────┘

  crosscut: observability/ — per-record trace, validators, cost log
```

Each stage is independently runnable and independently testable. The orchestration
graph lives in [`n8n/workflows/`](n8n/workflows/) and is exported as JSON so it
can be diffed and reviewed.

---

## Repository layout

```
pipeline/
  signal/             ingestion from Greenhouse + Lever
  enrichment/         waterfall orchestration, one file per provider
  research/           Claude research agent (Python) with grounding
  scoring/            transparent rubric
  personalization/    email + LinkedIn drafting (Python)
  crm/                HubSpot push + schema
observability/
  trace.ts            per-record stage trace
  validators.ts       grounding + schema validators
reports/              generated weekly static HTML output
n8n/workflows/        exported orchestration graphs (JSON)
prompts/              all LLM system prompts, version-controlled
dashboard/            (v1.1) Next.js observability UI
docs/                 architecture notes, decisions
.github/workflows/    weekly cron
```

---

## Getting started

Prerequisites:

- Node.js 20+
- Python 3.11+
- Docker (for self-hosted n8n)
- Accounts: Anthropic API, HubSpot developer, Apollo or Ocean.io, BuiltWith,
  Proxycurl. Free tiers are fine for the demo volume (~10 accounts/week).

Setup:

```bash
# 1. install deps
npm install
pip install -e .

# 2. configure secrets
cp .env.example .env
# fill in API keys

# 3. start n8n (orchestration)
docker compose up -d n8n
# import n8n/workflows/*.json from the n8n UI

# 4. run the pipeline once, end to end
npm run pipeline:run
```

The first run writes records to your HubSpot sandbox and emits a static report
into `reports/`.

---

## Scope

**v1 (in scope, ~2 weeks):**

- Greenhouse + Lever signal ingestion
- 3-source waterfall (Apollo or Ocean.io, BuiltWith, Proxycurl)
- Claude research agent with source-grounded extraction
- Transparent scoring rubric
- Email + LinkedIn draft generation
- HubSpot developer sandbox push
- Static weekly HTML report
- n8n workflow exported to the repo
- Architecture docs + a runnable README

**v1.1 (deferred):**

- Next.js observability dashboard
- Slack alerting on validator failures
- Expanded validator suite
- A/B subject-line testing
- Deliberate-failure degradation tests

---

## Design principles

1. **Source-ground everything.** The research agent never writes a field
   without an associated source URL. If a claim cannot be grounded, the field
   is dropped. This is the single biggest hygiene fix versus typical AI-SDR
   stacks.
2. **Transparent scoring.** The rubric is published, the weights are in code,
   the breakdown rides with each record. No black-box fit scores.
3. **Trace every stage per record.** Every record carries a trace of which
   waterfall sources hit, which fell back, what the AI cost, and what
   validators ran.
4. **Degrade, don't fail silently.** A waterfall miss should produce a
   lower-confidence record with a recorded reason, not a hallucinated field.
5. **One niche, done well.** The default play is intentionally narrow.
   Generalization is a v2 problem.

---

## Status

Initial scaffold. Not production-ready. See [`docs/architecture.md`](docs/architecture.md)
for design notes and the current build plan.

## License

MIT.
