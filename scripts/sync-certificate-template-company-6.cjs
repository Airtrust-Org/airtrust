const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const templatePath = path.join(rootDir, 'scripts', 'certificate-template-company-6.html');
const outputPath = '/tmp/sync_certificate_template_company_6.sql';

const templateHtml = fs.readFileSync(templatePath, 'utf8').trim();
const escapedTemplateHtml = templateHtml.replace(/'/g, "''");

const sql = `
INSERT INTO empresas_config (empresa_id, certificado_template_html, timezone, idioma, updated_at)
SELECT 6, '${escapedTemplateHtml}', 'America/Sao_Paulo', 'pt-BR', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM empresas_config WHERE empresa_id = 6);

UPDATE empresas_config
SET certificado_template_html = '${escapedTemplateHtml}',
    updated_at = datetime('now')
WHERE empresa_id = 6;
`;

fs.writeFileSync(outputPath, sql);
console.log(outputPath);
