import { supabase, escapeHtml, showToast, formatRupiah, formatKg } from './supabase.js';
import { skeletonCards, emptyState } from './ui.js';

const viewMenu = document.getElementById('view-menu');
const viewGreenhouse = document.getElementById('view-greenhouse');
const viewPicker = document.getElementById('view-picker');

const form = document.getElementById('form-greenhouse');
const list = document.getElementById('greenhouse-list');
const submitBtn = document.getElementById('greenhouse-submit-btn');
const cancelBtn = document.getElementById('greenhouse-cancel-btn');

const pickerTitle = document.getElementById('picker-title');
const pickerList = document.getElementById('picker-list');
const summaryGrid = document.getElementById('summary-grid');

const PICKER_CONFIG = {
  'biaya-operasional': { title: 'Biaya Operasional — Pilih Greenhouse', page: 'biaya-operasional.html' },
};

let rows = [];
let editingId = null;
let pickerPage = null;

function showView(view) {
  viewMenu.classList.toggle('hidden', view !== 'menu');
  viewGreenhouse.classList.toggle('hidden', view !== 'greenhouse');
  viewPicker.classList.toggle('hidden', view !== 'picker');
}

document.querySelectorAll('button.menu-card').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    if (target === 'greenhouse') {
      showView('greenhouse');
      loadGreenhouses();
    } else {
      const config = PICKER_CONFIG[target];
      pickerPage = config.page;
      pickerTitle.textContent = config.title;
      showView('picker');
      loadPicker();
    }
  });
});

document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => {
    resetForm();
    showView('menu');
  });
});

// ---------------------------------------------------------------
// Ringkasan semua greenhouse (halaman awal)
// ---------------------------------------------------------------

async function loadSummary() {
  const [ghRes, logRes, biayaRes, panenRes] = await Promise.all([
    supabase.from('greenhouses').select('id', { count: 'exact', head: true }),
    supabase.from('log_harian').select('nominal_biaya'),
    supabase.from('biaya_operasional').select('nominal'),
    supabase.from('panen_detail').select('kg_grade_a, kg_grade_b, kg_grade_c, kg_grade_d'),
  ]);

  const ghCount = ghRes.count || 0;
  const totalLog = (logRes.data || []).reduce((sum, r) => sum + Number(r.nominal_biaya || 0), 0);
  const totalOperasional = (biayaRes.data || []).reduce((sum, r) => sum + Number(r.nominal || 0), 0);
  const totalBiaya = totalLog + totalOperasional;
  const totalPanen = (panenRes.data || []).reduce(
    (sum, r) => sum + Number(r.kg_grade_a || 0) + Number(r.kg_grade_b || 0) + Number(r.kg_grade_c || 0) + Number(r.kg_grade_d || 0),
    0
  );
  const hpp = totalPanen > 0 ? totalBiaya / totalPanen : 0;

  summaryGrid.innerHTML = `
    <div class="card p-4 fade-in">
      <p class="text-xs text-muted uppercase tracking-wide">Total Biaya Produksi</p>
      <p class="text-lg sm:text-xl font-bold text-teal-600 dark:text-teal-400 mt-1">${formatRupiah(totalBiaya)}</p>
    </div>
    <div class="card p-4 fade-in fade-in-1">
      <p class="text-xs text-muted uppercase tracking-wide">Total Panen</p>
      <p class="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">${formatKg(totalPanen)}</p>
    </div>
    <div class="card p-4 fade-in fade-in-2">
      <p class="text-xs text-muted uppercase tracking-wide">HPP Rata-rata</p>
      <p class="text-lg sm:text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">${totalPanen > 0 ? formatRupiah(hpp) + '/kg' : '-'}</p>
    </div>
    <div class="card p-4 fade-in fade-in-3">
      <p class="text-xs text-muted uppercase tracking-wide">Greenhouse Aktif</p>
      <p class="text-lg sm:text-xl font-bold text-sky-600 dark:text-sky-400 mt-1">${ghCount}</p>
    </div>
  `;
}

// ---------------------------------------------------------------
// Kelola Greenhouse (tambah / edit / hapus / masuk dashboard)
// ---------------------------------------------------------------

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { nama: form.nama.value.trim() };

  let error;
  if (editingId) {
    ({ error } = await supabase.from('greenhouses').update(payload).eq('id', editingId));
  } else {
    ({ error } = await supabase.from('greenhouses').insert(payload));
  }

  if (error) {
    showToast('Gagal menyimpan: ' + error.message, true);
    return;
  }

  showToast(editingId ? 'Greenhouse berhasil diperbarui' : 'Greenhouse berhasil ditambahkan');
  resetForm();
  await loadGreenhouses();
  loadSummary();
});

