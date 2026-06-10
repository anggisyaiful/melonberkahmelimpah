import { initGreenhouseContext } from './supabase.js';

initGreenhouseContext();

const TABS = ['log-harian', 'rekap'];

function switchTab(tab) {
  TABS.forEach((t) => {
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('text-emerald-600', active);
    btn.classList.toggle('border-emerald-600', active);
    btn.classList.toggle('text-slate-500', !active);
    btn.classList.toggle('border-transparent', !active);
  });
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
