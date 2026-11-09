import { describe, expect, it } from 'vitest';
import { escapeAlertEmailHtml, getManualAlertDaysUntilDueDate } from '../../routes/alertas';

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

describe('P04-05 manual due-date alert uses Sao Paulo calendar days', () => {
  it('treats 01:30 UTC as prior business day in Sao Paulo', () => {
    const now = new Date('2026-11-09T01:30:00Z'); // 08/11 22:30 BRT
    expect(getManualAlertDaysUntilDueDate('2026-11-09', now)).toBe(1);
    expect(getManualAlertDaysUntilDueDate('2026-11-08', now)).toBe(0);
    expect(getManualAlertDaysUntilDueDate('2026-11-07', now)).toBe(-1);
  });
  it('uses the local date after midnight and rejects malformed calendar dates', () => {
    const now = new Date('2026-11-09T04:00:00Z'); // 09/11 01:00 BRT
    expect(getManualAlertDaysUntilDueDate('2026-11-09', now)).toBe(0);
    expect(getManualAlertDaysUntilDueDate('2026-11-10', now)).toBe(1);
    expect(getManualAlertDaysUntilDueDate('2026-02-30', now)).toBeNull();
    expect(getManualAlertDaysUntilDueDate('banana', now)).toBeNull();
  });
  it('counts leap-year and end-of-month boundaries without UTC offset', () => {
    const now = new Date('2024-03-01T01:00:00Z'); // 29/02 22:00 BRT
    expect(getManualAlertDaysUntilDueDate('2024-02-29', now)).toBe(0);
    expect(getManualAlertDaysUntilDueDate('2024-03-01', now)).toBe(1);
  });
});
