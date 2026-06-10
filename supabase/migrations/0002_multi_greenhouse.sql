-- =========================================================
-- Migration: Multi-Greenhouse
-- Jalankan script ini di Supabase SQL Editor (Project > SQL Editor)
-- Aman dijalankan di database yang sudah berisi data dari schema.sql awal.
-- =========================================================

-- 1. Tabel greenhouses
create table if not exists greenhouses (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  created_at timestamptz not null default now()
);

alter table greenhouses enable row level security;

drop policy if exists "anon full access" on greenhouses;
create policy "anon full access" on greenhouses
  for all to anon using (true) with check (true);

-- 2. Greenhouse default untuk menampung data lama (jika ada)
insert into greenhouses (nama)
select 'Greenhouse 1'
where not exists (select 1 from greenhouses);

-- 3. Tambah kolom greenhouse_id (nullable dulu agar bisa backfill)
alter table log_harian add column if not exists greenhouse_id uuid references greenhouses(id) on delete cascade;
alter table biaya_operasional add column if not exists greenhouse_id uuid references greenhouses(id) on delete cascade;
alter table panen add column if not exists greenhouse_id uuid references greenhouses(id) on delete cascade;

-- 4. Backfill data lama ke greenhouse pertama
update log_harian set greenhouse_id = (select id from greenhouses order by created_at asc limit 1) where greenhouse_id is null;
update biaya_operasional set greenhouse_id = (select id from greenhouses order by created_at asc limit 1) where greenhouse_id is null;
update panen set greenhouse_id = (select id from greenhouses order by created_at asc limit 1) where greenhouse_id is null;

-- 5. Wajibkan greenhouse_id untuk data baru
alter table log_harian alter column greenhouse_id set not null;
alter table biaya_operasional alter column greenhouse_id set not null;
alter table panen alter column greenhouse_id set not null;

-- 6. Index untuk mempercepat query per greenhouse
create index if not exists idx_log_harian_greenhouse on log_harian (greenhouse_id);
create index if not exists idx_biaya_operasional_greenhouse on biaya_operasional (greenhouse_id);
create index if not exists idx_panen_greenhouse on panen (greenhouse_id);
