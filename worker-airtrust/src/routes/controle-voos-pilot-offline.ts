/**
 * Pacote operacional read-only para o Pilot App offline.
 *
 * Esta rota não cria lease, não escreve rascunho, não sincroniza mudanças e
 * não produz qualquer artefato regulatório de eDB. O único objetivo desta
 * fase é entregar ao tablet um snapshot operacional explicitamente versionado
 * do voo ao qual o usuário já tem acesso pelo fluxo RDV.
 */
import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import type { Env } from '../types';
import {
  getActiveRdvByFlight,
  getActorId,
  getEmpresaIdSafe,
  getFlightOrThrow,
  getFuncionarioIdForUser,
} from '../repositories/controle-voos/rdv-repository';
import {
  RDV_CAPABILITIES,
  assertRdvSelfScope,
  requireAnyRdvAccess,
} from '../services/controle-voos/rdv-workflow';

const pilotOffline = new Hono<{ Bindings: Env }>();

type CrewRow = {
  id: number;
  funcionario_id: number;
  etapa_id: number | null;
  funcao: string;
  horario_apresentacao: string | null;
  horario_dispensa: string | null;
  observacoes: string | null;
  nome: string | null;
  codigo_anac: string | null;
  updated_at: string | null;
};

type StageRow = {
  id: number;
  numero_etapa: number;
  origem_icao: string | null;
  destino_icao: string | null;
  horario_motor_ligado: string | null;
  horario_decolagem: string | null;
  horario_pouso: string | null;
  horario_motor_desligado: string | null;
  tempo_decolagem_pouso: number | null;
  tempo_total: number | null;
  tempo_navegacao: number | null;
  tempo_ifr: number | null;
  tempo_noturno: number | null;
  pousos_diurnos: number | null;
  pousos_noturnos: number | null;
  starts: number | null;
  pax: number | null;
  payload: number | null;
  combustivel_inicio: number | null;
  combustivel_fim: number | null;
  unidade_combustivel: string | null;
  origem_dados: string | null;
  updated_at: string | null;
};

type FuelRow = {
  id: number;
  etapa_id: number | null;
  fornecedor: string | null;
  localidade: string | null;
  combustivel_solicitado: number | null;
  unidade: string | null;
  combustivel_abastecido: number | null;
  numero_ce: string | null;
  anexo_r2_key: string | null;
  responsavel_id: number | null;
  data_hora: string | null;
  observacoes: string | null;
  updated_at: string | null;
};

type AirportRow = {
  id: number;
  codigo: string | null;
  codigo_icao: string | null;
  codigo_iata: string | null;
  nome: string | null;
  cidade: string | null;
  uf: string | null;
  tipo: string | null;
};

type AircraftRow = {
  id: number;
  modelo: string | null;
};

