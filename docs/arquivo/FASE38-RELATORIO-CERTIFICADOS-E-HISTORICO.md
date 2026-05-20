# FASE 38 – Certificados no Histórico de Qualificações

Data de conclusão: **16/11/2025**

Responsável: **Automação AirTrust (Fase 38)**

---

## 1. Objetivo da Fase

Implementar, de ponta a ponta, o fluxo de **certificados vinculados ao histórico de qualificações**, com as seguintes premissas:

- Reutilizar a **Pasta Virtual** (tabela `documentos` + bucket R2 `BUCKET`).
- Não criar novas tabelas; apenas novas rotas de orquestração.
- Nomear arquivos de certificado seguindo rigorosamente o padrão:
  - `CERT-{MATRICULA}-{CODIGO}-{YYYYMMDD}.pdf`
  - A data usada é a **data da realização da qualificação**, com fallback para `data_vencimento` e, por último, data atual.
- Expor esse fluxo na tela de **Histórico de Qualificações** com um botão **“Certificados”** por linha e um **modal completo** para gerar, anexar, listar, baixar e excluir certificados.

---

## 2. Arquitetura Backend

### 2.1. Novo módulo de rotas

Arquivo: `worker-airtrust/src/routes/qualificacoes-certificados.ts`

Responsável por concentrar toda a lógica de certificados atrelados à tabela `qualificacoes_historico`.

Principais pontos:

- Usa `Hono` com bindings `Env`.
- Reutiliza middlewares existentes:
  - `auth()` – autenticação JWT.
  - `requireRole('admin', 'manager')` – restrição de ações de escrita.
  - Helpers de erro: `badRequest`, `notFound`.

### 2.2. Helper de contexto e naming

Função central:

```ts
async function resolveCertificadoContext(
  db: D1Database,
  historicoId: number,
): Promise<{
  historico: HistoricoRow;
  matricula: string;
  codigo: string;
  dataBase: Date;
  dataStr: string;
  r2KeyPrefix: string;
}> {
  /* ... */
}
```

Consulta:

- `qualificacoes_historico qh`
- `funcionarios f` (para `matricula`)
- `qualificacoes_tipos qt` (para recuperar `codigo` quando não estiver em `qh`)

Regras:

1. `matricula = funcionario_matricula || 'SEM_MATRICULA'`
2. `codigo = codigo || 'SEM_CODIGO'`
3. Seleção da data base:
   - Se `data_conclusao` existir → usar `data_conclusao`.
   - Senão, se `data_vencimento` existir → usar `data_vencimento`.
   - Caso contrário → `new Date()` com `console.warn` para rastreio.
4. `dataStr = YYYYMMDD`.
5. Prefixo final de key R2: `r2KeyPrefix = CERT-{matricula}-{codigo}-{dataStr}`.

### 2.3. Endpoints implementados

#### 2.3.1. Listar certificados de um histórico

- **Rota**: `GET /api/qualificacoes/historico/:id/certificados`
- **Auth**: `auth()`
- **Comportamento**:
  - Resolve contexto.
  - Consulta `documentos` filtrando por `funcionario_id` e `r2_key LIKE prefixo%`.
  - Ordena por `created_at DESC`.
  - Retorna `ApiResponse<Documento[]>` com `success: true`.

#### 2.3.2. Gerar certificado automático

- **Rota**: `POST /api/qualificacoes/historico/:id/certificados/gerar`
- **Auth**: `auth()`, `requireRole('admin', 'manager')`.
- **Processo**:
  1. Resolve contexto.
  2. Gera `uuid`.
  3. Monta key: `CERT-{MATRICULA}-{CODIGO}-{YYYYMMDD}-{uuid}.pdf`.
  4. Monta `nomeArquivo = CERT-{codigo}-{YYYYMMDD}.pdf`.
  5. Gera PDF simples em memória.
  6. Faz upload para R2 com metadados (`tipo`, `matricula`, `codigo`, `historico_id`, `data_referencia`, `origem='auto-gerado'`).
  7. Insere registro em `documentos` com `uuid`, `funcionario_id`, `nome_arquivo`, `tipo`, `tamanho`, `r2_key`, `descricao`, timestamps.
  8. Retorna `201` com `{ id, uuid, r2_key }`.

#### 2.3.3. Upload de certificado existente

- **Rota**: `POST /api/qualificacoes/historico/:id/certificados/upload`
- **Auth**: `auth()`, `requireRole('admin', 'manager')`.
- **Entrada**: `multipart/form-data` (`file`, `descricao?`).
- **Processo**:
  1. Resolve contexto.
  2. Lê `File` / buffer.
  3. Gera `uuid` e `r2Key` com mesmo prefixo.
  4. `nomeArquivo = file.name || CERT-{codigo}-{YYYYMMDD}.pdf`.
  5. `bucket.put` com metadados (`origem='upload_manual'`).
  6. Insere em `documentos` com `descricao` customizada ou padrão.
  7. Retorna `201` com `{ id, uuid, r2_key }`.

