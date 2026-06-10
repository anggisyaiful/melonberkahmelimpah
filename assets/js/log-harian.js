import { supabase, formatRupiah, formatTanggal, escapeHtml, showToast, todayISO, getGreenhouseId } from './supabase.js';
import { refreshRekap } from './rekapitulasi.js';
import { onFilterChange, applyDateFilter } from './filter.js';
import { exportSheet } from './export.js';

const greenhouseId = getGreenhouseId();

const form = document.getElementById('form-log-harian');
const list = document.getElementById('log-harian-list');
const totalEl = document.getElementById('log-harian-total');
const submitBtn = document.getElementById('log-submit-btn');
const cancelBtn = document.getElementById('log-cancel-btn');
const exportBtn = document.getElementById('log-harian-export');

let rows = [];
let editingId = null;

form.tanggal.value = todayISO();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    greenhouse_id: greenhouseId,
    tanggal: form.tanggal.value,
    uraian_kegiatan: form.uraian_kegiatan.value.trim(),
    nominal_biaya: Number(form.nominal_biaya.value) || 0,
    keterangan: form.keterangan.value.trim() || null,
  };

  let error;
  if (editingId) {
    ({ error } = await supabase.from('log_harian').update(payload).eq('id', editingId));
  } else {
    ({ error } = await supabase.from('log_harian').insert(payload));
  }

  if (error) {
    showToast('Gagal menyimpan: ' + error.message, true);
    return;
  }

  showToast(editingId ? 'Log berhasil diperbarui' : 'Log berhasil ditambahkan');
  resetForm();
  await load();
  refreshRekap();
});

cancelBtn.addEventListener('click', resetForm);

function resetForm() {
  form.reset();
  form.tanggal.value = todayISO();
  editingId = null;
  submitBtn.textContent = 'Simpan';
  cancelBtn.classList.add('hidden');
}

window.editLogHarian = (id) => {
  const row = rows.find((r) => r.id === id);
  if (!row) return;
  form.tanggal.value = row.tanggal;
  form.uraian_kegiatan.value = row.uraian_kegiatan;
  form.nominal_biaya.value = row.nominal_biaya;
  form.keterangan.value = row.keterangan || '';
  editingId = id;
  submitBtn.textContent = 'Update';
  cancelBtn.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deleteLogHarian = async (id) => {
  if (!confirm('Hapus catatan ini?')) return;
  const { error } = await supabase.from('log_harian').delete().eq('id', id);
  if (error) {
    showToast('Gagal menghapus: ' + error.message, true);
    return;
  }
  showToast('Catatan dihapus');
  await load();
  refreshRekap();
};

export async function load() {
  if (!greenhouseId) return;
  list.innerHTML = '<p class="text-center text-slate-400 py-6">Memuat...</p>';

  let query = supabase.from('log_harian').select('*').eq('greenhouse_id', greenhouseId);
  query = applyDateFilter(query, 'tanggal');
  const { data, error } = await query
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = `<p class="text-center text-rose-500 py-6">Gagal memuat data: ${escapeHtml(error.message)}</p>`;
    return;
  }

  rows = data;
  render();
}

function render() {
  if (!rows.length) {
    list.innerHTML = '<p class="text-center text-slate-400 py-6">Belum ada catatan</p>';
    totalEl.textContent = formatRupiah(0);
    return;
  }

  const total = rows.reduce((sum, r) => sum + Number(r.nominal_biaya || 0), 0);
  totalEl.textContent = formatRupiah(total);

  list.innerHTML = rows
    .map(
      (r) => `
    <div class="bg-white rounded-lg shadow-sm border border-slate-100 p-3 flex justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-xs text-slate-400">${formatTanggal(r.tanggal)}</p>
        <p class="font-medium text-slate-700 break-words">${escapeHtml(r.uraian_kegiatan)}</p>
        ${r.keterangan ? `<p class="text-sm text-slate-500 break-words mt-0.5">${escapeHtml(r.keterangan)}</p>` : ''}
        <p class="text-rose-600 font-semibold mt-1">${formatRupiah(r.nominal_biaya)}</p>
      </div>
      <div class="flex flex-col gap-1.5 shrink-0">
        <button onclick="editLogHarian('${r.id}')" class="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md font-medium hover:bg-amber-100">Edit</button>
        <button onclick="deleteLogHarian('${r.id}')" class="text-xs px-2.5 py-1 bg-rose-50 text-rose-600 rounded-md font-medium hover:bg-rose-100">Hapus</button>
      </div>
    </div>
  `
    )
    .join('');
}

exportBtn?.addEventListener('click', () => {
  const exportRows = rows.map((r) => ({
    Tanggal: formatTanggal(r.tanggal),
    'Uraian Kegiatan': r.uraian_kegiatan,
    'Nominal Biaya (Rp)': Number(r.nominal_biaya || 0),
    Keterangan: r.keterangan || '',
  }));
  exportSheet('LogHarian', 'Log Harian', exportRows);
});

onFilterChange(load);
load();
