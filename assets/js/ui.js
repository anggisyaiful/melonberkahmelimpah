// Helper UI bersama: skeleton loading, empty state (SVG inline),
// label bulan untuk grafik, dan bottom navigation bar (mobile).

export function skeletonRows(count = 3, heightClass = 'h-16') {
  return Array.from({ length: count })
    .map(() => `<div class="skeleton ${heightClass} w-full"></div>`)
    .join('');
}

export function skeletonCards(count = 3) {
  return Array.from({ length: count })
    .map(() => `<div class="skeleton h-24 w-full col-span-1"></div>`)
    .join('');
}

const EMPTY_ICONS = {
  box: `
    <svg viewBox="0 0 120 96" class="w-28 h-24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="86" rx="40" ry="6" class="fill-slate-100 dark:fill-slate-700"/>
      <path d="M20 34 L60 18 L100 34 L100 70 L60 86 L20 70 Z" class="fill-emerald-50 dark:fill-slate-800 stroke-emerald-300 dark:stroke-slate-600" stroke-width="2"/>
      <path d="M20 34 L60 50 L100 34" class="stroke-emerald-300 dark:stroke-slate-600" stroke-width="2" fill="none"/>
      <path d="M60 50 L60 86" class="stroke-emerald-300 dark:stroke-slate-600" stroke-width="2"/>
      <path d="M40 26 L80 42" class="stroke-emerald-300 dark:stroke-slate-600" stroke-width="2"/>
    </svg>`,
  chart: `
    <svg viewBox="0 0 120 96" class="w-28 h-24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="86" rx="40" ry="6" class="fill-slate-100 dark:fill-slate-700"/>
      <rect x="22" y="40" width="16" height="36" rx="3" class="fill-emerald-100 dark:fill-slate-700"/>
      <rect x="46" y="26" width="16" height="50" rx="3" class="fill-emerald-200 dark:fill-slate-600"/>
      <rect x="70" y="48" width="16" height="28" rx="3" class="fill-emerald-100 dark:fill-slate-700"/>
      <path d="M22 22 L46 36 L70 14 L94 30" class="stroke-emerald-400 dark:stroke-emerald-500" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  leaf: `
    <svg viewBox="0 0 120 96" class="w-28 h-24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="86" rx="40" ry="6" class="fill-slate-100 dark:fill-slate-700"/>
      <path d="M60 80 C60 80 30 60 30 36 C30 20 45 12 60 24 C75 12 90 20 90 36 C90 60 60 80 60 80 Z" class="fill-emerald-50 dark:fill-slate-800 stroke-emerald-300 dark:stroke-slate-600" stroke-width="2"/>
      <path d="M60 24 L60 76" class="stroke-emerald-300 dark:stroke-slate-600" stroke-width="2"/>
    </svg>`,
  search: `
    <svg viewBox="0 0 120 96" class="w-28 h-24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="86" rx="40" ry="6" class="fill-slate-100 dark:fill-slate-700"/>
      <circle cx="54" cy="42" r="22" class="fill-emerald-50 dark:fill-slate-800 stroke-emerald-300 dark:stroke-slate-600" stroke-width="3"/>
      <line x1="70" y1="58" x2="86" y2="74" class="stroke-emerald-300 dark:stroke-slate-600" stroke-width="4" stroke-linecap="round"/>
    </svg>`,
};

export function emptyState(message, icon = 'box', extra = '') {
  return `
    <div class="flex flex-col items-center justify-center py-10 px-4 text-center gap-2 col-span-full">
      ${EMPTY_ICONS[icon] || EMPTY_ICONS.box}
      <p class="text-muted text-sm max-w-xs">${message}</p>
      ${extra}
    </div>
  `;
}

export function formatMonthLabel(ym) {
  const [year, month] = String(ym).split('-').map(Number);
  if (!year || !month) return ym;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
}

// ---------------------------------------------------------------
// Perbandingan bulan ini vs bulan lalu (Biaya Operasional & Panen)
// ---------------------------------------------------------------
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// Mengembalikan rentang tanggal (YYYY-MM-DD) untuk bulan ini & bulan lalu,
// dipakai dengan filter .gte()/.lt() pada query Supabase.
export function getMonthRanges() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const thisStart = `${y}-${pad(m + 1)}-01`;
  const nextStart = m === 11 ? `${y + 1}-01-01` : `${y}-${pad(m + 2)}-01`;
  const lastStart = m === 0 ? `${y - 1}-12-01` : `${y}-${pad(m)}-01`;
  return { thisStart, nextStart, lastStart };
}

// Render kartu perbandingan "bulan ini vs bulan lalu" lengkap dengan
// progress bar & badge persentase perubahan.
// higherIsBetter: true untuk panen (naik = baik), false untuk biaya (naik = buruk).
export function renderMonthCompareCard({ thisTotal, lastTotal, formatFn, higherIsBetter, title = 'Perbandingan Bulanan' }) {
  const now = new Date();
  const thisMonthName = MONTH_NAMES[now.getMonth()];
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthName = MONTH_NAMES[lastMonthDate.getMonth()];

  let pctLabel;
  let barPct;
  if (lastTotal > 0) {
    const pct = ((thisTotal - lastTotal) / lastTotal) * 100;
    pctLabel = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    barPct = Math.min((thisTotal / lastTotal) * 100, 100);
  } else if (thisTotal > 0) {
    pctLabel = 'Baru';
    barPct = 100;
  } else {
    pctLabel = '0%';
    barPct = 0;
  }

  const noData = lastTotal === 0 && thisTotal === 0;
  const isGood = higherIsBetter ? thisTotal >= lastTotal : thisTotal <= lastTotal;
  const badgeColor = noData
    ? 'text-muted bg-slate-100 dark:bg-slate-700'
    : isGood
      ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
      : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30';
  const barColor = noData ? 'bg-slate-300 dark:bg-slate-600' : isGood ? 'bg-emerald-500' : 'bg-rose-500';

  return `
    <div class="card p-4 space-y-3 fade-in">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-heading">${title}</h2>
        <span class="text-xs font-semibold px-2 py-1 rounded-full ${badgeColor}">${pctLabel}</span>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <p class="text-xs text-muted">${thisMonthName} (bulan ini)</p>
          <p class="text-lg font-bold text-heading mt-0.5">${formatFn(thisTotal)}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-muted">${lastMonthName} (bulan lalu)</p>
          <p class="text-lg font-bold text-muted mt-0.5">${formatFn(lastTotal)}</p>
        </div>
      </div>
      <div class="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div class="h-full rounded-full ${barColor} transition-all duration-500" style="width: ${barPct}%"></div>
      </div>
    </div>
  `;
}
