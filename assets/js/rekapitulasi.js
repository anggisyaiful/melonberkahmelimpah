import { supabase, formatRupiah, formatKg, formatTanggal, escapeHtml, getGreenhouseId } from './supabase.js';
import { applyDateFilter, onFilterChange, getFilter } from './filter.js';
import { exportSheet, exportWorkbook } from './export.js';
import { formatMonthLabel } from './ui.js';
import { loadJenisBiaya } from './biaya-jenis.js';
import { loadJenisKegiatan } from './jenis-kegiatan.js';
import { gradeTotalKg, gradePenghasilan, buildPanenExportRows } from './panen-shared.js';

const greenhouseId = getGreenhouseId();

const els = {
  totalBiaya: document.getElementById('rekap-total-biaya'),
  totalPanen: document.getElementById('rekap-total-panen'),
  hpp: document.getElementById('rekap-hpp'),
  breakdown: document.getElementById('rekap-breakdown'),
  penghasilanTotal: document.getElementById('rekap-penghasilan-total'),
  profitTotal: document.getElementById('rekap-profit-total'),
  profitStatus: document.getElementById('rekap-profit-status'),
  chartBiaya: document.getElementById('chart-biaya'),
  chartPanen: document.getElementById('chart-panen'),
};

let lastTotals = null;
let lastSeries = null;
let jenisLabelMap = {};
let jenisKegiatanLabelMap = {};
let chartBiaya = null;
let chartPanen = null;

function computeTotals(logRows, biayaRows, pupukDetailRows, panenPairs) {
  const totalLog = (logRows || []).reduce((sum, r) => sum + Number(r.nominal_biaya || 0), 0);

  const byJenis = {};
  let totalOperasional = 0;
  (biayaRows || []).forEach((r) => {
    const nominal = Number(r.nominal || 0);
    byJenis[r.jenis_biaya] = (byJenis[r.jenis_biaya] || 0) + nominal;
    totalOperasional += nominal;
  });

  const totalPupuk = (pupukDetailRows || []).reduce((sum, r) => sum + Number(r.biaya || 0), 0);
  const totalBiaya = totalLog + totalOperasional + totalPupuk;

  let totalKg = 0;
  let totalPenghasilan = 0;
  (panenPairs || []).forEach(({ ev, detail }) => {
    totalKg += gradeTotalKg(detail);
    totalPenghasilan += gradePenghasilan(detail, ev);
  });

  const hpp = totalKg > 0 ? totalBiaya / totalKg : 0;
  const profit = totalPenghasilan - totalBiaya;

  return { totalLog, byJenis, totalOperasional, totalPupuk, totalBiaya, totalKg, totalPenghasilan, hpp, profit };
}

function buildPanenPairs(eventsWithDetails, ghId) {
  const pairs = [];
  (eventsWithDetails || []).forEach((ev) => {
    const detail = ev.details.find((d) => d.greenhouse_id === ghId);
    if (detail) pairs.push({ ev, detail });
  });
  return pairs;
}

// ---------------------------------------------------------------
// Rincian biaya & total penghasilan / profit
// ---------------------------------------------------------------

function renderBreakdown(totals) {
  if (!els.breakdown) return;

  const rows = [
    `<div class="flex justify-between py-2"><dt class="text-muted">Total Log Harian</dt><dd class="font-medium text-heading">${formatRupiah(totals.totalLog)}</dd></div>`,
    `<div class="flex justify-between py-2"><dt class="text-muted">Total Log Pupuk</dt><dd class="font-medium text-heading">${formatRupiah(totals.totalPupuk)}</dd></div>`,
  ];

  Object.entries(totals.byJenis).forEach(([kode, nominal]) => {
    const label = jenisLabelMap[kode] || kode;
    rows.push(
      `<div class="flex justify-between py-2"><dt class="text-muted">${escapeHtml(label)}</dt><dd class="font-medium text-heading">${formatRupiah(nominal)}</dd></div>`
    );
  });

  rows.push(
    `<div class="flex justify-between py-2 font-semibold text-heading"><dt>Total Biaya Operasional</dt><dd>${formatRupiah(totals.totalOperasional)}</dd></div>`
  );

  els.breakdown.innerHTML = rows.join('');
}

