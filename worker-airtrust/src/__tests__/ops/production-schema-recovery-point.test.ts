import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  join(process.cwd(), '..', '.github', 'workflows', 'apply-schema-change-v2.yml'),
  'utf8',
);

describe('Schema V2 production recovery point', () => {
  it('captures a Time Travel timestamp before any schema file is applied', () => {
    const recoveryIndex = workflow.indexOf('- name: Capture D1 Time Travel recovery point');
    const applyIndex = workflow.indexOf('- name: Apply one schema file');

    expect(recoveryIndex).toBeGreaterThan(-1);
    expect(applyIndex).toBeGreaterThan(recoveryIndex);
    expect(workflow).toContain('d1 time-travel info airtrust-db');
    expect(workflow).toContain('RECOVERY_TIMESTAMP_UTC=');
    expect(workflow).toContain('RECOVERY_POINT_CAPTURED=true');
  });

  it('does not restore production or expose the captured bookmark in logs', () => {
    expect(workflow).not.toContain('d1 time-travel restore');
    expect(workflow).toContain('> "$recovery_output"');
    expect(workflow).not.toContain('cat "$recovery_output"');
  });
});
