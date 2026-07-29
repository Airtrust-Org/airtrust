import { describe, it, expect } from 'vitest';
// @ts-ignore
import { parseWorkerVersionId } from '../../../../scripts/parse-worker-version-id.mjs';

describe('parseWorkerVersionId', () => {
  it('extracts "Worker Version ID: <uuid>" format', () => {
    const log = `Deploying...
Worker Version ID: 123e4567-e89b-12d3-a456-426614174000
Done.`;
    expect(parseWorkerVersionId(log)).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('extracts "Version ID: <uuid>" format', () => {
    const log = `Deploying...
Version ID: 123e4567-e89b-12d3-a456-426614174000
Done.`;
    expect(parseWorkerVersionId(log)).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('fails if no UUID is present', () => {
    const log = `Deploying...
Worker Version ID: not-a-uuid
Done.`;
    expect(() => parseWorkerVersionId(log)).toThrow('No Worker Version ID found');
  });

  it('fails if multiple DIFFERENT UUIDs are present', () => {
    const log = `Deploying...
Worker Version ID: 123e4567-e89b-12d3-a456-426614174000
Version ID: 987e6543-e21b-12d3-a456-426614174000
Done.`;
    expect(() => parseWorkerVersionId(log)).toThrow('Ambiguous output: multiple different Worker Version IDs found');
  });

  it('succeeds if the SAME UUID is present multiple times', () => {
    const log = `Deploying...
Worker Version ID: 123e4567-e89b-12d3-a456-426614174000
Version ID: 123E4567-E89B-12D3-A456-426614174000
Done.`;
    expect(parseWorkerVersionId(log).toLowerCase()).toBe('123e4567-e89b-12d3-a456-426614174000');
  });
});
