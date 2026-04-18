// Shared record types passed between pipeline stages.
//
// Each stage takes a record, adds its own fields, appends a trace entry, and
// returns the updated record. Stages should not mutate fields owned by an
// upstream stage.

import { z } from "zod";

export const SignalSourceSchema = z.enum(["greenhouse", "lever"]);
export type SignalSource = z.infer<typeof SignalSourceSchema>;

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

export const FirmographicsSchema = z.object({
  domain: z.string(),
  legal_name: z.string().optional(),
  industry: z.string().optional(),
  headcount: z.number().int().nonnegative().optional(),
  headcount_band: z.enum(["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]).optional(),
  funding_stage: z.enum(["pre-seed", "seed", "series-a", "series-b", "series-c", "later", "public", "unknown"]).optional(),
  last_funding_at: z.string().datetime().optional(),
  hq_country: z.string().optional(),
  source: z.string(),
  source_url: z.string().url().optional(),
});
export type Firmographics = z.infer<typeof FirmographicsSchema>;

export const TechStackSchema = z.object({
  domain: z.string(),
  warehouse: z.string().optional(),
  bi: z.string().optional(),
  cdp: z.string().optional(),
  reverse_etl: z.string().optional(),
  others: z.array(z.string()).default([]),
  source: z.string(),
  source_url: z.string().url().optional(),
});
export type TechStack = z.infer<typeof TechStackSchema>;

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

// The full record carried through the pipeline. Optional fields fill in as
// stages run. Stages should never overwrite a populated upstream field.
export const PipelineRecordSchema = z.object({
  id: z.string(),
  posting: JobPostingSchema,
  firmographics: FirmographicsSchema.optional(),
  tech_stack: TechStackSchema.optional(),
  person: PersonSchema.optional(),

  // Populated by the Python research agent; structure mirrors ResearchBrief.
  research: z
    .object({
      pain_thesis: z.string(),
      pain_thesis_source_url: z.string().url(),
      stack_maturity: z.enum(["greenfield", "piecemeal", "maturing", "mature"]),
      stack_maturity_source_url: z.string().url(),
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
