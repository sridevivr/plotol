"""Grounding validator.

Re-checks every `*_source_url` on a ResearchBrief against the allow-list of
URLs supplied to the model. If a field's URL is not in the allow-list, the
field is considered ungrounded and the entire brief is rejected.

This is intentionally strict: in v1 we would rather drop a brief than write
a hallucinated fact into the CRM.
"""

from __future__ import annotations

from .types import ResearchBrief


def enforce_grounding(brief: ResearchBrief, *, allowed_urls: set[str]) -> ResearchBrief | None:
    urls = {
        str(brief.pain_thesis_source_url),
        str(brief.stack_maturity_source_url),
        str(brief.reference_fact_source_url),
    }
    if not urls.issubset(allowed_urls):
        return None
    return brief
