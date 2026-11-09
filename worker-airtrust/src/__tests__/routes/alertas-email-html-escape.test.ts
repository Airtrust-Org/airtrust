import { describe, expect, it } from 'vitest';
import { escapeAlertEmailHtml } from '../../routes/alertas';

describe('P04-04 alert email HTML escaping', () => {
  it('escapes script markup in a database-backed employee name', () => {
    expect(escapeAlertEmailHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });
  it('escapes quotes and ampersands in qualifications and URLs', () => {
    expect(escapeAlertEmailHtml('CRM & \'Compliance\'')).toBe('CRM &amp; &#39;Compliance&#39;');
    expect(escapeAlertEmailHtml('https://airtrust.online/?x=" y&z=1')).toBe('https://airtrust.online/?x=&quot; y&amp;z=1');
  });
  it('handles nullish values safely without changing ordinary text', () => {
    expect(escapeAlertEmailHtml(null)).toBe('');
    expect(escapeAlertEmailHtml(undefined)).toBe('');
    expect(escapeAlertEmailHtml('Vence em 10 dias')).toBe('Vence em 10 dias');
  });
});
