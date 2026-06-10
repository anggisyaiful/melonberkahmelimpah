import { supabase, formatRupiah, formatTanggal, escapeHtml, showToast, todayISO, getGreenhouseId, initGreenhouseContext } from './supabase.js';
import { onFilterChange, applyDateFilter } from './filter.js';
import { exportSheet } from './export.js';
import { skeletonRows, emptyState, getMonthRanges, renderMonthCompareCard } from './ui.js';

const JENIS_LABEL = {
  listrik: 'Listrik',
  air: 'Air',
  tenaga_kerja: 'Tenaga Kerja',
  lainnya: 'Lainnya',
};

initGreenhouseContext();

const greenhouseId = getGreenhouseId();

const form = document.getElementById('form-biaya-operasional');
const list = document.getElementById('biaya-operasional-list');
const totalEl = document.getElementById('biaya-operasional-total');
const submitBtn = document.getElementById('biaya-submit-btn');
const cancelBtn = document.getElementById('biaya-cancel-btn');
const exportBtn = document.getElementById('biaya-operasional-export');
const monthSummaryEl = document.getElementById('month-summary');

let rows = [];
let editingId = null;

form.tanggal.value = todayISO();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    greenhouse_id: greenhouseId,
    tanggal: form.tanggal.value,
    jenis_biaya: form.jenis_biaya.value,
    nominal: Number(form.nominal.value) || 0,
    keterangan: form.keterangan.value.trim() || null,
  };

  let error;
  if (editingId) {
    ({ error } = await supabase.from('biaya_operasional').update(payload).eq('id', editingId));
  } else {
    ({ error } = await supabase.from('biaya_operasional').insert(payload));
  }

  if (error) {
    showToast('Gagal menyimpan: ' + error.message, true);
    return;
  }

  showToast(editingId ? 'Biaya berhasil diperbarui' : 'Biaya berhasil ditambahkan');
  resetForm();
  await load();
  loadMonthSummary();
});

cancelBtn.addEventListener('click', resetForm);

function resetForm() {
  form.reset();
  form.tanggal.value = todayISO();
  editingId = null;
  submitBtn.textContent = 'Simpan';
  cancelBtn.classList.add('hidden');
}

window.editBiayaOperasional = (id) => {
  const row = rows.find((r) => r.id === id);
  if (!row) return;
  form.tanggal.value = row.tanggal;
  form.jenis_biaya.value = row.jenis_biaya;
  form.nominal.value = row.nominal;
  form.keterangan.value = row.keterangan || '';
  editingId = id;
  submitBtn.textContent = 'Update';
  cancelBtn.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deleteBiayaOperasional = async (id) => {
  if (!confirm('Hapus data biaya ini?')) return;
  const { error } = await supabase.from('biaya_operasional').delete().eq('id', id);
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

  let query = supabase.from('biaya_operasional').select('*').eq('greenhouse_id', greenhouseId);
  query = applyDateFilter(query, 'tanggal');
  const { data, error } = await query
    .order('tanggal', { ascending: false })
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
    list.innerHTML = emptyState('Belum ada catatan biaya operasional', 'box');
    totalEl.textContent = formatRupiah(0);
    return;
  }

  const total = rows.reduce((sum, r) => sum + Number(r.nominal || 0), 0);
  totalEl.textContent = formatRupiah(total);

  list.innerHTML = rows
    .map(
      (r, i) => `
    <div class="card p-3 flex justify-between gap-3 fade-in fade-in-${Math.min(i + 1, 5)}">
      <div class="min-w-0 flex-1">
        <p class="text-xs text-muted">${formatTanggal(r.tanggal)}</p>
        <span class="inline-block text-xs bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 px-2 py-0.5 rounded-full mt-1">${
          JENIS_LABEL[r.jenis_biaya] || r.jenis_biaya
        }</span>
        ${r.keterangan ? `<p class="text-sm text-muted break-words mt-1">${escapeHtml(r.keterangan)}</p>` : ''}
        <p class="text-rose-600 dark:text-rose-400 font-semibold mt-1">${formatRupiah(r.nominal)}</p>
      </div>
      <div class="flex flex-col gap-1.5 shrink-0">
        <button onclick="editBiayaOperasional('${r.id}')" class="text-xs px-2.5 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-md font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50">Edit</button>
        <button onclick="deleteBiayaOperasional('${r.id}')" class="text-xs px-2.5 py-1 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-md font-medium hover:bg-rose-100 dark:hover:bg-rose-900/50">Hapus</button>
      </div>
    </div>
  `
    )
    .join('');
}

// ---------------------------------------------------------------
// Perbandingan biaya bulan ini vs bulan lalu
// ---------------------------------------------------------------
async function loadMonthSummary() {
  if (!greenhouseId) return;
  const { thisStart, nextStart, lastStart } = getMonthRanges();

  const [thisRes, lastRes] = await Promise.all([
    supabase.from('biaya_operasional').select('nominal').eq('greenhouse_id', greenhouseId).gte('tanggal', thisStart).lt('tanggal', nextStart),
    supabase.from('biaya_operasional').select('nominal').eq('greenhouse_id', greenhouseId).gte('tanggal', lastStart).lt('tanggal', thisStart),
  ]);

  const thisTotal = (thisRes.data || []).reduce((sum, r) => sum + Number(r.nominal || 0), 0);
  const lastTotal = (lastRes.data || []).reduce((sum, r) => sum + Number(r.nominal || 0), 0);

  monthSummaryEl.innerHTML = renderMonthCompareCard({
    thisTotal,
    lastTotal,
    formatFn: formatRupiah,
    higherIsBetter: false,
    title: 'Biaya Operasional: Bulan Ini vs Bulan Lalu',
  });
}

exportBtn?.addEventListener('click', () => {
  const exportRows = rows.map((r) => ({
    Tanggal: formatTanggal(r.tanggal),
    'Jenis Biaya': JENIS_LABEL[r.jenis_biaya] || r.jenis_biaya,
    'Nominal (Rp)': Number(r.nominal || 0),
    Keterangan: r.keterangan || '',
  }));
  exportSheet('BiayaOperasional', 'Biaya Operasional', exportRows);
});

onFilterChange(load);
load();
loadMonthSummary();
