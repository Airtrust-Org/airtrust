# Módulo de Qualificações

## 📋 Visão Geral

O módulo de Qualificações é responsável pelo gerenciamento completo de treinamentos, exames e checks dos funcionários no sistema AirTrust.

## 🎯 Funcionalidades Principais

### 1. Gerenciamento de Qualificações
- ✅ Listagem com filtros avançados
- ✅ Criação via modal
- ✅ Edição inline
- ✅ Exclusão com confirmação
- ✅ Sistema de renovação automática

### 2. Upload de Certificados
- ✅ Upload de PDFs
- ✅ Visualização de certificados
- ✅ Download de certificados
- ✅ Exclusão de certificados

### 3. Importação em Lote
- ✅ Importação via CSV/Excel
- ✅ Validação de dados
- ✅ Preview antes de importar
- ✅ Relatório de erros

### 4. Configuração
- ✅ Configurar colunas visíveis
- ✅ Ordenação de colunas (drag & drop)
- ✅ Persistência em localStorage

## 📁 Estrutura de Arquivos

```
qualificacoes/
├── README.md                          # Este arquivo
├── ConfigurarColunasQualificacoes.tsx # Modal de configuração de colunas
├── ImportarQualificacoes.tsx          # Importação em lote
├── FormularioQualificacao.tsx         # Formulário de criação/edição
├── Dashboard.tsx                      # Dashboard de qualificações
├── DashboardGraficos.tsx             # Gráficos e estatísticas
├── Alertas.tsx                       # Alertas de vencimento
├── Treinamentos.tsx                  # Gestão de treinamentos
├── Exames.tsx                        # Gestão de exames
├── Checks.tsx                        # Gestão de checks
└── QualificacoesMain.tsx             # Componente principal (legado)
```

## 🔧 Componentes Principais

### Qualificacoes.tsx (Página Principal)
**Responsabilidades:**
- Container principal da página
- Gerenciamento de estado global
- Coordenação entre componentes
- Chamadas à API

**Props:** Nenhuma (página raiz)

**Estado Principal:**
```typescript
- qualificacoes: Qualificacao[]
- loading: boolean
- filtros: FiltrosQualificacoes
- paginacao: Paginacao
- configColunas: Coluna[]
```

### ModalNovaQualificacao.tsx
**Responsabilidades:**
- Formulário de criação de qualificação
- Validação de dados
- Seleção de funcionário e tipo
- Cálculo automático de vencimento

**Props:**
```typescript
interface ModalNovaQualificacaoProps {
  onClose: () => void;
  onSave: () => void;
}
```

### ModalEditarQualificacao.tsx
**Responsabilidades:**
- Formulário de edição de qualificação
- Carregamento de dados existentes
- Atualização de qualificação

**Props:**
```typescript
interface ModalEditarQualificacaoProps {
  qualificacaoId: number;
  onClose: () => void;
  onSave: () => void;
}
```

### ConfigurarColunasQualificacoes.tsx
**Responsabilidades:**
- Configuração de colunas visíveis
- Ordenação de colunas (drag & drop)
- Persistência em localStorage

**Props:**
```typescript
interface ConfigurarColunasQualificacoesProps {
  onClose: () => void;
  onSave: () => void;
}
```

## 🔄 Fluxo de Dados

### Criação de Qualificação
```
1. Usuário clica em "+ Nova Qualificação"
2. ModalNovaQualificacao abre
3. Usuário preenche formulário
4. Validação de dados
5. POST /api/v2/qualificacoes
6. Sistema marca qualificações anteriores como RENOVADA
7. Tabela atualiza automaticamente
8. Modal fecha
```

### Edição de Qualificação
```
1. Usuário clica no ícone de editar
2. ModalEditarQualificacao abre
3. GET /api/v2/qualificacoes/:id (carrega dados)
4. Usuário edita campos
5. PUT /api/v2/qualificacoes/:id
6. Tabela atualiza
7. Modal fecha
```

### Upload de Certificado
```
1. Usuário clica no ícone de upload
2. CertificadoUpload abre
3. Usuário seleciona arquivo PDF
4. POST /api/v2/certificados/upload
5. Arquivo salvo no R2 Bucket
6. certificado_url atualizado na qualificação
7. Lista de certificados atualiza
```

## 🎨 Tipos e Interfaces

### Qualificacao
```typescript
interface Qualificacao {
  id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_matricula: string;
  tipo: 'TREINAMENTO' | 'EXAME' | 'CHECK';
  codigo: string;
  nome?: string;
  data_conclusao?: string;
  data_vencimento?: string;
  validade_meses: number;
  status: 'VALIDA' | 'VENCENDO' | 'VENCIDA' | 'RENOVADA';
  certificado_url?: string;
  is_renovada: boolean;
}
```

### TipoQualificacao
```typescript
interface TipoQualificacao {
  id: number;
  codigo: string;
  nome: string;
  tipo: 'TREINAMENTO' | 'EXAME' | 'CHECK';
  validade_meses: number;
  vencimento_tipo: 'DIA_EXATO' | 'FIM_DO_MES';
  categoria?: string;
}
```

## 🔌 Endpoints da API

### Qualificações
- `GET /api/v2/qualificacoes` - Listar qualificações
- `GET /api/v2/qualificacoes/:id` - Buscar por ID
- `POST /api/v2/qualificacoes` - Criar qualificação
- `PUT /api/v2/qualificacoes/:id` - Atualizar qualificação
- `DELETE /api/v2/qualificacoes/:id` - Excluir qualificação

