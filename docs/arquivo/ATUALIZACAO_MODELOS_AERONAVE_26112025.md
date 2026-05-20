# Atualização: Modelos de Aeronave + Reestruturação Cadastros

**Data**: 26 de Novembro de 2025  
**Deploy**: Version 68b36f21-e029-44a3-993a-7a3d12222cda  
**Commit**: 9d7895d

## 🎯 Mudanças Principais

### 1. Cadastro de Modelos de Aeronave

✅ **Backend**

- Nova tabela `modelos_aeronave` (Migration 0117)
  - Campos: codigo, nome, fabricante, tipo, categoria, descricao
  - Dados seed: A320, B737, E195, ATR72
- CRUD completo em `/api/modelos-aeronave`

✅ **Frontend**

- Nova aba "Modelos" em Cadastros
- Modal completo com todos os campos
- Layout padronizado (border-slate-200)

### 2. Vínculo Funcionário → Modelo de Aeronave

✅ **Migration 0118** (PENDENTE APLICAÇÃO REMOTA)

```sql
-- Renomeia: funcionarios.aeronave → modelo_aeronave_id
-- Preserva dados existentes: AW139, SK76
```

✅ **Backend Atualizado**

- `POST /api/funcionarios` → usa `modelo_aeronave_id`
- `PUT /api/funcionarios/:id` → usa `modelo_aeronave_id`

✅ **Frontend Atualizado**

- `ModalFuncionario.tsx` → campo "Modelo de Aeronave"
- Select populado de `/api/modelos-aeronave`
- Exibe: `{codigo} - {nome}` (ex: "A320 - Airbus A320")

### 3. Reestruturação: Cadastros → Configurações

✅ **Nova Estrutura**

```
/configuracoes/cadastros
├── Funções
├── Setores
├── Modelos de Aeronave
└── Aeronaves (futuro: cadastro de aeronaves físicas)
```

✅ **Página Funcionários Simplificada**

- Removida aba "Cadastros"
- Foco exclusivo em lista de funcionários
- Botões: Importar + Novo Funcionário

## 📋 Status de Deploy

### ✅ Deployado (Produção)

- [x] Migration 0117 (modelos_aeronave)
- [x] Backend: `/api/modelos-aeronave`
- [x] Frontend: Cadastros em Configurações
- [x] Frontend: ModalFuncionario atualizado
- [x] Backend: funcionarios.ts atualizado

### ⚠️ Pendente Aplicação Manual

- [ ] Migration 0118 (rename aeronave → modelo_aeronave_id)

**Motivo**: Token API do Wrangler sem permissões D1  
**Solução**: Aplicar manualmente via Cloudflare Dashboard

## 🔧 Como Aplicar Migration 0118

### Opção 1: Cloudflare Dashboard

1. Acessar: https://dash.cloudflare.com
2. D1 Databases → airtrust-db → Console
3. Executar SQL do arquivo: `worker-airtrust/migrations/0118_rename_aeronave_to_modelo_aeronave_id.sql`

### Opção 2: Wrangler (se credenciais OK)

```bash
npx wrangler d1 execute airtrust-db --remote \
  --file=worker-airtrust/migrations/0118_rename_aeronave_to_modelo_aeronave_id.sql
```

## 📊 Dados Preservados

A migration 0118 **preserva** todos os dados existentes:

- Funcionários com `aeronave = "AW139"` → `modelo_aeronave_id = "AW139"`
- Funcionários com `aeronave = "SK76"` → `modelo_aeronave_id = "SK76"`

**Nota**: O campo está como TEXT temporariamente. Em uma migration futura, podemos converter para INTEGER e criar FK para `modelos_aeronave.id`.

## 🎨 Layout Padronizado

Todas as tabelas de cadastros agora seguem o padrão:

```css
border: border-slate-200
bg: bg-slate-50 (header)
text: text-slate-600 (labels), text-slate-900 (valores)
divide: divide-slate-200
```

## 🧪 Testes Recomendados

Após aplicar Migration 0118:

1. ✅ Criar novo funcionário → verificar campo "Modelo de Aeronave"
2. ✅ Editar funcionário existente → verificar valor preservado
3. ✅ Navegar para `/configuracoes/cadastros` → verificar aba Modelos
4. ✅ Criar novo modelo → verificar aparece no select de funcionários

## 📁 Arquivos Modificados

### Backend (3 arquivos)

- `worker-airtrust/migrations/0117_create_modelos_aeronave.sql` (NOVO)
- `worker-airtrust/migrations/0118_rename_aeronave_to_modelo_aeronave_id.sql` (NOVO)
- `worker-airtrust/src/routes/funcionarios.ts` (aeronave → modelo_aeronave_id)
- `worker-airtrust/src/routes/modelos-aeronave.ts` (NOVO)
- `worker-airtrust/src/index.ts` (registrar rota modelos-aeronave)

### Frontend (4 arquivos)

- `src/react-app/pages/Configuracoes/Cadastros.tsx` (NOVO - copiado de funcionarios)
- `src/react-app/pages/Configuracoes/CadastrosPage.tsx` (NOVO - wrapper)
- `src/react-app/pages/Funcionarios.tsx` (removida aba Cadastros)
- `src/react-app/pages/funcionarios/ModalFuncionario.tsx` (aeronave → modelo_aeronave_id)
- `src/react-app/App.tsx` (rota /configuracoes/cadastros)

## 🚀 Próximos Passos Sugeridos

1. **Aplicar Migration 0118** (ver instruções acima)
2. **Padronizar Códigos de Modelos**: Converter dados existentes
   - AW139 → Criar modelo "AW139 - AgustaWestland AW139"
   - SK76 → Criar modelo "S76 - Sikorsky S-76"
3. **Migration Futura**: Converter `modelo_aeronave_id` de TEXT para INTEGER
4. **Cadastro de Aeronaves Físicas**: Vincular matrícula (PP-XXX) ao modelo
5. **Dashboards**: Adicionar atalho para Cadastros em Configurações

## ⚡ Performance

Build time: 2.52s  
Deploy time: 11.77s (worker) + 4.97s (triggers)  
Bundle size: 1454.62 KiB / gzip: 299.94 KiB

---

**Documentação gerada automaticamente**  
Para dúvidas: verificar commits 9d7895d e 9199788
