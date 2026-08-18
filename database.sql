-- ============================================================
-- OFFICIAL SHOP ADMINISTRATION — database.sql
-- Esquema COMPLETO do banco (Supabase / PostgreSQL).
--
-- Execute este ficheiro UMA vez em:
--   Supabase Dashboard → SQL Editor → New query → colar → Run
--
-- Contém: tabelas, primary keys, foreign keys, índices,
-- constraints, funções, triggers de updated_at, mecanismo de
-- auditoria, RLS e policies para admin / junior_admin / cashier.
-- ============================================================

begin;

-- ─────────────────────────────────────────────
-- 1. FUNÇÕES DE APOIO
-- ─────────────────────────────────────────────

-- Role do utilizador autenticado, lida de public.users.
-- SECURITY DEFINER: evita recursão de RLS ao consultar users.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users
  where auth_user_id = auth.uid() and active = true
  limit 1;
$$;

-- ID do perfil (public.users.id) do utilizador autenticado.
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users
  where auth_user_id = auth.uid() and active = true
  limit 1;
$$;

-- Atualização automática de updated_at.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────
-- 2. TABELAS
-- ─────────────────────────────────────────────

-- Perfis complementares (palavras-passe ficam SÓ em auth.users)
create table if not exists public.users (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  name         text not null,
  role         text not null check (role in ('admin', 'junior_admin', 'cashier')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) > 0),
  category_id    uuid references public.categories (id) on delete set null,
  unit_type      text not null default 'unit'
                 check (unit_type in ('unit', 'box', 'pack', 'kg', 'g', 'l', 'ml')),
  purchase_price numeric(14, 2) not null default 0 check (purchase_price >= 0),
  sale_price     numeric(14, 2) not null default 0 check (sale_price >= 0),
  location       text not null default 'store'
                 check (location in ('store', 'warehouse', 'both')),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.stock (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null unique references public.products (id) on delete cascade,
  warehouse_qty numeric(14, 3) not null default 0 check (warehouse_qty >= 0),
  store_qty     numeric(14, 3) not null default 0 check (store_qty >= 0),
  updated_at    timestamptz not null default now()
);

-- FONTE DE VERDADE de qualquer alteração de stock.
create table if not exists public.movements (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id),
  quantity      numeric(14, 3) not null check (quantity > 0),
  type          text not null
                check (type in ('in', 'out', 'sale', 'transfer', 'loss', 'theft', 'adjustment')),
  from_location text check (from_location in ('store', 'warehouse', 'external')),
  to_location   text check (to_location in ('store', 'warehouse', 'external')),
  user_id       uuid references public.users (id),
  created_at    timestamptz not null default now()
);

create table if not exists public.sales (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id),
  quantity    numeric(14, 3) not null check (quantity > 0),
  total_price numeric(14, 2) not null check (total_price >= 0),
  user_id     uuid references public.users (id),
  created_at  timestamptz not null default now()
);

create table if not exists public.cash_register (
  id              uuid primary key default gen_random_uuid(),
  opening_balance numeric(14, 2) not null default 0 check (opening_balance >= 0),
  total_sales     numeric(14, 2) not null default 0 check (total_sales >= 0),
  closing_balance numeric(14, 2) check (closing_balance >= 0),
  status          text not null default 'open' check (status in ('open', 'closed')),
  created_at      timestamptz not null default now(),
  closed_at       timestamptz
);

create table if not exists public.fuel (
  id             uuid primary key default gen_random_uuid(),
  fuel_type      text not null check (fuel_type in ('petrol', 'diesel', 'kerosene', 'gas')),
  quantity_in    numeric(14, 3) not null default 0 check (quantity_in >= 0),
  quantity_out   numeric(14, 3) not null default 0 check (quantity_out >= 0),
  purchase_price numeric(14, 2) not null default 0 check (purchase_price >= 0),
  sale_price     numeric(14, 2) not null default 0 check (sale_price >= 0),
  created_at     timestamptz not null default now()
);

create table if not exists public.inventory_sessions (
  id              uuid primary key default gen_random_uuid(),
  warehouse_stock jsonb,
  store_stock     jsonb,
  manual_stock    jsonb,
  differences     jsonb,
  user_id         uuid references public.users (id),
  created_at      timestamptz not null default now()
);

-- Auditoria completa (alimentada por triggers; escrita manual bloqueada por RLS)
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users (id),
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name  text not null,
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 3. ÍNDICES
-- ─────────────────────────────────────────────

