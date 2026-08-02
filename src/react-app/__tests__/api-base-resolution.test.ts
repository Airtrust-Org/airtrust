import { describe, expect, it } from 'vitest';
import { resolveApiBase } from '../config/api';

const STAGING_API_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev/api';
const PRODUCTION_API_BASE_URL = 'https://api.airtrust.online/api';

describe('resolveApiBase', () => {
  it.each([
    ['staging.airtrust.pages.dev', 'https://staging.airtrust.pages.dev', '', STAGING_API_BASE_URL],
    ['main.airtrust.pages.dev', 'https://main.airtrust.pages.dev', '', STAGING_API_BASE_URL],
    [
      'production.airtrust.pages.dev',
      'https://production.airtrust.pages.dev',
      '',
      PRODUCTION_API_BASE_URL,
    ],
    ['airtrust.online', 'https://airtrust.online', '', PRODUCTION_API_BASE_URL],
    ['localhost', 'http://localhost:3000', '', 'http://localhost:3000/api'],
    [
      'localhost',
      'http://localhost:3000',
      'https://custom.example.test/api',
      'http://localhost:3000/api',
    ],
    [
      'unknown.example.test',
      'https://unknown.example.test',
      '',
      'https://unknown.example.test/api',
    ],
    [
      'preview.example.test',
      'https://preview.example.test',
      'https://custom.example.test/api',
      'https://custom.example.test/api',
    ],
  ])('resolves %s safely', (host, origin, envUrl, expected) => {
    expect(resolveApiBase({ host, origin, envUrl })).toBe(expected);
  });
});