### Tipos de Qualificações
- `GET /api/v2/tipos-qualificacoes` - Listar tipos
- `POST /api/v2/tipos-qualificacoes` - Criar tipo
- `PUT /api/v2/tipos-qualificacoes/:id` - Atualizar tipo
- `DELETE /api/v2/tipos-qualificacoes/:id` - Excluir tipo

### Certificados
- `POST /api/v2/certificados/upload` - Upload de certificado
- `DELETE /api/v2/certificados/:id` - Excluir certificado
- `GET /api/v2/certificados/funcionario/:id` - Listar por funcionário

## 📊 Estado e Persistência

### LocalStorage
```typescript
// Configuração de colunas
localStorage.setItem('qualificacoes_colunas_config', JSON.stringify(colunas));

// Estrutura:
{
  id: string;
  nome: string;
  visivel: boolean;
}[]
```

## 🐛 Debugging

### Logs Importantes
```typescript
// Criação de qualificação
console.log('Criando qualificação:', data);

// Erro ao carregar
console.error('Erro ao carregar qualificações:', error);

// Upload de certificado
console.log('Upload iniciado:', file.name);
```

### Problemas Comuns

**1. Qualificações não carregam**
- Verificar se API está respondendo
- Verificar filtros aplicados
- Verificar console para erros

**2. Upload de certificado falha**
- Verificar tamanho do arquivo (< 10MB)
- Verificar formato (apenas PDF)
- Verificar R2 Bucket configurado

**3. Renovação não funciona**
- Verificar se código e funcionário são os mesmos
- Verificar campo `is_renovada` no banco

## 🚀 Performance

### Otimizações Aplicadas
- ✅ Paginação de resultados (20 por página)
- ✅ Debounce em filtros de busca
- ✅ Lazy loading de modais
- ✅ Memoização de componentes pesados

### Métricas
- Tempo de carregamento inicial: ~500ms
- Tempo de abertura de modal: ~100ms
- Tempo de upload de certificado: ~2s (depende do tamanho)

## 🛡️ Validação com Zod

Todos os endpoints de qualificações usam validação Zod para garantir type safety e prevenir erros.

### Schemas Disponíveis

```typescript
import {
  QualificacaoSchema,           // Entidade completa
  CriarQualificacaoSchema,       // Para criação (POST)
  AtualizarQualificacaoSchema,   // Para atualização (PUT)
  FiltrosQualificacoesSchema,    // Para filtros (GET)
  TipoQualificacaoSchema,        // Tipo de qualificação
} from '@/schemas/qualificacoes.schema';
```

### Backend - Validação de Requests

```typescript
import { validateRequest } from '@/worker/utils/zod-validation';
import { CriarQualificacaoSchema } from '@/schemas/qualificacoes.schema';

// Validar dados de entrada
const validation = validateRequest(CriarQualificacaoSchema, body);

if (!validation.success) {
  return c.json(validation, 400); // Retorna erros detalhados
}

const dadosValidados = validation.data; // Tipado corretamente!
```

### Frontend - Validação de Responses

```typescript
import { useValidatedFetch } from '@/hooks/useValidatedFetch';
import { QualificacaoSchema } from '@/schemas/qualificacoes.schema';

// Criar função de fetch validada
const fetchQualificacoes = useValidatedFetch(
  z.array(QualificacaoSchema)
);

// Usar (data é tipado automaticamente)
const data = await fetchQualificacoes('/api/v2/qualificacoes');
// data: Qualificacao[]
```

### Validação de Formulários

```typescript
import { useValidateData } from '@/hooks/useValidatedFetch';

const validateForm = useValidateData(CriarQualificacaoSchema);

const result = validateForm(formData);

if (!result.valid) {
  // Mostrar erros
  console.error(result.errors);
  return;
}

// Enviar dados validados
await api.post('/qualificacoes', result.data);
```

### Tratamento de Erros

Erros de validação retornam formato padronizado:

```json
{
  "success": false,
  "error": "Dados inválidos",
  "details": [
    {
      "path": "funcionario_id",
      "message": "ID do funcionário deve ser positivo"
    },
    {
      "path": "codigo",
      "message": "Código é obrigatório"
    }
  ]
}
```

## 📝 TODO / Melhorias Futuras

- [x] Adicionar validação com Zod ✅
- [ ] Extrair hooks customizados (useQualificacoes)
- [ ] Dividir Qualificacoes.tsx em componentes menores
- [ ] Adicionar testes unitários
- [ ] Implementar cache de dados
- [ ] Melhorar feedback visual de loading
- [ ] Adicionar filtros salvos
- [ ] Exportação para Excel/PDF

## 🤝 Contribuindo

Ao modificar este módulo:
1. Manter compatibilidade com API existente
2. Adicionar testes para novas funcionalidades
3. Atualizar este README
4. Seguir padrões de código do projeto
5. Fazer commits atômicos e descritivos

## 📚 Referências

- [Documentação da API](../../worker/api/v2/qualificacoes.ts)
- [Schemas Zod](../../schemas/qualificacoes.schema.ts)
- [Tipos TypeScript](../../types/qualificacoes.ts)

---

**Última atualização**: 1 de Novembro de 2025  
**Mantido por**: Equipe AirTrust