create index if not exists idx_users_auth_user_id   on public.users (auth_user_id);
create index if not exists idx_products_name        on public.products (name);
create index if not exists idx_products_category    on public.products (category_id);
create index if not exists idx_products_active      on public.products (active);
create index if not exists idx_stock_product        on public.stock (product_id);
create index if not exists idx_movements_product    on public.movements (product_id);
create index if not exists idx_movements_created_at on public.movements (created_at desc);
create index if not exists idx_sales_product        on public.sales (product_id);
create index if not exists idx_sales_created_at     on public.sales (created_at desc);
create index if not exists idx_sales_user           on public.sales (user_id);
create index if not exists idx_cash_status          on public.cash_register (status);
create index if not exists idx_fuel_type            on public.fuel (fuel_type);
create index if not exists idx_audit_table          on public.audit_logs (table_name, created_at desc);

-- ─────────────────────────────────────────────
-- 4. TRIGGERS
-- ─────────────────────────────────────────────

drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_stock_touch on public.stock;
create trigger trg_stock_touch
  before update on public.stock
  for each row execute function public.touch_updated_at();

-- ── Mecanismo de auditoria ──
-- SECURITY DEFINER: escreve em audit_logs mesmo sem policy de INSERT
-- (o dono da função contorna o RLS da tabela de auditoria).
create or replace function public.log_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.current_app_user_id();
  insert into public.audit_logs (user_id, action, table_name, before_data, after_data)
  values (
    v_user_id,
    TG_OP,
    TG_TABLE_NAME,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_products on public.products;
create trigger trg_audit_products
  after insert or update or delete on public.products
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_stock on public.stock;
create trigger trg_audit_stock
  after insert or update or delete on public.stock
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_sales on public.sales;
create trigger trg_audit_sales
  after insert or update or delete on public.sales
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_movements on public.movements;
create trigger trg_audit_movements
  after insert or update or delete on public.movements
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_cash on public.cash_register;
create trigger trg_audit_cash
  after insert or update or delete on public.cash_register
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_fuel on public.fuel;
create trigger trg_audit_fuel
  after insert or update or delete on public.fuel
  for each row execute function public.log_audit();

-- ─────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY
--    A segurança real vive AQUI — não no frontend.
-- ─────────────────────────────────────────────

alter table public.users              enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.stock              enable row level security;
alter table public.movements          enable row level security;
alter table public.sales              enable row level security;
alter table public.cash_register      enable row level security;
alter table public.fuel               enable row level security;
alter table public.inventory_sessions enable row level security;
alter table public.audit_logs         enable row level security;

-- ── users ──
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (auth_user_id = auth.uid() or public.current_app_role() in ('admin', 'junior_admin'));

drop policy if exists users_insert_admin on public.users;
create policy users_insert_admin on public.users for insert to authenticated
  with check (public.current_app_role() = 'admin');

drop policy if exists users_update_admin on public.users;
create policy users_update_admin on public.users for update to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin on public.users for delete to authenticated
  using (public.current_app_role() = 'admin');

-- ── categories ──
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select to authenticated
  using (public.current_app_role() in ('admin', 'junior_admin', 'cashier'));

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for insert to authenticated
  with check (public.current_app_role() in ('admin', 'junior_admin'));

drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories for update to authenticated
  using (public.current_app_role() in ('admin', 'junior_admin'))
  with check (public.current_app_role() in ('admin', 'junior_admin'));

-- Eliminar categorias: reservado a admin
drop policy if exists categories_delete_admin on public.categories;
create policy categories_delete_admin on public.categories for delete to authenticated
  using (public.current_app_role() = 'admin');

-- ── products ──
-- cashier só lê produtos ATIVOS; admin/junior leem tudo.
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
  using (
    public.current_app_role() in ('admin', 'junior_admin')
    or (public.current_app_role() = 'cashier' and active = true)
  );

drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated
  with check (public.current_app_role() in ('admin', 'junior_admin'));

drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
  using (public.current_app_role() in ('admin', 'junior_admin'))
  with check (public.current_app_role() in ('admin', 'junior_admin'));

-- Eliminar produtos: reservado a admin
drop policy if exists products_delete_admin on public.products;
create policy products_delete_admin on public.products for delete to authenticated
  using (public.current_app_role() = 'admin');

-- ── stock (armazém NÃO visível ao cashier por defeito) ──
drop policy if exists stock_select on public.stock;
create policy stock_select on public.stock for select to authenticated
  using (public.current_app_role() in ('admin', 'junior_admin'));

drop policy if exists stock_write on public.stock;
create policy stock_write on public.stock for insert to authenticated
  with check (public.current_app_role() in ('admin', 'junior_admin'));

drop policy if exists stock_update on public.stock;
create policy stock_update on public.stock for update to authenticated
  using (public.current_app_role() in ('admin', 'junior_admin'))
  with check (public.current_app_role() in ('admin', 'junior_admin'));

drop policy if exists stock_delete_admin on public.stock;
create policy stock_delete_admin on public.stock for delete to authenticated
  using (public.current_app_role() = 'admin');

-- ── movements (cashier regista movimentos de venda; leitura só admin/junior) ──
drop policy if exists movements_select on public.movements;
create policy movements_select on public.movements for select to authenticated
  using (public.current_app_role() in ('admin', 'junior_admin'));

drop policy if exists movements_insert on public.movements;
create policy movements_insert on public.movements for insert to authenticated
  with check (public.current_app_role() in ('admin', 'junior_admin', 'cashier'));

-- movements são IMUTÁVEIS: sem policies de update/delete (fonte de verdade).

-- ── sales ──
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select to authenticated
  using (
    public.current_app_role() in ('admin', 'junior_admin')
    or user_id = public.current_app_user_id()
  );

drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales for insert to authenticated
  with check (public.current_app_role() in ('admin', 'junior_admin', 'cashier'));

-- vendas não se editam nem se apagam via API (correção = movimento inverso).

-- ── cash_register ──
drop policy if exists cash_select on public.cash_register;
create policy cash_select on public.cash_register for select to authenticated
  using (
    public.current_app_role() in ('admin', 'junior_admin')
    or (public.current_app_role() = 'cashier' and status = 'open')
  );

drop policy if exists cash_insert on public.cash_register;
create policy cash_insert on public.cash_register for insert to authenticated
  with check (public.current_app_role() in ('admin', 'junior_admin', 'cashier'));

drop policy if exists cash_update on public.cash_register;
create policy cash_update on public.cash_register for update to authenticated
  using (public.current_app_role() in ('admin', 'junior_admin', 'cashier'))
  with check (public.current_app_role() in ('admin', 'junior_admin', 'cashier'));

drop policy if exists cash_delete_admin on public.cash_register;
create policy cash_delete_admin on public.cash_register for delete to authenticated
  using (public.current_app_role() = 'admin');

-- ── fuel ──
drop policy if exists fuel_all on public.fuel;
create policy fuel_all on public.fuel for all to authenticated
  using (public.current_app_role() in ('admin', 'junior_admin'))
  with check (public.current_app_role() in ('admin', 'junior_admin'));

-- ── inventory_sessions ──
drop policy if exists inventory_all on public.inventory_sessions;
create policy inventory_all on public.inventory_sessions for all to authenticated
  using (public.current_app_role() in ('admin', 'junior_admin'))
  with check (public.current_app_role() in ('admin', 'junior_admin'));

-- ── audit_logs: leitura reservada a admin; escrita só via triggers ──
drop policy if exists audit_select_admin on public.audit_logs;
create policy audit_select_admin on public.audit_logs for select to authenticated
  using (public.current_app_role() = 'admin');

-- ─────────────────────────────────────────────
-- 6. VISTA PARA O POS (cashier)
--    Não expõe purchase_price nem qualquer dado financeiro restrito.
-- ─────────────────────────────────────────────

create or replace view public.products_pos
with (security_invoker = on) as
select id, name, category_id, unit_type, sale_price, location, active
from public.products
where active = true;

-- ─────────────────────────────────────────────
-- 7. DADOS INICIAIS (opcional — comente se não quiser)
-- ─────────────────────────────────────────────

insert into public.categories (name) values
  ('Alimentar'),
  ('Bebidas'),
  ('Higiene'),
  ('Combustível')
on conflict (name) do nothing;

-- ─────────────────────────────────────────────
-- 8. PERFIS DE UTILIZADORES — OBRIGATÓRIO
--    Depois de criar cada utilizador em:
--      Authentication → Users → Add user
--    copie o "User UID" gerado e execute (1 linha por utilizador):
--
-- insert into public.users (auth_user_id, name, role)
-- values ('COLE-AQUI-O-USER-UID', 'Nome do Admin', 'admin');
--
-- insert into public.users (auth_user_id, name, role)
-- values ('COLE-AQUI-O-USER-UID', 'Nome do Caixa', 'cashier');
-- ─────────────────────────────────────────────

commit;
