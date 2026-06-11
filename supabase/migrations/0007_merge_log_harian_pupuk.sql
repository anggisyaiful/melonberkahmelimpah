-- =========================================================
-- Migration: Gabungkan Log Harian + Log Pupuk menjadi satu form/tabel
-- Jalankan di Supabase SQL Editor. Aman dijalankan di DB yang sudah berisi data.
-- =========================================================

-- 1. Kolom baru di log_harian untuk form gabungan: HST (opsional),
--    Jenis Kegiatan (kode dari jenis_kegiatan_pupuk), dan flag toggle
--    "pakai dosis pupuk?" (independen dari jenis kegiatan, bisa
--    diubah per entry oleh pengguna). uraian_kegiatan dipertahankan
--    untuk data lama, tapi tidak lagi wajib diisi.
alter table log_harian add column if not exists hst int;
alter table log_harian add column if not exists jenis_kegiatan text;
alter table log_harian add column if not exists pakai_dosis_pupuk boolean not null default false;
alter table log_harian alter column uraian_kegiatan drop not null;

-- 2. log_pupuk_detail sekarang bisa terkait ke log_harian (entri baru
--    & hasil migrasi entri lama), selain ke log_pupuk (dipertahankan apa
--    adanya, tidak dihapus).
alter table log_pupuk_detail alter column log_pupuk_id drop not null;
alter table log_pupuk_detail add column if not exists log_harian_id uuid references log_harian(id) on delete cascade;
create index if not exists idx_log_pupuk_detail_log_harian on log_pupuk_detail (log_harian_id);

-- 3. Tambahkan opsi "Lainnya" ke dropdown Jenis Kegiatan (Pemupukan,
--    Spray, Injek, Spray + Injek sudah ada dari migrasi 0005).
insert into jenis_kegiatan_pupuk (nama, kode) values
  ('Lainnya', 'lainnya')
on conflict (kode) do nothing;

-- 4. Pindahkan data log_pupuk (header) + total biaya pupuknya ke
--    log_harian, sekali saja (idempotent). Tabel log_pupuk lama TIDAK
--    dihapus/diubah, hanya ditinggalkan begitu saja (inert).
do $$
begin
  if not exists (select 1 from log_pupuk_detail where log_harian_id is not null) then

    -- Kolom sementara untuk memetakan log_pupuk.id -> log_harian.id baru
    alter table log_harian add column if not exists _migrate_src_log_pupuk_id uuid;

    insert into log_harian (
      greenhouse_id, tanggal, hst, jenis_kegiatan, pakai_dosis_pupuk, nominal_biaya, keterangan,
      created_at, _migrate_src_log_pupuk_id
    )
    select
      lp.greenhouse_id, lp.tanggal, lp.hst, lp.jenis_kegiatan, true,
      coalesce((select sum(d.biaya) from log_pupuk_detail d where d.log_pupuk_id = lp.id), 0),
      lp.keterangan, lp.created_at, lp.id
    from log_pupuk lp;

    update log_pupuk_detail d
    set log_harian_id = lh.id
    from log_harian lh
    where lh._migrate_src_log_pupuk_id = d.log_pupuk_id;

    alter table log_harian drop column _migrate_src_log_pupuk_id;
  end if;
end $$;

-- 5. Jaga-jaga (idempotent): tandai pakai_dosis_pupuk = true untuk baris
--    log_harian mana pun yang sudah punya detail dosis pupuk terkait,
--    walau belum ditandai begitu (mis. data lama lainnya).
update log_harian
set pakai_dosis_pupuk = true
where pakai_dosis_pupuk = false
  and id in (select distinct log_harian_id from log_pupuk_detail where log_harian_id is not null);
