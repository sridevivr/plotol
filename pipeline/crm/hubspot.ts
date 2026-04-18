// HubSpot push.
//
// Writes a Company + (optional) Contact + Deal to a HubSpot developer
// sandbox. Custom properties used:
//   - signalforge_score (number)
//   - signalforge_score_breakdown (multiline string, JSON)
//   - signalforge_why (multiline string: reference fact + source URL)
//   - signalforge_email_subject, signalforge_email_body, signalforge_linkedin_note
//
// These properties must be created in the sandbox before first run. See
// docs/architecture.md for the bootstrap script (v1.1).

import { request } from "undici";
import { PipelineRecord, newTraceEntry } from "../types.js";

const HS_BASE = "https://api.hubapi.com";

export interface HubspotPushResult {
  ok: boolean;
  company_id?: string;
  contact_id?: string;
  deal_id?: string;
  reason?: string;
}

export async function pushRecord(record: PipelineRecord): Promise<HubspotPushResult> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: "no_access_token" };

  const started = Date.now();
  try {
    const company_id = await upsertCompany(token, record);
    const contact_id = record.person ? await upsertContact(token, record) : undefined;
    const deal_id = await createDeal(token, record, company_id, contact_id);

    record.trace.push(
      newTraceEntry("crm.hubspot", "ok", `company=${company_id} deal=${deal_id}`, {
        duration_ms: Date.now() - started,
      }),
    );
    return { ok: true, company_id, contact_id, deal_id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    record.trace.push(newTraceEntry("crm.hubspot", "error", reason));
    return { ok: false, reason };
  }
}

async function upsertCompany(token: string, record: PipelineRecord): Promise<string> {
  const props: Record<string, string | number> = {
    name: record.posting.company_name,
    domain: record.posting.company_domain,
    signalforge_score: record.score?.total ?? 0,
    signalforge_score_breakdown: JSON.stringify(record.score ?? {}),
    signalforge_why: buildWhy(record),
  };
  if (record.draft) {
    props.signalforge_email_subject = record.draft.email_subject;
    props.signalforge_email_body = record.draft.email_body;
    props.signalforge_linkedin_note = record.draft.linkedin_note;
  }

  const res = await hsPost(token, "/crm/v3/objects/companies", { properties: props });
  return res.id;
}

async function upsertContact(token: string, record: PipelineRecord): Promise<string | undefined> {
  if (!record.person) return undefined;
  const props: Record<string, string | undefined> = {
    firstname: record.person.full_name.split(" ")[0],
    lastname: record.person.full_name.split(" ").slice(1).join(" ") || undefined,
    jobtitle: record.person.title,
    email: record.person.email,
    linkedin_url: record.person.linkedin_url,
  };
  const res = await hsPost(token, "/crm/v3/objects/contacts", { properties: props });
  return res.id;
}

async function createDeal(
  token: string,
  record: PipelineRecord,
  company_id: string,
  contact_id?: string,
): Promise<string> {
  const associations = [
    { to: { id: company_id }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 5 }] },
  ];
  if (contact_id) {
    associations.push({
      to: { id: contact_id },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
    });
  }
  const res = await hsPost(token, "/crm/v3/objects/deals", {
    properties: {
      dealname: `${record.posting.company_name} — ${record.posting.role_title}`,
      pipeline: "default",
      dealstage: "appointmentscheduled",
    },
    associations,
  });
  return res.id;
}

function buildWhy(record: PipelineRecord): string {
  const parts: string[] = [];
  if (record.research?.reference_fact) {
    parts.push(`Reference: ${record.research.reference_fact}`);
    parts.push(`Source: ${record.research.reference_fact_source_url}`);
  }
  if (record.research?.pain_thesis) {
    parts.push(`Pain thesis: ${record.research.pain_thesis}`);
  }
  parts.push(`Posting: ${record.posting.source_url}`);
  return parts.join("\n");
}

async function hsPost(token: string, path: string, body: unknown): Promise<{ id: string }> {
  const res = await request(`${HS_BASE}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.statusCode >= 300) {
    const text = await res.body.text();
    throw new Error(`hubspot ${path} ${res.statusCode}: ${text.slice(0, 300)}`);
  }
  return (await res.body.json()) as { id: string };
}