cancelBtn.addEventListener('click', resetForm);

function resetForm() {
  form.reset();
  editingId = null;
  submitBtn.textContent = 'Simpan';
  cancelBtn.classList.add('hidden');
}

function startEdit(id) {
  const row = rows.find((r) => r.id === id);
  if (!row) return;
  form.nama.value = row.nama;
  editingId = id;
  submitBtn.textContent = 'Update';
  cancelBtn.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteGreenhouse(id) {
  if (!confirm('Hapus greenhouse ini? Semua data log harian, biaya operasional, dan panen di dalamnya akan ikut terhapus.')) return;
  const { error } = await supabase.from('greenhouses').delete().eq('id', id);
  if (error) {
    showToast('Gagal menghapus: ' + error.message, true);
    return;
  }
  showToast('Greenhouse dihapus');
  await loadGreenhouses();
  loadSummary();
}

function openDashboard(id) {
  window.location.href = 'dashboard.html?gh=' + encodeURIComponent(id);
}

async function loadGreenhouses() {
  list.innerHTML = skeletonCards(2);
  const { data, error } = await supabase
    .from('greenhouses')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    list.innerHTML = emptyState('Gagal memuat data: ' + escapeHtml(error.message), 'search');
    return;
  }

  rows = data;
  renderGreenhouseList();
}

function renderGreenhouseList() {
  if (!rows.length) {
    list.innerHTML = emptyState('Belum ada greenhouse, tambahkan di atas', 'leaf');
    return;
  }

  list.innerHTML = rows
    .map(
      (r, i) => `
    <div class="greenhouse-card card p-4 flex flex-col gap-3 cursor-pointer hover:shadow-card-lg hover:border-emerald-300 dark:hover:border-emerald-600 hover:-translate-y-0.5 transition-all duration-300 fade-in fade-in-${Math.min(i + 1, 5)}" data-id="${r.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="font-semibold text-heading truncate">${escapeHtml(r.nama)}</h3>
          <p class="text-xs text-muted mt-0.5">Dibuat ${escapeHtml((r.created_at || '').slice(0, 10))}</p>
        </div>
        <span class="text-emerald-600 dark:text-emerald-400 text-lg leading-none shrink-0">&rarr;</span>
      </div>
      <div class="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
        <button data-action="edit" data-id="${r.id}" class="flex-1 text-xs px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-md font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50">Edit</button>
        <button data-action="delete" data-id="${r.id}" class="flex-1 text-xs px-2.5 py-1.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-md font-medium hover:bg-rose-100 dark:hover:bg-rose-900/50">Hapus</button>
      </div>
    </div>
  `
    )
    .join('');
}

list.addEventListener('click', (e) => {
  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    e.stopPropagation();
    const id = actionBtn.dataset.id;
    if (actionBtn.dataset.action === 'edit') startEdit(id);
    else if (actionBtn.dataset.action === 'delete') deleteGreenhouse(id);
    return;
  }

  const card = e.target.closest('.greenhouse-card');
  if (card) openDashboard(card.dataset.id);
});

// ---------------------------------------------------------------
// Pilih Greenhouse untuk Biaya Operasional / Panen
// ---------------------------------------------------------------

async function loadPicker() {
  pickerList.innerHTML = skeletonCards(2);
  const { data, error } = await supabase
    .from('greenhouses')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    pickerList.innerHTML = emptyState('Gagal memuat data: ' + escapeHtml(error.message), 'search');
    return;
  }

  if (!data.length) {
    pickerList.innerHTML = emptyState('Belum ada greenhouse. Tambahkan lewat menu Greenhouse terlebih dahulu.', 'leaf');
    return;
  }

  pickerList.innerHTML = data
    .map(
      (r, i) => `
    <button type="button" data-id="${r.id}" class="picker-card text-left card p-4 flex items-center justify-between gap-2 cursor-pointer hover:shadow-card-lg hover:border-emerald-300 dark:hover:border-emerald-600 hover:-translate-y-0.5 transition-all duration-300 fade-in fade-in-${Math.min(i + 1, 5)}">
      <h3 class="font-semibold text-heading truncate">${escapeHtml(r.nama)}</h3>
      <span class="text-emerald-600 dark:text-emerald-400 text-lg leading-none shrink-0">&rarr;</span>
    </button>
  `
    )
    .join('');
}

pickerList.addEventListener('click', (e) => {
  const card = e.target.closest('.picker-card');
  if (!card || !pickerPage) return;
  window.location.href = pickerPage + '?gh=' + encodeURIComponent(card.dataset.id);
});

loadSummary();