#### 2.3.4. Remover certificado

- **Rota**: `DELETE /api/qualificacoes/historico/:id/certificados/:certId`
- **Auth**: `auth()`, `requireRole('admin')`.
- **Processo**:
  1. Busca `documento` por `id`.
  2. Marca `deleted_at = datetime('now')`.
  3. Remove objeto em R2 (`bucket.delete`).
  4. Retorna `success: true`.

### 2.4. Integração no entrypoint do Worker

Arquivo: `worker-airtrust/src/index.ts`

- Montagem:

```ts
import qualificacoesCertificadosRoutes from './routes/qualificacoes-certificados';

app.route('/api/qualificacoes', qualificacoesCertificadosRoutes);
```

- Limpeza de imports duplicados e logger não utilizado.
- Ajuste no handler `scheduled` para evitar warning de variável não usada.

---

## 3. Integração Frontend

### 3.1. Modal de Certificados

Arquivo: `src/react-app/components/qualificacoes/ModalCertificados.tsx`

- Lê token JWT do `localStorage`.
- Usa `fetch` para consumir endpoints de certificados e Pasta Virtual.
- Exibe:
  - Resumo da qualificação (matrícula, código, nome, data de realização).
  - Ações:
    - **Gerar certificado** (POST `/certificados/gerar`).
    - **Upload** (POST `/certificados/upload` com `FormData`).
  - Tabela:
    - Nome do arquivo (`nome_arquivo`).
    - Tipo (`tipo`).
    - Tamanho (KB).
    - Data de criação (`created_at`).
    - Botões de **Download** e **Excluir**.

### 3.2. Botão "Certificados" no histórico

Arquivo: `src/react-app/pages/QualificacoesNew.tsx`

- Estado local:

```ts
const [showCertModal, setShowCertModal] = useState(false);
const [historicoSelecionado, setHistoricoSelecionado] = useState<HistoricoItem | null>(null);
```

- Botão por linha na tabela de histórico:

```tsx
<button
  onClick={() => {
    setHistoricoSelecionado(row);
    setShowCertModal(true);
  }}
  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-primary-600"
  title="Certificados desta qualificação"
>
  <span className="material-symbols-outlined text-xl">workspace_premium</span>
</button>
```

- Renderização do modal:

```tsx
{
  historicoSelecionado && (
    <ModalCertificados
      isOpen={showCertModal}
      onClose={() => {
        setShowCertModal(false);
        setHistoricoSelecionado(null);
      }}
      historicoId={historicoSelecionado.id}
      funcionarioId={historicoSelecionado.funcionario_id}
      matricula={historicoSelecionado.funcionario_matricula}
      codigoQualificacao={historicoSelecionado.codigo}
      nomeQualificacao={historicoSelecionado.qualificacao_nome}
      dataConclusao={historicoSelecionado.data_conclusao || historicoSelecionado.data_emissao}
    />
  );
}
```

- Ajustes de tipos para `DataTable` (valores `unknown`): conversão consistente com `String(value ?? '')` e `new Date(value as string | number | Date)` quando necessário.

---

## 4. Fluxos de Uso

### 4.1. Gerar certificado automático

1. Usuário acessa **Qualificações → Histórico**.
2. Clica no botão **Certificados** de uma linha.
3. Modal abre com dados da qualificação.
4. Usuário clica em **Gerar certificado**.
5. Backend cria PDF, armazena em R2 e insere entrada em `documentos`.
6. Lista de certificados é recarregada e o novo registro aparece.

### 4.2. Upload de certificado existente

1. Usuário seleciona um PDF e preenche descrição opcional.
2. Clica em **Anexar**.
3. Backend envia arquivo ao R2 e registra em `documentos`.
4. Lista é atualizada exibindo o certificado anexado.

### 4.3. Download e exclusão

- **Download**: via `GET /api/pasta-virtual/download/:id` → abre URL de stream.
- **Excluir**: `DELETE /api/qualificacoes/historico/:id/certificados/:certId`, com soft delete em `documentos` e remoção física em R2.

---

## 5. Validação Técnica

- `npm run build` – **PASS** (frontend/build geral).
- Tipagem TypeScript ok em:
  - `QualificacoesNew.tsx`.
  - `ModalCertificados.tsx`.
  - `worker-airtrust/src/index.ts`.
  - `worker-airtrust/src/routes/qualificacoes-certificados.ts`.
- Deploy já realizado previamente para:
  - Frontend (`wrangler pages deploy dist ...`).
  - Worker (`npm run deploy` em `worker-airtrust`).

---

## 6. Conclusão

- Fluxo de certificados para histórico de qualificações está **100% implementado**:
  - Backend com rotas dedicadas e naming correto (`CERT-{MATRICULA}-{CODIGO}-{YYYYMMDD}`) baseado na data da qualificação.
  - Frontend com botão por linha e modal completo de certificados.
  - Integração com Pasta Virtual/R2 e auditoria via tabela `documentos`.
- Não há pendências de build ou lint relacionadas à Fase 38 neste momento.
