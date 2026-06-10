import { supabase } from './supabase.js';

// Helper bersama untuk daftar "jenis biaya operasional" (global, lintas GH).
// kode dipakai sebagai value tersimpan di biaya_operasional.jenis_biaya,
// nama adalah label yang ditampilkan ke pengguna.

export function slugifyKode(nama) {
  return nama
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function loadJenisBiaya() {
  const { data, error } = await supabase
    .from('biaya_jenis')
    .select('kode, nama')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Gagal memuat jenis biaya:', error.message);
    return [];
  }
  return data || [];
}

export async function addJenisBiaya(nama) {
  const kode = slugifyKode(nama);
  if (!kode) return null;

  const { data, error } = await supabase
    .from('biaya_jenis')
    .upsert({ nama: nama.trim(), kode }, { onConflict: 'kode' })
    .select('kode, nama')
    .single();

  if (error) {
    console.error('Gagal menambah jenis biaya:', error.message);
    return null;
  }
  return data;
}

export async function removeJenisBiaya(kode) {
  const { error } = await supabase.from('biaya_jenis').delete().eq('kode', kode);
  if (error) {
    console.error('Gagal menghapus jenis biaya:', error.message);
    return false;
  }
  return true;
}
