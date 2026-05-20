/**
 * Email notifications for the ficha/assinatura lifecycle.
 *
 * Three trigger points:
 *  1. instrutor_avaliacao_pendente  → session finalized, instructor must fill evaluation
 *  2. aluno_assinatura_pendente     → instructor saved evaluation, aluno must sign
 *  3. instrutor_assinatura_final_pendente → aluno signed, instructor must sign & close
 *
 * All functions catch errors internally and must never throw.
 * The main request flow is unaffected if email sending fails.
 */

import type { Env } from '../types';
import { sendEmail } from './email';

export type FichaEmailTipo =
  | 'instrutor_avaliacao_pendente'
  | 'aluno_assinatura_pendente'
  | 'instrutor_assinatura_final_pendente';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateBr(isoDate?: string | null): string {
  if (!isoDate) return 'N/A';
  // Accept "YYYY-MM-DD" or "YYYY-MM-DDT..."
  const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function appUrl(env: Env): string {
  return env.FRONTEND_URL || 'https://airtrust.online';
}

function fichaLink(env: Env, fichaId: number | string): string {
  return `${appUrl(env)}/simuladores/fichas/${fichaId}`;
}

function buildHtml(plain: string): string {
  const escaped = plain
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const withBreaks = escaped.replace(/\n/g, '<br/>');
  return `<html><body style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">${withBreaks}</body></html>`;
}

// ---------------------------------------------------------------------------
// Data fetcher
// ---------------------------------------------------------------------------

interface FichaEmailData {
  fichaId: number;
  nomeInstrutor: string;
  emailInstrutor: string | null;
  nomeAluno: string;
  emailAluno: string | null;
  dataSessao: string; // DD/MM/YYYY
}

async function getFichaEmailData(
  db: D1Database,
  fichaId: number,
): Promise<FichaEmailData | null> {
  try {
    const row = await db
      .prepare(
        `SELECT
          fs.id,
          fi.nome     AS instrutor_nome,
          fi.email    AS instrutor_email,
          fa.nome     AS aluno_nome,
          fa.email    AS aluno_email,
          COALESCE(sa.data, fs.data_sessao) AS data_sessao
         FROM fichas_sessao fs
         INNER JOIN funcionarios fi ON fi.id = fs.instrutor_id    AND fi.deleted_at IS NULL
         INNER JOIN funcionarios fa ON fa.id = fs.colaborador_id_aluno AND fa.deleted_at IS NULL
         LEFT  JOIN simulador_agendamentos sa ON sa.id = fs.agendamento_slot_id AND sa.deleted_at IS NULL
         WHERE fs.id = ? AND fs.deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(fichaId)
      .first<{
        id: number;
        instrutor_nome: string | null;
        instrutor_email: string | null;
        aluno_nome: string | null;
        aluno_email: string | null;
        data_sessao: string | null;
      }>();

    if (!row) return null;

    return {
      fichaId,
      nomeInstrutor: row.instrutor_nome || 'Instrutor',
      emailInstrutor: row.instrutor_email || null,
      nomeAluno: row.aluno_nome || 'Aluno',
      emailAluno: row.aluno_email || null,
      dataSessao: formatDateBr(row.data_sessao),
    };
  } catch (err) {
    console.error('[fichaEmails] Erro ao buscar dados da ficha:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Template builders
// ---------------------------------------------------------------------------

function buildInstrutorAvaliacaoPendente(data: FichaEmailData, link: string) {
  const subject = 'AirTrust — Avaliação de sessão pendente';
  const text = [
    `Olá, ${data.nomeInstrutor}.`,
    '',
    `A sessão de treinamento realizada em ${data.dataSessao}, com o aluno ${data.nomeAluno}, foi finalizada e a ficha de avaliação está pendente de preenchimento.`,
    '',
    `Acesse o AirTrust para realizar a avaliação da sessão:`,
    link,
    '',
    'Esta é uma mensagem automática. Por favor, não responda este e-mail.',
  ].join('\n');
  return { subject, text };
}

function buildAlunoAssinaturaPendente(data: FichaEmailData, link: string) {
  const subject = 'AirTrust — Assinatura de ficha pendente';
  const text = [
    `Olá, ${data.nomeAluno}.`,
    '',
    `A ficha da sua sessão de treinamento realizada em ${data.dataSessao}, com o instrutor ${data.nomeInstrutor}, foi preenchida e está aguardando a sua assinatura.`,
    '',
    `Acesse o AirTrust para revisar e assinar a ficha:`,
    link,
    '',
    'Esta é uma mensagem automática. Por favor, não responda este e-mail.',
  ].join('\n');
  return { subject, text };
}

function buildInstrutorAssinaturaFinalPendente(data: FichaEmailData, link: string) {
  const subject = 'AirTrust — Assinatura final da ficha pendente';
  const text = [
    `Olá, ${data.nomeInstrutor}.`,
    '',
    `O aluno ${data.nomeAluno} assinou a ficha da sessão de treinamento realizada em ${data.dataSessao}.`,
    '',
    `A ficha agora aguarda sua assinatura final e encerramento no AirTrust.`,
    '',
    `Acesse o sistema para assinar e finalizar:`,
    link,
    '',
    'Esta é uma mensagem automática. Por favor, não responda este e-mail.',
  ].join('\n');
  return { subject, text };
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

export async function enviarEmailFichaSessao(
  env: Env,
  db: D1Database,
  fichaId: number,
  tipo: FichaEmailTipo,
): Promise<void> {
  try {
    const data = await getFichaEmailData(db, fichaId);
    if (!data) {
      console.warn(`[fichaEmails] Ficha ${fichaId} não encontrada — email ${tipo} ignorado`);
      return;
    }

    const link = fichaLink(env, fichaId);

    let subject: string;
    let text: string;
    let toEmail: string | null;
    let toName: string;

    switch (tipo) {
      case 'instrutor_avaliacao_pendente': {
        const built = buildInstrutorAvaliacaoPendente(data, link);
        subject = built.subject;
        text = built.text;
        toEmail = data.emailInstrutor;
        toName = data.nomeInstrutor;
        break;
      }
      case 'aluno_assinatura_pendente': {
        const built = buildAlunoAssinaturaPendente(data, link);
        subject = built.subject;
        text = built.text;
        toEmail = data.emailAluno;
        toName = data.nomeAluno;
        break;
      }
      case 'instrutor_assinatura_final_pendente': {
        const built = buildInstrutorAssinaturaFinalPendente(data, link);
        subject = built.subject;
        text = built.text;
        toEmail = data.emailInstrutor;
        toName = data.nomeInstrutor;
        break;
      }
      default:
        console.warn(`[fichaEmails] Tipo de email desconhecido: ${tipo}`);
        return;
    }

    if (!toEmail) {
      console.warn(
        `[fichaEmails] Destinatário sem email — tipo=${tipo} ficha=${fichaId} para="${toName}"`,
      );
      return;
    }

    await sendEmail(env, {
      to: [{ email: toEmail, name: toName }],
      subject,
      textContent: text,
      htmlContent: buildHtml(text),
    });

    console.log(`[fichaEmails] ✅ Email ${tipo} enviado → ficha=${fichaId} para=${toEmail}`);
  } catch (err) {
    console.error(`[fichaEmails] ❌ Erro ao enviar email ${tipo} para ficha ${fichaId}:`, err);
  }
}
