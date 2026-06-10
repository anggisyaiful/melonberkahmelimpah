import { supabase, formatRupiah, formatTanggal, escapeHtml, showToast, todayISO, getGreenhouseId, initGreenhouseContext } from './supabase.js';
import { onFilterChange, applyDateFilter } from './filter.js';
import { exportSheet } from './export.js';

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
};

export async function load() {
  if (!greenhouseId) return;
  list.innerHTML = '<p class="text-center text-slate-400 py-6">Memuat...</p>';

  let query = supabase.from('biaya_operasional').select('*').eq('greenhouse_id', greenhouseId);
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

  const total = rows.reduce((sum, r) => sum + Number(r.nominal || 0), 0);
  totalEl.textContent = formatRupiah(total);

  list.innerHTML = rows
    .map(
      (r) => `
    <div class="bg-white rounded-lg shadow-sm border border-slate-100 p-3 flex justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-xs text-slate-400">${formatTanggal(r.tanggal)}</p>
        <span class="inline-block text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full mt-1">${
          JENIS_LABEL[r.jenis_biaya] || r.jenis_biaya
        }</span>
        ${r.keterangan ? `<p class="text-sm text-slate-500 break-words mt-1">${escapeHtml(r.keterangan)}</p>` : ''}
        <p class="text-rose-600 font-semibold mt-1">${formatRupiah(r.nominal)}</p>
      </div>
      <div class="flex flex-col gap-1.5 shrink-0">
        <button onclick="editBiayaOperasional('${r.id}')" class="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md font-medium hover:bg-amber-100">Edit</button>
        <button onclick="deleteBiayaOperasional('${r.id}')" class="text-xs px-2.5 py-1 bg-rose-50 text-rose-600 rounded-md font-medium hover:bg-rose-100">Hapus</button>
      </div>
    </div>
  `
    )
    .join('');
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
