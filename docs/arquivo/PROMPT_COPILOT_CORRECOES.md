# 🎯 PROMPT PARA COPILOT - CORREÇÕES AIRTRUST

**Cole TUDO isto no GitHub Copilot Chat (Cmd+Shift+I)**

---

Baseado na auditoria do sistema AirTrust, preciso fazer 6 correções críticas HOJE para deixar o sistema 100% funcional.

## CORREÇÃO 1: CRIAR TABELA empresa_config

Crie uma migration SQL com as seguintes colunas:

- id (INTEGER PRIMARY KEY)
- empresa_id (INTEGER UNIQUE, FOREIGN KEY empresas)
- nome (TEXT)
- logo_url (TEXT)
- template_certificado (TEXT)
- cor_primaria (TEXT default #0066cc)
- cor_secundaria (TEXT default #333333)
- created_at (DATETIME)
- updated_at (DATETIME)
- deleted_at (DATETIME)

Crie índices para empresa_id e deleted_at.

## CORREÇÃO 2: CRIAR ENDPOINTS DE CONFIGURAÇÃO

Em src/worker/routes/empresas.ts, adicione 2 endpoints:

**GET /api/v2/empresas/:empresa_id/config**

- Retorna a configuração atual ou valores default
- Filtra por deleted_at IS NULL

**PUT /api/v2/empresas/:empresa_id/config**

- Recebe: {nome, logo_url, template_certificado, cor_primaria, cor_secundaria}
- Valida com Zod
- UPDATE se existe, INSERT se não existe
- Registra em auditoria_avancadav2
- Retorna {success: true, message: "Salvo"}

## CORREÇÃO 3: INTEGRAR FRONTEND COM API

Refatore `src/react-app/pages/ConfiguracaoEmpresa.tsx` para:

- Carregar dados do endpoint GET /config no useEffect
- Usar estado local para editar valores
- Chamar PUT /config ao clicar "Salvar"
- Mostrar mensagem de sucesso com alert (depois usamos toast)
- Recarregar dados após salvar
- Os dados devem persistir ao F5

Remova todos os console.log e substitua por chamadas reais de API.

## CORREÇÃO 4: ADICIONAR TOAST NOTIFICATIONS

Em `src/react-app/pages/Habilitacoes.tsx`, procure por todas as linhas com `alert()` e substitua por:

```typescript
import { useToast } from '@/hooks/useToast';
const { showToast } = useToast();

showToast('✅ Deletado com sucesso!', 'success');
showToast('❌ Erro ao deletar', 'error');
```

Faça o mesmo em todas as páginas com CRUD (Qualificacoes, Funcionarios, etc).

## CORREÇÃO 5: IMPLEMENTAR PAGINAÇÃO LAZY LOADING

Em `src/react-app/pages/Habilitacoes.tsx`:

- Mude de `carregarHab(1, 1036)` para `carregarHab(1, 50)`
- Implemente infinite scroll
- Ao usuário chegar no final da página, carregue próxima página
- Vá acumulando registros (não substitua)

## CORREÇÃO 6: APLICAR DESIGN SYSTEM EM TODAS PÁGINAS

Remova todos os emojis das páginas (🎓, 📋, 🎨, etc).
Use os componentes do UI Design System:

```typescript
import { PageHeader, SectionCard, Button, Badge } from '@/components/UI';

// Antes: <h1>🎓 Certificados</h1>
// Depois:
<PageHeader title="Certificados" subtitle="Gerenciar certificados" />

// Antes: <button className="bg-green-500">Salvar</button>
// Depois:
<Button variant="success">Salvar</Button>

// Antes: <div className="bg-blue-50">Status</div>
// Depois:
<Badge variant="success">Ativo</Badge>
```

Páginas a refatorar:

- Habilitacoes.tsx
- Qualificacoes.tsx
- Funcionarios.tsx
- Configuracoes.tsx
- Dashboard.tsx
- Certificacoes.tsx
- Simuladores.tsx
- ConfiguracaoEmpresa.tsx

## VERIFICAÇÃO FINAL

Após TODAS as mudanças:

1. `npm run build`
2. `wrangler deploy`
3. `wrangler dev`
4. Testar em `http://localhost:8787`:
   - GET `/configuracoes/empresa`
   - Preencher Nome da Empresa
   - Mudar Cores
   - Clicar Salvar
   - F5 (recarregar)
   - Verificar que dados permaneceram ✓
5. Testar DELETE em Habilitacoes
   - Ver toast notification (não alert) ✓
6. Testar scroll em Habilitacoes
   - Deve carregar mais registros ao chegar no final ✓

---

**PRONTO. Execute TUDO isso na ordem e manda screenshot de cada passo.**
