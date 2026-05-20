# ⚙️ REFATOR CONFIGURAÇÕES - Padronizar Tudo

**Padronizar toda a configuração do AirTrust**  
**Data**: 3 de novembro de 2025  
**Status**: PRONTO PARA IMPLEMENTAR

---

## PARTE 1: CRIAR TABELA empresa_config

### SQL Migrations

```sql
-- Migration: 0009_criar_tabela_empresa_config.sql

CREATE TABLE IF NOT EXISTS empresa_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Relacionamentos
  empresa_id INTEGER NOT NULL UNIQUE,

  -- Configurações básicas
  nome TEXT NOT NULL DEFAULT 'Empresa',
  descricao TEXT,

  -- Logo e branding
  logo_url TEXT DEFAULT NULL,
  logo_s3_key TEXT DEFAULT NULL,
  logo_tipo TEXT DEFAULT 'png',
  logo_largura INTEGER DEFAULT 200,
  logo_altura INTEGER DEFAULT 100,

  -- Cores do certificado
  cor_primaria TEXT DEFAULT '#0066cc',
  cor_secundaria TEXT DEFAULT '#333333',
  cor_acento TEXT DEFAULT '#FF6B35',

  -- Template do certificado
  template_certificado TEXT DEFAULT 'default',
  assinatura_digital BOOLEAN DEFAULT FALSE,
  assinatura_url TEXT DEFAULT NULL,

  -- Configurações de emissão
  emitir_automatico BOOLEAN DEFAULT TRUE,
  intervalo_dias INTEGER DEFAULT 365,

  -- Dados de contato
  email_contato TEXT,
  telefone TEXT,
  website TEXT,
  endereco TEXT,

  -- Registro
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL,

  -- Foreign key
  FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);

-- Índices
CREATE INDEX idx_empresa_config_empresa_id ON empresa_config(empresa_id);
CREATE INDEX idx_empresa_config_deleted_at ON empresa_config(deleted_at);

-- Trigger para atualizar updated_at
CREATE TRIGGER IF NOT EXISTS trigger_empresa_config_updated_at
AFTER UPDATE ON empresa_config
BEGIN
  UPDATE empresa_config SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

---

## PARTE 2: DTO - empresa_config

### Arquivo: `src/worker/dtos/empresasConfig.ts`

```typescript
import { z } from 'zod';

// CREATE DTO
export const CreateEmpresaConfigDTO = z.object({
  empresa_id: z.number().int().positive('Empresa ID é obrigatório'),
  nome: z.string().min(1, 'Nome é obrigatório').max(200),
  descricao: z.string().optional(),

  // Logo
  logo_url: z.string().url().optional(),
  logo_tipo: z.enum(['png', 'jpg', 'svg']).default('png'),
  logo_largura: z.number().int().positive().default(200),
  logo_altura: z.number().int().positive().default(100),

  // Cores
  cor_primaria: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .default('#0066cc'),
  cor_secundaria: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .default('#333333'),
  cor_acento: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .default('#FF6B35'),

  // Template
  template_certificado: z.enum(['default', 'premium', 'simples']).default('default'),
  assinatura_digital: z.boolean().default(false),

  // Contato
  email_contato: z.string().email().optional(),
  telefone: z.string().optional(),
  website: z.string().url().optional(),
  endereco: z.string().optional(),
});

// UPDATE DTO (todos opcionais)
export const UpdateEmpresaConfigDTO = CreateEmpresaConfigDTO.partial();

// RESPONSE DTO
export const EmpresaConfigResponseDTO = z.object({
  id: z.number(),
  empresa_id: z.number(),
  nome: z.string(),
  descricao: z.string().nullable(),

  logo_url: z.string().url().nullable(),
  logo_tipo: z.string(),
  logo_largura: z.number(),
  logo_altura: z.number(),

  cor_primaria: z.string(),
  cor_secundaria: z.string(),
  cor_acento: z.string(),

  template_certificado: z.string(),
  assinatura_digital: z.boolean(),
  assinatura_url: z.string().url().nullable(),

  email_contato: z.string().email().nullable(),
  telefone: z.string().nullable(),
  website: z.string().url().nullable(),
  endereco: z.string().nullable(),

  created_at: z.string(),
  updated_at: z.string(),
});

