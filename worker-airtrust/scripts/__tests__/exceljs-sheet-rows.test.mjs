import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { csvRows, worksheetRows } from '../lib/exceljs-sheet-rows.mjs';

test('reads header+data rows as arrays without using xlsx', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'airtrust-exceljs-'));
  const file = path.join(dir, 'matriz.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Matriz Completa');
  sheet.addRow(['Modelo', 'Ordem', 'Código']);
  sheet.addRow(['M1', 1, 'A01']);
  await workbook.xlsx.writeFile(file);

  const rows = await worksheetRows(file, 'Matriz Completa');
  assert.deepEqual(rows[0].slice(0, 3), ['Modelo', 'Ordem', 'Código']);
  assert.deepEqual(rows[1].slice(0, 3), ['M1', '1', 'A01']);
});

test('reads CSV rows as arrays without using xlsx', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'airtrust-csv-'));
  const file = path.join(dir, 'matriz.csv');
  writeFileSync(file, 'modelo,ordem,codigo\nM1,1,A01\n');
  const rows = await csvRows(file);
  assert.equal(rows[0][0].toLowerCase(), 'modelo');
  assert.equal(String(rows[1][2]), 'A01');
});
