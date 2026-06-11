import { supabase, formatRupiah, formatTanggal, escapeHtml, showToast, todayISO, getGreenhouseId } from './supabase.js';
import { refreshRekap } from './rekapitulasi.js';
import { onFilterChange, applyDateFilter } from './filter.js';
import { exportSheet } from './export.js';
import { skeletonRows, emptyState } from './ui.js';
import { loadJenisKegiatan, addJenisKegiatan, removeJenisKegiatan } from './jenis-kegiatan.js';
import { createManageableSelect } from './manageable-select.js';

// Jenis kegiatan yang secara default memakai dosis pupuk (toggle ON).
// User tetap bisa mengubah toggle ini sesuka hati per entry.
const DEFAULT_DOSIS_KODE = new Set(['pemupukan', 'spray', 'injek', 'spray_injek']);

let jenisKegiatanLabelMap = {};
let masterPupukList = [];

const greenhouseId = getGreenhouseId();

const form = document.getElementById('form-log-harian');
const toggleDosis = document.getElementById('toggle-dosis-pupuk');
const dosisSection = document.getElementById('dosis-pupuk-section');
const nominalSection = document.getElementById('nominal-biaya-section');
const dosisRowsEl = document.getElementById('dosis-pupuk-rows');
const addPupukSelect = document.getElementById('add-pupuk-select');
const estimasiEl = document.getElementById('log-pupuk-estimasi');
const list = document.getElementById('log-harian-list');
const totalEl = document.getElementById('log-harian-total');
const submitBtn = document.getElementById('log-submit-btn');
const cancelBtn = document.getElementById('log-cancel-btn');
const exportBtn = document.getElementById('log-harian-export');

let rows = [];
let editingId = null;

form.tanggal.value = todayISO();

function defaultPakaiDosis(kode) {
  return DEFAULT_DOSIS_KODE.has(kode);
}

function kegiatanLabel(row) {
  if (row.jenis_kegiatan) return jenisKegiatanLabelMap[row.jenis_kegiatan] || row.jenis_kegiatan;
  return row.uraian_kegiatan || '-';
}

function updateSectionVisibility(pakaiDosis) {
  dosisSection.classList.toggle('hidden', !pakaiDosis);
  nominalSection.classList.toggle('hidden', pakaiDosis);
  if (pakaiDosis) updateEstimasi();
}

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
  onAdd: addJenisKegiatan,
  onRemove: removeJenisKegiatan,
  onChange: (kode) => {
    toggleDosis.checked = defaultPakaiDosis(kode);
    clearDosisRows();
    updateSectionVisibility(toggleDosis.checked);
  },
});

toggleDosis.addEventListener('change', () => {
  updateSectionVisibility(toggleDosis.checked);
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
    showToast('Gagal memuat master pupuk: ' + error.message, true);
    masterPupukList = [];
  } else {
    masterPupukList = data || [];
  }
  renderAddPupukOptions();
}

function renderAddPupukOptions() {
  const usedIds = new Set([...dosisRowsEl.querySelectorAll('.dosis-row')].map((r) => r.dataset.pupukId));
  const available = masterPupukList.filter((p) => !usedIds.has(p.id));

  addPupukSelect.innerHTML =
    `<option value="">+ Tambah Pupuk...</option>` +
    available.map((p) => `<option value="${p.id}">${escapeHtml(p.nama)} (${escapeHtml(p.satuan)})</option>`).join('');
  addPupukSelect.disabled = !available.length;
}

function addDosisRow(pupukId, dosisValue = '') {
  const p = masterPupukList.find((m) => m.id === pupukId);
  if (!p) return;

  const row = document.createElement('div');
  row.className = 'flex items-center gap-2 dosis-row';
  row.dataset.pupukId = pupukId;
  row.innerHTML = `
    <span class="flex-1 text-sm text-heading truncate">${escapeHtml(p.nama)}</span>
    <input type="number" min="0" step="0.01" placeholder="0" value="${dosisValue}" class="dosis-input input-field w-20 text-sm !py-1.5">
    <span class="text-xs text-muted w-10 shrink-0">${escapeHtml(p.satuan)}</span>
    <button type="button" class="dosis-remove shrink-0 text-rose-400 hover:text-rose-600 px-1 text-lg leading-none" aria-label="Hapus pupuk">&times;</button>
  `;
  dosisRowsEl.appendChild(row);
  renderAddPupukOptions();
}

