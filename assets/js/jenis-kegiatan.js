import { supabase } from './supabase.js';

// Helper bersama untuk daftar "jenis kegiatan" Log Pupuk (global, lintas GH).
// kode dipakai sebagai value tersimpan di log_pupuk.jenis_kegiatan,
// nama adalah label yang ditampilkan ke pengguna.

// Kode bawaan aplikasi — tidak bisa dihapus dari dropdown.
export const DEFAULT_KODE = ['spray', 'pemupukan', 'injek', 'spray_injek'];

function slugifyKode(nama) {
  return nama
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function loadJenisKegiatan() {
  const { data, error } = await supabase
    .from('jenis_kegiatan_pupuk')
    .select('kode, nama')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Gagal memuat jenis kegiatan:', error.message);
    return [];
  }
  return data || [];
}

export async function addJenisKegiatan(nama) {
  const kode = slugifyKode(nama);
  if (!kode) return null;

  const { data, error } = await supabase
    .from('jenis_kegiatan_pupuk')
    .upsert({ nama: nama.trim(), kode }, { onConflict: 'kode' })
    .select('kode, nama')
    .single();

  if (error) {
    console.error('Gagal menambah jenis kegiatan:', error.message);
    return null;
  }
  return data;
}

export async function removeJenisKegiatan(kode) {
  const { error } = await supabase.from('jenis_kegiatan_pupuk').delete().eq('kode', kode);
  if (error) {
    console.error('Gagal menghapus jenis kegiatan:', error.message);
    return false;
  }
  return true;
}
