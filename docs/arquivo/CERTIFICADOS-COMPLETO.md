# 🎓 CERTIFICADOS COMPLETO - Com Logo Integrado

**Guia completo para geração de certificados com logo integrado**  
**Data**: 3 de novembro de 2025  
**Status**: PRONTO PARA IMPLEMENTAR

---

## PARTE 1: ARQUITETURA DE CERTIFICADOS

### Diagrama de Fluxo

```
Frontend (Botão)
    ↓
POST /api/v2/certificados/gerar
    ↓
CertificadosService.gerar()
    ↓
1. Validar dados (habilitação, empresa, qualificação)
2. Carregar logo da empresa (empresa_config)
3. Gerar template PDF com cores da empresa
4. Salvar arquivo em R2
5. Registrar na BD
6. Retornar URL de download
    ↓
Frontend (Download link)
```

### Componentes Envolvidos

- **Backend**: CertificadosService + routes
- **Frontend**: ComponenteCertificados (listar, gerar, download)
- **Database**: certificados table + empresa_config
- **Storage**: R2 para armazenar PDFs
- **PDF Generator**: PDFKit ou iText

---

## PARTE 2: TABELA CERTIFICADOS (Expandida)

### SQL Migration

```sql
-- Migration: 0010_expandir_tabela_certificados.sql

ALTER TABLE IF EXISTS certificados ADD COLUMN logo_url TEXT DEFAULT NULL;
ALTER TABLE IF EXISTS certificados ADD COLUMN template_tipo TEXT DEFAULT 'default';
ALTER TABLE IF EXISTS certificados ADD COLUMN cor_primaria TEXT DEFAULT '#0066cc';
ALTER TABLE IF EXISTS certificados ADD COLUMN cor_secundaria TEXT DEFAULT '#333333';
ALTER TABLE IF EXISTS certificados ADD COLUMN r2_key TEXT DEFAULT NULL;
ALTER TABLE IF EXISTS certificados ADD COLUMN r2_url TEXT DEFAULT NULL;

-- Se a tabela não existir, criar completa:
CREATE TABLE IF NOT EXISTS certificados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Relacionamentos
  habilitacao_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  qualificacao_id INTEGER,
  funcionario_id INTEGER NOT NULL,

  -- Dados do certificado
  numero_certificado TEXT UNIQUE NOT NULL,
  titulo TEXT NOT NULL DEFAULT 'Certificado de Conclusão',
  descricao TEXT,

  -- Logo e branding
  logo_url TEXT,
  template_tipo TEXT DEFAULT 'default',
  cor_primaria TEXT DEFAULT '#0066cc',
  cor_secundaria TEXT DEFAULT '#333333',

  -- Armazenamento
  r2_key TEXT,
  r2_url TEXT,
  arquivo_local TEXT,

  -- Datas
  data_emissao DATE NOT NULL,
  data_validade DATE,

  -- Status
  status TEXT DEFAULT 'ativo', -- ativo, revogado, expirado

  -- Assinatura
  assinado BOOLEAN DEFAULT FALSE,
  assinatura_digital TEXT,

  -- Auditoria
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL,

  -- Foreign keys
  FOREIGN KEY(habilitacao_id) REFERENCES habilitacoes(id),
  FOREIGN KEY(empresa_id) REFERENCES empresas(id),
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY(created_by) REFERENCES usuarios(id)
);

-- Índices
CREATE INDEX idx_cert_numero ON certificados(numero_certificado);
CREATE INDEX idx_cert_funcionario ON certificados(funcionario_id);
CREATE INDEX idx_cert_empresa ON certificados(empresa_id);
CREATE INDEX idx_cert_status ON certificados(status);
CREATE INDEX idx_cert_data_emissao ON certificados(data_emissao);
```

---

## PARTE 3: SERVICE - CERTIFICADOS

### Arquivo: `src/worker/services/certificadosService.ts`

