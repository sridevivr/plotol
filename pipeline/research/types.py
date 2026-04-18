"""Pydantic models shared by the research and personalization services."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl


WorkforcePlanningMaturity = Literal[
    "manual",
    "spreadsheets",
    "point_tools",
    "enterprise_wfm",
    "in_house_science",
]
Sector = Literal["retail_ecommerce", "manufacturing", "hospitality", "other"]
RevenueBand = Literal["under_500m", "500m_1b", "1b_5b", "5b_plus"]
DataAnalyticsInvestment = Literal["none", "some", "mature"]


class JobPosting(BaseModel):
    """Universal seed shape. Used for Greenhouse/Lever postings and EDGAR filings.

    For EDGAR, `role_title` holds the filing headline (e.g. "10-K — new store
    openings") and `role_location` may be empty.
    """

    source: Literal["greenhouse", "lever", "edgar"]
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
    hq_country: Optional[str] = None

    # Labor-intel ICP attributes.
    location_count: Optional[int] = None
    revenue_band: Optional[RevenueBand] = None
    sector: Optional[Sector] = None
    data_analytics_investment: Optional[DataAnalyticsInvestment] = None

    source: str
    source_url: Optional[HttpUrl] = None


class LaborTechStack(BaseModel):
    """Workforce tooling detected for the target. Replaces the data-stack
    fields used for the prior ICP."""

    domain: str
    wfm: Optional[str] = None  # Kronos/UKG, Legion, Deputy
    hris: Optional[str] = None  # Workday, ADP, UKG
    scheduling: Optional[str] = None
    time_attendance: Optional[str] = None
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
    workforce_planning_maturity: WorkforcePlanningMaturity
    workforce_planning_maturity_source_url: HttpUrl
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
    labor_tech_stack: Optional[LaborTechStack] = None
    person: Optional[Person] = None
    research: Optional[ResearchBrief] = None
    draft: Optional[Draft] = None
