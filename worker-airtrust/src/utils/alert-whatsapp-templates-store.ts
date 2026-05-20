import type { Env } from '../types';
import {
  createTwilioContentTemplate,
  getTwilioContentTemplate,
  submitTwilioWhatsAppApproval,
} from './twilio-content';
import {
  getAlertWhatsAppTemplateCatalog,
  type AlertWhatsAppTemplateDefinition,
  type AlertWhatsAppTemplateKey,
} from './whatsapp-templates';

export type LocalWhatsAppTemplateRecord = {
  template_key: string;
  provider: string;
  friendly_name: string;
  template_name: string;
  category: string;
  language: string;
  body_text: string;
  variables_json: string;
  twilio_content_sid: string | null;
  approval_status: string | null;
  approval_error: string | null;
  approval_payload_json: string | null;
  last_synced_at: string | null;
  updated_at: string;
};

export async function ensureWhatsAppTemplatesTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS alertas_whatsapp_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_key TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL DEFAULT 'twilio',
        friendly_name TEXT NOT NULL,
        template_name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'UTILITY',
        language TEXT NOT NULL DEFAULT 'pt_BR',
        body_text TEXT NOT NULL,
        variables_json TEXT NOT NULL,
        twilio_content_sid TEXT,
        approval_status TEXT,
        approval_error TEXT,
        approval_payload_json TEXT,
        last_synced_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    )
    .run();

  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_alertas_whatsapp_templates_provider ON alertas_whatsapp_templates (provider, approval_status, updated_at DESC)',
    )
    .run();
  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_alertas_whatsapp_templates_sid ON alertas_whatsapp_templates (twilio_content_sid)',
    )
    .run();
}

export async function upsertLocalWhatsAppTemplateDefinition(
  db: D1Database,
  template: AlertWhatsAppTemplateDefinition,
): Promise<void> {
  await ensureWhatsAppTemplatesTable(db);

  await db
    .prepare(
      `INSERT INTO alertas_whatsapp_templates (
        template_key,
        provider,
        friendly_name,
        template_name,
        category,
        language,
        body_text,
        variables_json,
        updated_at
      ) VALUES (?, 'twilio', ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(template_key) DO UPDATE SET
        friendly_name = excluded.friendly_name,
        template_name = excluded.template_name,
        category = excluded.category,
        language = excluded.language,
        body_text = excluded.body_text,
        variables_json = excluded.variables_json,
        updated_at = datetime('now'),
        deleted_at = NULL`,
    )
    .bind(
      template.key,
      template.friendlyName,
      template.templateName,
      template.category,
      template.language,
      template.bodyText,
      JSON.stringify(template.variables),
    )
    .run();
}

export async function seedLocalWhatsAppTemplateCatalog(db: D1Database): Promise<void> {
  const catalog = getAlertWhatsAppTemplateCatalog();

  for (const template of catalog) {
    await upsertLocalWhatsAppTemplateDefinition(db, template);
  }
}

export async function listLocalWhatsAppTemplates(
  db: D1Database,
): Promise<LocalWhatsAppTemplateRecord[]> {
  await ensureWhatsAppTemplatesTable(db);

  const result = await db
    .prepare(
      `SELECT template_key, provider, friendly_name, template_name, category, language,
              body_text, variables_json, twilio_content_sid, approval_status,
              approval_error, approval_payload_json, last_synced_at, updated_at
         FROM alertas_whatsapp_templates
        WHERE deleted_at IS NULL
        ORDER BY template_key ASC`,
    )
    .all<LocalWhatsAppTemplateRecord>();

  return result.results || [];
}

export async function getLocalWhatsAppTemplateRecord(
  db: D1Database,
  templateKey: AlertWhatsAppTemplateKey,
): Promise<LocalWhatsAppTemplateRecord | null> {
  await ensureWhatsAppTemplatesTable(db);

  return db
    .prepare(
      `SELECT template_key, provider, friendly_name, template_name, category, language,
              body_text, variables_json, twilio_content_sid, approval_status,
              approval_error, approval_payload_json, last_synced_at, updated_at
         FROM alertas_whatsapp_templates
        WHERE template_key = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(templateKey)
    .first<LocalWhatsAppTemplateRecord>();
}

export function isWhatsAppTemplateApproved(status?: string | null): boolean {
  const normalized = String(status || '')
    .trim()
    .toLowerCase();

  return normalized === 'approved';
}

export async function syncWhatsAppTemplatesToTwilio(
  env: Env,
  db: D1Database,
  templateKeys?: AlertWhatsAppTemplateKey[],
): Promise<
  Array<{
    templateKey: string;
    templateName: string;
    twilioContentSid: string | null;
    approvalStatus: string | null;
    approvalError: string | null;
  }>
> {
  const catalog = getAlertWhatsAppTemplateCatalog().filter(
    (template) => !templateKeys || templateKeys.includes(template.key),
  );
  const synced: Array<{
    templateKey: string;
    templateName: string;
    twilioContentSid: string | null;
    approvalStatus: string | null;
    approvalError: string | null;
  }> = [];

  for (const template of catalog) {
    await upsertLocalWhatsAppTemplateDefinition(db, template);

    const localRecord = await getLocalWhatsAppTemplateRecord(db, template.key);
    let twilioContentSid = localRecord?.twilio_content_sid || null;
    let approvalStatus = localRecord?.approval_status || null;
    let approvalError = localRecord?.approval_error || null;
    let approvalPayloadJson = localRecord?.approval_payload_json || null;

    if (twilioContentSid) {
      try {
        await getTwilioContentTemplate(env, twilioContentSid);
      } catch {
        twilioContentSid = null;
      }
    }

    if (!twilioContentSid) {
      const createdTemplate = await createTwilioContentTemplate(env, template);
      twilioContentSid = createdTemplate.sid;
    }

    try {
      const approvalResponse = await submitTwilioWhatsAppApproval(env, twilioContentSid, template);
      approvalStatus = approvalResponse.status || approvalStatus || 'submitted';
      approvalError = approvalResponse.rejection_reason || null;
      approvalPayloadJson = JSON.stringify(approvalResponse);
    } catch (error) {
      approvalStatus = approvalStatus || 'submission_error';
      approvalError = error instanceof Error ? error.message : String(error);
      approvalPayloadJson = JSON.stringify({ error: approvalError });
    }

    await db
      .prepare(
        `UPDATE alertas_whatsapp_templates
            SET twilio_content_sid = ?,
                approval_status = ?,
                approval_error = ?,
                approval_payload_json = ?,
                last_synced_at = datetime('now'),
                updated_at = datetime('now')
          WHERE template_key = ?
            AND deleted_at IS NULL`,
      )
      .bind(twilioContentSid, approvalStatus, approvalError, approvalPayloadJson, template.key)
      .run();

    synced.push({
      templateKey: template.key,
      templateName: template.templateName,
      twilioContentSid,
      approvalStatus,
      approvalError,
    });
  }

  return synced;
}
