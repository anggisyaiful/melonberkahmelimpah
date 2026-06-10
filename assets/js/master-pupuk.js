import { supabase, formatRupiah, escapeHtml, showToast } from './supabase.js';
import { initPinGate } from './pin.js';
import { skeletonCards, emptyState } from './ui.js';

const MASTER_PUPUK_PIN = '1234';

const list = document.getElementById('pupuk-list');
const formTambah = document.getElementById('form-tambah-pupuk');

const SATUAN_OPTIONS = [
  { value: 'sdk', label: 'Sendok (sdk)' },
  { value: 'ttp', label: 'Tutup (ttp)' },
  { value: 'ml', label: 'Mililiter (ml)' },
  { value: 'grm', label: 'Gram (grm)' },
];

const SATUAN_DASAR_OPTIONS = [
  { value: 'gram', label: 'gram' },
  { value: 'ml', label: 'ml' },
];

// Pupuk bawaan aplikasi — tidak bisa dihapus dari master pupuk.
const DEFAULT_PUPUK_NAMES = new Set([
  'KNO Merah', 'Ultradap', 'Yaramila', 'Magnes', 'MKP', 'KNO Putih', 'Calcium',
  'Mordern', 'Vitaron', 'Demolis', 'Antila', 'Bendas', 'Starban', 'Javagros',
  'Kalingga', 'Premix', 'Antracol',
]);

let rows = [];

initPinGate({
  pin: MASTER_PUPUK_PIN,
  storageKey: 'melon-pupuk-unlocked',
  gateEl: document.getElementById('pin-gate'),
  contentEl: document.getElementById('pin-content'),
  lockBtnEl: document.getElementById('btn-lock'),
});

// Muat data begitu konten terbuka (baik karena PIN benar maupun sudah tersimpan).
const observer = new MutationObserver(() => {
  const content = document.getElementById('pin-content');
  if (!content.classList.contains('hidden') && !rows.length) {
    load();
  }
});
observer.observe(document.getElementById('pin-content'), { attributes: true, attributeFilter: ['class'] });

// Jika sudah unlocked sejak awal (initPinGate langsung membuka), load segera.
if (!document.getElementById('pin-content').classList.contains('hidden')) {
  load();
}

function selectOptions(options, selected) {
  return options
    .map((o) => `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${o.label}</option>`)
    .join('');
}

function computeHargaDasar(ukuranKemasan, hargaPerKemasan) {
  const ukuran = Number(ukuranKemasan) || 0;
  const harga = Number(hargaPerKemasan) || 0;
  return ukuran > 0 ? harga / ukuran : 0;
}

function computeHargaDosis(konversi, hargaDasar) {
  return (Number(konversi) || 0) * hargaDasar;
}

async function load() {
  list.innerHTML = skeletonCards(4);
  const { data, error } = await supabase
    .from('master_pupuk')
    .select('*')
    .order('urutan', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    list.innerHTML = emptyState('Gagal memuat data: ' + escapeHtml(error.message), 'search');
    return;
  }

  rows = data || [];
  render();
}

function render() {
  if (!rows.length) {
    list.innerHTML = emptyState('Belum ada data pupuk', 'box');
    return;
  }

  list.innerHTML = rows
    .map((r, i) => {
      const hargaDasar = computeHargaDasar(r.ukuran_kemasan, r.harga_per_kemasan);
      const hargaDosis = computeHargaDosis(r.konversi_ke_satuan_dasar, hargaDasar);
      const aktif = r.aktif !== false;

      return `
    <div class="pupuk-card card p-4 space-y-3 fade-in fade-in-${Math.min((i % 5) + 1, 5)}" data-id="${r.id}">
      <div class="flex items-start justify-between gap-2">
        <input type="text" data-field="nama" value="${escapeHtml(r.nama)}" class="input-field font-semibold text-heading flex-1 !py-1.5">
        <span data-badge-aktif class="shrink-0 text-xs px-2 py-1 rounded-full font-medium ${aktif ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}">${aktif ? 'Aktif' : 'Nonaktif'}</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="label text-xs">Satuan Dosis</label>
          <select data-field="satuan" class="input-field text-sm !py-1.5">${selectOptions(SATUAN_OPTIONS, r.satuan)}</select>
        </div>
        <div>
          <label class="label text-xs">Satuan Dasar</label>
          <select data-field="satuan_dasar" class="input-field text-sm !py-1.5">${selectOptions(SATUAN_DASAR_OPTIONS, r.satuan_dasar)}</select>
        </div>
        <div>
          <label class="label text-xs">Konversi ke Satuan Dasar</label>
          <input type="number" step="0.0001" min="0" data-field="konversi_ke_satuan_dasar" value="${r.konversi_ke_satuan_dasar}" class="input-field text-sm !py-1.5">
        </div>
        <div>
          <label class="label text-xs">Ukuran Kemasan</label>
          <input type="number" step="0.01" min="0" data-field="ukuran_kemasan" value="${r.ukuran_kemasan}" class="input-field text-sm !py-1.5">
        </div>
        <div class="col-span-2">
          <label class="label text-xs">Harga per Kemasan (Rp)</label>
          <input type="number" step="100" min="0" data-field="harga_per_kemasan" value="${r.harga_per_kemasan}" class="input-field text-sm !py-1.5">
        </div>
      </div>
      <div class="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <p class="text-xs text-muted">Harga / Satuan Dasar</p>
          <p data-computed="harga_dasar" class="font-semibold text-heading">${formatRupiah(hargaDasar)}</p>
        </div>
        <div>
          <p class="text-xs text-muted">Harga / Satuan Dosis</p>
          <p data-computed="harga_dosis" class="font-semibold text-emerald-600 dark:text-emerald-400">${formatRupiah(hargaDosis)}</p>
        </div>
      </div>
      <div class="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
        <button type="button" data-action="save" class="flex-1 text-xs px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-md font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/50">Simpan</button>
        <button type="button" data-action="toggle-aktif" class="flex-1 text-xs px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-md font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50">${aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
        ${
          DEFAULT_PUPUK_NAMES.has(r.nama)
            ? ''
            : `<button type="button" data-action="delete" class="text-xs px-2.5 py-1.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-md font-medium hover:bg-rose-100 dark:hover:bg-rose-900/50">Hapus</button>`
        }
      </div>
    </div>
  `;
    })
    .join('');
}