function updateProfitDisplay(totals) {
  if (!els.penghasilanTotal || !els.profitTotal || !els.profitStatus) return;

  const untung = totals.profit >= 0;
  const colorClass = untung ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

  els.penghasilanTotal.textContent = formatRupiah(totals.totalPenghasilan);

  els.profitTotal.textContent = formatRupiah(totals.profit);
  els.profitTotal.className = `text-xl font-bold mt-1 ${colorClass}`;

  if (totals.totalKg > 0 || totals.totalPenghasilan > 0) {
    els.profitStatus.textContent = untung
      ? `✅ Untung ${formatRupiah(Math.abs(totals.profit))}`
      : `⚠️ Rugi ${formatRupiah(Math.abs(totals.profit))}`;
    els.profitStatus.className = `text-sm font-semibold ${colorClass}`;
  } else {
    els.profitStatus.textContent = 'Belum ada data panen pada periode ini.';
    els.profitStatus.className = 'text-sm font-semibold text-muted';
  }
}

// ---------------------------------------------------------------
// Grafik tren biaya & panen per bulan
// ---------------------------------------------------------------

function buildMonthlySeries(logRows, biayaRows, pupukRows, panenPairs) {
  const costMap = new Map();
  (logRows || []).forEach((r) => {
    const month = (r.tanggal || '').slice(0, 7);
    if (!month) return;
    costMap.set(month, (costMap.get(month) || 0) + Number(r.nominal_biaya || 0));
  });
  (biayaRows || []).forEach((r) => {
    const month = (r.tanggal || '').slice(0, 7);
    if (!month) return;
    costMap.set(month, (costMap.get(month) || 0) + Number(r.nominal || 0));
  });
  (pupukRows || []).forEach((r) => {
    const month = (r.tanggal || '').slice(0, 7);
    if (!month) return;
    costMap.set(month, (costMap.get(month) || 0) + Number(r.biaya || 0));
  });

  const harvestMap = new Map();
  (panenPairs || []).forEach(({ ev, detail }) => {
    const month = (ev.tanggal || '').slice(0, 7);
    if (!month) return;
    harvestMap.set(month, (harvestMap.get(month) || 0) + gradeTotalKg(detail));
  });

  const months = [...new Set([...costMap.keys(), ...harvestMap.keys()])].sort();
  return {
    labels: months.map(formatMonthLabel),
    cost: months.map((m) => costMap.get(m) || 0),
    harvest: months.map((m) => harvestMap.get(m) || 0),
  };
}

function isDarkMode() {
  return document.documentElement.classList.contains('dark');
}

function renderCharts(series) {
  if (typeof Chart === 'undefined' || !els.chartBiaya || !els.chartPanen) return;

  const dark = isDarkMode();
  const textColor = dark ? '#cbd5e1' : '#475569';
  const gridColor = dark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.1)';
  const scales = {
    x: { ticks: { color: textColor }, grid: { color: gridColor } },
    y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true },
  };

  chartBiaya?.destroy();
  chartBiaya = new Chart(els.chartBiaya, {
    type: 'bar',
    data: {
      labels: series.labels,
      datasets: [
        {
          label: 'Biaya (Rp)',
          data: series.cost,
          backgroundColor: 'rgba(20, 184, 166, 0.6)',
          borderColor: 'rgb(13, 148, 136)',
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales,
    },
  });

  chartPanen?.destroy();
  chartPanen = new Chart(els.chartPanen, {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [
        {
          label: 'Panen (kg)',
          data: series.harvest,
          borderColor: 'rgb(16, 185, 129)',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: 'rgb(16, 185, 129)',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales,
    },
  });
}

// Re-render grafik dengan warna yang sesuai saat tema diganti.
document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (lastSeries) setTimeout(() => renderCharts(lastSeries), 50);
  });
});

// ---------------------------------------------------------------
// Helper data fetch (dipakai refreshRekap & exportSemua)
// ---------------------------------------------------------------