export type CreateEmpresaConfigInput = z.infer<typeof CreateEmpresaConfigDTO>;
export type UpdateEmpresaConfigInput = z.infer<typeof UpdateEmpresaConfigDTO>;
export type EmpresaConfigResponse = z.infer<typeof EmpresaConfigResponseDTO>;
```

---

## PARTE 3: SERVICE - empresa_config

### Arquivo: `src/worker/services/empresasConfigService.ts`

```typescript
import { BaseService } from './BaseService';
import type { EmpresaConfigResponse } from '../dtos/empresasConfig';

export interface EmpresaConfig {
  id: number;
  empresa_id: number;
  nome: string;
  logo_url?: string;
  cor_primaria: string;
  cor_secundaria: string;
  template_certificado: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export class EmpresasConfigService extends BaseService<EmpresaConfig> {
  constructor(db: any) {
    super('empresa_config', db);
  }

  /**
   * Obter configuração por empresa_id
   */
  async getByEmpresaId(empresa_id: number): Promise<EmpresaConfig | null> {
    const result = await this.db
      .prepare('SELECT * FROM empresa_config WHERE empresa_id = ? AND deleted_at IS NULL')
      .bind(empresa_id)
      .first();

    return result || null;
  }

  /**
   * Obter ou criar configuração padrão
   */
  async getOrCreateDefault(empresa_id: number): Promise<EmpresaConfig> {
    let config = await this.getByEmpresaId(empresa_id);

    if (!config) {
      // Criar configuração padrão
      const { results } = await this.db
        .prepare('SELECT nome FROM empresas WHERE id = ? AND deleted_at IS NULL')
        .bind(empresa_id)
        .all();

      const empresaNome = (results as any[])?.[0]?.nome || 'Empresa';

      config = await this.create({
        empresa_id,
        nome: empresaNome,
        cor_primaria: '#0066cc',
        cor_secundaria: '#333333',
        template_certificado: 'default',
      } as Record<string, unknown>);
    }

    return config;
  }

  /**
   * Atualizar configuração com INSERT OR REPLACE
   */
  async upsert(empresa_id: number, dados: Record<string, unknown>): Promise<EmpresaConfig> {
    // Primeiro tenta atualizar
    const existing = await this.getByEmpresaId(empresa_id);

    if (existing) {
      return await this.update(existing.id, dados);
    } else {
      // Se não existe, cria
      return await this.create({
        empresa_id,
        ...dados,
      });
    }
  }

  /**
   * Validar URL do logo
   */
  async validateLogoUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

---

## PARTE 4: ROUTES - empresa_config

### Adicionar em `src/worker/routes/empresas.ts`

```typescript
import { EmpresasConfigService } from '../services/empresasConfigService';
import { EmpresaConfigResponseDTO, UpdateEmpresaConfigDTO } from '../dtos/empresasConfig';

// Adicionar ANTES de: router.get('/:id', ...)

/**
 * GET /api/v2/empresas/:id/config
 * Obter configurações da empresa
 */
router.get('/:id/config', async (c) => {
  try {
    const empresa_id = parseInt(c.req.param('id'));

    if (isNaN(empresa_id)) {
      return c.json({ success: false, error: 'ID inválido', code: 'INVALID_ID' }, 400);
    }

    const service = new EmpresasConfigService(c.env.DB);
    const config = await service.getOrCreateDefault(empresa_id);

    const response = EmpresaConfigResponseDTO.parse(config);
    return c.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      { success: false, error: 'Erro ao obter configuração', code: 'INTERNAL_ERROR' },
      500,
    );
  }
});

/**
 * PUT /api/v2/empresas/:id/config
 * Atualizar configurações da empresa
 */
router.put('/:id/config', async (c) => {
  try {
    const empresa_id = parseInt(c.req.param('id'));

    if (isNaN(empresa_id)) {
      return c.json({ success: false, error: 'ID inválido', code: 'INVALID_ID' }, 400);
    }

    const body = await c.req.json();
    const dados = UpdateEmpresaConfigDTO.parse(body);

    const service = new EmpresasConfigService(c.env.DB);
    await service.upsert(empresa_id, dados as Record<string, unknown>);

    return c.json({
      success: true,
      message: 'Configuração salva com sucesso',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return c.json(
        {
          success: false,
          error: 'Erro de validação',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        },
        400,
      );
    }

    return c.json(
      { success: false, error: 'Erro ao salvar configuração', code: 'INTERNAL_ERROR' },
      500,
    );
  }
});
```

---

## PARTE 5: FRONTEND - ConfiguracaoEmpresa.tsx

### Arquivo: `src/frontend/pages/ConfiguracaoEmpresa.tsx`

```typescript
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from 'react-hot-toast';
import { Save, AlertCircle } from 'lucide-react';

interface ConfigEmpresa {
  id: number;
  empresa_id: number;
  nome: string;
  logo_url?: string;
  cor_primaria: string;
  cor_secundaria: string;
  cor_acento: string;
  template_certificado: string;
  email_contato?: string;
  telefone?: string;
  website?: string;
  endereco?: string;
}

export default function ConfiguracaoEmpresa() {
  const { id } = useParams<{ id: string }>();
  const { get, put } = useApi();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigEmpresa | null>(null);
  const [formData, setFormData] = useState<Partial<ConfigEmpresa>>({});

  // Carregar configurações
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const response = await get(`/api/v2/empresas/${id}/config`);

        if (response.success && response.data) {
          setConfig(response.data);
          setFormData(response.data);
        } else {
          toast.error('Erro ao carregar configurações');
        }
      } catch (error) {
        toast.error('Erro na requisição');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, get, toast]);

  // Salvar configurações
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      const response = await put(`/api/v2/empresas/${id}/config`, formData);

      if (response.success) {
        toast.success('Configurações salvas com sucesso!');
        // Recarregar para confirmar persistência
        const updated = await get(`/api/v2/empresas/${id}/config`);
        if (updated.success) {
          setConfig(updated.data);
          setFormData(updated.data);
        }
      } else {
        toast.error(response.error || 'Erro ao salvar');
      }
    } catch (error) {
      toast.error('Erro na requisição');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Configurações da Empresa</h1>

      <form onSubmit={handleSave} className="space-y-6 bg-white rounded-lg shadow p-6">
        {/* Nome */}
        <div>
          <label className="block text-sm font-medium mb-2">Nome da Empresa</label>
          <input
            type="text"
            value={formData.nome || ''}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Cores */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Cor Primária</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={formData.cor_primaria || '#0066cc'}
                onChange={(e) => setFormData({ ...formData, cor_primaria: e.target.value })}
                className="w-12 h-10 rounded"
              />
              <span className="text-sm font-mono">{formData.cor_primaria}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Cor Secundária</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={formData.cor_secundaria || '#333333'}
                onChange={(e) => setFormData({ ...formData, cor_secundaria: e.target.value })}
                className="w-12 h-10 rounded"
              />
              <span className="text-sm font-mono">{formData.cor_secundaria}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Cor Acentuada</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={formData.cor_acento || '#FF6B35'}
                onChange={(e) => setFormData({ ...formData, cor_acento: e.target.value })}
                className="w-12 h-10 rounded"
              />
              <span className="text-sm font-mono">{formData.cor_acento}</span>
            </div>
          </div>
        </div>

        {/* Template */}
        <div>
          <label className="block text-sm font-medium mb-2">Template de Certificado</label>
          <select
            value={formData.template_certificado || 'default'}
            onChange={(e) => setFormData({ ...formData, template_certificado: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="default">Padrão</option>
            <option value="premium">Premium</option>
            <option value="simples">Simples</option>
          </select>
        </div>

        {/* Contato */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Email de Contato</label>
            <input
              type="email"
              value={formData.email_contato || ''}
              onChange={(e) => setFormData({ ...formData, email_contato: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Telefone</label>
            <input
              type="tel"
              value={formData.telefone || ''}
              onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
        </div>

        {/* Website e Endereço */}
        <div>
          <label className="block text-sm font-medium mb-2">Website</label>
          <input
            type="url"
            value={formData.website || ''}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Endereço</label>
          <textarea
            value={formData.endereco || ''}
            onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>

        {/* Botão Salvar */}
        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </form>

      {/* Preview das cores */}
      <div className="mt-8 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-bold mb-4">Preview das Cores</h2>
        <div className="flex gap-4">
          <div
            className="w-24 h-24 rounded-lg border-2 border-gray-300"
            style={{ backgroundColor: formData.cor_primaria }}
            title="Cor Primária"
          />
          <div
            className="w-24 h-24 rounded-lg border-2 border-gray-300"
            style={{ backgroundColor: formData.cor_secundaria }}
            title="Cor Secundária"
          />
          <div
            className="w-24 h-24 rounded-lg border-2 border-gray-300"
            style={{ backgroundColor: formData.cor_acento }}
            title="Cor Acentuada"
          />
        </div>
      </div>
    </div>
  );
}
```

---

## PARTE 6: ADICIONAR À NAVEGAÇÃO

### Arquivo: `src/frontend/components/Sidebar.tsx`

```typescript
// Adicionar no menu principal:

{
  icon: <Settings size={20} />,
  label: 'Configurações',
  children: [
    { label: 'Empresa', path: '/configuracoes/empresa' },
    { label: 'Usuários', path: '/configuracoes/usuarios' },
    { label: 'Sistema', path: '/configuracoes/sistema' },
  ]
}
```

---

## PARTE 7: ROTAS FRONTEND

### Arquivo: `src/frontend/router.tsx`

```typescript
import ConfiguracaoEmpresa from './pages/ConfiguracaoEmpresa';

const routes = [
  {
    path: '/configuracoes/empresa',
    element: <ConfiguracaoEmpresa />,
  },
  // ... outras rotas
];
```

---

## PARTE 8: PADRÕES DE RESPOSTA PADRONIZADOS

### Response Format (Todos endpoints)

```json
{
  "success": true/false,
  "data": { /* dados */ },
  "page": 1,           // Se for paginado
  "total": 100,        // Se for paginado
  "error": "string",   // Se houver erro
  "code": "ERROR_CODE",// Se houver erro
  "timestamp": "ISO-8601"
}
```

### Error Response Format

```json
{
  "success": false,
  "error": "Descrição do erro",
  "code": "ERROR_CODE",
  "timestamp": "ISO-8601"
}
```

### Validation Error Response

```json
{
  "success": false,
  "error": "Erro de validação",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "path": ["field"],
      "message": "Campo obrigatório"
    }
  ],
  "timestamp": "ISO-8601"
}
```

---

## PARTE 9: CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Criar migration SQL para tabela empresa_config
- [ ] Criar DTO em `src/worker/dtos/empresasConfig.ts`
- [ ] Criar Service em `src/worker/services/empresasConfigService.ts`
- [ ] Adicionar routes em `src/worker/routes/empresas.ts`
- [ ] Criar componente React `ConfiguracaoEmpresa.tsx`
- [ ] Adicionar rota no router (`/configuracoes/empresa`)
- [ ] Adicionar link no Sidebar
- [ ] Testar GET /api/v2/empresas/:id/config
- [ ] Testar PUT /api/v2/empresas/:id/config
- [ ] Testar persistência (recarregar página)
- [ ] Testar validação de cores (formato #RRGGBB)
- [ ] Testar validação de emails
- [ ] Testar validação de URLs
- [ ] Adicionar permissões (só admin pode editar)
- [ ] Implementar soft delete
- [ ] Registrar auditoria de mudanças

---

## PARTE 10: PADRÃO PARA NOVOS ENDPOINTS

Quando criar novo endpoint, use este template:

### 1. DTO (`src/worker/dtos/novo.ts`)

```typescript
export const CreateNovoDTO = z.object({ ... });
export const UpdateNovoDTO = CreateNovoDTO.partial();
export const NovoResponseDTO = z.object({ ... });
```

### 2. Service (`src/worker/services/novoService.ts`)

```typescript
export class NovoService extends BaseService<Novo> {
  constructor(db: any) {
    super('novo', db);
  }
  // Métodos específicos...
}
```

### 3. Route (`src/worker/routes/novo.ts`)

```typescript
export function novoRoutes() {
  const router = new Hono<{ Bindings: Env }>();

  router.get('/', async (c) => {
    const service = new NovoService(c.env.DB);
    const { data, total } = await service.getAll(page, limit);
    return c.json({ success: true, data, page, total, timestamp });
  });

  return router;
}
```

### 4. Integrar em index.ts

```typescript
import { novoRoutes } from '../routes/novo';
app.route('/api/v2/novo', novoRoutes());
```

---

## RESUMO DAS MUDANÇAS

| Camada   | Arquivo        | Tipo         | Status |
| -------- | -------------- | ------------ | ------ |
| Database | Migration 0009 | CREATE TABLE | ✅     |
| Backend  | DTOs           | CREATE       | ✅     |
| Backend  | Service        | CREATE       | ✅     |
| Backend  | Routes         | UPDATE       | ✅     |
| Frontend | Component      | CREATE       | ✅     |
| Frontend | Router         | UPDATE       | ✅     |
| Frontend | Sidebar        | UPDATE       | ✅     |

---

**Implementação**: Pronto para começar  
**Build**: npm run build (verificar 0 errors)  
**Deploy**: npm run deploy  
**Test**: AUDIT-CHECKLIST-COMPLETO.md
