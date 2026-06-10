import { supabase, escapeHtml, showToast } from './supabase.js';

const form = document.getElementById('form-greenhouse');
const list = document.getElementById('greenhouse-list');
const submitBtn = document.getElementById('greenhouse-submit-btn');
const cancelBtn = document.getElementById('greenhouse-cancel-btn');

let rows = [];
let editingId = null;

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
  await load();
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
  await load();
}

function openDashboard(id) {
  window.location.href = 'dashboard.html?gh=' + encodeURIComponent(id);
}

async function load() {
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
  render();
}

function render() {
  if (!rows.length) {
    list.innerHTML = '<p class="text-center text-slate-400 py-6 col-span-full">Belum ada greenhouse, tambahkan di atas</p>';
    return;
  }

  list.innerHTML = rows
    .map(
      (r) => `
    <div class="greenhouse-card bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col gap-3 cursor-pointer hover:shadow-md hover:border-emerald-200 transition" data-id="${r.id}">
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

load();