async function fetchPupukDetailRows(ghId) {
  const { data: headers } = await applyDateFilter(
    supabase.from('log_pupuk').select('id, tanggal').eq('greenhouse_id', ghId),
    'tanggal'
  );
  const pupukHeaders = headers || [];
  const ids = pupukHeaders.map((h) => h.id);

  let detailRows = [];
  if (ids.length) {
    const { data } = await supabase.from('log_pupuk_detail').select('biaya, log_pupuk_id').in('log_pupuk_id', ids);
    detailRows = data || [];
  }

  const tanggalById = Object.fromEntries(pupukHeaders.map((h) => [h.id, h.tanggal]));
  const withTanggal = detailRows.map((d) => ({ tanggal: tanggalById[d.log_pupuk_id], biaya: d.biaya }));

  return { detailRows, withTanggal };
}

async function fetchEventsWithDetails() {
  const { data: eventRows } = await applyDateFilter(supabase.from('event_panen').select('*'), 'tanggal').order('tanggal', {
    ascending: false,
  });
  const events = eventRows || [];
  const ids = events.map((e) => e.id);

  let detailRows = [];
  if (ids.length) {
    const { data } = await supabase.from('panen_detail').select('*').in('event_panen_id', ids);
    detailRows = data || [];
  }

  return events.map((e) => ({ ...e, details: detailRows.filter((d) => d.event_panen_id === e.id) }));
}

async function fetchMasterPupukActive() {
  const { data, error } = await supabase.from('master_pupuk').select('*').eq('aktif', true).order('urutan', { ascending: true });
  if (error) return [];
  return data || [];
}

async function fetchLogPupukWithDetails(ghId) {
  const { data: headers, error } = await applyDateFilter(supabase.from('log_pupuk').select('*').eq('greenhouse_id', ghId), 'tanggal')
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return [];
  const rows = headers || [];
  const ids = rows.map((h) => h.id);

  let detailRows = [];
  if (ids.length) {
    const { data } = await supabase.from('log_pupuk_detail').select('*').in('log_pupuk_id', ids);
    detailRows = data || [];
  }

  return rows.map((h) => ({ ...h, details: detailRows.filter((d) => d.log_pupuk_id === h.id) }));
}

async function computeGhTotals(ghId, eventsWithDetails) {
  const [logRes, biayaRes, pupuk] = await Promise.all([
    applyDateFilter(supabase.from('log_harian').select('nominal_biaya').eq('greenhouse_id', ghId), 'tanggal'),
    applyDateFilter(supabase.from('biaya_operasional').select('nominal').eq('greenhouse_id', ghId), 'tanggal'),
    fetchPupukDetailRows(ghId),
  ]);

  const totalLog = (logRes.data || []).reduce((sum, r) => sum + Number(r.nominal_biaya || 0), 0);
  const totalOperasional = (biayaRes.data || []).reduce((sum, r) => sum + Number(r.nominal || 0), 0);
  const totalPupuk = pupuk.detailRows.reduce((sum, r) => sum + Number(r.biaya || 0), 0);
  const totalBiaya = totalLog + totalOperasional + totalPupuk;

  let totalKg = 0;
  let totalPenghasilan = 0;
  buildPanenPairs(eventsWithDetails, ghId).forEach(({ ev, detail }) => {
    totalKg += gradeTotalKg(detail);
    totalPenghasilan += gradePenghasilan(detail, ev);
  });

  const hpp = totalKg > 0 ? totalBiaya / totalKg : 0;
  const profit = totalPenghasilan - totalBiaya;
  const margin = totalPenghasilan > 0 ? (profit / totalPenghasilan) * 100 : 0;

  return { totalBiaya, totalKg, hpp, totalPenghasilan, profit, margin };
}

// ---------------------------------------------------------------
// Rekap utama
// ---------------------------------------------------------------

