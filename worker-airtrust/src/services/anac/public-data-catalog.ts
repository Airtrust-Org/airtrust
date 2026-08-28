export const ANAC_PUBLIC_DATA_CATALOG_VERSION = 'anac.public-data.v1' as const;

export type AnacPublicDataSourceId =
  | 'RAB_AIRCRAFT'
  | 'PUBLIC_AERODROMES'
  | 'PRIVATE_AERODROMES'
  | 'RBAC145_ORGANIZATIONS';

export type AnacPublicDataFormat = 'JSON' | 'CSV_JSON_DIRECTORY';

export interface AnacPublicDataSource {
  id: AnacPublicDataSourceId;
  label: string;
  authority: 'ANAC';
  classification: 'OFFICIAL_PUBLIC_DATA';
  format: AnacPublicDataFormat;
  metadataUrl: string;
  dataUrl: string;
  expectedRefresh: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'SOURCE_DEFINED';
  containsPersonalData: boolean;
  ingestionPolicy: 'MINIMIZED_PROJECTION_ONLY';
  operationalUses: readonly string[];
}

/**
 * Registry of ANAC public sources that can be consumed without privileged API credentials.
 *
 * Data URLs are deliberately separated from regulated/private integrations (eDB, CHT, CMA).
 * A source being public does not make its fields suitable for unrestricted persistence: every
 * ingestion must project only the attributes required by the AirTrust use case.
 */
export const ANAC_PUBLIC_DATA_SOURCES: Readonly<Record<AnacPublicDataSourceId, AnacPublicDataSource>> = {
  RAB_AIRCRAFT: {
    id: 'RAB_AIRCRAFT',
    label: 'Registro Aeronáutico Brasileiro (RAB)',
    authority: 'ANAC',
    classification: 'OFFICIAL_PUBLIC_DATA',
    format: 'JSON',
    metadataUrl:
      'https://www.anac.gov.br/acesso-a-informacao/dados-abertos/areas-de-atuacao/aeronaves/registro-aeronautico-brasileiro/5-registro-aeronautico-brasileiro',
    dataUrl: 'https://sistemas.anac.gov.br/dadosabertos/Aeronaves/RAB/dados_aeronaves.json',
    expectedRefresh: 'MONTHLY',
    containsPersonalData: true,
    ingestionPolicy: 'MINIMIZED_PROJECTION_ONLY',
    operationalUses: [
      'aircraft-registration-validation',
      'aircraft-master-data-enrichment',
      'airworthiness-status-cross-check',
      'edb-aircraft-snapshot-support',
    ],
  },
  PUBLIC_AERODROMES: {
    id: 'PUBLIC_AERODROMES',
    label: 'Aeródromos Públicos — Características Gerais',
    authority: 'ANAC',
    classification: 'OFFICIAL_PUBLIC_DATA',
    format: 'CSV_JSON_DIRECTORY',
    metadataUrl:
      'https://www.anac.gov.br/acesso-a-informacao/dados-abertos/areas-de-atuacao/aerodromos/aerodromos-publicos-caracteristicas-gerais',
    dataUrl:
      'https://sistemas.anac.gov.br/dadosabertos/Aerodromos/Aer%C3%B3dromos%20P%C3%BAblicos/Caracter%C3%ADsticas%20Gerais/',
    expectedRefresh: 'BIWEEKLY',
    containsPersonalData: false,
    ingestionPolicy: 'MINIMIZED_PROJECTION_ONLY',
    operationalUses: [
      'flight-origin-destination-validation',
      'aerodrome-master-data-enrichment',
      'flight-planning-reference',
    ],
  },
  PRIVATE_AERODROMES: {
    id: 'PRIVATE_AERODROMES',
    label: 'Aeródromos Privados V2 — aeródromos, helipontos e helidecks',
    authority: 'ANAC',
    classification: 'OFFICIAL_PUBLIC_DATA',
    format: 'CSV_JSON_DIRECTORY',
    metadataUrl:
      'https://www.anac.gov.br/acesso-a-informacao/dados-abertos/areas-de-atuacao/aerodromos/lista-de-aerodromos-privados-v2/',
    dataUrl:
      'https://sistemas.anac.gov.br/dadosabertos/Aerodromos/Aer%C3%B3dromos%20Privados/Lista%20de%20aer%C3%B3dromos%20privados/',
    expectedRefresh: 'SOURCE_DEFINED',
    containsPersonalData: false,
    ingestionPolicy: 'MINIMIZED_PROJECTION_ONLY',
    operationalUses: [
      'offshore-helideck-reference',
      'flight-origin-destination-validation',
      'flight-planning-reference',
    ],
  },
  RBAC145_ORGANIZATIONS: {
    id: 'RBAC145_ORGANIZATIONS',
    label: 'Organizações de Manutenção — RBAC 145',
    authority: 'ANAC',
    classification: 'OFFICIAL_PUBLIC_DATA',
    format: 'CSV_JSON_DIRECTORY',
    metadataUrl:
      'https://www.anac.gov.br/acesso-a-informacao/dados-abertos/areas-de-atuacao/organizacoes-de-manutencao/oficinas-de-manutencao',
    dataUrl:
      'https://sistemas.anac.gov.br/dadosabertos/Organizacoes%20de%20Manutencao/',
    expectedRefresh: 'SOURCE_DEFINED',
    containsPersonalData: false,
    ingestionPolicy: 'MINIMIZED_PROJECTION_ONLY',
    operationalUses: [
      'maintenance-organization-validation',
      'edb-return-to-service-support',
    ],
  },
};

export function getAnacPublicDataSource(id: AnacPublicDataSourceId): AnacPublicDataSource {
  return ANAC_PUBLIC_DATA_SOURCES[id];
}

export function isOfficialAnacPublicDataUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'www.anac.gov.br' ||
        url.hostname === 'anac.gov.br' ||
        url.hostname.endsWith('.anac.gov.br'))
    );
  } catch {
    return false;
  }
}
