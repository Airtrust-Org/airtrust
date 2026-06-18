# Plano de validacao autenticada - certificados setoriais

**Data:** 2026-06-18
**Escopo:** Validacao funcional de visibilidade, upload e download de certificados em contexto de RBAC setorial.
**Status:** Plano sanitizado para registro tecnico. Nenhuma credencial, identificador operacional ou dado pessoal incluido.

---

## Perfis a testar

| Perfil | Papel esperado | Objetivo |
|---|---|---|
| Admin | `admin` | Confirmar acesso irrestrito esperado |
| Gestor setorial valido | `manager` | Confirmar acesso apenas ao proprio escopo |
| Gestor sem escopo | `manager` | Confirmar fail-closed |
| Usuario fora do escopo | `viewer` ou equivalente | Confirmar isolamento |

---

## Casos de teste obrigatorios

### CT-01 - Admin visualiza anexos existentes

Validar listagem, abertura do modal, visualizacao e download de anexos existentes sem erro de autorizacao.

### CT-02 - Gestor setorial visualiza anexos do proprio escopo

Validar que o funcionario alvo aparece na listagem, que o indicador de certificado existe e que o modal lista anexos com sucesso.

### CT-03 - Gestor setorial anexa certificado no proprio escopo

Validar upload bem-sucedido de arquivo compativel e persistencia apos refetch.

### CT-04 - Certificado permanece visivel apos reload

Validar que o anexo continua disponivel para listagem e download depois de recarregar a pagina.

### CT-05 - Gestor setorial nao acessa funcionarios fora do escopo

Validar que funcionarios fora do escopo nao aparecem na listagem e que tentativas diretas de leitura ou upload retornam bloqueio.

### CT-06 - Escopo vazio falha fechado

Validar que um gestor sem vinculo setorial valido nao recebe acesso a dados nem a operacoes de certificado.

### CT-07 - Admin permanece sem regressao

Repetir fluxos de leitura e escrita com perfil admin para confirmar ausencia de regressao funcional.

---

## Endpoints exercitados

- `GET /api/historico`
- `GET /api/historico/:id/certificados`
- `GET /api/historico/certificados/download/:id`
- `POST /api/historico/:id/certificados/upload`

---

## Criterios de aceitacao

- Perfis com escopo valido enxergam apenas dados permitidos.
- Perfis fora do escopo recebem bloqueio consistente.
- Admin continua com acesso funcional esperado.
- Nenhum fluxo grava ou expõe dado fora do escopo autorizado.
- Nenhuma validacao depende de nomes reais, emails, IDs internos ou contagens operacionais exatas.
