import { supabase, formatRupiah, formatKg, formatTanggal, getGreenhouseId } from './supabase.js';
import { applyDateFilter, onFilterChange, getFilter } from './filter.js';
import { exportSheet, exportWorkbook } from './export.js';

const JENIS_LABEL = {
  listrik: 'Listrik',
  air: 'Air',
  tenaga_kerja: 'Tenaga Kerja',
  lainnya: 'Lainnya',
};

const greenhouseId = getGreenhouseId();

const els = {
  totalBiaya: document.getElementById('rekap-total-biaya'),
  totalPanen: document.getElementById('rekap-total-panen'),
  hpp: document.getElementById('rekap-hpp'),
  logTotal: document.getElementById('rekap-log-total'),
  listrik: document.getElementById('rekap-listrik'),
  air: document.getElementById('rekap-air'),
  tenagaKerja: document.getElementById('rekap-tenaga-kerja'),
  lainnya: document.getElementById('rekap-lainnya'),
  operasionalTotal: document.getElementById('rekap-operasional-total'),
};

let lastTotals = null;

function computeTotals(logRows, biayaRows, panenRows) {
  const totalLog = (logRows || []).reduce((sum, r) => sum + Number(r.nominal_biaya || 0), 0);

  const byJenis = { listrik: 0, air: 0, tenaga_kerja: 0, lainnya: 0 };
  let totalOperasional = 0;
  (biayaRows || []).forEach((r) => {
    const nominal = Number(r.nominal || 0);
    if (byJenis[r.jenis_biaya] !== undefined) byJenis[r.jenis_biaya] += nominal;
    totalOperasional += nominal;
  });

  const totalPanen = (panenRows || []).reduce((sum, r) => sum + Number(r.jumlah_kg || 0), 0);
  const totalBiaya = totalLog + totalOperasional;
  const hpp = totalPanen > 0 ? totalBiaya / totalPanen : 0;

  return { totalLog, byJenis, totalOperasional, totalPanen, totalBiaya, hpp };
}

export async function refreshRekap() {
  if (!greenhouseId) return;

  const [logRes, biayaRes, panenRes] = await Promise.all([
    applyDateFilter(supabase.from('log_harian').select('nominal_biaya').eq('greenhouse_id', greenhouseId), 'tanggal'),
    applyDateFilter(supabase.from('biaya_operasional').select('jenis_biaya, nominal').eq('greenhouse_id', greenhouseId), 'tanggal'),
    applyDateFilter(supabase.from('panen').select('jumlah_kg').eq('greenhouse_id', greenhouseId), 'tanggal_panen'),
  ]);

  const totals = computeTotals(logRes.data, biayaRes.data, panenRes.data);
  lastTotals = totals;

  els.totalBiaya.textContent = formatRupiah(totals.totalBiaya);
  els.totalPanen.textContent = formatKg(totals.totalPanen);
  els.hpp.textContent = totals.totalPanen > 0 ? formatRupiah(totals.hpp) + ' / kg' : '-';

  els.logTotal.textContent = formatRupiah(totals.totalLog);
  els.listrik.textContent = formatRupiah(totals.byJenis.listrik);
  els.air.textContent = formatRupiah(totals.byJenis.air);
  els.tenagaKerja.textContent = formatRupiah(totals.byJenis.tenaga_kerja);
  els.lainnya.textContent = formatRupiah(totals.byJenis.lainnya);
  els.operasionalTotal.textContent = formatRupiah(totals.totalOperasional);
}

function buildRekapRows(totals) {
  const { from, to } = getFilter();
  const periode = from || to ? `${from || '...'} s/d ${to || '...'}` : 'Semua tanggal';

  return [
    { Keterangan: 'Periode', Nilai: periode },
    { Keterangan: 'Total Biaya Produksi (Rp)', Nilai: totals.totalBiaya },
    { Keterangan: 'Total Hasil Panen (kg)', Nilai: totals.totalPanen },
    { Keterangan: 'HPP per Kg (Rp)', Nilai: totals.totalPanen > 0 ? Math.round(totals.hpp) : 0 },
    { Keterangan: 'Total Log Harian (Rp)', Nilai: totals.totalLog },
    { Keterangan: 'Listrik (Rp)', Nilai: totals.byJenis.listrik },
    { Keterangan: 'Air (Rp)', Nilai: totals.byJenis.air },
    { Keterangan: 'Tenaga Kerja (Rp)', Nilai: totals.byJenis.tenaga_kerja },
    { Keterangan: 'Biaya Lainnya (Rp)', Nilai: totals.byJenis.lainnya },
    { Keterangan: 'Total Biaya Operasional (Rp)', Nilai: totals.totalOperasional },
  ];
}

async function exportSemua() {
  if (!greenhouseId) return;

  const [logRes, biayaRes, panenRes] = await Promise.all([
    applyDateFilter(supabase.from('log_harian').select('*').eq('greenhouse_id', greenhouseId), 'tanggal').order('tanggal', { ascending: false }),
    applyDateFilter(supabase.from('biaya_operasional').select('*').eq('greenhouse_id', greenhouseId), 'tanggal').order('tanggal', { ascending: false }),
    applyDateFilter(supabase.from('panen').select('*').eq('greenhouse_id', greenhouseId), 'tanggal_panen').order('tanggal_panen', { ascending: false }),
  ]);

  const logRows = logRes.data || [];
  const biayaRows = biayaRes.data || [];
  const panenRows = panenRes.data || [];
  const totals = computeTotals(logRows, biayaRows, panenRows);

  exportWorkbook('Export_Semua', [
    { name: 'Rekap', rows: buildRekapRows(totals) },
    {
      name: 'Log Harian',
      rows: logRows.map((r) => ({
        Tanggal: formatTanggal(r.tanggal),
        'Uraian Kegiatan': r.uraian_kegiatan,
        'Nominal Biaya (Rp)': Number(r.nominal_biaya || 0),
        Keterangan: r.keterangan || '',
      })),
    },
    {
      name: 'Biaya Operasional',
      rows: biayaRows.map((r) => ({
        Tanggal: formatTanggal(r.tanggal),
        'Jenis Biaya': JENIS_LABEL[r.jenis_biaya] || r.jenis_biaya,
        'Nominal (Rp)': Number(r.nominal || 0),
        Keterangan: r.keterangan || '',
      })),
    },
    {
      name: 'Panen',
      rows: panenRows.map((r) => ({
        'Tanggal Panen': formatTanggal(r.tanggal_panen),
        'Jumlah (kg)': Number(r.jumlah_kg || 0),
        Keterangan: r.keterangan || '',
      })),
    },
  ]);
}

document.getElementById('btn-refresh-rekap')?.addEventListener('click', refreshRekap);

document.getElementById('btn-export-rekap')?.addEventListener('click', () => {
  exportSheet('Rekap', 'Rekap', buildRekapRows(lastTotals || computeTotals([], [], [])));
});

document.getElementById('btn-export-semua')?.addEventListener('click', exportSemua);

onFilterChange(refreshRekap);
refreshRekap();
