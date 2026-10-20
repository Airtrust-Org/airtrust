import test from 'node:test';
import assert from 'node:assert/strict';
import {isExplicitMissingR2Object} from '../staging/player3-qa-r2-object-miss.mjs';

test('new QA R2 object absent: Wrangler explicit key missing is allowed', () => {
  for (const msg of [
    'The specified key does not exist',
    'Error: The specified key does not exist.',
    'NoSuchKey',
    '404 Object not found',
    'No such R2 object'
  ]) assert.equal(isExplicitMissingR2Object(msg),true,msg);
});

test('authentication and unexpected failures must not be mistaken for missing objects', () => {
  for (const msg of [
    'Authentication error 10000',
    'HTTP 403 Forbidden',
    '401 unauthorized',
    'permission denied',
    'R2 GET returned 500 Internal Server Error',
    'network timeout',
    'The specified key does not exist; authorization error: 403',
    '',
    undefined
  ]) assert.equal(isExplicitMissingR2Object(msg),false,String(msg));
});