export async function refreshRekap() {
  if (!greenhouseId) return;

  const [logRes, biayaRes, pupuk, eventsWithDetails, jenisList] = await Promise.all([
    applyDateFilter(supabase.from('log_harian').select('tanggal, nominal_biaya').eq('greenhouse_id', greenhouseId), 'tanggal'),
    applyDateFilter(supabase.from('biaya_operasional').select('tanggal, jenis_biaya, nominal').eq('greenhouse_id', greenhouseId), 'tanggal'),
    fetchPupukDetailRows(greenhouseId),
    fetchEventsWithDetails(),
    loadJenisBiaya(),
  ]);

  jenisLabelMap = Object.fromEntries(jenisList.map((j) => [j.kode, j.nama]));

  const panenPairs = buildPanenPairs(eventsWithDetails, greenhouseId);
  const totals = computeTotals(logRes.data, biayaRes.data, pupuk.detailRows, panenPairs);
  lastTotals = totals;

  els.totalBiaya.textContent = formatRupiah(totals.totalBiaya);
  els.totalPanen.textContent = formatKg(totals.totalKg);
  els.hpp.textContent = totals.totalKg > 0 ? formatRupiah(totals.hpp) + ' / kg' : '-';

  renderBreakdown(totals);
  updateProfitDisplay(totals);

  lastSeries = buildMonthlySeries(logRes.data, biayaRes.data, pupuk.withTanggal, panenPairs);
  renderCharts(lastSeries);
}

function buildRekapRows(totals) {
  const { from, to } = getFilter();
  const periode = from || to ? `${from || '...'} s/d ${to || '...'}` : 'Semua tanggal';
  const hargaJualRataRata = totals.totalKg > 0 ? totals.totalPenghasilan / totals.totalKg : 0;

  const rows = [
    { Keterangan: 'Periode', Nilai: periode },
    { Keterangan: 'Total Biaya Log Harian (Rp)', Nilai: totals.totalLog },
    { Keterangan: 'Total Biaya Log Pupuk (Rp)', Nilai: totals.totalPupuk },
  ];

  Object.entries(totals.byJenis).forEach(([kode, nominal]) => {
    rows.push({ Keterangan: `Biaya Operasional - ${jenisLabelMap[kode] || kode} (Rp)`, Nilai: nominal });
  });

  rows.push(
    { Keterangan: 'Total Biaya Operasional (Rp)', Nilai: totals.totalOperasional },
    { Keterangan: 'Total Biaya Produksi (Rp)', Nilai: totals.totalBiaya },
    { Keterangan: 'Total Hasil Panen (kg)', Nilai: totals.totalKg },
    { Keterangan: 'HPP per Kg (Rp)', Nilai: totals.totalKg > 0 ? Math.round(totals.hpp) : 0 },
    { Keterangan: 'Total Penghasilan (Rp)', Nilai: totals.totalPenghasilan },
    { Keterangan: 'Harga Jual Rata-rata per Kg (Rp)', Nilai: totals.totalKg > 0 ? Math.round(hargaJualRataRata) : 0 },
    { Keterangan: 'Profit (Rp)', Nilai: Math.round(totals.profit) },
    { Keterangan: 'Status', Nilai: totals.profit >= 0 ? 'Untung' : 'Rugi' }
  );

  return rows;
}

