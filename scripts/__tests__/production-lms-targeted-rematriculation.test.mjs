import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLegacyGatekeeperCompletions,
  filterEmployeeCandidates,
  normalizeText,
  selectCourse,
} from '../production/lms-targeted-rematriculation.mjs';

test('normalizeText removes accents and normalizes whitespace', () => {
  assert.equal(normalizeText('  João   Néri  '), 'JOAO NERI');
});

test('selectCourse prefers exact normalized title', () => {
  const course = selectCourse(
    [
      { id: 10, titulo: 'CFIT - Introdução' },
      { id: 11, titulo: 'CFIT' },
    ],
    'CFIT',
  );
  assert.equal(course.id, 11);
});

test('filterEmployeeCandidates requires all query tokens', () => {
  const rows = [
    { id: 1, nome: 'Wilson Nery da Silva' },
    { id: 2, nome: 'Wilson da Silva' },
    { id: 3, nome: 'Nery Souza' },
  ];
  const result = filterEmployeeCandidates(rows, 'Wilson Nery');
  assert.deepEqual(result.map((row) => row.id), [1]);
});

test('filterEmployeeCandidates can match name plus nome de guerra', () => {
  const rows = [
    { id: 4, nome: 'Wilson Antonio da Silva', guerra: 'Nery' },
    { id: 5, nome: 'Wilson Antonio da Silva', guerra: 'Silva' },
  ];
  const result = filterEmployeeCandidates(rows, 'Wilson Nery');
  assert.deepEqual(result.map((row) => row.id), [4]);
});

test('Gatekeeper legacy 14 requires two distinct canonically completed enrollments', () => {
  const history = [
    { funcionario_id: 401, status: 'CONCLUIDO' },
    { funcionario_id: 402, status: 'CONCLUIDO' },
    { funcionario_id: 403, status: 'CANCELADO' },
  ];
  assert.equal(assertLegacyGatekeeperCompletions(history, [401, 402]), true);
  assert.throws(() => assertLegacyGatekeeperCompletions(history, [401, 403]));
  assert.throws(() => assertLegacyGatekeeperCompletions(history, [401]));
  assert.throws(() => assertLegacyGatekeeperCompletions([history[0], history[0], history[1]], [401, 402]));
});
