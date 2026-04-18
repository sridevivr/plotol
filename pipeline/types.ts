// Shared record types passed between pipeline stages.
//
// Each stage takes a record, adds its own fields, appends a trace entry, and
// returns the updated record. Stages should not mutate fields owned by an
// upstream stage.

import { z } from "zod";

export const SignalSourceSchema = z.enum(["greenhouse", "lever", "edgar"]);
export type SignalSource = z.infer<typeof SignalSourceSchema>;

// JobPostingSchema is the universal "seed" shape every signal source emits.
// For Greenhouse/Lever it holds a job posting. For EDGAR it holds a filing
// match — `role_title` becomes the filing headline (e.g. "10-K — new store
// openings") and `role_location` may be empty. The shape is reused rather
// than discriminated-unioned to keep the downstream stages simple; a later
// refactor can rename this to `Seed` without breaking ingestion contracts.
export const JobPostingSchema = z.object({
  source: SignalSourceSchema,
  source_id: z.string(),
  source_url: z.string().url(),
  company_name: z.string(),
  company_domain: z.string(),
  role_title: z.string(),
  role_location: z.string().optional(),
  posted_at: z.string().datetime().optional(),
  raw_text: z.string(),
});
export type JobPosting = z.infer<typeof JobPostingSchema>;

export const SectorSchema = z.enum([
  "retail_ecommerce",
  "manufacturing",
  "hospitality",
  "other",
]);
export type Sector = z.infer<typeof SectorSchema>;

export const RevenueBandSchema = z.enum(["under_500m", "500m_1b", "1b_5b", "5b_plus"]);
export type RevenueBand = z.infer<typeof RevenueBandSchema>;

export const DataAnalyticsInvestmentSchema = z.enum(["none", "some", "mature"]);
export type DataAnalyticsInvestment = z.infer<typeof DataAnalyticsInvestmentSchema>;

export const FirmographicsSchema = z.object({
  domain: z.string(),
  legal_name: z.string().optional(),
  industry: z.string().optional(),
  headcount: z.number().int().nonnegative().optional(),
  headcount_band: z
    .enum(["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"])
    .optional(),
  hq_country: z.string().optional(),

  // Labor-intel ICP attributes.
  location_count: z.number().int().nonnegative().optional(),
  revenue_band: RevenueBandSchema.optional(),
  sector: SectorSchema.optional(),
  data_analytics_investment: DataAnalyticsInvestmentSchema.optional(),

  source: z.string(),
  source_url: z.string().url().optional(),
});
export type Firmographics = z.infer<typeof FirmographicsSchema>;

// Labor-tech stack: what workforce tooling the company already runs. Replaces
// the data-stack fields used for the prior ICP.
export const LaborTechStackSchema = z.object({
  domain: z.string(),
  wfm: z.string().optional(), // workforce management (Kronos/UKG, Legion, Deputy)
  hris: z.string().optional(), // HRIS (Workday, ADP, UKG)
  scheduling: z.string().optional(),
  time_attendance: z.string().optional(),
  others: z.array(z.string()).default([]),
  source: z.string(),
  source_url: z.string().url().optional(),
});
export type LaborTechStack = z.infer<typeof LaborTechStackSchema>;

export const PersonSchema = z.object({
  full_name: z.string(),
  title: z.string(),
  linkedin_url: z.string().url().optional(),
  email: z.string().email().optional(),
  source: z.string(),
});
export type Person = z.infer<typeof PersonSchema>;

export const TraceEntrySchema = z.object({
  stage: z.string(),
  status: z.enum(["ok", "fallback", "skipped", "error"]),
  detail: z.string().optional(),
  duration_ms: z.number().nonnegative().optional(),
  cost_usd: z.number().nonnegative().optional(),
  at: z.string().datetime(),
});
export type TraceEntry = z.infer<typeof TraceEntrySchema>;

export const ScoreBreakdownSchema = z.object({
  icp_fit: z.number().min(0).max(40),
  timing: z.number().min(0).max(30),
  signal_strength: z.number().min(0).max(30),
  total: z.number().min(0).max(100),
  notes: z.array(z.string()).default([]),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const WorkforcePlanningMaturitySchema = z.enum([
  "manual",
  "spreadsheets",
  "point_tools",
  "enterprise_wfm",
  "in_house_science",
]);
export type WorkforcePlanningMaturity = z.infer<typeof WorkforcePlanningMaturitySchema>;

// The full record carried through the pipeline. Optional fields fill in as
// stages run. Stages should never overwrite a populated upstream field.
export const PipelineRecordSchema = z.object({
  id: z.string(),
  posting: JobPostingSchema,
  firmographics: FirmographicsSchema.optional(),
  labor_tech_stack: LaborTechStackSchema.optional(),
  person: PersonSchema.optional(),

  // Populated by the Python research agent; structure mirrors ResearchBrief.
  research: z
    .object({
      pain_thesis: z.string(),
      pain_thesis_source_url: z.string().url(),
      workforce_planning_maturity: WorkforcePlanningMaturitySchema,
      workforce_planning_maturity_source_url: z.string().url(),
      reference_fact: z.string(),
      reference_fact_source_url: z.string().url(),
    })
    .optional(),

  score: ScoreBreakdownSchema.optional(),

  draft: z
    .object({
      email_subject: z.string(),
      email_body: z.string(),
      linkedin_note: z.string(),
    })
    .optional(),

  trace: z.array(TraceEntrySchema).default([]),
});
export type PipelineRecord = z.infer<typeof PipelineRecordSchema>;

export function newTraceEntry(
  stage: string,
  status: TraceEntry["status"],
  detail?: string,
  extras: { duration_ms?: number; cost_usd?: number } = {},
): TraceEntry {
  return {
    stage,
    status,
    detail,
    duration_ms: extras.duration_ms,
    cost_usd: extras.cost_usd,
    at: new Date().toISOString(),
  };
}
