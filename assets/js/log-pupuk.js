import { supabase, formatRupiah, formatTanggal, escapeHtml, showToast, todayISO, getGreenhouseId } from './supabase.js';
import { refreshRekap } from './rekapitulasi.js';
import { onFilterChange, applyDateFilter } from './filter.js';
import { exportSheet } from './export.js';
import { skeletonRows, emptyState } from './ui.js';
import { loadJenisKegiatan, addJenisKegiatan, removeJenisKegiatan, DEFAULT_KODE } from './jenis-kegiatan.js';
import { createManageableSelect } from './manageable-select.js';

let jenisKegiatanLabelMap = {};

const greenhouseId = getGreenhouseId();

const form = document.getElementById('form-log-pupuk');
const dosisGrid = document.getElementById('log-pupuk-dosis-grid');
const estimasiEl = document.getElementById('log-pupuk-estimasi');
const list = document.getElementById('log-pupuk-list');
const totalEl = document.getElementById('log-pupuk-total');
const submitBtn = document.getElementById('log-pupuk-submit-btn');
const cancelBtn = document.getElementById('log-pupuk-cancel-btn');
const exportBtn = document.getElementById('log-pupuk-export');

let masterPupukList = [];
let rows = [];
let editingId = null;

form.tanggal.value = todayISO();

async function loadAndCacheJenisKegiatan() {
  const jenisList = await loadJenisKegiatan();
  jenisKegiatanLabelMap = Object.fromEntries(jenisList.map((j) => [j.kode, j.nama]));
  return jenisList;
}

const jenisKegiatanSelect = createManageableSelect({
  mount: document.getElementById('jenis-kegiatan-select'),
  name: 'jenis_kegiatan',
  placeholder: 'Memuat...',
  promptLabel: 'Nama jenis kegiatan baru:',
  load: loadAndCacheJenisKegiatan,
  isDefault: (kode) => DEFAULT_KODE.includes(kode),
  onAdd: addJenisKegiatan,
  onRemove: removeJenisKegiatan,
});

function hargaPerSatuan(p) {
  return (Number(p.konversi_ke_satuan_dasar) || 0) * (Number(p.harga_per_satuan_dasar) || 0);
}

async function loadMasterPupuk() {
  const { data, error } = await supabase
    .from('master_pupuk')
    .select('*')
    .eq('aktif', true)
    .order('urutan', { ascending: true });

  if (error) {
    dosisGrid.innerHTML = emptyState('Gagal memuat master pupuk: ' + escapeHtml(error.message), 'search');
    return;
  }

  masterPupukList = data || [];
  renderDosisGrid();
}

function renderDosisGrid() {
  if (!masterPupukList.length) {
    dosisGrid.innerHTML = emptyState('Belum ada data master pupuk. Tambahkan lewat menu Master Pupuk.', 'box');
    return;
  }

  dosisGrid.innerHTML = masterPupukList
    .map(
      (p) => `
    <div>
      <label class="label text-xs">${escapeHtml(p.nama)} (${p.satuan})</label>
      <input type="number" min="0" step="0.01" placeholder="0" data-pupuk-id="${p.id}" class="dosis-input input-field text-sm !py-1.5">
    </div>
  `
    )
    .join('');
}

function updateEstimasi() {
  let total = 0;
  dosisGrid.querySelectorAll('.dosis-input').forEach((input) => {
    const dosis = Number(input.value) || 0;
    if (dosis <= 0) return;
    const p = masterPupukList.find((m) => m.id === input.dataset.pupukId);
    if (!p) return;
    total += dosis * hargaPerSatuan(p);
  });
  estimasiEl.textContent = formatRupiah(total);
}

