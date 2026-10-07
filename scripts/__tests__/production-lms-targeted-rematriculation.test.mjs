import assert from 'node:assert/strict';
import test from 'node:test';
import {
  employeeSearchTerm,
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

test('employeeSearchTerm broadens multi-token lookup to first token', () => {
  assert.equal(employeeSearchTerm('  Wilson Nery  '), 'Wilson');
});

test('filterEmployeeCandidates matches non-contiguous name tokens', () => {
  const rows = [
    { id: 1, nome: 'Wilson José Nery da Silva' },
    { id: 2, nome: 'Wilson da Silva' },
    { id: 3, nome: 'Nery Souza' },
  ];
  const result = filterEmployeeCandidates(rows, 'Wilson Nery');
  assert.deepEqual(result.map((row) => row.id), [1]);
});
