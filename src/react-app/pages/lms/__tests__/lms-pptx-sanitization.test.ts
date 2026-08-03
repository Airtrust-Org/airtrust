// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { sanitizePptxSlideHtml } from '../pptxSanitization';

function parseSanitizedSlide(html: string): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = sanitizePptxSlideHtml(html);
  return root;
}

describe('sanitizePptxSlideHtml', () => {
  it('removes executable elements, event handlers and javascript URLs', () => {
    const root = parseSanitizedSlide(`
      <div class="slide" onclick="alert('xss')">
        <script>alert('xss')</script>
        <img src="x" onerror="alert('xss')" />
        <a href="javascript:alert('xss')">link</a>
        <iframe srcdoc="<script>alert('xss')</script>"></iframe>
        <object data="https://attacker.invalid/payload"></object>
        <embed src="https://attacker.invalid/payload" />
      </div>
    `);

    const slide = root.querySelector<HTMLElement>('.slide');
    const image = root.querySelector<HTMLImageElement>('img');
    const link = root.querySelector<HTMLAnchorElement>('a');

    expect(slide).not.toBeNull();
    expect(slide?.getAttribute('onclick')).toBeNull();
    expect(image?.getAttribute('onerror')).toBeNull();
    expect(link?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    expect(root.querySelector('script, iframe, object, embed')).toBeNull();
  });

  it('preserves safe text, layout and SVG structures used by PPTX slides', () => {
    const root = parseSanitizedSlide(`
      <div class="slide" style="position:absolute;left:10px;top:20px">
        <span style="font-size:24px">Safety first</span>
        <svg viewBox="0 0 100 100" aria-label="shape">
          <path d="M0 0 L100 100" fill="none"></path>
        </svg>
        <img src="data:image/png;base64,iVBORw0KGgo=" alt="diagram" />
      </div>
    `);

    const slide = root.querySelector<HTMLElement>('.slide');

    expect(slide).not.toBeNull();
    expect(slide?.style.position).toBe('absolute');
    expect(slide?.style.left).toBe('10px');
    expect(root.querySelector('span')?.textContent).toBe('Safety first');
    expect(root.querySelector('svg')).not.toBeNull();
    expect(root.querySelector('path')).not.toBeNull();
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('diagram');
  });
});