dosisGrid.addEventListener('input', updateEstimasi);

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const headerPayload = {
    greenhouse_id: greenhouseId,
    tanggal: form.tanggal.value,
    hst: Number(form.hst.value) || 0,
    jenis_kegiatan: form.jenis_kegiatan.value,
    keterangan: form.keterangan.value.trim() || null,
  };

  const details = [];
  dosisGrid.querySelectorAll('.dosis-input').forEach((input) => {
    const dosis = Number(input.value) || 0;
    if (dosis <= 0) return;
    const p = masterPupukList.find((m) => m.id === input.dataset.pupukId);
    if (!p) return;
    const harga = hargaPerSatuan(p);
    details.push({
      master_pupuk_id: p.id,
      nama_pupuk: p.nama,
      satuan: p.satuan,
      dosis,
      harga_per_satuan: harga,
      biaya: dosis * harga,
    });
  });

  let logPupukId = editingId;
  let error;

  if (editingId) {
    ({ error } = await supabase.from('log_pupuk').update(headerPayload).eq('id', editingId));
    if (!error) {
      ({ error } = await supabase.from('log_pupuk_detail').delete().eq('log_pupuk_id', editingId));
    }
  } else {
    const { data, error: insertError } = await supabase.from('log_pupuk').insert(headerPayload).select('id').single();
    error = insertError;
    if (!error) logPupukId = data.id;
  }

  if (error) {
    showToast('Gagal menyimpan: ' + error.message, true);
    return;
  }

  if (details.length) {
    const detailRows = details.map((d) => ({ ...d, log_pupuk_id: logPupukId }));
    const { error: detailError } = await supabase.from('log_pupuk_detail').insert(detailRows);
    if (detailError) {
      showToast('Gagal menyimpan detail: ' + detailError.message, true);
      return;
    }
  }

  showToast(editingId ? 'Log pupuk berhasil diperbarui' : 'Log pupuk berhasil ditambahkan');
  resetForm();
  await load();
  refreshRekap();
});

cancelBtn.addEventListener('click', resetForm);

function resetForm() {
  form.reset();
  form.tanggal.value = todayISO();
  jenisKegiatanSelect.refresh();
  dosisGrid.querySelectorAll('.dosis-input').forEach((input) => (input.value = ''));
  updateEstimasi();
  editingId = null;
  submitBtn.textContent = 'Simpan';
  cancelBtn.classList.add('hidden');
}

window.editLogPupuk = (id) => {
  const row = rows.find((r) => r.id === id);
  if (!row) return;

  form.tanggal.value = row.tanggal;
  form.hst.value = row.hst;
  jenisKegiatanSelect.setValue(row.jenis_kegiatan);
  form.keterangan.value = row.keterangan || '';

  dosisGrid.querySelectorAll('.dosis-input').forEach((input) => {
    const detail = row.details.find((d) => d.master_pupuk_id === input.dataset.pupukId);
    input.value = detail ? detail.dosis : '';
  });
  updateEstimasi();

  editingId = id;
  submitBtn.textContent = 'Update';
  cancelBtn.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deleteLogPupuk = async (id) => {
  if (!confirm('Hapus log pupuk ini?')) return;
  const { error } = await supabase.from('log_pupuk').delete().eq('id', id);
  if (error) {
    showToast('Gagal menghapus: ' + error.message, true);
    return;
  }
  showToast('Log pupuk dihapus');
  await load();
  refreshRekap();
};

export async function load() {
  if (!greenhouseId) return;
  list.innerHTML = skeletonRows(3);

  let query = supabase.from('log_pupuk').select('*').eq('greenhouse_id', greenhouseId);
  query = applyDateFilter(query, 'tanggal');
  const { data, error } = await query
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = emptyState('Gagal memuat data: ' + escapeHtml(error.message), 'search');
    return;
  }

  const headers = data || [];
  const ids = headers.map((h) => h.id);

  let detailRows = [];
  if (ids.length) {
    const { data: details, error: detailError } = await supabase.from('log_pupuk_detail').select('*').in('log_pupuk_id', ids);
    if (detailError) {
      list.innerHTML = emptyState('Gagal memuat detail: ' + escapeHtml(detailError.message), 'search');
      return;
    }
    detailRows = details || [];
  }

  rows = headers.map((h) => ({
    ...h,
    details: detailRows.filter((d) => d.log_pupuk_id === h.id),
  }));

  render();
}

