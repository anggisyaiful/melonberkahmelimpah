import { getGreenhouseName, todayISO, showToast } from './supabase.js';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};
const NUMBER_FORMAT = '#,##0.##';

function sanitizeFilename(str) {
  const cleaned = String(str || 'Greenhouse')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'Greenhouse';
}

function buildFilename(jenis) {
  return `${jenis}_${sanitizeFilename(getGreenhouseName())}_${todayISO()}.xlsx`;
}

// Isi worksheet dari array of object + styling: header bold + hijau muda,
// border tipis di semua cell, format angka pemisah ribuan, baris TOTAL bold.
function fillWorksheet(ws, rows) {
  const headers = Object.keys(rows[0]);

  const headerRow = ws.addRow(headers);
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
  });

  rows.forEach((row) => {
    const values = headers.map((h) => row[h]);
    const dataRow = ws.addRow(values);
    const isTotalRow = typeof values[0] === 'string' && /^total/i.test(values[0].trim());

    dataRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = THIN_BORDER;
      if (typeof cell.value === 'number') cell.numFmt = NUMBER_FORMAT;
      if (isTotalRow) cell.font = { bold: true };
    });
  });
}

async function downloadWorkbook(wb, filename) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Export satu daftar data menjadi satu sheet Excel.
export async function exportSheet(jenis, sheetName, rows) {
  if (!rows.length) {
    showToast('Tidak ada data untuk diexport', true);
    return;
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  fillWorksheet(ws, rows);
  await downloadWorkbook(wb, buildFilename(jenis));
}

// Export beberapa daftar data sekaligus menjadi satu file Excel
// dengan satu sheet per daftar. sheets: [{ name, rows }]
export async function exportWorkbook(jenis, sheets) {
  const wb = new ExcelJS.Workbook();
  sheets.forEach(({ name, rows }) => {
    const ws = wb.addWorksheet(name);
    fillWorksheet(ws, rows.length ? rows : [{ Keterangan: 'Tidak ada data' }]);
  });
  await downloadWorkbook(wb, buildFilename(jenis));
}
