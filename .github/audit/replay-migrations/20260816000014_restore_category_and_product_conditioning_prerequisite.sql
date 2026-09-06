-- Audit-only replay prerequisite.
-- Exact structural effect of production migration 20260813083723
-- restore_category_and_product_conditioning, placed after the synthetic CI
-- baseline because that baseline creates categories/products later than the
-- original production history. No data is inserted or modified.
-- This file must not be merged to main.

alter table public.categories
  add column if not exists unit_vente text not null default 'pièces',
  add column if not exists pieces_per_lot numeric not null default 0,
  add column if not exists length_per_piece numeric not null default 0;

alter table public.products
  add column if not exists pieces_per_lot numeric,
  add column if not exists length_per_piece numeric;

alter table public.categories
  drop constraint if exists categories_pieces_per_lot_nonnegative,
  add constraint categories_pieces_per_lot_nonnegative check (pieces_per_lot >= 0);

alter table public.categories
  drop constraint if exists categories_length_per_piece_nonnegative,
  add constraint categories_length_per_piece_nonnegative check (length_per_piece >= 0);

alter table public.products
  drop constraint if exists products_pieces_per_lot_nonnegative,
  add constraint products_pieces_per_lot_nonnegative check (pieces_per_lot is null or pieces_per_lot >= 0);

alter table public.products
  drop constraint if exists products_length_per_piece_nonnegative,
  add constraint products_length_per_piece_nonnegative check (length_per_piece is null or length_per_piece >= 0);
