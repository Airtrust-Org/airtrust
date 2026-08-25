import ExcelJS from 'exceljs';

function cellText(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
    if (value.result != null) return String(value.result);
    if (value.hyperlink && value.text) return String(value.text);
  }
  return String(value);
}

function rowsFromWorksheet(worksheet) {
  if (!worksheet) return null;
  const columnCount = Math.max(worksheet.columnCount || 0, 1);
  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = [];
    for (let index = 1; index <= columnCount; index += 1) {
      values.push(cellText(row.getCell(index).value));
    }
    rows.push(values);
  });
  return rows;
}

export async function worksheetRows(file, sheetName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  return rowsFromWorksheet(workbook.getWorksheet(sheetName));
}

export async function csvRows(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.csv.readFile(file);
  return rowsFromWorksheet(workbook.worksheets[0]);
}
