import { supabase, escapeHtml, showToast } from './supabase.js';

const viewMenu = document.getElementById('view-menu');
const viewGreenhouse = document.getElementById('view-greenhouse');
const viewPicker = document.getElementById('view-picker');

const form = document.getElementById('form-greenhouse');
const list = document.getElementById('greenhouse-list');
const submitBtn = document.getElementById('greenhouse-submit-btn');
const cancelBtn = document.getElementById('greenhouse-cancel-btn');

const pickerTitle = document.getElementById('picker-title');
const pickerList = document.getElementById('picker-list');

const PICKER_CONFIG = {
  'biaya-operasional': { title: 'Biaya Operasional — Pilih Greenhouse', page: 'biaya-operasional.html' },
  panen: { title: 'Panen — Pilih Greenhouse', page: 'panen.html' },
};

let rows = [];
let editingId = null;
let pickerPage = null;

function showView(view) {
  viewMenu.classList.toggle('hidden', view !== 'menu');
  viewGreenhouse.classList.toggle('hidden', view !== 'greenhouse');
  viewPicker.classList.toggle('hidden', view !== 'picker');
}

document.querySelectorAll('.menu-card').forEach((btn) => {
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
}

function openDashboard(id) {
  window.location.href = 'dashboard.html?gh=' + encodeURIComponent(id);
}

async function loadGreenhouses() {
  list.innerHTML = '<p class="text-center text-slate-400 py-6 col-span-full">Memuat...</p>';
  const { data, error } = await supabase
    .from('greenhouses')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    list.innerHTML = `<p class="text-center text-rose-500 py-6 col-span-full">Gagal memuat data: ${escapeHtml(error.message)}</p>`;
    return;
  }

  rows = data;
  renderGreenhouseList();
}

function renderGreenhouseList() {
  if (!rows.length) {
    list.innerHTML = '<p class="text-center text-slate-400 py-6 col-span-full">Belum ada greenhouse, tambahkan di atas</p>';
    return;
  }

  list.innerHTML = rows
    .map(
      (r) => `
    <div class="greenhouse-card bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col gap-3 cursor-pointer hover:shadow-md hover:border-emerald-200 transition" data-id="${r.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="font-semibold text-slate-700 truncate">${escapeHtml(r.nama)}</h3>
          <p class="text-xs text-slate-400 mt-0.5">Dibuat ${escapeHtml((r.created_at || '').slice(0, 10))}</p>
        </div>
        <span class="text-emerald-600 text-lg leading-none shrink-0">&rarr;</span>
      </div>
      <div class="flex gap-2 pt-2 border-t border-slate-100">
        <button data-action="edit" data-id="${r.id}" class="flex-1 text-xs px-2.5 py-1.5 bg-amber-50 text-amber-700 rounded-md font-medium hover:bg-amber-100">Edit</button>
        <button data-action="delete" data-id="${r.id}" class="flex-1 text-xs px-2.5 py-1.5 bg-rose-50 text-rose-600 rounded-md font-medium hover:bg-rose-100">Hapus</button>
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
  pickerList.innerHTML = '<p class="text-center text-slate-400 py-6 col-span-full">Memuat...</p>';
  const { data, error } = await supabase
    .from('greenhouses')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    pickerList.innerHTML = `<p class="text-center text-rose-500 py-6 col-span-full">Gagal memuat data: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data.length) {
    pickerList.innerHTML = '<p class="text-center text-slate-400 py-6 col-span-full">Belum ada greenhouse. Tambahkan lewat menu Greenhouse terlebih dahulu.</p>';
    return;
  }

  pickerList.innerHTML = data
    .map(
      (r) => `
    <button type="button" data-id="${r.id}" class="picker-card text-left bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex items-center justify-between gap-2 cursor-pointer hover:shadow-md hover:border-emerald-200 transition">
      <h3 class="font-semibold text-slate-700 truncate">${escapeHtml(r.nama)}</h3>
      <span class="text-emerald-600 text-lg leading-none shrink-0">&rarr;</span>
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
