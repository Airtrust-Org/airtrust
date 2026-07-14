# Schema V2 Changes

Mudancas futuras de schema de producao devem entrar aqui como arquivos SQL individuais, com:

- um `change_id` unico;
- um `plan_hash` associado;
- validacao previa do contrato read-only;
- aplicacao manual pelo workflow `apply-schema-change-v2.yml`.

Regras:

- um arquivo por execucao;
- nenhuma chamada a `wrangler d1 migrations apply`;
- `d1_migrations` permanece congelado para producao;
- bootstrap inicial nao entra neste diretório.
