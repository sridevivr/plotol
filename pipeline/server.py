"""HTTP service exposing the research and personalization stages.

Endpoints:
  POST /research      body: {record}        -> {research, cost_usd}
  POST /personalize   body: {record}        -> {draft, cost_usd}
  GET  /healthz                              -> "ok"

The TypeScript pipeline driver (pipeline/run.ts) calls these over HTTP.
Run with:

    uvicorn pipeline.server:app --port 8000

This module deliberately uses the stdlib http.server rather than FastAPI to
keep the dependency surface small. Swap to FastAPI in v1.1 if you want
schema-driven routing.
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

from .personalization.draft import draft as draft_outreach
from .research.agent import research as research_record
from .research.types import PipelineRecord


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - http.server convention
        if self.path == "/healthz":
            self._send_json(200, {"status": "ok"})
            return
        self._send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802 - http.server convention
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid_json"})
            return

        record_data = payload.get("record")
        if not isinstance(record_data, dict):
            self._send_json(400, {"error": "missing_record"})
            return

        try:
            record = PipelineRecord.model_validate(record_data)
        except Exception as exc:
            self._send_json(400, {"error": "invalid_record", "detail": str(exc)})
            return

        if self.path == "/research":
            brief, cost = research_record(record)
            self._send_json(
                200,
                {
                    "research": brief.model_dump(mode="json") if brief else None,
                    "cost_usd": cost,
                },
            )
            return

        if self.path == "/personalize":
            d, cost = draft_outreach(record)
            self._send_json(
                200,
                {
                    "draft": d.model_dump() if d else None,
                    "cost_usd": cost,
                },
            )
            return

        self._send_json(404, {"error": "not_found"})

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        # silence default access log; observability layer owns logging.
        return

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def serve(host: str = "0.0.0.0", port: int = 8000) -> None:
    HTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    serve()
