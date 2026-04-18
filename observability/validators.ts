// Cross-record validators run after the pipeline completes.
//
// v1 ships two checks:
//   1. grounding   — every research field on every record has a source URL.
//   2. schema      — the record matches PipelineRecordSchema.
//
// v1.1 will add a personalization check (every drafted sentence references a
// brief fact) and a CRM-schema check (custom properties exist in the portal).

import { PipelineRecord, PipelineRecordSchema } from "../pipeline/types.js";

export interface ValidatorReport {
  passed: boolean;
  issues: { record_id: string; check: string; detail: string }[];
}

export function validateAll(records: PipelineRecord[]): ValidatorReport {
  const issues: ValidatorReport["issues"] = [];

  for (const r of records) {
    // schema check
    const parse = PipelineRecordSchema.safeParse(r);
    if (!parse.success) {
      issues.push({
        record_id: r.id,
        check: "schema",
        detail: parse.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    }

    // grounding check
    if (r.research) {
      const urls = [
        r.research.pain_thesis_source_url,
        r.research.stack_maturity_source_url,
        r.research.reference_fact_source_url,
      ];
      for (const u of urls) {
        if (!u || !/^https?:\/\//.test(u)) {
          issues.push({ record_id: r.id, check: "grounding", detail: `bad source url: ${u}` });
        }
      }
    }
  }

  return { passed: issues.length === 0, issues };
}
