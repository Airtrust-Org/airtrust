import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Pasta Virtual document actions', () => {
  it('keeps preview and download as distinct visible actions', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/react-app/components/funcionarios/PastaVirtualCompleta.tsx'),
      'utf8',
    );
    expect(source).toContain('handlePreview(doc)');
    expect(source).toContain('<Eye className="h-5 w-5" />');
    expect(source).toContain('title="Visualizar documento"');
    expect(source).toContain('handleDownload(doc)');
    expect(source).toContain('title="Baixar documento"');
    expect(source).toContain("? 'Gerado pelo AirTrust'");
    expect(source).toContain(": 'Documento enviado por upload'");
    expect(source).toContain('<Sparkles className="h-3.5 w-3.5" />');
    expect(source).toContain('<Upload className="h-3.5 w-3.5" />');
  });

  it('separates preview and direct download in the hook contract', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/react-app/hooks/usePastaVirtual.ts'),
      'utf8',
    );
    expect(source).toContain('previewDocumento: (doc: DocumentoPV) => Promise<void>');
    expect(source).toContain('downloadDocumento: (doc: DocumentoPV) => Promise<void>');
    expect(source).toContain('triggerDocumentDownload(blob, doc.nome)');
  });
});
