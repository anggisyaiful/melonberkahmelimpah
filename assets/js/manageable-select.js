import { escapeHtml, showToast } from './supabase.js';

const CHEVRON_SVG =
  '<svg class="w-4 h-4 text-muted shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>';

// Dropdown kustom untuk field "jenis" yang datanya bisa dikelola pengguna:
// - Setiap pilihan punya tombol hapus (×), termasuk pilihan bawaan.
// - Baris terakhir adalah "+ Tambah jenis baru" (prompt -> onAdd).
// - Sinkron ke <input type="hidden" name="${name}"> agar `form.<name>.value`
//   tetap berfungsi seperti <select> biasa.
export function createManageableSelect({
  mount,
  name,
  placeholder = 'Pilih...',
  addLabel = '+ Tambah jenis baru',
  promptLabel = 'Nama baru:',
  load,
  onAdd,
  onRemove,
}) {
  let items = [];
  let value = '';

  mount.innerHTML = `
    <div class="relative">
      <button type="button" data-ms-toggle class="input-field flex items-center justify-between gap-2 text-left">
        <span data-ms-label class="truncate text-heading">${escapeHtml(placeholder)}</span>
        ${CHEVRON_SVG}
      </button>
      <input type="hidden" name="${name}">
      <div data-ms-panel class="hidden absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-card-lg"></div>
    </div>
  `;

  const toggle = mount.querySelector('[data-ms-toggle]');
  const label = mount.querySelector('[data-ms-label]');
  const hidden = mount.querySelector(`input[name="${name}"]`);
  const panel = mount.querySelector('[data-ms-panel]');

  function renderPanel() {
    const optionsHtml = items
      .map((item) => {
        const selected = item.kode === value;
        return `
          <div class="flex items-center justify-between ${selected ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}">
            <button type="button" data-ms-option data-kode="${escapeHtml(item.kode)}" class="flex-1 min-w-0 text-left px-3 py-2 text-sm text-heading hover:bg-slate-50 dark:hover:bg-slate-700/50 truncate">${escapeHtml(item.nama)}</button>
            <button type="button" data-ms-remove data-kode="${escapeHtml(item.kode)}" data-nama="${escapeHtml(item.nama)}" class="shrink-0 px-2.5 py-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30" aria-label="Hapus ${escapeHtml(item.nama)}">&times;</button>
          </div>`;
      })
      .join('');

    panel.innerHTML = `${optionsHtml}<button type="button" data-ms-add class="w-full text-left px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border-t border-slate-100 dark:border-slate-700">${escapeHtml(addLabel)}</button>`;
  }

  function setValue(kode) {
    value = kode;
    hidden.value = kode;
    const item = items.find((i) => i.kode === kode);
    label.textContent = item ? item.nama : placeholder;
  }

  function openPanel() {
    renderPanel();
    panel.classList.remove('hidden');
  }

  function closePanel() {
    panel.classList.add('hidden');
  }

  toggle.addEventListener('click', () => {
    if (panel.classList.contains('hidden')) openPanel();
    else closePanel();
  });

  document.addEventListener('click', (e) => {
    if (!mount.contains(e.target)) closePanel();
  });

  panel.addEventListener('click', async (e) => {
    const optBtn = e.target.closest('[data-ms-option]');
    const removeBtn = e.target.closest('[data-ms-remove]');
    const addBtn = e.target.closest('[data-ms-add]');

    if (removeBtn) {
      if (!confirm(`Hapus "${removeBtn.dataset.nama}"?`)) return;
      const ok = await onRemove(removeBtn.dataset.kode);
      if (!ok) {
        showToast('Gagal menghapus', true);
        return;
      }
      showToast('Dihapus');
      const wasSelected = removeBtn.dataset.kode === value;
      await refresh(wasSelected ? null : value);
      openPanel();
      return;
    }

    if (optBtn) {
      setValue(optBtn.dataset.kode);
      closePanel();
      return;
    }

    if (addBtn) {
      const nama = prompt(promptLabel);
      if (!nama || !nama.trim()) return;
      const newItem = await onAdd(nama.trim());
      if (!newItem) {
        showToast('Gagal menambah', true);
        return;
      }
      showToast('Berhasil ditambahkan');
      await refresh(newItem.kode);
      closePanel();
    }
  });

  async function refresh(selectKode) {
    items = await load();
    const target =
      selectKode && items.some((i) => i.kode === selectKode)
        ? selectKode
        : value && items.some((i) => i.kode === value)
          ? value
          : items[0]?.kode || '';
    setValue(target);
  }

  return { refresh, setValue, getValue: () => value };
}
