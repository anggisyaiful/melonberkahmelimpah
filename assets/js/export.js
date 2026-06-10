import { getGreenhouseName, todayISO, showToast } from './supabase.js';

function sanitizeFilename(str) {
  const cleaned = String(str || 'Greenhouse')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'Greenhouse';
}

function buildFilename(jenis) {
  return `${jenis}_${sanitizeFilename(getGreenhouseName())}_${todayISO()}.xlsx`;
}

// Export satu daftar data menjadi satu sheet Excel.
export function exportSheet(jenis, sheetName, rows) {
  if (!rows.length) {
    showToast('Tidak ada data untuk diexport', true);
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, buildFilename(jenis));
}

// Export beberapa daftar data sekaligus menjadi satu file Excel
// dengan satu sheet per daftar. sheets: [{ name, rows }]
export function exportWorkbook(jenis, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Keterangan: 'Tidak ada data' }]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  XLSX.writeFile(wb, buildFilename(jenis));
}
