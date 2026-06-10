import { supabase, formatKg, formatTanggal, escapeHtml, showToast, todayISO, getGreenhouseId, initGreenhouseContext } from './supabase.js';
import { onFilterChange, applyDateFilter } from './filter.js';
import { exportSheet } from './export.js';
import { skeletonRows, emptyState, getMonthRanges, renderMonthCompareCard } from './ui.js';

initGreenhouseContext();

const greenhouseId = getGreenhouseId();

const form = document.getElementById('form-panen');
const list = document.getElementById('panen-list');
const totalEl = document.getElementById('panen-total');
const submitBtn = document.getElementById('panen-submit-btn');
const cancelBtn = document.getElementById('panen-cancel-btn');
const exportBtn = document.getElementById('panen-export');
const monthSummaryEl = document.getElementById('month-summary');

let rows = [];
let editingId = null;

form.tanggal_panen.value = todayISO();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    greenhouse_id: greenhouseId,
    tanggal_panen: form.tanggal_panen.value,
    jumlah_kg: Number(form.jumlah_kg.value) || 0,
    keterangan: form.keterangan.value.trim() || null,
  };

  let error;
  if (editingId) {
    ({ error } = await supabase.from('panen').update(payload).eq('id', editingId));
  } else {
    ({ error } = await supabase.from('panen').insert(payload));
  }

  if (error) {
    showToast('Gagal menyimpan: ' + error.message, true);
    return;
  }

  showToast(editingId ? 'Data panen berhasil diperbarui' : 'Data panen berhasil ditambahkan');
  resetForm();
  await load();
  loadMonthSummary();
});

cancelBtn.addEventListener('click', resetForm);

function resetForm() {
  form.reset();
  form.tanggal_panen.value = todayISO();
  editingId = null;
  submitBtn.textContent = 'Simpan';
  cancelBtn.classList.add('hidden');
}

window.editPanen = (id) => {
  const row = rows.find((r) => r.id === id);
  if (!row) return;
  form.tanggal_panen.value = row.tanggal_panen;
  form.jumlah_kg.value = row.jumlah_kg;
  form.keterangan.value = row.keterangan || '';
  editingId = id;
  submitBtn.textContent = 'Update';
  cancelBtn.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deletePanen = async (id) => {
  if (!confirm('Hapus data panen ini?')) return;
  const { error } = await supabase.from('panen').delete().eq('id', id);
  if (error) {
    showToast('Gagal menghapus: ' + error.message, true);
    return;
  }
  showToast('Data dihapus');
  await load();
  loadMonthSummary();
};

export async function load() {
  if (!greenhouseId) return;
  list.innerHTML = skeletonRows(3);

  let query = supabase.from('panen').select('*').eq('greenhouse_id', greenhouseId);
  query = applyDateFilter(query, 'tanggal_panen');
  const { data, error } = await query
    .order('tanggal_panen', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = emptyState('Gagal memuat data: ' + escapeHtml(error.message), 'search');
    return;
  }

  rows = data;
  render();
}

function render() {
  if (!rows.length) {
    list.innerHTML = emptyState('Belum ada catatan panen', 'leaf');
    totalEl.textContent = formatKg(0);
    return;
  }

  const total = rows.reduce((sum, r) => sum + Number(r.jumlah_kg || 0), 0);
  totalEl.textContent = formatKg(total);

  list.innerHTML = rows
    .map(
      (r, i) => `
    <div class="card p-3 flex justify-between gap-3 fade-in fade-in-${Math.min(i + 1, 5)}">
      <div class="min-w-0 flex-1">
        <p class="text-xs text-muted">${formatTanggal(r.tanggal_panen)}</p>
        ${r.keterangan ? `<p class="text-sm text-muted break-words mt-0.5">${escapeHtml(r.keterangan)}</p>` : ''}
        <p class="text-emerald-600 dark:text-emerald-400 font-semibold mt-1">${formatKg(r.jumlah_kg)}</p>
      </div>
      <div class="flex flex-col gap-1.5 shrink-0">
        <button onclick="editPanen('${r.id}')" class="text-xs px-2.5 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-md font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50">Edit</button>
        <button onclick="deletePanen('${r.id}')" class="text-xs px-2.5 py-1 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-md font-medium hover:bg-rose-100 dark:hover:bg-rose-900/50">Hapus</button>
      </div>
    </div>
  `
    )
    .join('');
}

// ---------------------------------------------------------------
// Perbandingan hasil panen bulan ini vs bulan lalu
// ---------------------------------------------------------------
async function loadMonthSummary() {
  if (!greenhouseId) return;
  const { thisStart, nextStart, lastStart } = getMonthRanges();

  const [thisRes, lastRes] = await Promise.all([
    supabase.from('panen').select('jumlah_kg').eq('greenhouse_id', greenhouseId).gte('tanggal_panen', thisStart).lt('tanggal_panen', nextStart),
    supabase.from('panen').select('jumlah_kg').eq('greenhouse_id', greenhouseId).gte('tanggal_panen', lastStart).lt('tanggal_panen', thisStart),
  ]);

  const thisTotal = (thisRes.data || []).reduce((sum, r) => sum + Number(r.jumlah_kg || 0), 0);
  const lastTotal = (lastRes.data || []).reduce((sum, r) => sum + Number(r.jumlah_kg || 0), 0);

  monthSummaryEl.innerHTML = renderMonthCompareCard({
    thisTotal,
    lastTotal,
    formatFn: formatKg,
    higherIsBetter: true,
    title: 'Hasil Panen: Bulan Ini vs Bulan Lalu',
  });
}

exportBtn?.addEventListener('click', () => {
  const exportRows = rows.map((r) => ({
    'Tanggal Panen': formatTanggal(r.tanggal_panen),
    'Jumlah (kg)': Number(r.jumlah_kg || 0),
    Keterangan: r.keterangan || '',
  }));
  exportSheet('Panen', 'Panen', exportRows);
});

onFilterChange(load);
load();
loadMonthSummary();
