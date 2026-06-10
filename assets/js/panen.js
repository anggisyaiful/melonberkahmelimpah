import { supabase, formatKg, formatTanggal, escapeHtml, showToast, todayISO, getGreenhouseId, initGreenhouseContext } from './supabase.js';
import { onFilterChange, applyDateFilter } from './filter.js';
import { exportSheet } from './export.js';

initGreenhouseContext();

const greenhouseId = getGreenhouseId();

const form = document.getElementById('form-panen');
const list = document.getElementById('panen-list');
const totalEl = document.getElementById('panen-total');
const submitBtn = document.getElementById('panen-submit-btn');
const cancelBtn = document.getElementById('panen-cancel-btn');
const exportBtn = document.getElementById('panen-export');

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
};

export async function load() {
  if (!greenhouseId) return;
  list.innerHTML = '<p class="text-center text-slate-400 py-6">Memuat...</p>';

  let query = supabase.from('panen').select('*').eq('greenhouse_id', greenhouseId);
  query = applyDateFilter(query, 'tanggal_panen');
  const { data, error } = await query
    .order('tanggal_panen', { ascending: false })
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
    list.innerHTML = '<p class="text-center text-slate-400 py-6">Belum ada catatan panen</p>';
    totalEl.textContent = formatKg(0);
    return;
  }

  const total = rows.reduce((sum, r) => sum + Number(r.jumlah_kg || 0), 0);
  totalEl.textContent = formatKg(total);

  list.innerHTML = rows
    .map(
      (r) => `
    <div class="bg-white rounded-lg shadow-sm border border-slate-100 p-3 flex justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-xs text-slate-400">${formatTanggal(r.tanggal_panen)}</p>
        ${r.keterangan ? `<p class="text-sm text-slate-500 break-words mt-0.5">${escapeHtml(r.keterangan)}</p>` : ''}
        <p class="text-emerald-600 font-semibold mt-1">${formatKg(r.jumlah_kg)}</p>
      </div>
      <div class="flex flex-col gap-1.5 shrink-0">
        <button onclick="editPanen('${r.id}')" class="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md font-medium hover:bg-amber-100">Edit</button>
        <button onclick="deletePanen('${r.id}')" class="text-xs px-2.5 py-1 bg-rose-50 text-rose-600 rounded-md font-medium hover:bg-rose-100">Hapus</button>
      </div>
    </div>
  `
    )
    .join('');
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
