# n8n orchestration

The signal → enrichment → CRM path runs in a self-hosted n8n instance. The
research and personalization stages run as a Python HTTP service that n8n
calls (see `pipeline/server.py`).

## Why n8n

- Real GTM teams ship workflows in n8n / Zapier / Make. Reviewing the orchestration
  graph is part of code review for these systems.
- Exporting the workflow JSON makes the graph diffable in PRs.
- Self-hosting keeps cost and data-sharing under control.

## Layout

```
n8n/
  workflows/             exported workflow JSON, one file per workflow
  README.md              this file
```

## Bootstrap

```bash
docker compose up -d n8n
# open http://localhost:5678
# from the n8n UI: Workflows -> Import from File
# import each JSON file in n8n/workflows/
```

## Workflow files

- `signalforge.weekly.json` — weekly cron: ingest signals, run waterfall, call
  the Python research/personalization endpoints, push to HubSpot, render the
  static report.

(The exported JSON is committed once the workflow is built in the n8n UI.
v1 ships the placeholder; the real export lands with the v1 implementation
ticket.)