async function exportSemua() {
  if (!greenhouseId) return;

  const [masterPupukList, logPupukRows, logRes, biayaRes, eventsWithDetails, greenhousesRes, jenisList, jenisKegiatanList] = await Promise.all([
    fetchMasterPupukActive(),
    fetchLogPupukWithDetails(greenhouseId),
    applyDateFilter(supabase.from('log_harian').select('*').eq('greenhouse_id', greenhouseId), 'tanggal').order('tanggal', { ascending: false }),
    applyDateFilter(supabase.from('biaya_operasional').select('*').eq('greenhouse_id', greenhouseId), 'tanggal').order('tanggal', { ascending: false }),
    fetchEventsWithDetails(),
    supabase.from('greenhouses').select('id, nama').order('created_at', { ascending: true }),
    loadJenisBiaya(),
    loadJenisKegiatan(),
  ]);

  jenisLabelMap = Object.fromEntries(jenisList.map((j) => [j.kode, j.nama]));
  jenisKegiatanLabelMap = Object.fromEntries(jenisKegiatanList.map((j) => [j.kode, j.nama]));

  const logRows = logRes.data || [];
  const biayaRows = biayaRes.data || [];
  const greenhouses = greenhousesRes.data || [];

  const pupuk = await fetchPupukDetailRows(greenhouseId);
  const panenPairs = buildPanenPairs(eventsWithDetails, greenhouseId);
  const totals = computeTotals(logRows, biayaRows, pupuk.detailRows, panenPairs);

  // Sheet 1: Log Pupuk (pivot)
  const pupukNames = masterPupukList.map((p) => `${p.nama} (${p.satuan})`);
  const dosisTotals = {};
  const biayaTotals = {};
  pupukNames.forEach((name) => {
    dosisTotals[name] = 0;
    biayaTotals[name] = 0;
  });
  let grandTotalPupuk = 0;

  const logPupukExportRows = logPupukRows.map((r) => {
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
    grandTotalPupuk += rowBiaya;
    return row;
  });

  const totalDosisRow = { Tanggal: 'Total Dosis', HST: '', Kegiatan: '' };
  pupukNames.forEach((name) => {
    totalDosisRow[name] = dosisTotals[name] || '';
  });
  totalDosisRow['Total Biaya (Rp)'] = '';

  const totalBiayaPupukRow = { Tanggal: 'Total Biaya', HST: '', Kegiatan: '' };
  pupukNames.forEach((name) => {
    totalBiayaPupukRow[name] = biayaTotals[name] || '';
  });
  totalBiayaPupukRow['Total Biaya (Rp)'] = grandTotalPupuk;

  if (logPupukExportRows.length) logPupukExportRows.push(totalDosisRow, totalBiayaPupukRow);

  // Sheet 2: Log Harian
  const logHarianRows = logRows.map((r) => ({
    Tanggal: formatTanggal(r.tanggal),
    'Uraian Kegiatan': r.uraian_kegiatan,
    'Nominal Biaya (Rp)': Number(r.nominal_biaya || 0),
    Keterangan: r.keterangan || '',
  }));
  if (logHarianRows.length) {
    logHarianRows.push({
      Tanggal: 'TOTAL',
      'Uraian Kegiatan': '',
      'Nominal Biaya (Rp)': totals.totalLog,
      Keterangan: '',
    });
  }

  // Sheet 3: Biaya Operasional
  const biayaOperasionalRows = biayaRows.map((r) => ({
    Tanggal: formatTanggal(r.tanggal),
    'Jenis Biaya': jenisLabelMap[r.jenis_biaya] || r.jenis_biaya,
    'Nominal (Rp)': Number(r.nominal || 0),
    Keterangan: r.keterangan || '',
  }));
  if (biayaOperasionalRows.length) {
    biayaOperasionalRows.push({
      Tanggal: 'TOTAL',
      'Jenis Biaya': '',
      'Nominal (Rp)': totals.totalOperasional,
      Keterangan: '',
    });
  }

  // Sheet 4: Panen (global, semua GH)
  const panenRows = buildPanenExportRows(eventsWithDetails, greenhouses);

  // Sheet 5: Rekap HPP
  const rekapRows = buildRekapRows(totals);

  // Sheet 6: Ringkasan Semua GH
  const ghTotals = await Promise.all(greenhouses.map((gh) => computeGhTotals(gh.id, eventsWithDetails)));
  const ringkasanRows = greenhouses.map((gh, i) => {
    const t = ghTotals[i];
    return {
      Greenhouse: gh.nama,
      'Total Biaya (Rp)': Math.round(t.totalBiaya),
      'Total Kg': t.totalKg,
      'HPP per Kg (Rp)': t.totalKg > 0 ? Math.round(t.hpp) : 0,
      'Total Penghasilan (Rp)': Math.round(t.totalPenghasilan),
      'Profit (Rp)': Math.round(t.profit),
      'Margin (%)': t.totalPenghasilan > 0 ? Number(t.margin.toFixed(1)) : 0,
    };
  });

  exportWorkbook('Export_Semua', [
    { name: 'Log Pupuk', rows: logPupukExportRows },
    { name: 'Log Harian', rows: logHarianRows },
    { name: 'Biaya Operasional', rows: biayaOperasionalRows },
    { name: 'Panen', rows: panenRows },
    { name: 'Rekap HPP', rows: rekapRows },
    { name: 'Ringkasan Semua GH', rows: ringkasanRows },
  ]);
}

document.getElementById('btn-refresh-rekap')?.addEventListener('click', refreshRekap);

document.getElementById('btn-export-rekap')?.addEventListener('click', () => {
  exportSheet('Rekap', 'Rekap', buildRekapRows(lastTotals || computeTotals([], [], [], [])));
});

document.getElementById('btn-export-semua')?.addEventListener('click', exportSemua);

onFilterChange(refreshRekap);

refreshRekap();
