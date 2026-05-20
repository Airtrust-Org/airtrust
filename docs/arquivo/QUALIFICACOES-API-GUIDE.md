# 📚 AirTrust - Guia Completo de Qualificações

## Sumário

1. [Endpoints da API](#endpoints-da-api)
2. [Rotas Frontend](#rotas-frontend)
3. [Componentes](#componentes)
4. [Status & Informações](#status--informações)

---

## Endpoints da API

### Base URL

```
https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes
```

### GET Endpoints

#### 1. **GET / - Listar Qualificações**

- **Path**: `/api/v2/qualificacoes`
- **Descrição**: Lista todas as qualificações com paginação e filtros
- **Query Parameters**:
  - `page`: Número da página (padrão: 1)
  - `limit`: Itens por página (padrão: 20)
  - `tipo`: Filtrar por tipo (TREINAMENTO, EXAME, CHECK)
  - `status`: Filtrar por status (VALIDA, VENCENDO, VENCIDA, CANCELADA, RENOVADA)
  - `busca`: Buscar por nome do funcionário
  - `nome_qualificacao`: Buscar por nome da qualificação
  - `data_inicio`: Filtro de data inicial
  - `data_fim`: Filtro de data final
  - `orderBy`: Campo para ordenação (default: data_vencimento)
  - `orderDir`: Direção (asc ou desc)

**Exemplo**:

```bash
curl -X GET "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes?page=1&limit=20&tipo=TREINAMENTO&status=VALIDA"
```

#### 2. **GET /:id - Obter Qualificação por ID**

- **Path**: `/api/v2/qualificacoes/{id}`
- **Descrição**: Retorna detalhes de uma qualificação específica
- **Exemplo**:

```bash
curl -X GET "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes/958"
```

#### 3. **GET /alertas-vencimento - Alertas de Vencimento**

- **Path**: `/api/v2/qualificacoes/alertas-vencimento`
- **Descrição**: Retorna qualificações com alertas de vencimento
- **Retorna**:
  - `vencidas`: Qualificações vencidas
  - `vencendo_7`: Vencendo em 7 dias
  - `vencendo_30`: Vencendo em 30 dias

**Exemplo**:

```bash
curl -X GET "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes/alertas-vencimento"
```

#### 4. **GET /funcionario/:funcionario_id - Qualificações por Funcionário**

- **Path**: `/api/v2/qualificacoes/funcionario/{funcionario_id}`
- **Descrição**: Lista todas as qualificações de um funcionário específico
- **Exemplo**:

```bash
curl -X GET "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes/funcionario/39"
```

#### 5. **GET /stats - Estatísticas**

- **Path**: `/api/v2/qualificacoes/stats`
- **Descrição**: Retorna estatísticas gerais de qualificações
- **Retorna**:
  - `total`: Total de qualificações
  - `validas`: Qualificações válidas
  - `vencendo`: Qualificações vencendo
  - `vencidas`: Qualificações vencidas
  - `por_tipo`: Contagem por tipo

**Exemplo**:

```bash
curl -X GET "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes/stats"
```

#### 6. **GET /stats/funcionario/:funcionario_id - Estatísticas por Funcionário**

- **Path**: `/api/v2/qualificacoes/stats/funcionario/{funcionario_id}`
- **Descrição**: Retorna estatísticas de qualificações de um funcionário

**Exemplo**:

```bash
curl -X GET "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes/stats/funcionario/39"
```

### POST Endpoints

#### 1. **POST / - Criar Qualificação**

- **Path**: `/api/v2/qualificacoes`
- **Descrição**: Cria uma nova qualificação
- **Body**:

```json
{
  "funcionario_id": 39,
  "tipo": "TREINAMENTO",
  "codigo": "OPC",
  "nome": "OPC",
  "descricao": "OPC",
  "data_realizao": "2024-07-31",
  "validade_meses": 12
}
```

**Exemplo**:

```bash
curl -X POST "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes" \
  -H "Content-Type: application/json" \
  -d '{
    "funcionario_id": 39,
    "tipo": "TREINAMENTO",
    "codigo": "F2",
    "nome": "SK76 - Solo"
  }'
```

### PUT Endpoints

#### 1. **PUT /:id - Atualizar Qualificação**

- **Path**: `/api/v2/qualificacoes/{id}`
- **Descrição**: Atualiza uma qualificação existente
- **Body**: Mesmos campos de criação

**Exemplo**:

```bash
curl -X PUT "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes/958" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "RENOVADA",
    "data_renovacao": "2025-07-31"
  }'
```

### DELETE Endpoints

#### 1. **DELETE /:id - Deletar Qualificação (Soft Delete)**

- **Path**: `/api/v2/qualificacoes/{id}`
- **Descrição**: Soft delete de uma qualificação (marca como deletada sem remover do BD)

**Exemplo**:

```bash
curl -X DELETE "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes/958"
```

#### 2. **DELETE /delete-all-certificates - Deletar Todos os Certificados**

- **Path**: `/api/v2/certificados/delete-all-certificates`
- **Descrição**: Deleta todos os certificados do sistema
- **Nota**: Operação destrutiva! Use com cuidado.

**Exemplo**:

```bash
curl -X DELETE "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/certificados/delete-all-certificates"
```

---

## Rotas Frontend

### Arquivo Principal

**Path**: `/src/react-app/pages/Qualificacoes.tsx`

### Rotas React Router

```
Base URL: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
```

#### 1. **Página Principal de Qualificações**

- **Route**: `/qualificacoes`
- **Component**: `QualificacoesMain`
- **URL Completa**: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/qualificacoes
- **Descrição**: Interface principal para gerenciar todas as qualificações

#### 2. **Nova Qualificação**

- **Route**: `/qualificacoes/nova`
- **Component**: `ModalNovaQualificacao`
- **Descrição**: Modal para criar nova qualificação
- **Atalho**: Clique em "Nova Qualificação" na página principal

#### 3. **Editar Qualificação**

- **Route**: `/qualificacoes/editar/:id`
- **Component**: `ModalEditarQualificacao`
- **Descrição**: Modal para editar qualificação existente
- **Atalho**: Clique no botão editar em qualquer linha

#### 4. **Importar Qualificações**

- **Route**: `/qualificacoes/importar`
- **Component**: `ImportarQualificacoes`
- **URL Completa**: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/qualificacoes/importar
- **Descrição**: Página para importar qualificações em bulk

#### 5. **Importar Tipos de Qualificação**

- **Route**: `/qualificacoes/importar-tipos`
- **Component**: `ImportarQualificacoes`
- **Descrição**: Página para importar tipos de qualificação

#### 6. **Treinamentos (Lista de Certificações)**

- **Route**: `/treinamentos/qualificacoes`
- **Component**: `CertificacoesList`
- **Descrição**: Lista de certificações de treinamentos

---

## Componentes

### Componentes Principais

#### 1. **Qualificacoes.tsx** (Principal)

- **Path**: `/src/react-app/pages/Qualificacoes.tsx`
- **Responsabilidades**:
  - Gerenciar estado das qualificações
  - Filtros e busca
  - Paginação
  - Ordenação
  - CRUD de qualificações

#### 2. **CertificadoUpload**

- **Path**: `/src/react-app/components/CertificadoUpload.tsx`
- **Funcionalidade**: Upload de certificados PDF

#### 3. **CertificadoLista**

- **Path**: `/src/react-app/components/CertificadoLista.tsx`
- **Funcionalidade**: Lista e gerenciamento de certificados
- **Ícone**: `FileText` (folha de papel)
- **Ações**: Download, Delete, Visualizar

#### 4. **BannerAlertasVencimento**

- **Path**: `/src/react-app/components/qualificacoes/BannerAlertasVencimento.tsx`
- **Funcionalidade**: Exibe alertas de qualificações vencendo

#### 5. **ConfigurarColunasQualificacoes**

- **Path**: `/src/react-app/pages/qualificacoes/ConfigurarColunasQualificacoes.tsx`
- **Funcionalidade**: Permite configurar quais colunas exibir

#### 6. **ModalEditarQualificacao**

- **Path**: `/src/react-app/components/qualificacoes/ModalEditarQualificacao.tsx`
- **Funcionalidade**: Modal para editar qualificação

#### 7. **ModalNovaQualificacao**

- **Path**: `/src/react-app/components/qualificacoes/ModalNovaQualificacao.tsx`
- **Funcionalidade**: Modal para criar nova qualificação

#### 8. **ImportarQualificacoes**

- **Path**: `/src/react-app/pages/qualificacoes/ImportarQualificacoes.tsx`
- **Funcionalidade**: Importar qualificações em CSV ou JSON

---

## Status & Informações

### Estados de Qualificação

- **VALIDA**: Qualificação dentro da validade
- **VENCENDO**: Qualificação próxima de vencer (até 7 dias)
- **VENCIDA**: Qualificação expirada
- **CANCELADA**: Qualificação cancelada
- **RENOVADA**: Qualificação que foi renovada

### Tipos de Qualificação

- **TREINAMENTO**: Cursos e treinamentos
- **EXAME**: Avaliações e exames
- **CHECK**: Verificações de proficiência

### Colunas Configuráveis

- Funcionário
- Matrícula
- Tipo
- Nome
- Código
- Data de Realização
- Data de Vencimento
- Validade (meses)
- Status
- Instrutor
- Nota
- Ações

### Filtros Disponíveis

- **Tipo**: TREINAMENTO, EXAME, CHECK
- **Status**: VALIDA, VENCENDO, VENCIDA, CANCELADA, RENOVADA
- **Funcionário**: Nome ou matrícula
- **Nome da Qualificação**: Descrição
- **Data Inicial e Final**: Filtro por período

### Ordenação

- **Por**: Qualquer coluna
- **Direção**: Ascendente (ASC) ou Descendente (DESC)
- **Padrão**: Data de Vencimento (ASC)

---

## Exemplos de Uso

### 1. Listar Qualificações Vencidas

```bash
curl -X GET "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes?status=VENCIDA&limit=50"
```

### 2. Buscar Qualificações de um Funcionário

```bash
curl -X GET "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes/funcionario/39"
```

### 3. Obter Alertas de Vencimento

```bash
curl -X GET "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes/alertas-vencimento"
```

### 4. Obter Estatísticas Gerais

```bash
curl -X GET "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes/stats"
```

### 5. Criar Nova Qualificação

```bash
curl -X POST "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes" \
  -H "Content-Type: application/json" \
  -d '{
    "funcionario_id": 39,
    "tipo": "EXAME",
    "codigo": "EXM-001",
    "nome": "Exame Técnico",
    "data_realizado": "2024-11-02",
    "validade_meses": 24
  }'
```

---

## Status da Implementação

✅ **Implementado**:

- ✅ API REST completa (GET, POST, PUT, DELETE)
- ✅ Paginação e filtros no servidor
- ✅ Busca por múltiplos campos
- ✅ Ordenação customizável
- ✅ Upload e gerenciamento de certificados
- ✅ Alertas de vencimento
- ✅ Importação em bulk
- ✅ Estatísticas por funcionário
- ✅ Cache de dados
- ✅ Rate limiting

⚠️ **Em Desenvolvimento**:

- Validações adicionais de negócio
- Testes automatizados
- Documentação Swagger/OpenAPI

❌ **Não Implementado**:

- Notificações de vencimento
- Relatórios avançados
- Integração com calendário

---

## Links Úteis

**Aplicação**: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev

**Módulo de Qualificações**: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/qualificacoes

**API Health Check**: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/sistema/health

---

**Última Atualização**: 2 de novembro de 2025
**Versão**: 1.0
**Status**: ✅ Ativo e Testado