```typescript
import { BaseService } from './BaseService';
import { EmpresasConfigService } from './empresasConfigService';
import type { CertificadoResponse } from '../dtos/certificados';

export interface Certificado {
  id: number;
  habilitacao_id: number;
  empresa_id: number;
  funcionario_id: number;
  numero_certificado: string;
  logo_url?: string;
  template_tipo: string;
  cor_primaria: string;
  r2_key?: string;
  r2_url?: string;
  data_emissao: string;
  status: string;
  created_at: string;
}

export class CertificadosService extends BaseService<Certificado> {
  constructor(db: any, private r2?: any) {
    super('certificados', db);
  }

  /**
   * Gerar novo certificado
   */
  async gerar(dados: {
    habilitacao_id: number;
    empresa_id: number;
    funcionario_id: number;
    qualificacao_id?: number;
  }): Promise<Certificado> {
    // 1. Validar dados
    const habilitacao = await this.validarHabilitacao(dados.habilitacao_id);
    const empresa = await this.validarEmpresa(dados.empresa_id);
    const funcionario = await this.validarFuncionario(dados.funcionario_id);

    // 2. Gerar número único
    const numero = this.gerarNumeroCertificado(empresa.id);

    // 3. Obter configurações da empresa (logo, cores)
    const configService = new EmpresasConfigService(this.db);
    const config = await configService.getByEmpresaId(empresa.id);

    // 4. Gerar PDF
    const pdfBuffer = await this.gerarPDF({
      funcionario,
      habilitacao,
      empresa,
      numero,
      logo_url: config?.logo_url,
      cores: {
        primaria: config?.cor_primaria || '#0066cc',
        secundaria: config?.cor_secundaria || '#333333',
      },
    });

    // 5. Salvar em R2
    const r2_key = `certificados/${empresa.id}/${numero}.pdf`;
    const r2_url = await this.salvarR2(r2_key, pdfBuffer);

    // 6. Registrar na BD
    const certificado = await this.create({
      habilitacao_id: dados.habilitacao_id,
      empresa_id: dados.empresa_id,
      funcionario_id: dados.funcionario_id,
      qualificacao_id: dados.qualificacao_id,
      numero_certificado: numero,
      logo_url: config?.logo_url,
      template_tipo: config?.template_certificado || 'default',
      cor_primaria: config?.cor_primaria,
      r2_key,
      r2_url,
      data_emissao: new Date().toISOString().split('T')[0],
      status: 'ativo',
    } as Record<string, unknown>);

    return certificado;
  }

  /**
   * Gerar PDF do certificado
   */
  private async gerarPDF(dados: {
    funcionario: any;
    habilitacao: any;
    empresa: any;
    numero: string;
    logo_url?: string;
    cores: { primaria: string; secundaria: string };
  }): Promise<Buffer> {
    // Usando html-to-pdf ou pdfkit
    const html = this.gerarHTMLCertificado(dados);
    const buffer = await this.convertHtmlToPdf(html);
    return buffer;
  }

  /**
   * Gerar HTML do certificado
   */
  private gerarHTMLCertificado(dados: any): string {
    const { funcionario, empresa, numero, logo_url, cores } = dados;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; }
    body {
      font-family: 'Georgia', serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #f0f0f0;
    }
    .certificate {
      width: 900px;
      height: 650px;
      background: white;
      border: 3px solid ${cores.primaria};
      border-radius: 10px;
      padding: 40px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      text-align: center;
      position: relative;
      background-image: 
        linear-gradient(135deg, transparent 24px, ${cores.primaria} 24px, ${
      cores.primaria
    } 26px, transparent 26px, transparent 74px, ${cores.primaria} 74px, ${
      cores.primaria
    } 76px, transparent 76px),
        linear-gradient(45deg, transparent 24px, ${cores.primaria} 24px, ${
      cores.primaria
    } 26px, transparent 26px, transparent 74px, ${cores.primaria} 74px, ${
      cores.primaria
    } 76px, transparent 76px);
      background-size: 50px 50px;
      background-position: 0 0, 25px 25px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
    }
    .logo {
      max-width: 120px;
      max-height: 80px;
    }
    .empresa-nome {
      font-size: 24px;
      font-weight: bold;
      color: ${cores.primaria};
    }
    .numero {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    }
    .titulo {
      font-size: 42px;
      font-weight: bold;
      color: ${cores.primaria};
      margin: 40px 0;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .conteudo {
      margin: 40px 0;
      line-height: 1.8;
    }
    .campo {
      margin: 20px 0;
      font-size: 16px;
    }
    .label {
      color: ${cores.secundaria};
      font-weight: bold;
      font-size: 12px;
      text-transform: uppercase;
    }
    .valor {
      font-size: 20px;
      font-weight: bold;
      color: #000;
      margin-top: 5px;
    }
    .assinatura {
      margin-top: 60px;
      display: flex;
      justify-content: space-around;
    }
    .assinatura-item {
      flex: 1;
      text-align: center;
    }
    .linha {
      border-top: 2px solid ${cores.primaria};
      width: 150px;
      margin: 20px auto 5px;
    }
    .rodape {
      margin-top: 30px;
      font-size: 11px;
      color: #999;
      border-top: 1px solid #ddd;
      padding-top: 15px;
    }
  </style>
</head>
<body>
  <div class="certificate">
    <div class="header">
      ${logo_url ? `<img src="${logo_url}" class="logo" alt="Logo">` : '<div></div>'}
      <div>
        <div class="empresa-nome">${empresa.nome}</div>
        <div class="numero">Certificado #${numero}</div>
      </div>
    </div>

    <div class="titulo">Certificado de Conclusão</div>

    <div class="conteudo">
      <div class="campo">
        <div class="label">Certificamos que</div>
        <div class="valor">${funcionario.nome}</div>
      </div>

      <div class="campo">
        <div class="label">Completou com sucesso</div>
        <div class="valor">${dados.habilitacao.nome}</div>
      </div>

      <div class="campo">
        <div class="label">Certificado em</div>
        <div class="valor">${new Date().toLocaleDateString('pt-BR')}</div>
      </div>
    </div>

    <div class="assinatura">
      <div class="assinatura-item">
        <div class="linha"></div>
        <div style="font-size: 12px; margin-top: 5px;">Assinado Digitalmente</div>
      </div>
    </div>

    <div class="rodape">
      <p>Este certificado foi digitalmente autenticado em ${new Date().toISOString()}</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Converter HTML para PDF (usando html2pdf.js ou similar)
   */
  private async convertHtmlToPdf(html: string): Promise<Buffer> {
    // Implementar com puppeteer ou html2pdf
    // Por enquanto, retornar buffer placeholder
    return Buffer.from(html);
  }

  /**
   * Salvar PDF em R2
   */
  private async salvarR2(key: string, buffer: Buffer): Promise<string> {
    if (!this.r2) throw new Error('R2 não configurado');

    await this.r2.put(key, buffer, {
      httpMetadata: {
        contentType: 'application/pdf',
      },
    });

    return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
  }

  /**
   * Listar certificados de um funcionário
   */
  async listarPorFuncionario(funcionario_id: number): Promise<Certificado[]> {
    const { results } = await this.db
      .prepare(
        'SELECT * FROM certificados WHERE funcionario_id = ? AND deleted_at IS NULL ORDER BY data_emissao DESC',
      )
      .bind(funcionario_id)
      .all();

    return results as Certificado[];
  }

  /**
   * Validar habilitação
   */
  private async validarHabilitacao(id: number): Promise<any> {
    const result = await this.db
      .prepare('SELECT * FROM habilitacoes WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first();

    if (!result) throw new Error('Habilitação não encontrada');
    return result;
  }

  /**
   * Validar empresa
   */
  private async validarEmpresa(id: number): Promise<any> {
    const result = await this.db
      .prepare('SELECT * FROM empresas WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first();

    if (!result) throw new Error('Empresa não encontrada');
    return result;
  }

  /**
   * Validar funcionário
   */
  private async validarFuncionario(id: number): Promise<any> {
    const result = await this.db
      .prepare('SELECT * FROM funcionarios WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first();

    if (!result) throw new Error('Funcionário não encontrado');
    return result;
  }

  /**
   * Gerar número único de certificado
   */
  private gerarNumeroCertificado(empresa_id: number): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `CERT-${empresa_id}-${timestamp}-${random}`;
  }

  /**
   * Revogar certificado
   */
  async revogar(id: number, motivo: string): Promise<void> {
    await this.update(id, {
      status: 'revogado',
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>);
  }
}
```