// Live recompute harga turunan saat user mengetik (sebelum disimpan)
list.addEventListener('input', (e) => {
  const card = e.target.closest('.pupuk-card');
  if (!card) return;
  const field = e.target.dataset.field;
  if (!['konversi_ke_satuan_dasar', 'ukuran_kemasan', 'harga_per_kemasan'].includes(field)) return;

  const konversi = card.querySelector('[data-field="konversi_ke_satuan_dasar"]').value;
  const ukuran = card.querySelector('[data-field="ukuran_kemasan"]').value;
  const harga = card.querySelector('[data-field="harga_per_kemasan"]').value;

  const hargaDasar = computeHargaDasar(ukuran, harga);
  const hargaDosis = computeHargaDosis(konversi, hargaDasar);

  card.querySelector('[data-computed="harga_dasar"]').textContent = formatRupiah(hargaDasar);
  card.querySelector('[data-computed="harga_dosis"]').textContent = formatRupiah(hargaDosis);
});

list.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const card = btn.closest('.pupuk-card');
  const id = card.dataset.id;
  const action = btn.dataset.action;

  if (action === 'save') {
    const payload = {
      nama: card.querySelector('[data-field="nama"]').value.trim(),
      satuan: card.querySelector('[data-field="satuan"]').value,
      satuan_dasar: card.querySelector('[data-field="satuan_dasar"]').value,
      konversi_ke_satuan_dasar: Number(card.querySelector('[data-field="konversi_ke_satuan_dasar"]').value) || 0,
      ukuran_kemasan: Number(card.querySelector('[data-field="ukuran_kemasan"]').value) || 0,
      harga_per_kemasan: Number(card.querySelector('[data-field="harga_per_kemasan"]').value) || 0,
    };

    const { error } = await supabase.from('master_pupuk').update(payload).eq('id', id);
    if (error) {
      showToast('Gagal menyimpan: ' + error.message, true);
      return;
    }
    showToast('Harga pupuk disimpan');
    await load();
  } else if (action === 'toggle-aktif') {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const aktif = !(row.aktif !== false);
    const { error } = await supabase.from('master_pupuk').update({ aktif }).eq('id', id);
    if (error) {
      showToast('Gagal mengubah status: ' + error.message, true);
      return;
    }
    showToast(aktif ? 'Pupuk diaktifkan' : 'Pupuk dinonaktifkan');
    await load();
  } else if (action === 'delete') {
    const row = rows.find((r) => r.id === id);
    if (!confirm(`Hapus "${row?.nama || 'pupuk ini'}" dari master pupuk? Data Log Pupuk yang sudah ada tetap tersimpan (snapshot).`)) return;
    const { error } = await supabase.from('master_pupuk').delete().eq('id', id);
    if (error) {
      showToast('Gagal menghapus: ' + error.message, true);
      return;
    }
    showToast('Pupuk dihapus dari master');
    await load();
  }
});

formTambah.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nama = formTambah.nama.value.trim();
  if (!nama) return;

  const maxUrutan = rows.reduce((max, r) => Math.max(max, r.urutan || 0), 0);
  const payload = {
    nama,
    urutan: maxUrutan + 1,
    satuan: formTambah.satuan.value,
    satuan_dasar: formTambah.satuan_dasar.value,
    konversi_ke_satuan_dasar: 1,
    ukuran_kemasan: 0,
    harga_per_kemasan: 0,
  };

  const { error } = await supabase.from('master_pupuk').insert(payload);
  if (error) {
    showToast('Gagal menambah pupuk: ' + error.message, true);
    return;
  }

  showToast('Pupuk baru ditambahkan');
  formTambah.reset();
  await load();
});
