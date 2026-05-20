# Pasta Virtual - Configuração Completa

## Objetivo

Centralizar gestão documental do funcionário (certificados de qualificação + demais arquivos). Interface unificada: categorias, upload/download, preview (futuro), exclusão, agrupamento e contagem.

## Categorias

Fonte: `src/react-app/config/pastaVirtual.ts`

| Ordem | Tipo                     | Título                       | Descrição                                      |
| ----- | ------------------------ | ---------------------------- | ---------------------------------------------- |
| 1     | CERTIFICADO_QUALIFICACAO | Certificados de Qualificação | Gerados/anexados por histórico de qualificação |
| 2     | EXAME_MEDICO             | Exames Médicos (ASO, CMA)    | Documentos de saúde                            |
| 3     | CERTIFICADO_PROFISSIONAL | Certificados Profissionais   | Outras habilitações externas                   |
| 4     | DOCUMENTO_PESSOAL        | Documentos Pessoais          | RG, CPF, identidade, etc.                      |
| 5     | CONTRATO                 | Contratos e Termos           | Contratos de trabalho e termos assinados       |
| 6     | OUTROS                   | Outros Documentos            | Arquivos diversos                              |

## Hook

`usePastaVirtual(funcionarioId)` em `src/react-app/hooks/usePastaVirtual.ts` retorna:

```ts
{
  categorias: { tipo, titulo, cor, expandido, documentos: DocumentoPV[] }[];
  loading: boolean;
  error: string | null;
  refetch(): Promise<void>;
  uploadDocumento(file: File, categoria: TipoDocumento): Promise<void>;
  deleteDocumento(id: number): Promise<void>;
  downloadDocumento(doc: DocumentoPV): Promise<void>;
}
```

`DocumentoPV` estrutura:

```ts
interface DocumentoPV {
  id: number;
  nome: string;
  tipo: TipoDocumento; // categoria
  arquivo_url?: string;
  data_upload: string; // ISO
  data_vencimento?: string;
  tamanho: number; // bytes
  status: 'ATIVO' | 'VENCIDO' | 'VENCENDO';
}
```

## Endpoints Utilizados (Frontend)

| Ação                 | Endpoint                                                | Método | Observações                                 |
| -------------------- | ------------------------------------------------------- | ------ | ------------------------------------------- |
| Listar certificados  | `/api/certificados/funcionario/:id`                     | GET    | Certificados de qualificação                |
| Listar gerais        | `/api/pasta-virtual/:id`                                | GET    | Retorna `{ arquivos: [...] }`               |
| Upload documento     | `/api/pasta-virtual/upload`                             | POST   | `FormData(file, funcionario_id, categoria)` |
| Delete documento     | `/api/pasta-virtual/delete/:docId`                      | DELETE | Remove arquivo (soft delete se aplicável)   |
| Download certificado | `/api/certificados/download/:docId`                     | GET    | Blob PDF                                    |
| Download documento   | `/api/pasta-virtual/download/:docId`                    | GET    | Blob PDF                                    |
| Gerar certificado    | `/api/qualificacoes/historico/:hid/certificados/gerar`  | POST   | Criação automática PDF                      |
| Upload certificado   | `/api/qualificacoes/historico/:hid/certificados/upload` | POST   | Anexar PDF existente                        |
| Remover certificado  | `/api/qualificacoes/historico/:hid/certificados/:cid`   | DELETE | Remove registro + arquivo                   |

## Integração ModalCertificados

Arquivo: `src/react-app/components/qualificacoes/ModalCertificados.tsx`
Funções principais: `fetchCertificados`, `handleGerar`, `handleUpload`, `handleDownload`, `handleDelete`.

Título: `Certificados • MATRICULA / CODIGO`

Navegação para Pasta Virtual: redireciona para `/pasta-virtual/:funcionarioId`.

## Padronização Visual

- Header com gradiente e badge de histórico.
- Botões primários usam `bg-primary` e hover `bg-primary/90`.
- Ações secundárias: borda + fundo branco.
- Tabelas: `rounded-lg`, `border-slate-200`, `divide-y` consistente.
- Upload área: bloco destacado `bg-slate-50`.

## Próximos Incrementos (Futuros)

- Preview inline (PDF) usando `<iframe>` ou serviço de conversão.
- Toasts unificados para Pasta Virtual (atualmente silencioso em download).
- Paginação / virtualização para grande volume de documentos.
- Filtro por vencimento e busca textual.
- Estado de expansão das categorias persistido em localStorage.

## Garantias Implementadas

- Campo `numero_certificado` removido do schema e não usado na UI.
- Hook central usa config única evitando duplicação.
- Modal redireciona corretamente para nova rota Pasta Virtual centralizada.
- Upload / delete / download encapsulados.

## Uso Rápido

```tsx
const { categorias, uploadDocumento } = usePastaVirtual(funcionarioId);

return categorias.map((c) => (
  <CategoriaView key={c.tipo} categoria={c} onUpload={(f) => uploadDocumento(f, c.tipo)} />
));
```

## Erros & Tratamento

- Falhas de rede: lança `Error` nas funções de mutação (para integração futura com toast global).
- Download silencioso (não polui com toast; pode ser ampliado).

---

Atualizado em: 2025-11-23
Responsável: Automação AirTrust