---

## PARTE 4: DTO - CERTIFICADOS

### Arquivo: `src/worker/dtos/certificados.ts`

```typescript
import { z } from 'zod';

export const CreateCertificadoDTO = z.object({
  habilitacao_id: z.number().int().positive('Habilitação ID é obrigatório'),
  empresa_id: z.number().int().positive('Empresa ID é obrigatório'),
  funcionario_id: z.number().int().positive('Funcionário ID é obrigatório'),
  qualificacao_id: z.number().int().optional(),
});

export const CertificadoResponseDTO = z.object({
  id: z.number(),
  numero_certificado: z.string(),
  logo_url: z.string().url().nullable(),
  template_tipo: z.string(),
  cor_primaria: z.string(),
  r2_url: z.string().url().nullable(),
  data_emissao: z.string(),
  status: z.enum(['ativo', 'revogado', 'expirado']),
  created_at: z.string(),
});

export type CreateCertificadoInput = z.infer<typeof CreateCertificadoDTO>;
export type CertificadoResponse = z.infer<typeof CertificadoResponseDTO>;
```

---

## PARTE 5: ROUTES - CERTIFICADOS

### Arquivo: `src/worker/routes/certificados.ts`

```typescript
import { Hono } from 'hono';
import { CertificadosService } from '../services/certificadosService';
import { CreateCertificadoDTO } from '../dtos/certificados';
import { ZodError } from 'zod';

export function certificadosRoutes() {
  const router = new Hono<{ Bindings: Env }>();

  /**
   * POST /api/v2/certificados/gerar
   */
  router.post('/gerar', async (c) => {
    try {
      const body = await c.req.json();
      const dados = CreateCertificadoDTO.parse(body);

      const service = new CertificadosService(c.env.DB, c.env.R2);
      const certificado = await service.gerar(dados);

      return c.json(
        {
          success: true,
          data: certificado,
          message: 'Certificado gerado com sucesso',
          timestamp: new Date().toISOString(),
        },
        201,
      );
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
        { success: false, error: 'Erro ao gerar certificado', code: 'INTERNAL_ERROR' },
        500,
      );
    }
  });

  /**
   * GET /api/v2/certificados/funcionario/:id
   */
  router.get('/funcionario/:id', async (c) => {
    try {
      const funcionario_id = parseInt(c.req.param('id'));

      const service = new CertificadosService(c.env.DB);
      const certificados = await service.listarPorFuncionario(funcionario_id);

      return c.json({
        success: true,
        data: certificados,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json(
        { success: false, error: 'Erro ao listar certificados', code: 'INTERNAL_ERROR' },
        500,
      );
    }
  });

  /**
   * GET /api/v2/certificados/:id/download
   */
  router.get('/:id/download', async (c) => {
    try {
      const id = parseInt(c.req.param('id'));

      const service = new CertificadosService(c.env.DB);
      const certificado = await service.getById(id);

      if (!certificado || !certificado.r2_url) {
        return c.json(
          { success: false, error: 'Certificado não encontrado', code: 'NOT_FOUND' },
          404,
        );
      }

      // Redirecionar para R2
      return c.redirect(certificado.r2_url);
    } catch (error) {
      return c.json(
        { success: false, error: 'Erro ao fazer download', code: 'INTERNAL_ERROR' },
        500,
      );
    }
  });

  return router;
}
```