function clearDosisRows() {
  dosisRowsEl.innerHTML = '';
  renderAddPupukOptions();
  updateEstimasi();
}

function updateEstimasi() {
  let total = 0;
  dosisRowsEl.querySelectorAll('.dosis-row').forEach((row) => {
    const dosis = Number(row.querySelector('.dosis-input').value) || 0;
    if (dosis <= 0) return;
    const p = masterPupukList.find((m) => m.id === row.dataset.pupukId);
    if (!p) return;
    total += dosis * hargaPerSatuan(p);
  });
  estimasiEl.textContent = formatRupiah(total);
}

addPupukSelect.addEventListener('change', () => {
  const pupukId = addPupukSelect.value;
  if (!pupukId) return;
  addDosisRow(pupukId);
  addPupukSelect.value = '';
  updateEstimasi();
});

dosisRowsEl.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.dosis-remove');
  if (!removeBtn) return;
  removeBtn.closest('.dosis-row').remove();
  renderAddPupukOptions();
  updateEstimasi();
});

dosisRowsEl.addEventListener('input', (e) => {
  if (e.target.classList.contains('dosis-input')) updateEstimasi();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const jenisKegiatan = jenisKegiatanSelect.getValue();
  const pakaiDosis = toggleDosis.checked;

  const details = [];
  let nominalBiaya;

  if (pakaiDosis) {
    dosisRowsEl.querySelectorAll('.dosis-row').forEach((row) => {
      const dosis = Number(row.querySelector('.dosis-input').value) || 0;
      if (dosis <= 0) return;
      const p = masterPupukList.find((m) => m.id === row.dataset.pupukId);
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
    nominalBiaya = details.reduce((sum, d) => sum + d.biaya, 0);
  } else {
    nominalBiaya = Number(form.nominal_biaya.value) || 0;
  }

  const headerPayload = {
    greenhouse_id: greenhouseId,
    tanggal: form.tanggal.value,
    hst: form.hst.value !== '' ? Number(form.hst.value) : null,
    jenis_kegiatan: jenisKegiatan,
    pakai_dosis_pupuk: pakaiDosis,
    nominal_biaya: nominalBiaya,
    keterangan: form.keterangan.value.trim() || null,
  };

  let logHarianId = editingId;
  let error;

  if (editingId) {
    ({ error } = await supabase.from('log_harian').update(headerPayload).eq('id', editingId));
    if (!error) {
      ({ error } = await supabase.from('log_pupuk_detail').delete().eq('log_harian_id', editingId));
    }
  } else {
    const { data, error: insertError } = await supabase.from('log_harian').insert(headerPayload).select('id').single();
    error = insertError;
    if (!error) logHarianId = data.id;
  }

  if (error) {
    showToast('Gagal menyimpan: ' + error.message, true);
    return;
  }

  if (details.length) {
    const detailRows = details.map((d) => ({ ...d, log_harian_id: logHarianId }));
    const { error: detailError } = await supabase.from('log_pupuk_detail').insert(detailRows);
    if (detailError) {
      showToast('Gagal menyimpan detail: ' + detailError.message, true);
      return;
    }
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
  jenisKegiatanSelect.refresh();
  editingId = null;
  submitBtn.textContent = 'Simpan';
  cancelBtn.classList.add('hidden');
}

window.editLogHarian = (id) => {
  const row = rows.find((r) => r.id === id);
  if (!row) return;

  form.tanggal.value = row.tanggal;
  form.hst.value = row.hst ?? '';
  form.keterangan.value = row.keterangan || '';
  jenisKegiatanSelect.setValue(row.jenis_kegiatan || '');

  toggleDosis.checked = !!row.pakai_dosis_pupuk;
  updateSectionVisibility(toggleDosis.checked);

  if (toggleDosis.checked) {
    (row.details || []).forEach((d) => addDosisRow(d.master_pupuk_id, d.dosis));
    updateEstimasi();
    form.nominal_biaya.value = '';
  } else {
    form.nominal_biaya.value = row.nominal_biaya;
  }

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

window.toggleLogHarianDetail = (id) => {
  document.getElementById(`log-harian-detail-${id}`)?.classList.toggle('hidden');
};

export async function load() {
  if (!greenhouseId) return;
  list.innerHTML = skeletonRows(3);

  let query = supabase.from('log_harian').select('*').eq('greenhouse_id', greenhouseId);
  query = applyDateFilter(query, 'tanggal');
  const { data, error } = await query
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = emptyState('Gagal memuat data: ' + escapeHtml(error.message), 'search');
    return;
  }

  const headers = data || [];
  const dosisIds = headers.filter((h) => h.pakai_dosis_pupuk).map((h) => h.id);

  let detailRows = [];
  if (dosisIds.length) {
    const { data: details, error: detailError } = await supabase
      .from('log_pupuk_detail')
      .select('*')
      .in('log_harian_id', dosisIds);
    if (detailError) {
      list.innerHTML = emptyState('Gagal memuat detail: ' + escapeHtml(detailError.message), 'search');
      return;
    }
    detailRows = details || [];
  }

  rows = headers.map((h) => ({
    ...h,
    details: detailRows.filter((d) => d.log_harian_id === h.id),
  }));

  render();
}

function render() {
  if (!rows.length) {
    list.innerHTML = emptyState('Belum ada catatan log harian', 'box');
    totalEl.textContent = formatRupiah(0);
    return;
  }

  const total = rows.reduce((sum, r) => sum + Number(r.nominal_biaya || 0), 0);
  totalEl.textContent = formatRupiah(total);

  list.innerHTML = rows
    .map((r, i) => {
      const hasDetail = r.pakai_dosis_pupuk && (r.details || []).length > 0;

      return `
    <div class="card p-3 fade-in fade-in-${Math.min(i + 1, 5)}">
      <div class="flex justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <p class="text-xs text-muted">${formatTanggal(r.tanggal)}</p>
            ${r.hst != null ? `<span class="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">HST ${r.hst}</span>` : ''}
            <span class="text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 px-2 py-0.5 rounded-full">${escapeHtml(kegiatanLabel(r))}</span>
          </div>
          ${r.keterangan ? `<p class="text-sm text-muted break-words mt-1">${escapeHtml(r.keterangan)}</p>` : ''}
          <p class="text-rose-600 dark:text-rose-400 font-semibold mt-1">${formatRupiah(r.nominal_biaya)}</p>
          ${hasDetail ? `<button type="button" onclick="toggleLogHarianDetail('${r.id}')" class="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-1">Detail Pupuk &#9662;</button>` : ''}
        </div>
        <div class="flex flex-col gap-1.5 shrink-0">
          <button onclick="editLogHarian('${r.id}')" class="text-xs px-2.5 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-md font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50">Edit</button>
          <button onclick="deleteLogHarian('${r.id}')" class="text-xs px-2.5 py-1 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-md font-medium hover:bg-rose-100 dark:hover:bg-rose-900/50">Hapus</button>
        </div>
      </div>
      ${
        hasDetail
          ? `<div id="log-harian-detail-${r.id}" class="hidden mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 space-y-1">
        ${r.details
          .map(
            (d) =>
              `<div class="flex justify-between text-sm text-muted"><span>${escapeHtml(d.nama_pupuk)}</span><span>${d.dosis} ${escapeHtml(d.satuan)} &middot; ${formatRupiah(d.biaya)}</span></div>`
          )
          .join('')}
      </div>`
          : ''
      }
    </div>
  `;
    })
    .join('');
}

exportBtn?.addEventListener('click', () => {
  const exportRows = rows.map((r) => ({
    Tanggal: formatTanggal(r.tanggal),
    HST: r.hst ?? '',
    'Jenis Kegiatan': kegiatanLabel(r),
    'Nominal Biaya (Rp)': Number(r.nominal_biaya || 0),
    Keterangan: r.keterangan || '',
  }));
  exportSheet('LogHarian', 'Log Harian', exportRows);
});

onFilterChange(load);

(async function init() {
  await loadMasterPupuk();
  await jenisKegiatanSelect.refresh();
  await load();
})();
