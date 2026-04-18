"""Personalization: 3-line email + LinkedIn note.

Generates outreach copy from a grounded ResearchBrief. The system prompt
forbids any sentence that is not directly tied to a brief field. A post-call
validator strips sentences that fail to reference a brief fact, so the
worst-case output is shorter copy rather than fabricated copy.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from anthropic import Anthropic

from ..research.types import Draft, PipelineRecord, ResearchBrief

PROMPT_PATH = Path(__file__).resolve().parents[2] / "prompts" / "personalization_system.md"
MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")


def draft(record: PipelineRecord) -> tuple[Draft | None, float]:
    if record.research is None:
        return None, 0.0

    client = Anthropic()
    user = json.dumps(
        {
            "company_name": record.posting.company_name,
            "role_title": record.posting.role_title,
            "sector": record.firmographics.sector if record.firmographics else None,
            "location_count": record.firmographics.location_count if record.firmographics else None,
            "person": record.person.model_dump() if record.person else None,
            "brief": record.research.model_dump(mode="json"),
        },
        default=str,
    )

    resp = client.messages.create(
        model=MODEL,
        max_tokens=512,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user}],
    )

    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    cost = _estimate_cost(resp)

    parsed = _parse_json_block(text)
    if parsed is None:
        return None, cost
    try:
        d = Draft.model_validate(parsed)
    except Exception:
        return None, cost

    cleaned = _strip_ungrounded_sentences(d, record.research)
    return cleaned, cost


# Permits a sentence if it shares enough lowercased word-tokens with one of the
# brief fields. Token overlap is intentionally loose; the heuristic exists to
# catch egregious off-topic sentences, not to enforce paraphrase semantics.
_TOKEN = re.compile(r"[a-z0-9]{4,}")


def _facts_tokens(brief: ResearchBrief) -> set[str]:
    blob = " ".join(
        [brief.pain_thesis, brief.reference_fact, brief.workforce_planning_maturity]
    ).lower()
    return set(_TOKEN.findall(blob))


def _sentence_grounded(sentence: str, fact_tokens: set[str]) -> bool:
    toks = set(_TOKEN.findall(sentence.lower()))
    if not toks:
        return True  # pure punctuation / greetings — leave to caller to remove
    return bool(toks & fact_tokens)


def _strip_ungrounded_sentences(d: Draft, brief: ResearchBrief) -> Draft:
    facts = _facts_tokens(brief)

    def filter_text(t: str) -> str:
        sentences = re.split(r"(?<=[.!?])\s+", t.strip())
        keep = [s for s in sentences if _sentence_grounded(s, facts)]
        return " ".join(keep).strip()

    return Draft(
        email_subject=d.email_subject.strip(),
        email_body=filter_text(d.email_body),
        linkedin_note=filter_text(d.linkedin_note),
    )


def _parse_json_block(text: str) -> dict[str, Any] | None:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


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
