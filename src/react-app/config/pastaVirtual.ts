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
    titulo: 'Avaliações, Checks e FAP',
    descricao: 'FAP, OPC, LPC, IFR, FTV, checks e demais avaliações operacionais.',
    icone: ClipboardCheck,
    cor: 'purple',
    ordem: 2,
    grupo: 'OPERACIONAL',
    apiCategorias: ['Avaliações e Checks'],
  },
  {
    tipo: 'SIMULADOR',
    titulo: 'Simuladores e Treinamento de Voo',
    descricao: 'Fichas e evidências de sessões de simulador ou treinamento de voo.',
    icone: Plane,
    cor: 'cyan',
    ordem: 3,
    grupo: 'OPERACIONAL',
    apiCategorias: ['Simuladores'],
  },
  {
    tipo: 'DESIGNACAO_OPERACIONAL',
    titulo: 'Designações Operacionais',
    descricao: 'Designações de função, equipamento, PIC/SIC, instrutor e examinador.',
    icone: BadgeCheck,
    cor: 'orange',
    ordem: 4,
    grupo: 'OPERACIONAL',
    apiCategorias: ['Designações Operacionais'],
  },
  {
    tipo: 'EXPERIENCIA_HORAS',
    titulo: 'Experiência e Horas de Voo',
    descricao: 'Declarações de experiência, CIV, horas de voo e experiência recente.',
    icone: Clock,
    cor: 'green',
    ordem: 5,
    grupo: 'OPERACIONAL',
    apiCategorias: ['Experiência e Horas de Voo'],
  },
  {
    tipo: 'INSTRUTOR_EXAMINADOR',
    titulo: 'Instrutor e Examinador',
    descricao: 'Credenciamentos, cursos, termos e documentos de instrutor/examinador.',
    icone: GraduationCap,
    cor: 'purple',
    ordem: 6,
    grupo: 'OPERACIONAL',
    apiCategorias: ['Instrutor e Examinador'],
  },
  {
    tipo: 'EXAME_MEDICO',
    titulo: 'Exames Médicos',
    descricao: 'ASO, CMA, toxicológico e demais documentos de aptidão médica.',
    icone: Heart,
    cor: 'red',
    ordem: 7,
    grupo: 'REGULATORIO',
    apiCategorias: ['Exames Médicos (ASO, CMA)'],
  },
  {
    tipo: 'LICENCA_ANAC',
    titulo: 'Licenças e Extratos ANAC',
    descricao: 'Licenças, CHT, extratos de habilitações e comprovantes regulatórios.',
    icone: IdCard,
    cor: 'blue',
    ordem: 8,
    grupo: 'REGULATORIO',
    apiCategorias: ['Licenças e Extratos ANAC', 'Licenças'],
  },
  {
    tipo: 'VINCULO_FUNCIONAL',
    titulo: 'Vínculo e Registro Funcional',
    descricao: 'Ficha de registro, contrato, admissão, desligamento e documentos do vínculo.',
    icone: Briefcase,
    cor: 'orange',
    ordem: 9,
    grupo: 'PESSOAL',
    apiCategorias: ['Vínculo e Registro Funcional'],
  },
  {
    tipo: 'DOCUMENTO_PESSOAL',
    titulo: 'Documentos Pessoais',
    descricao: 'RG, CPF, CNH, CTPS, passaporte e documentos pessoais correlatos.',
    icone: FileCheck,
    cor: 'green',
    ordem: 10,
    grupo: 'PESSOAL',
    apiCategorias: ['Documentos Pessoais'],
  },
  {
    tipo: 'CURRICULO_PROFISSIONAL',
    titulo: 'Currículo Profissional',
    descricao: 'Currículo, ficha profissional e documentos de histórico profissional.',
    icone: UserCheck,
    cor: 'cyan',
    ordem: 11,
    grupo: 'PESSOAL',
    apiCategorias: ['Currículo Profissional'],
  },
  {
    tipo: 'OUTROS',
    titulo: 'Outros Documentos',
    descricao: 'Somente para arquivos que realmente não se enquadram nas categorias acima.',
    icone: File,
    cor: 'gray',
    ordem: 12,
    grupo: 'OUTROS',
    apiCategorias: ['Outros'],
  },
];

export const pastaVirtualCategoriaPorTipo = Object.fromEntries(
  PASTA_VIRTUAL_CATEGORIAS.map((categoria) => [categoria.tipo, categoria]),
) as Record<TipoDocumento, PastaVirtualCategoriaConfig>;
