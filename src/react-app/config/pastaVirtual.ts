import { Award, Heart, FileCheck, File, Plane } from 'lucide-react';
import type { TipoDocumento } from '@/react-app/hooks/usePastaVirtual';

import type { ComponentType } from 'react';

export interface PastaVirtualCategoriaConfig {
  tipo: TipoDocumento;
  titulo: string;
  descricao?: string;
  icone: ComponentType<{ className?: string }>;
  cor: string; // semantic color key
  ordem: number;
  expandidoInicial?: boolean;
}

export const PASTA_VIRTUAL_CATEGORIAS: PastaVirtualCategoriaConfig[] = [
  {
    tipo: 'CERTIFICADO_QUALIFICACAO',
    titulo: 'Certificados de Qualificação',
    descricao: 'Gerados ou anexados para cada histórico de qualificação',
    icone: Award,
    cor: 'blue',
    ordem: 1,
    expandidoInicial: true,
  },
  {
    tipo: 'EXAME_MEDICO',
    titulo: 'Exames Médicos (ASO, CMA)',
    descricao: 'Documentos de saúde e aptidão',
    icone: Heart,
    cor: 'red',
    ordem: 2,
  },
  {
    tipo: 'SIMULADOR',
    titulo: 'Fichas de Simulador',
    descricao: 'Fichas de treinamento em simulador arquivadas',
    icone: Plane,
    cor: 'cyan',
    ordem: 3,
  },
  {
    tipo: 'DOCUMENTO_PESSOAL',
    titulo: 'Documentos Pessoais',
    descricao: 'Identidade, comprovantes e registros pessoais',
    icone: FileCheck,
    cor: 'green',
    ordem: 4,
  },
  {
    tipo: 'OUTROS',
    titulo: 'Outros Documentos',
    descricao: 'Arquivos diversos não categorizados',
    icone: File,
    cor: 'gray',
    ordem: 7,
  },
];

export const pastaVirtualCategoriaPorTipo = Object.fromEntries(
  PASTA_VIRTUAL_CATEGORIAS.map((c) => [c.tipo, c]),
) as Record<TipoDocumento, PastaVirtualCategoriaConfig>;
