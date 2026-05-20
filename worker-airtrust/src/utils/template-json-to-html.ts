/**
 * Conversor de Template JSON (certificados_templates.template_json) para HTML
 * Os templates são armazenados em JSON estruturado com elementos visuais
 */

export interface TemplateElement {
  type: 'logo' | 'title' | 'subtitle' | 'text' | 'field' | 'footer' | 'signature' | 'line';
  text?: string;
  name?: string; // nome do campo (para substituição posterior)
  position?: { x: number | string; y: number };
  size?: { width: number; height: number };
  source?: string; // URL da imagem
  style?: {
    fontSize?: number;
    fontWeight?: string;
    color?: string; // 'primary', 'secondary', 'highlight' ou hex
    uppercase?: boolean;
  };
  elements?: TemplateElement[]; // para footer com múltiplos elementos
  label?: string;
}

export interface TemplateJson {
  version: string;
  layout?: {
    orientation?: 'portrait' | 'landscape';
    size?: 'A4' | 'Letter';
    margin?: number;
  };
  elements: TemplateElement[];
  colors?: {
    primary?: string;
    secondary?: string;
    highlight?: string;
  };
}

/**
 * Converte template JSON estruturado para HTML
 */
export function convertTemplateJsonToHtml(templateJson: string | object): string {
  let template: TemplateJson;

  // Parsear JSON se for string
  if (typeof templateJson === 'string') {
    try {
      template = JSON.parse(templateJson);
    } catch {
      // Se não conseguir parsear, retornar como string (talvez seja HTML puro)
      return templateJson;
    }
  } else {
    template = templateJson as TemplateJson;
  }

  // Se não tem 'elements', não é um template estruturado
  if (!template.elements || !Array.isArray(template.elements)) {
    return JSON.stringify(template);
  }

  // Definir cores padrão
  const colors = template.colors || {
    primary: '#003366',
    secondary: '#666666',
    highlight: '#0066CC',
  };

  const layout = template.layout || {
    orientation: 'landscape',
    size: 'A4',
    margin: 50,
  };

  // Converter elementos para HTML
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Certificado</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      background: white;
      margin: 0;
      padding: 0;
    }
    .certificate-page {
      width: ${layout.size === 'Letter' ? '8.5in' : '210mm'};
      height: ${layout.size === 'Letter' ? '11in' : '297mm'};
      margin: 0 auto;
      padding: ${layout.margin || 20}px;
      background: white;
      position: relative;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
      ${
        layout.orientation === 'landscape'
          ? 'transform: rotate(90deg) translateY(-100%); transform-origin: top left;'
          : ''
      }
    }
    .certificate-content {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100%;
      text-align: center;
    }
    .logo-container {
      text-align: center;
      margin-bottom: 20px;
    }
    .logo-container img {
      max-width: 120px;
      max-height: 60px;
    }
    .title {
      font-size: 28px;
      font-weight: bold;
      color: ${colors.primary};
      margin: 30px 0 20px 0;
    }
    .subtitle {
      font-size: 16px;
      color: ${colors.secondary};
      margin: 15px 0;
    }
    .field {
      font-size: 20px;
      font-weight: bold;
      color: ${colors.highlight};
      margin: 15px 0;
      text-transform: uppercase;
      border-bottom: 2px solid ${colors.primary};
      padding-bottom: 5px;
      min-height: 30px;
    }
    .text {
      font-size: 14px;
      color: ${colors.secondary};
      margin: 10px 0;
      line-height: 1.6;
    }
    .footer {
      font-size: 12px;
      color: ${colors.secondary};
      border-top: 1px solid ${colors.primary};
      padding-top: 20px;
      margin-top: 30px;
    }
    .footer-item {
      margin: 8px 0;
    }
    .signature-container {
      display: flex;
      justify-content: space-between;
      margin-top: 40px;
      padding-top: 30px;
    }
    .signature-box {
      text-align: center;
      width: 150px;
      border-top: 1px solid ${colors.primary};
    }
    .signature-image {
      max-width: 100%;
      max-height: 50px;
      margin-bottom: 5px;
    }
    .signature-label {
      font-size: 10px;
      color: ${colors.secondary};
    }
    .line {
      border-top: 1px solid ${colors.primary};
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="certificate-page">
    <div class="certificate-content">
      ${template.elements.map((el) => elementToHtml(el, colors)).join('')}
    </div>
  </div>
</body>
</html>
  `;

  return html;
}

function elementToHtml(element: TemplateElement, colors: Record<string, string>): string {
  const getColorValue = (colorName?: string): string => {
    if (!colorName) return colors.primary;
    if (colorName.startsWith('#')) return colorName;
    return colors[colorName] || colors.primary;
  };

  switch (element.type) {
    case 'logo':
      return `
        <div class="logo-container">
          ${element.source ? `<img src="${element.source}" alt="Logo" />` : ''}
        </div>
      `;

    case 'title':
      return `
        <div class="title" style="color: ${getColorValue(element.style?.color)}">
          ${element.text || ''}
        </div>
      `;

    case 'subtitle':
      return `
        <div class="subtitle" style="color: ${getColorValue(element.style?.color)}">
          ${element.text || ''}
        </div>
      `;

    case 'text':
      return `
        <div class="text" style="color: ${getColorValue(element.style?.color)}">
          ${element.text || ''}
        </div>
      `;

    case 'field':
      // Mapear nomes de campos para as variáveis que processTemplate espera
      const fieldNameMap: Record<string, string> = {
        // Nomes do template JSON
        pessoa_nome: 'nome_funcionario',
        funcionario_nome: 'nome_funcionario',
        funcionario_cpf: 'cpf',
        funcionario_codigo_anac: 'codigo_anac',
        funcionario_matricula: 'matricula',
        qualificacao_nome: 'nome_qualificacao',
        qualificacao_codigo: 'codigo_qualificacao',
        qualificacao_categoria: 'categoria',
        data_conclusao: 'data_conclusao',
        data_vencimento: 'data_vencimento',
        data_realizacao: 'data_conclusao', // Alias
        data_validade: 'data_vencimento', // Alias
        carga_horaria: 'carga_horaria',
        numero_certificado: 'numero_certificado',
        matricula: 'matricula',
        nome_empresa: 'nome_empresa',
      };

      const mappedFieldName = fieldNameMap[element.name || ''] || element.name || '';

      return `
        <div class="field" style="color: ${getColorValue(element.style?.color)}; ${
        element.style?.uppercase ? 'text-transform: uppercase;' : ''
      }">
          {{${mappedFieldName}}}
        </div>
      `;

    case 'line':
      return `<div class="line" style="border-top-color: ${getColorValue(
        element.style?.color,
      )}"></div>`;

    case 'signature':
      return `
        <div class="signature-box">
          ${
            element.source
              ? `<img src="${element.source}" alt="Assinatura" class="signature-image" />`
              : ''
          }
          <div class="signature-label">${element.label || 'Assinado'}</div>
        </div>
      `;

    case 'footer':
      return `
        <div class="footer">
          ${
            element.elements
              ?.map((child) => `<div class="footer-item">${child.text || ''}</div>`)
              .join('') || ''
          }
        </div>
      `;

    default:
      return '';
  }
}

/**
 * Detecta se uma string é um template JSON estruturado ou HTML puro
 */
export function isTemplateJson(template: string): boolean {
  if (!template.trim().startsWith('{')) {
    return false;
  }
  try {
    const parsed = JSON.parse(template);
    return parsed.elements && Array.isArray(parsed.elements);
  } catch {
    return false;
  }
}
