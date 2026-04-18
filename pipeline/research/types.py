"""Pydantic models shared by the research and personalization services."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl


StackMaturity = Literal["greenfield", "piecemeal", "maturing", "mature"]


class JobPosting(BaseModel):
    source: Literal["greenhouse", "lever"]
    source_id: str
    source_url: HttpUrl
    company_name: str
    company_domain: str
    role_title: str
    role_location: Optional[str] = None
    posted_at: Optional[str] = None
    raw_text: str


class Firmographics(BaseModel):
    domain: str
    legal_name: Optional[str] = None
    industry: Optional[str] = None
    headcount: Optional[int] = None
    headcount_band: Optional[str] = None
    funding_stage: Optional[str] = None
    last_funding_at: Optional[str] = None
    hq_country: Optional[str] = None
    source: str
    source_url: Optional[HttpUrl] = None


class TechStack(BaseModel):
    domain: str
    warehouse: Optional[str] = None
    bi: Optional[str] = None
    cdp: Optional[str] = None
    reverse_etl: Optional[str] = None
    others: list[str] = Field(default_factory=list)
    source: str
    source_url: Optional[HttpUrl] = None


class Person(BaseModel):
    full_name: str
    title: str
    linkedin_url: Optional[HttpUrl] = None
    email: Optional[str] = None
    source: str


class ResearchBrief(BaseModel):
    """The output schema the research agent must conform to.

    Every field carries a source URL. A field without a verifiable source URL
    is dropped by the validator before being returned to the pipeline.
    """

    pain_thesis: str
    pain_thesis_source_url: HttpUrl
    stack_maturity: StackMaturity
    stack_maturity_source_url: HttpUrl
    reference_fact: str
    reference_fact_source_url: HttpUrl


class Draft(BaseModel):
    email_subject: str
    email_body: str
    linkedin_note: str


class PipelineRecord(BaseModel):
    """Mirror of pipeline/types.ts PipelineRecord, minus the trace array."""

    id: str
    posting: JobPosting
    firmographics: Optional[Firmographics] = None
    tech_stack: Optional[TechStack] = None
    person: Optional[Person] = None
    research: Optional[ResearchBrief] = None
    draft: Optional[Draft] = None