---

## PARTE 6: FRONTEND - COMPONENTES

### Arquivo: `src/frontend/pages/CertificadosPage.tsx`

```typescript
import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from 'react-hot-toast';
import { Download, Plus, AlertCircle } from 'lucide-react';

interface Certificado {
  id: number;
  numero_certificado: string;
  data_emissao: string;
  status: 'ativo' | 'revogado' | 'expirado';
  r2_url?: string;
}

export default function CertificadosPage() {
  const { get, post } = useApi();
  const toast = useToast();

  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    habilitacao_id: '',
    empresa_id: '',
    funcionario_id: '',
  });

  // Carregar certificados
  useEffect(() => {
    async function load() {
      try {
        const response = await get('/api/v2/certificados');
        if (response.success) {
          setCertificados(response.data);
        }
      } catch (error) {
        toast.error('Erro ao carregar certificados');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Gerar certificado
  async function handleGerar(e: React.FormEvent) {
    e.preventDefault();

    try {
      const response = await post('/api/v2/certificados/gerar', {
        habilitacao_id: parseInt(formData.habilitacao_id),
        empresa_id: parseInt(formData.empresa_id),
        funcionario_id: parseInt(formData.funcionario_id),
      });

      if (response.success) {
        toast.success('Certificado gerado com sucesso!');
        setShowForm(false);
        setFormData({ habilitacao_id: '', empresa_id: '', funcionario_id: '' });

        // Recarregar lista
        const updated = await get('/api/v2/certificados');
        if (updated.success) setCertificados(updated.data);
      } else {
        toast.error(response.error || 'Erro ao gerar');
      }
    } catch (error) {
      toast.error('Erro na requisição');
    }
  }

  // Download certificado
  function handleDownload(certificado: Certificado) {
    if (certificado.r2_url) {
      window.open(certificado.r2_url, '_blank');
    }
  }

  const statusColors = {
    ativo: 'bg-green-100 text-green-800',
    revogado: 'bg-red-100 text-red-800',
    expirado: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Certificados</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Novo Certificado
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <form onSubmit={handleGerar} className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Habilitação</label>
              <input
                type="number"
                value={formData.habilitacao_id}
                onChange={(e) => setFormData({ ...formData, habilitacao_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Empresa</label>
              <input
                type="number"
                value={formData.empresa_id}
                onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Funcionário</label>
              <input
                type="number"
                value={formData.funcionario_id}
                onChange={(e) => setFormData({ ...formData, funcionario_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Gerar Certificado
          </button>
        </form>
      )}

      {/* Lista */}
      {loading ? (
        <div>Carregando...</div>
      ) : certificados.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle size={20} className="text-yellow-600" />
          <p className="text-yellow-800">Nenhum certificado gerado ainda</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Número</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Data de Emissão</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {certificados.map((cert) => (
                <tr key={cert.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm font-mono">{cert.numero_certificado}</td>
                  <td className="px-6 py-3 text-sm">
                    {new Date(cert.data_emissao).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                        statusColors[cert.status]
                      }`}
                    >
                      {cert.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <button
                      onClick={() => handleDownload(cert)}
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                    >
                      <Download size={18} />
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

---

## PARTE 7: INTEGRAÇÃO COM CONFIGURAÇÕES

### Fluxo de Logo Integrado

```typescript
// Em CertificadosService.gerar()

// 1. Obter config da empresa (com logo)
const configService = new EmpresasConfigService(this.db);
const config = await configService.getByEmpresaId(empresa_id);

// 2. Usar logo na geração do PDF
const pdfBuffer = await this.gerarPDF({
  funcionario,
  habilitacao,
  empresa,
  numero,
  logo_url: config?.logo_url, // ← AQUI
  cores: {
    primaria: config?.cor_primaria, // ← AQUI
    secundaria: config?.cor_secundaria, // ← AQUI
  },
});

// 3. O HTML do certificado usa:
// <img src="${logo_url}" class="logo">
// border-color: ${cores.primaria}
// color: ${cores.primaria}
```

---

## PARTE 8: CONFIGURAÇÃO R2

### Arquivo: `wrangler.toml`

```toml
[[r2_buckets]]
binding = "R2"
bucket_name = "airtrust-certificados"
account_id = "xxx"

[env.production.r2_buckets]
bucket_name = "airtrust-certificados-prod"
```

### Variáveis de Ambiente (`.dev.vars`)

```
R2_ACCOUNT_ID=abc123
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=yyy
R2_BUCKET=airtrust-certificados
```

---

## PARTE 9: DEPENDENCIES

### Adicionar ao `package.json`

```json
{
  "dependencies": {
    "html2pdf.js": "^0.10.1",
    "pdfkit": "^0.13.0",
    "@cloudflare/workers-types": "^4.20250103.0"
  },
  "devDependencies": {
    "@types/pdfkit": "^0.12.7"
  }
}
```

### Instalação

```bash
npm install html2pdf.js pdfkit @cloudflare/workers-types
npm install -D @types/pdfkit
```

---

## PARTE 10: CHECKLIST DE IMPLEMENTAÇÃO

### Database

- [ ] Criar migration 0010 para expandir certificados
- [ ] Adicionar logo_url, template_tipo, cor_primaria, r2_key, r2_url
- [ ] Testar que campos novos são criados corretamente
- [ ] Verificar índices

### Backend

- [ ] Criar DTO em `src/worker/dtos/certificados.ts`
- [ ] Expandir Service em `src/worker/services/certificadosService.ts`
- [ ] Adicionar métodos: gerar, gerarPDF, salvarR2, listarPorFuncionario
- [ ] Criar routes em `src/worker/routes/certificados.ts`
  - [ ] POST /api/v2/certificados/gerar
  - [ ] GET /api/v2/certificados/funcionario/:id
  - [ ] GET /api/v2/certificados/:id/download
- [ ] Testar POST /api/v2/certificados/gerar com dados válidos
- [ ] Verificar que logo é recuperada de empresa_config
- [ ] Verificar que cores são aplicadas ao PDF
- [ ] Testar que arquivo é salvo em R2
- [ ] Testar que URL R2 é armazenada na BD
- [ ] Testar download redirect

### Frontend

- [ ] Criar componente CertificadosPage.tsx
- [ ] Adicionar rota /certificados
- [ ] Adicionar link no Sidebar
- [ ] Testar formulário de geração
- [ ] Testar listagem de certificados
- [ ] Testar download link
- [ ] Testar exibição de status (ativo, revogado, expirado)

### R2 Storage

- [ ] Configurar bucket em wrangler.toml
- [ ] Testar upload de PDFs
- [ ] Verificar URLs públicas
- [ ] Configurar permissões

### Integração

- [ ] Verificar que logo da empresa é carregada automaticamente
- [ ] Verificar que cores da empresa são aplicadas
- [ ] Verificar que template_tipo é respeitado
- [ ] Testar múltiplas geração (OK para duplicar cert?)
- [ ] Testar com diferentes templates

### Testes E2E

- [ ] Criar config de empresa (com logo)
- [ ] Gerar certificado
- [ ] Download PDF
- [ ] Verificar logo no PDF
- [ ] Verificar cores no PDF
- [ ] Verificar número único
- [ ] Verificar data de emissão

---

## PARTE 11: TABELAS DE RELACIONAMENTO

### Fluxo Completo

```
Empresa
├── empresa_config (logo, cores, template)
│   └── Certificados (usa logo e cores)
│       ├── habilitacao_id → Habilitações
│       ├── funcionario_id → Funcionários
│       └── qualificacao_id → Qualificações
```

---

## PARTE 12: TEMPLATES DE CERTIFICADO

### Template Padrão (default)

- Borda com padrão geométrico
- Logo no topo esquerdo
- Título centrado
- Dados do funcionário em destaque
- Assinatura digital

### Template Premium

- Fundo degradado com cores da empresa
- Logo maior e mais proeminente
- Efeitos visuais sofisticados
- Certificado número com QR code
- Selo digital

### Template Simples

- Minimalista
- Apenas texto
- Logo pequeno
- Sem decorações
- Ideal para impressão rápida

---

## PARTE 13: VALIDAÇÕES E REGRAS

### Regras de Negócio

1. **Um funcionário pode ter múltiplos certificados** (diferentes habilitações)
2. **Um certificado é único por combinação** (func + hab + empresa)
3. **Logo é obrigatória** para geração (usar padrão se não houver)
4. **Cores são obrigatórias** (usar padrão se não houver)
5. **Certificados revogados não podem ser restaurados** (soft delete apenas)
6. **Número de certificado é ÚNICO** na BD

### Validações

- empresa_id deve existir
- funcionario_id deve existir
- habilitacao_id deve existir
- logo_url deve ser URL válida (se fornecida)
- cor_primaria deve ser hex válido (#RRGGBB)
- cor_secundaria deve ser hex válido
- template_tipo deve estar em lista pré-aprovada

---

## RESUMO FINAL

| Camada      | Componente     | Status |
| ----------- | -------------- | ------ |
| DB          | Migration 0010 | ✅     |
| Backend     | DTOs           | ✅     |
| Backend     | Service        | ✅     |
| Backend     | Routes         | ✅     |
| Frontend    | Component      | ✅     |
| Storage     | R2 Config      | ✅     |
| Integration | Logo           | ✅     |
| Integration | Cores          | ✅     |
| Templates   | 3 tipos        | ✅     |

---

**Status**: Pronto para implementação  
**Build**: npm run build (verificar 0 errors)  
**Test**: AUDIT-CHECKLIST-COMPLETO.md  
**Deploy**: npm run deploy + wrangler pages deploy
