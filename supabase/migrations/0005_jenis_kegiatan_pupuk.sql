-- =========================================================
-- Migration: Jenis Kegiatan Pupuk (manageable dropdown)
-- Jalankan di Supabase SQL Editor. Aman dijalankan di DB yang sudah berisi data.
-- =========================================================

create table if not exists jenis_kegiatan_pupuk (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  kode text not null unique,
  created_at timestamptz not null default now()
);

insert into jenis_kegiatan_pupuk (nama, kode) values
  ('Spray', 'spray'),
  ('Pemupukan', 'pemupukan'),
  ('Injek', 'injek'),
  ('Spray + Injek', 'spray_injek')
on conflict (kode) do nothing;

alter table log_pupuk drop constraint if exists log_pupuk_jenis_kegiatan_check;

alter table jenis_kegiatan_pupuk enable row level security;
drop policy if exists "anon full access" on jenis_kegiatan_pupuk;
create policy "anon full access" on jenis_kegiatan_pupuk for all to anon using (true) with check (true);