pilotOffline.get(
  '/voos/:id/offline-package',
  auth(),
  requireAnyRdvAccess(),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const voo = await getFlightOrThrow(c.env.DB, c.req.param('id'), empresaId);

    // Reutiliza o mesmo escopo já aplicado ao RDV: Coordenação com acesso
    // amplo pode visualizar; piloto precisa capability própria + vínculo real
    // em cv_voo_tripulantes no mesmo tenant.
    await assertRdvSelfScope(
      c,
      c.env.DB,
      empresaId,
      voo.id,
      RDV_CAPABILITIES.visualizarProprio,
    );

    const userId = getActorId(c);
    const funcionarioId = await getFuncionarioIdForUser(c.env.DB, userId);

    const [
      rdv,
      crewResult,
      stagesResult,
      fuelResult,
      origem,
      destino,
      aeronave,
    ] = await Promise.all([
      getActiveRdvByFlight(c.env.DB, voo.id, empresaId),
      c.env.DB
        .prepare(
          `
            SELECT
              t.id, t.funcionario_id, t.etapa_id, t.funcao,
              t.horario_apresentacao, t.horario_dispensa, t.observacoes,
              f.nome, f.codigo_anac, t.updated_at
            FROM cv_voo_tripulantes t
            LEFT JOIN funcionarios f
              ON f.id = t.funcionario_id
             AND f.empresa_id = t.empresa_id
             AND f.deleted_at IS NULL
            WHERE t.voo_id = ?
              AND t.empresa_id = ?
              AND t.deleted_at IS NULL
            ORDER BY t.funcao ASC, t.id ASC
          `,
        )
        .bind(voo.id, empresaId)
        .all<CrewRow>(),
      c.env.DB
        .prepare(
          `
            SELECT
              id, numero_etapa, origem_icao, destino_icao,
              horario_motor_ligado, horario_decolagem, horario_pouso,
              horario_motor_desligado, tempo_decolagem_pouso, tempo_total,
              tempo_navegacao, tempo_ifr, tempo_noturno,
              pousos_diurnos, pousos_noturnos, starts, pax, payload,
              combustivel_inicio, combustivel_fim, unidade_combustivel,
              origem_dados, updated_at
            FROM cv_voo_etapas
            WHERE voo_id = ?
              AND empresa_id = ?
              AND deleted_at IS NULL
            ORDER BY numero_etapa ASC, id ASC
          `,
        )
        .bind(voo.id, empresaId)
        .all<StageRow>(),
      c.env.DB
        .prepare(
          `
            SELECT
              id, etapa_id, fornecedor, localidade, combustivel_solicitado,
              unidade, combustivel_abastecido, numero_ce, anexo_r2_key,
              responsavel_id, data_hora, observacoes, updated_at
            FROM cv_voo_abastecimentos
            WHERE voo_id = ?
              AND empresa_id = ?
              AND deleted_at IS NULL
            ORDER BY data_hora ASC, id ASC
          `,
        )
        .bind(voo.id, empresaId)
        .all<FuelRow>(),
      c.env.DB
        .prepare(
          `
            SELECT id, codigo, codigo_icao, codigo_iata, nome, cidade, uf, tipo
            FROM cv_aeroportos
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
            LIMIT 1
          `,
        )
        .bind(voo.origem_id, empresaId)
        .first<AirportRow>(),
      c.env.DB
        .prepare(
          `
            SELECT id, codigo, codigo_icao, codigo_iata, nome, cidade, uf, tipo
            FROM cv_aeroportos
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
            LIMIT 1
          `,
        )
        .bind(voo.destino_id, empresaId)
        .first<AirportRow>(),
      voo.aeronave_id
        ? c.env.DB
            .prepare('SELECT id, modelo FROM aeronaves WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1')
            .bind(voo.aeronave_id, empresaId)
            .first<AircraftRow>()
        : Promise.resolve(null),
    ]);

    const sourceRevision = {
      voo: voo.versao,
      rdv: rdv?.versao ?? 0,
      stages: (stagesResult.results || []).map((stage) => ({
        id: stage.id,
        updated_at: stage.updated_at,
      })),
      crew: (crewResult.results || []).map((member) => ({
        id: member.id,
        updated_at: member.updated_at,
      })),
      fuel: (fuelResult.results || []).map((entry) => ({
        id: entry.id,
        updated_at: entry.updated_at,
      })),
    };

    const packageId = `pilot-offline:v1:voo:${voo.id}:v${voo.versao}:rdv:${rdv?.versao ?? 0}`;

    c.header('Cache-Control', 'no-store, max-age=0');
    c.header('Pragma', 'no-cache');

    return c.json({
      success: true,
      data: {
        contract: {
          name: 'airtrust-pilot-offline-package',
          version: 1,
          package_id: packageId,
          generated_at: new Date().toISOString(),
          read_only: true,
          sync_supported: false,
          attachments_included: false,
          regulated_edb: false,
        },
        identity: {
          tenant_id: empresaId,
          user_id: userId,
          funcionario_id: funcionarioId,
        },
        source_revision: sourceRevision,
        voo: {
          id: voo.id,
          prefixo: voo.prefixo,
          data_programacao: voo.data_programacao,
          origem_id: voo.origem_id,
          destino_id: voo.destino_id,
          tipo_voo_id: voo.tipo_voo_id,
          natureza_voo_id: voo.natureza_voo_id,
          aeronave_id: voo.aeronave_id,
          horario_previsto_partida: voo.horario_previsto_partida,
          horario_previsto_chegada: voo.horario_previsto_chegada,
          horario_real_partida: voo.horario_real_partida,
          horario_real_chegada: voo.horario_real_chegada,
          status: voo.status,
          observacoes: voo.observacoes,
          alternado_destino_id: voo.alternado_destino_id,
          versao: voo.versao,
          updated_at: voo.updated_at,
        },
        origem,
        destino,
        aeronave,
        tripulantes: crewResult.results || [],
        etapas: stagesResult.results || [],
        abastecimentos: (fuelResult.results || []).map(({ anexo_r2_key, ...entry }) => ({
          ...entry,
          tem_anexo: Boolean(anexo_r2_key),
        })),
        rdv: rdv
          ? {
              id: rdv.id,
              numero: rdv.numero,
              data_voo: rdv.data_voo,
              horario_decolagem_real: rdv.horario_decolagem_real,
              horario_pouso_real: rdv.horario_pouso_real,
              horas_voadas: rdv.horas_voadas,
              numero_pousos: rdv.numero_pousos,
              ciclos: rdv.ciclos,
              combustivel_decolagem: rdv.combustivel_decolagem,
              combustivel_pouso: rdv.combustivel_pouso,
              combustivel_consumo: rdv.combustivel_consumo,
              pob: rdv.pob,
              carga_kg: rdv.carga_kg,
              ocorrencias: rdv.ocorrencias,
              divergencias: rdv.divergencias,
              status: rdv.status,
              workflow_status: rdv.workflow_status,
              versao: rdv.versao,
              updated_at: rdv.updated_at,
            }
          : null,
      },
    });
  },
);

export default pilotOffline;
