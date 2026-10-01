import {
  Award,
  BadgeCheck,
  Briefcase,
  ClipboardCheck,
  Clock,
  File,
  FileCheck,
  GraduationCap,
  Heart,
  IdCard,
  Plane,
  UserCheck,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type TipoDocumento =
  | 'CERTIFICADO_QUALIFICACAO'
  | 'AVALIACAO_CQ'
  | 'FTV'
  | 'EXAME_MEDICO'
  | 'LICENCA_ANAC'
  | 'SIMULADOR'
  | 'DESIGNACAO_OPERACIONAL'
  | 'EXPERIENCIA_HORAS'
  | 'INSTRUTOR_EXAMINADOR'
  | 'VINCULO_FUNCIONAL'
  | 'DOCUMENTO_PESSOAL'
  | 'CURRICULO_PROFISSIONAL'
  | 'OUTROS';

export type PastaVirtualGrupo = 'OPERACIONAL' | 'REGULATORIO' | 'PESSOAL' | 'OUTROS';

export interface PastaVirtualCategoriaConfig {
  tipo: TipoDocumento;
  titulo: string;
  descricao: string;
  icone: ComponentType<{ className?: string }>;
  cor: string;
  ordem: number;
  grupo: PastaVirtualGrupo;
  apiCategorias: string[];
  expandidoInicial?: boolean;
  somenteTripulacaoVoo?: boolean;
}

export const PASTA_VIRTUAL_GRUPOS: Array<{
  id: PastaVirtualGrupo;
  titulo: string;
  descricao: string;
  ordem: number;
}> = [
  {
    id: 'OPERACIONAL',
    titulo: 'Operação e Treinamento',
    descricao: 'Qualificações, avaliações, simuladores, designações e experiência operacional.',
    ordem: 1,
  },
  {
    id: 'REGULATORIO',
    titulo: 'Regulatório',
    descricao: 'Aptidão médica, licenças, habilitações e extratos oficiais.',
    ordem: 2,
  },
  {
    id: 'PESSOAL',
    titulo: 'Pessoal e Vínculo',
    descricao: 'Registro funcional, documentos pessoais e currículo profissional.',
    ordem: 3,
  },
  {
    id: 'OUTROS',
    titulo: 'Outros',
    descricao: 'Documentos que ainda não se enquadram nas categorias anteriores.',
    ordem: 4,
  },
];

export const PASTA_VIRTUAL_CATEGORIAS: PastaVirtualCategoriaConfig[] = [
  {
    tipo: 'CERTIFICADO_QUALIFICACAO',
    titulo: 'Treinamentos e Qualificações',
    descricao: 'Certificados de cursos, treinamentos e qualificações profissionais.',
    icone: Award,
    cor: 'blue',
    ordem: 1,
    grupo: 'OPERACIONAL',
    apiCategorias: [
      'Treinamentos e Qualificações',
      'Certificados de Qualificação',
      'Treinamento',
      'Certificados Profissionais',
    ],
    expandidoInicial: true,
  },
  {
    tipo: 'AVALIACAO_CQ',
    titulo: 'FAPs e Checks',
    descricao: 'FAPs, OPC, LPC, IFR e demais fichas de avaliação ou cheque operacional.',
    icone: ClipboardCheck,
    cor: 'purple',
    ordem: 2,
    grupo: 'OPERACIONAL',
    apiCategorias: ['FAPs e Checks', 'Avaliações e Checks'],
    somenteTripulacaoVoo: true,
  },
  {
    tipo: 'FTV',
    titulo: 'FTV — Fichas de Treinamento de Voo',
    descricao:
      'Fichas de treinamento de voo, separadas dos certificados e das fichas de avaliação.',
    icone: FileCheck,
    cor: 'blue',
    ordem: 3,
    grupo: 'OPERACIONAL',
    apiCategorias: ['Fichas de Treinamento de Voo'],
    somenteTripulacaoVoo: true,
  },
  {
    tipo: 'SIMULADOR',
    titulo: 'Simuladores',
    descricao: 'Evidências e registros de sessões realizadas em simulador.',
    icone: Plane,
    cor: 'cyan',
    ordem: 4,
    grupo: 'OPERACIONAL',
    apiCategorias: ['Simuladores'],
    somenteTripulacaoVoo: true,
  },
  {
    tipo: 'DESIGNACAO_OPERACIONAL',
    titulo: 'Designações Operacionais',
    descricao: 'Designações de função, equipamento, PIC/SIC, instrutor e examinador.',
    icone: BadgeCheck,
    cor: 'orange',
    ordem: 5,
    grupo: 'OPERACIONAL',
    apiCategorias: ['Designações Operacionais'],
  },
  {
    tipo: 'EXPERIENCIA_HORAS',
    titulo: 'Experiência e Horas de Voo',
    descricao: 'Declarações de experiência, CIV, horas de voo e experiência recente.',
    icone: Clock,
    cor: 'green',
    ordem: 6,
    grupo: 'OPERACIONAL',
    apiCategorias: ['Experiência e Horas de Voo'],
    somenteTripulacaoVoo: true,
  },
  {
    tipo: 'INSTRUTOR_EXAMINADOR',
    titulo: 'Instrutor e Examinador',
    descricao: 'Credenciamentos, cursos, termos e documentos de instrutor/examinador.',
    icone: GraduationCap,
    cor: 'purple',
    ordem: 7,
    grupo: 'OPERACIONAL',
    apiCategorias: ['Instrutor e Examinador'],
  },
  {
    tipo: 'EXAME_MEDICO',
    titulo: 'Exames Médicos',
    descricao: 'ASO, CMA, toxicológico e demais documentos de aptidão médica.',
    icone: Heart,
    cor: 'red',
    ordem: 8,
    grupo: 'REGULATORIO',
    apiCategorias: ['Exames Médicos (ASO, CMA)'],
  },
  {
    tipo: 'LICENCA_ANAC',
    titulo: 'Licenças e Extratos ANAC',
    descricao: 'Licenças, CHT, extratos de habilitações e comprovantes regulatórios.',
    icone: IdCard,
    cor: 'blue',
    ordem: 9,
    grupo: 'REGULATORIO',
    apiCategorias: ['Licenças e Extratos ANAC', 'Licenças'],
  },
  {
    tipo: 'VINCULO_FUNCIONAL',
    titulo: 'Vínculo e Registro Funcional',
    descricao: 'Ficha de registro, contrato, admissão, desligamento e documentos do vínculo.',
    icone: Briefcase,
    cor: 'orange',
    ordem: 10,
    grupo: 'PESSOAL',
    apiCategorias: ['Vínculo e Registro Funcional'],
  },
  {
    tipo: 'DOCUMENTO_PESSOAL',
    titulo: 'Documentos Pessoais',
    descricao: 'RG, CPF, CNH, CTPS, passaporte e documentos pessoais correlatos.',
    icone: FileCheck,
    cor: 'green',
    ordem: 11,
    grupo: 'PESSOAL',
    apiCategorias: ['Documentos Pessoais'],
  },
  {
    tipo: 'CURRICULO_PROFISSIONAL',
    titulo: 'Currículo Profissional',
    descricao: 'Currículo, ficha profissional e documentos de histórico profissional.',
    icone: UserCheck,
    cor: 'cyan',
    ordem: 12,
    grupo: 'PESSOAL',
    apiCategorias: ['Currículo Profissional'],
  },
  {
    tipo: 'OUTROS',
    titulo: 'Outros Documentos',
    descricao: 'Somente para arquivos que realmente não se enquadram nas categorias acima.',
    icone: File,
    cor: 'gray',
    ordem: 13,
    grupo: 'OUTROS',
    apiCategorias: ['Outros'],
  },
];

export const pastaVirtualCategoriaPorTipo = Object.fromEntries(
  PASTA_VIRTUAL_CATEGORIAS.map((categoria) => [categoria.tipo, categoria]),
) as Record<TipoDocumento, PastaVirtualCategoriaConfig>;

export function isTripulacaoVooFuncionario(...values: Array<string | null | undefined>): boolean {
  const normalized = values
    .map((value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim(),
    )
    .filter(Boolean)
    .join(' ');

  return /(^|\b)(comandante|copiloto|co-piloto)(\b|$)/.test(normalized);
}
