import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicFile = (name: string) => readFileSync(resolve(process.cwd(), 'public', name));

function embeddedPng(svgName: string): Buffer {
  const svg = publicFile(svgName).toString('utf8');
  const match = svg.match(/href="data:image\/png;base64,([^"]+)"/);
  if (!match) throw new Error(`Missing embedded PNG in ${svgName}`);
  return Buffer.from(match[1], 'base64');
}

describe('legacy AirTrust branding paths', () => {
  it('serve the current brand assets instead of the retired logo', () => {
    expect(publicFile('airtrust-site-logo-20260830-192.png')).toEqual(
      publicFile('airtrust-brand-icon-20260915-192.png'),
    );
    expect(publicFile('airtrust-site-logo-20260830-512.png')).toEqual(
      publicFile('airtrust-brand-icon-20260915-512.png'),
    );
    expect(publicFile('airtrust-site-logo-apple-20260830.png')).toEqual(
      publicFile('airtrust-brand-icon-20260915-180.png'),
    );
    expect(embeddedPng('airtrust-logo.svg')).toEqual(publicFile('airtrust-logo-20260915.png'));
    expect(embeddedPng('airtrust-icon.svg')).toEqual(publicFile('airtrust-brand-icon-20260915-512.png'));
    expect(embeddedPng('favicon.svg')).toEqual(publicFile('airtrust-brand-icon-20260915-512.png'));
  });
});