function render() {
  if (!rows.length) {
    list.innerHTML = emptyState('Belum ada catatan log pupuk', 'box');
    totalEl.textContent = formatRupiah(0);
    return;
  }

  const total = rows.reduce((sum, r) => sum + r.details.reduce((s, d) => s + Number(d.biaya || 0), 0), 0);
  totalEl.textContent = formatRupiah(total);

  list.innerHTML = rows
    .map((r, i) => {
      const biaya = r.details.reduce((s, d) => s + Number(d.biaya || 0), 0);
      const pupukList = r.details.map((d) => `${escapeHtml(d.nama_pupuk)}: ${d.dosis} ${d.satuan}`).join(', ');

      return `
    <div class="card p-3 flex justify-between gap-3 fade-in fade-in-${Math.min(i + 1, 5)}">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-1.5">
          <p class="text-xs text-muted">${formatTanggal(r.tanggal)}</p>
          <span class="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">HST ${r.hst}</span>
          <span class="text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 px-2 py-0.5 rounded-full">${
            jenisKegiatanLabelMap[r.jenis_kegiatan] || r.jenis_kegiatan
          }</span>
        </div>
        ${
          pupukList
            ? `<p class="text-sm text-muted break-words mt-1">${pupukList}</p>`
            : '<p class="text-sm text-muted mt-1">Tidak ada dosis pupuk</p>'
        }
        ${r.keterangan ? `<p class="text-sm text-muted break-words mt-1">${escapeHtml(r.keterangan)}</p>` : ''}
        <p class="text-rose-600 dark:text-rose-400 font-semibold mt-1">${formatRupiah(biaya)}</p>
      </div>
      <div class="flex flex-col gap-1.5 shrink-0">
        <button onclick="editLogPupuk('${r.id}')" class="text-xs px-2.5 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-md font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50">Edit</button>
        <button onclick="deleteLogPupuk('${r.id}')" class="text-xs px-2.5 py-1 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-md font-medium hover:bg-rose-100 dark:hover:bg-rose-900/50">Hapus</button>
      </div>
    </div>
  `;
    })
    .join('');
}

exportBtn?.addEventListener('click', () => {
  if (!rows.length) {
    showToast('Tidak ada data untuk diexport', true);
    return;
  }

  const pupukNames = masterPupukList.map((p) => `${p.nama} (${p.satuan})`);
  const dosisTotals = {};
  const biayaTotals = {};
  pupukNames.forEach((name) => {
    dosisTotals[name] = 0;
    biayaTotals[name] = 0;
  });

  let grandTotal = 0;

  const exportRows = rows.map((r) => {
    const row = {
      Tanggal: formatTanggal(r.tanggal),
      HST: r.hst,
      Kegiatan: jenisKegiatanLabelMap[r.jenis_kegiatan] || r.jenis_kegiatan,
    };

    masterPupukList.forEach((p) => {
      const colName = `${p.nama} (${p.satuan})`;
      const detail = r.details.find((d) => d.master_pupuk_id === p.id);
      const dosis = detail ? Number(detail.dosis) : 0;
      const biaya = detail ? Number(detail.biaya) : 0;
      row[colName] = dosis || '';
      dosisTotals[colName] += dosis;
      biayaTotals[colName] += biaya;
    });

    const rowBiaya = r.details.reduce((s, d) => s + Number(d.biaya || 0), 0);
    row['Total Biaya (Rp)'] = rowBiaya;
    grandTotal += rowBiaya;
    return row;
  });

  const totalDosisRow = { Tanggal: 'Total Dosis', HST: '', Kegiatan: '' };
  pupukNames.forEach((name) => {
    totalDosisRow[name] = dosisTotals[name] || '';
  });
  totalDosisRow['Total Biaya (Rp)'] = '';

  const totalBiayaRow = { Tanggal: 'Total Biaya', HST: '', Kegiatan: '' };
  pupukNames.forEach((name) => {
    totalBiayaRow[name] = biayaTotals[name] || '';
  });
  totalBiayaRow['Total Biaya (Rp)'] = grandTotal;

  exportRows.push(totalDosisRow, totalBiayaRow);

  exportSheet('LogPupuk', 'Log Pupuk', exportRows);
});

onFilterChange(load);

(async function init() {
  await loadMasterPupuk();
  await jenisKegiatanSelect.refresh();
  await load();
})();
