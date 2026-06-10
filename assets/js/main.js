import { initGreenhouseContext } from './supabase.js';

initGreenhouseContext();

const TABS = ['log-harian', 'rekap'];

function switchTab(tab, updateHash = true) {
  if (!TABS.includes(tab)) tab = 'log-harian';

  TABS.forEach((t) => {
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('text-emerald-600', active);
    btn.classList.toggle('dark:text-emerald-400', active);
    btn.classList.toggle('border-emerald-600', active);
    btn.classList.toggle('dark:border-emerald-400', active);
    btn.classList.toggle('text-slate-500', !active);
    btn.classList.toggle('dark:text-slate-400', !active);
    btn.classList.toggle('border-transparent', !active);
  });

  if (updateHash) {
    const newHash = '#' + tab;
    if (window.location.hash !== newHash) {
      history.replaceState(null, '', newHash);
    }
  }
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

window.addEventListener('hashchange', () => {
  switchTab(window.location.hash.replace('#', ''), false);
});

const initialTab = window.location.hash.replace('#', '') || 'log-harian';
switchTab(initialTab, false);
