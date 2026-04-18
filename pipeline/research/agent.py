"""Claude research agent.

Inputs: a PipelineRecord with at least the job posting populated.
Output: a ResearchBrief — three grounded fields, each with a source URL.

Hard rule (enforced at two layers):
  1. The system prompt instructs the model to drop any claim it cannot ground
     to a real URL pulled from the inputs.
  2. The post-call validator (`grounding.py`) re-checks that every
     `*_source_url` is present in the input source set, and discards any
     field whose URL was not.

The system prompt lives in prompts/research_system.md and is loaded at import
time. Prompt caching is applied to the system prompt so repeated calls within
a run amortize cost.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from anthropic import Anthropic

from .grounding import enforce_grounding
from .types import PipelineRecord, ResearchBrief

PROMPT_PATH = Path(__file__).resolve().parents[2] / "prompts" / "research_system.md"
MODEL = "claude-sonnet-4-6"


def _load_system_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


SYSTEM_PROMPT = _load_system_prompt()


def research(record: PipelineRecord, *, fetch_pages: bool = False) -> tuple[ResearchBrief | None, float]:
    """Run the research agent against a single record.

    Returns (brief_or_none, cost_usd). When the model fails to produce a
    grounded brief, returns (None, cost). Callers should treat the absence of
    a brief as a skipped record rather than an error.

    fetch_pages: when True, fetch the company homepage and a small set of
    blog posts to give the model more grounding material. Off by default in
    v1 — the job posting alone is usually enough for a sharp reference fact.
    """
    client = Anthropic()

    sources = _collect_sources(record, fetch_pages=fetch_pages)
    user = json.dumps(
        {
            "company_name": record.posting.company_name,
            "company_domain": record.posting.company_domain,
            "role_title": record.posting.role_title,
            "posting_url": str(record.posting.source_url),
            "posting_text": record.posting.raw_text[:8000],
            "firmographics": record.firmographics.model_dump() if record.firmographics else None,
            "tech_stack": record.tech_stack.model_dump() if record.tech_stack else None,
            "allowed_source_urls": [s["url"] for s in sources],
        },
        default=str,
    )

    resp = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user}],
    )

    raw_text = "".join(
        block.text for block in resp.content if getattr(block, "type", None) == "text"
    )
    cost = _estimate_cost(resp)

    parsed = _parse_json_block(raw_text)
    if parsed is None:
        return None, cost

    try:
        brief = ResearchBrief.model_validate(parsed)
    except Exception:
        return None, cost

    grounded = enforce_grounding(brief, allowed_urls={s["url"] for s in sources})
    return grounded, cost


def _collect_sources(record: PipelineRecord, *, fetch_pages: bool) -> list[dict[str, Any]]:
    """Build the allow-list of URLs the model may cite."""
    sources: list[dict[str, Any]] = [
        {"url": str(record.posting.source_url), "kind": "job_posting"},
    ]
    if record.firmographics and record.firmographics.source_url:
        sources.append({"url": str(record.firmographics.source_url), "kind": "firmographics"})
    if record.tech_stack and record.tech_stack.source_url:
        sources.append({"url": str(record.tech_stack.source_url), "kind": "tech_stack"})

    if fetch_pages:
        # TODO(v1): fetch homepage + recent blog posts under the company domain
        # and append them to `sources` with their canonical URLs.
        pass
    return sources


def _parse_json_block(text: str) -> dict[str, Any] | None:
    """Extract the first JSON object from the model's response."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


# Pricing as of writing — check Anthropic's pricing page for current rates.
_INPUT_PRICE_PER_MTOK = 3.00
_OUTPUT_PRICE_PER_MTOK = 15.00
_CACHE_READ_PRICE_PER_MTOK = 0.30


def _estimate_cost(resp: Any) -> float:
    usage = getattr(resp, "usage", None)
    if usage is None:
        return 0.0
    in_tok = getattr(usage, "input_tokens", 0) or 0
    out_tok = getattr(usage, "output_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    return (
        (in_tok - cache_read) * _INPUT_PRICE_PER_MTOK / 1_000_000
        + cache_read * _CACHE_READ_PRICE_PER_MTOK / 1_000_000
        + out_tok * _OUTPUT_PRICE_PER_MTOK / 1_000_000
    )
