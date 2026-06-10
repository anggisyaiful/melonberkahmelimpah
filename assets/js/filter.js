// Filter rentang tanggal bersama, dipakai oleh semua tab di dashboard
// (Log Harian, Biaya Operasional, Panen, Rekap) serta fitur export.

let filterFrom = '';
let filterTo = '';
const listeners = [];

export function getFilter() {
  return { from: filterFrom, to: filterTo };
}

export function setFilter(from, to) {
  filterFrom = from || '';
  filterTo = to || '';
  listeners.forEach((fn) => fn());
}

export function onFilterChange(fn) {
  listeners.push(fn);
}

// Menambahkan kondisi rentang tanggal pada query Supabase berdasarkan
// nama kolom tanggal (mis. 'tanggal' atau 'tanggal_panen').
export function applyDateFilter(query, column) {
  const { from, to } = getFilter();
  if (from) query = query.gte(column, from);
  if (to) query = query.lte(column, to);
  return query;
}

export function describeFilter() {
  const { from, to } = getFilter();
  if (!from && !to) return 'Semua tanggal';
  if (from && to) return `${from} s/d ${to}`;
  if (from) return `Mulai ${from}`;
  return `Sampai ${to}`;
}

const fromInput = document.getElementById('filter-dari');
const toInput = document.getElementById('filter-sampai');
const applyBtn = document.getElementById('filter-apply');
const resetBtn = document.getElementById('filter-reset');

applyBtn?.addEventListener('click', () => {
  setFilter(fromInput.value, toInput.value);
});

resetBtn?.addEventListener('click', () => {
  if (fromInput) fromInput.value = '';
  if (toInput) toInput.value = '';
  setFilter('', '');
});
