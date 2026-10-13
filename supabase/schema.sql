-- Sylcat Farms POS secure schema.
-- Safe to run on a project with legacy pos_* JSON tables: legacy rows are
-- retained, but anonymous access is revoked. This script never deletes sales.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null,
  role text not null check (role in ('cashier', 'manager', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  size_label text not null,
  description text not null default '',
  retail_price_cents bigint not null check (retail_price_cents >= 0),
  wholesale_price_cents bigint not null check (wholesale_price_cents >= 0),
  low_stock_level integer not null default 0 check (low_stock_level >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory (
  product_id text primary key references public.products(id) on delete restrict,
  crates integer not null default 0 check (crates >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null unique,
  idempotency_key uuid not null unique,
  cashier_id uuid not null references public.profiles(id) on delete restrict,
  customer_name text not null default '',
  customer_phone text not null default '',
  price_type text not null check (price_type in ('retail', 'wholesale')),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  balance_due_cents bigint not null default 0 check (balance_due_cents >= 0),
  payment_method text not null,
  payment_details jsonb not null default '{}'::jsonb,
  status text not null default 'completed' check (status in ('completed', 'voided', 'partially_refunded', 'refunded')),
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (amount_paid_cents + balance_due_cents = total_cents)
);

create index if not exists sales_sold_at_idx on public.sales (sold_at desc);
create index if not exists sales_cashier_sold_at_idx on public.sales (cashier_id, sold_at desc);
create index if not exists sales_customer_idx on public.sales (lower(customer_name));

create table if not exists public.sale_items (
  id bigint generated always as identity primary key,
  sale_id uuid not null references public.sales(id) on delete restrict,
  product_id text not null references public.products(id) on delete restrict,
  product_name text not null,
  size_label text not null,
  crates integer not null check (crates > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0)
);
create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_id_idx on public.sale_items (product_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  method text not null check (method in ('cash', 'mobile_money', 'card', 'credit')),
  amount_cents bigint not null check (amount_cents >= 0),
  reference text not null default '',
  details jsonb not null default '{}'::jsonb,
  received_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists payments_sale_id_idx on public.payments (sale_id);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('initial_stock', 'delivery', 'adjustment', 'sale', 'refund')),
  crates_delta integer not null,
  previous_crates integer not null check (previous_crates >= 0),
  new_crates integer not null check (new_crates >= 0),
  reason text not null,
  reference text not null default '',
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_product_created_idx on public.stock_movements (product_id, created_at desc);

create table if not exists public.sale_adjustments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('refund', 'void')),
  amount_cents bigint not null check (amount_cents >= 0),
  reason text not null,
  returned_items jsonb not null default '[]'::jsonb,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.sale_adjustments add column if not exists returned_items jsonb not null default '[]'::jsonb;
create index if not exists sale_adjustments_sale_id_idx on public.sale_adjustments (sale_id);

create table if not exists public.pos_settings (
  id integer primary key check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.pos_settings add column if not exists updated_at timestamptz not null default now();

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_created_idx on public.audit_log (actor_id, created_at desc);

create or replace function public.current_pos_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select role from public.profiles
  where id = auth.uid() and active = true
$$;

create or replace function public.has_pos_role(allowed text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(public.current_pos_role() = any (allowed), false)
$$;

revoke all on function public.current_pos_role() from public, anon;
revoke all on function public.has_pos_role(text[]) from public, anon;
grant execute on function public.current_pos_role() to authenticated;
grant execute on function public.has_pos_role(text[]) to authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sale_adjustments enable row level security;
alter table public.pos_settings enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "profiles_read_staff" on public.profiles;
create policy "profiles_read_staff" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_pos_role(array['manager','admin']));
drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles for all to authenticated
  using (public.has_pos_role(array['admin'])) with check (public.has_pos_role(array['admin']));

drop policy if exists "products_read_staff" on public.products;
create policy "products_read_staff" on public.products for select to authenticated
  using (public.has_pos_role(array['cashier','manager','admin']));
drop policy if exists "products_manager_write" on public.products;
create policy "products_manager_write" on public.products for all to authenticated
  using (public.has_pos_role(array['manager','admin'])) with check (public.has_pos_role(array['manager','admin']));

drop policy if exists "categories_read_staff" on public.categories;
create policy "categories_read_staff" on public.categories for select to authenticated
  using (public.has_pos_role(array['cashier','manager','admin']));
drop policy if exists "categories_manager_write" on public.categories;
create policy "categories_manager_write" on public.categories for all to authenticated
  using (public.has_pos_role(array['manager','admin'])) with check (public.has_pos_role(array['manager','admin']));

drop policy if exists "inventory_read_staff" on public.inventory;
create policy "inventory_read_staff" on public.inventory for select to authenticated
  using (public.has_pos_role(array['cashier','manager','admin']));
drop policy if exists "inventory_manager_write" on public.inventory;
create policy "inventory_manager_write" on public.inventory for all to authenticated
  using (public.has_pos_role(array['manager','admin'])) with check (public.has_pos_role(array['manager','admin']));

drop policy if exists "sales_read_own_or_manager" on public.sales;
create policy "sales_read_own_or_manager" on public.sales for select to authenticated
  using (cashier_id = auth.uid() or public.has_pos_role(array['manager','admin']));
drop policy if exists "sale_items_read_own_or_manager" on public.sale_items;
create policy "sale_items_read_own_or_manager" on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id
    and (s.cashier_id = auth.uid() or public.has_pos_role(array['manager','admin']))));
drop policy if exists "payments_read_own_or_manager" on public.payments;
create policy "payments_read_own_or_manager" on public.payments for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id
    and (s.cashier_id = auth.uid() or public.has_pos_role(array['manager','admin']))));

drop policy if exists "stock_movements_read_staff" on public.stock_movements;
create policy "stock_movements_read_staff" on public.stock_movements for select to authenticated
  using (public.has_pos_role(array['cashier','manager','admin']));
drop policy if exists "adjustments_read_own_or_manager" on public.sale_adjustments;
create policy "adjustments_read_own_or_manager" on public.sale_adjustments for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id
    and (s.cashier_id = auth.uid() or public.has_pos_role(array['manager','admin']))));
drop policy if exists "settings_read_staff" on public.pos_settings;
create policy "settings_read_staff" on public.pos_settings for select to authenticated
  using (public.has_pos_role(array['cashier','manager','admin']));
drop policy if exists "settings_manager_write" on public.pos_settings;
create policy "settings_manager_write" on public.pos_settings for all to authenticated
  using (public.has_pos_role(array['manager','admin'])) with check (public.has_pos_role(array['manager','admin']));
drop policy if exists "audit_read_admin" on public.audit_log;
create policy "audit_read_admin" on public.audit_log for select to authenticated
  using (public.has_pos_role(array['manager','admin']));

revoke all on public.profiles, public.categories, public.products, public.inventory,
  public.sales, public.sale_items, public.payments, public.stock_movements,
  public.sale_adjustments, public.pos_settings, public.audit_log from anon, authenticated;
grant select on public.profiles, public.categories, public.products, public.inventory,
  public.sales, public.sale_items, public.payments, public.stock_movements,
  public.sale_adjustments, public.pos_settings, public.audit_log to authenticated;
revoke all on public.profiles, public.categories, public.products, public.inventory, public.sales,
  public.sale_items, public.payments, public.stock_movements, public.sale_adjustments,
  public.pos_settings, public.audit_log from anon;

-- Existing legacy JSON tables are deliberately retained; remove prior open policies.
do $$
begin
  if to_regclass('public.pos_products') is not null then
    execute 'drop policy if exists "Public POS access products" on public.pos_products';
    execute 'drop policy if exists "Authenticated POS staff can access products" on public.pos_products';
    execute 'revoke all on public.pos_products from anon, authenticated';
  end if;
  if to_regclass('public.pos_sales') is not null then
    execute 'drop policy if exists "Public POS access sales" on public.pos_sales';
    execute 'drop policy if exists "Authenticated POS staff can access sales" on public.pos_sales';
    execute 'revoke all on public.pos_sales from anon, authenticated';
  end if;
  if to_regclass('public.pos_stock_logs') is not null then
    execute 'drop policy if exists "Public POS access stock logs" on public.pos_stock_logs';
    execute 'drop policy if exists "Authenticated POS staff can access stock logs" on public.pos_stock_logs';
    execute 'revoke all on public.pos_stock_logs from anon, authenticated';
  end if;
  if to_regclass('public.pos_settings') is not null then
    execute 'drop policy if exists "Public POS access settings" on public.pos_settings';
    execute 'drop policy if exists "Authenticated POS staff can access settings" on public.pos_settings';
    execute 'revoke all on public.pos_settings from anon, authenticated';
  end if;
end $$;
grant select on public.pos_settings to authenticated;

create or replace function public.create_pos_sale(
  p_idempotency_key uuid,
  p_customer_name text,
  p_customer_phone text,
  p_price_type text,
  p_items jsonb,
  p_payment_method text,
  p_amount_paid_cents bigint,
  p_payment_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_id uuid;
  v_sale_number text;
  v_sale_day date := (now() at time zone 'UTC')::date;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_total bigint;
  v_balance bigint;
  v_item jsonb;
  v_product public.products%rowtype;
  v_stock public.inventory%rowtype;
  v_crates integer;
  v_unit bigint;
  v_line bigint;
  v_settings jsonb;
  v_discount_threshold integer;
  v_discount_percent numeric;
  v_sequence bigint;
  v_method text;
  v_paid bigint;
  v_split_total bigint;
begin
  if auth.uid() is null or not public.has_pos_role(array['cashier','manager','admin']) then
    raise exception 'Not authorized';
  end if;
  if p_price_type not in ('retail', 'wholesale') or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Invalid sale';
  end if;
  if p_payment_method not in ('cash','momo','card','credit','split') then
    raise exception 'Invalid payment method';
  end if;
  if exists (select 1 from public.sales where idempotency_key = p_idempotency_key) then
    return (select jsonb_build_object('sale_id', id, 'sale_number', sale_number)
      from public.sales where idempotency_key = p_idempotency_key);
  end if;

  select data into v_settings from public.pos_settings where id = 1;
  v_discount_threshold := coalesce((v_settings->>'bulkDiscountThreshold')::integer, 10);
  v_discount_percent := coalesce((v_settings->>'bulkDiscountPercent')::numeric, 10);

  for v_item in
    select value from jsonb_array_elements(p_items) order by value->>'productId'
  loop
    if (v_item->>'crates') !~ '^[1-9][0-9]*$' then
      raise exception 'Sale quantities must be positive whole crates';
    end if;
    v_crates := (v_item->>'crates')::integer;
    select * into v_product from public.products
      where id = v_item->>'productId' and active for update;
    if not found then raise exception 'Product is missing or inactive'; end if;
    select * into v_stock from public.inventory where product_id = v_product.id for update;
    if not found or v_stock.crates < v_crates then
      raise exception 'Insufficient stock for %', v_product.name;
    end if;
    v_unit := case when p_price_type = 'retail' then v_product.retail_price_cents else v_product.wholesale_price_cents end;
    v_line := v_unit * v_crates;
    v_subtotal := v_subtotal + v_line;
  end loop;
  if v_subtotal < 0 then raise exception 'Invalid total'; end if;
  if (select coalesce(sum((value->>'crates')::integer), 0) from jsonb_array_elements(p_items)) >= v_discount_threshold then
    v_discount := round(v_subtotal * least(greatest(v_discount_percent, 0), 100) / 100.0)::bigint;
  end if;
  v_total := v_subtotal - v_discount;
  v_paid := greatest(0, least(coalesce(p_amount_paid_cents, 0), v_total));
  if p_payment_method in ('momo','card') then v_paid := v_total; end if;
  if p_payment_method = 'credit' then v_paid := 0; end if;
  if p_payment_method = 'split' then
    if jsonb_typeof(p_payment_details->'splitAmounts') <> 'array'
      or jsonb_array_length(p_payment_details->'splitAmounts') <> 2
      or exists(select 1 from jsonb_array_elements(p_payment_details->'splitAmounts') x
        where x->>'method' not in ('cash','momo','card','credit')
          or coalesce((x->>'amountCents')::bigint,-1) < 0) then
      raise exception 'Invalid split payment amounts';
    end if;
    select coalesce(sum((value->>'amountCents')::bigint),0) into v_split_total
      from jsonb_array_elements(p_payment_details->'splitAmounts');
    if v_split_total <> v_total then
      raise exception 'Split amounts must equal the sale total';
    end if;
    select coalesce(sum((value->>'amountCents')::bigint),0) into v_paid
      from jsonb_array_elements(p_payment_details->'splitAmounts') where value->>'method' <> 'credit';
  end if;
  v_balance := v_total - v_paid;
  if v_balance > 0 and coalesce(trim(p_customer_name), '') = '' then
    raise exception 'Customer name is required when a balance is due';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_sale_day::text));
  select count(*) + 1 into v_sequence from public.sales
    where sold_at >= v_sale_day::timestamptz and sold_at < (v_sale_day + 1)::timestamptz;
  v_sale_number := 'SF-' || to_char(v_sale_day, 'YYYYMMDD') || '-' || lpad(v_sequence::text, 3, '0');
  insert into public.sales (sale_number, idempotency_key, cashier_id, customer_name, customer_phone,
    price_type, subtotal_cents, discount_cents, total_cents, amount_paid_cents, balance_due_cents,
    payment_method, payment_details)
  values (v_sale_number, p_idempotency_key, auth.uid(), left(trim(coalesce(p_customer_name,'')), 200),
    left(trim(coalesce(p_customer_phone,'')), 40), p_price_type, v_subtotal, v_discount, v_total,
    v_paid, v_balance, p_payment_method, coalesce(p_payment_details, '{}'::jsonb))
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items) order by value->>'productId'
  loop
    v_crates := (v_item->>'crates')::integer;
    select * into v_product from public.products where id = v_item->>'productId' for update;
    select * into v_stock from public.inventory where product_id = v_product.id for update;
    v_unit := case when p_price_type = 'retail' then v_product.retail_price_cents else v_product.wholesale_price_cents end;
    v_line := v_unit * v_crates;
    insert into public.sale_items (sale_id, product_id, product_name, size_label, crates, unit_price_cents, line_total_cents)
    values (v_sale_id, v_product.id, v_product.name, v_product.size_label, v_crates, v_unit, v_line);
    update public.inventory set crates = crates - v_crates, updated_at = now() where product_id = v_product.id;
    insert into public.stock_movements (product_id, movement_type, crates_delta, previous_crates, new_crates,
      reason, reference, actor_id)
    values (v_product.id, 'sale', -v_crates, v_stock.crates, v_stock.crates - v_crates,
      'Sale', v_sale_number, auth.uid());
  end loop;
  if p_payment_method = 'split' then
    for v_item in select value from jsonb_array_elements(p_payment_details->'splitAmounts')
    loop
      if v_item->>'method' <> 'credit' and (v_item->>'amountCents')::bigint > 0 then
        v_method := case v_item->>'method' when 'momo' then 'mobile_money' else v_item->>'method' end;
        insert into public.payments (sale_id, method, amount_cents, details, received_by)
        values (v_sale_id, v_method, (v_item->>'amountCents')::bigint, v_item, auth.uid());
      end if;
    end loop;
  elsif v_paid > 0 then
    v_method := case p_payment_method when 'momo' then 'mobile_money' else p_payment_method end;
    insert into public.payments (sale_id, method, amount_cents, details, received_by)
    values (v_sale_id, v_method, v_paid, coalesce(p_payment_details, '{}'::jsonb), auth.uid());
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, after_data)
  values (auth.uid(), 'sale.created', 'sale', v_sale_id::text,
    jsonb_build_object('sale_number',v_sale_number,'total_cents',v_total));
  return jsonb_build_object('sale_id',v_sale_id,'sale_number',v_sale_number,'subtotal_cents',v_subtotal,
    'discount_cents',v_discount,'total_cents',v_total,'amount_paid_cents',v_paid,'balance_due_cents',v_balance);
end;
$$;

create or replace function public.adjust_pos_stock(
  p_product_id text, p_delta integer, p_reason text, p_movement_type text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_before integer; v_after integer;
begin
  if auth.uid() is null or not public.has_pos_role(array['manager','admin']) then raise exception 'Not authorized'; end if;
  if p_delta = 0 or length(trim(coalesce(p_reason,''))) = 0
    or p_movement_type not in ('delivery','adjustment') then raise exception 'Invalid stock adjustment'; end if;
  select crates into v_before from public.inventory where product_id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  v_after := v_before + p_delta;
  if v_after < 0 then raise exception 'Stock cannot be negative'; end if;
  update public.inventory set crates=v_after, updated_at=now() where product_id=p_product_id;
  insert into public.stock_movements (product_id,movement_type,crates_delta,previous_crates,new_crates,reason,actor_id)
  values (p_product_id,p_movement_type,p_delta,v_before,v_after,left(trim(p_reason),500),auth.uid());
  insert into public.audit_log (actor_id,action,entity_type,entity_id,before_data,after_data)
  values (auth.uid(),'stock.adjusted','product',p_product_id,jsonb_build_object('crates',v_before),
    jsonb_build_object('crates',v_after,'reason',left(trim(p_reason),500)));
end;
$$;

create or replace function public.save_pos_product(
  p_id text, p_name text, p_size_label text, p_description text,
  p_retail_price_cents bigint, p_wholesale_price_cents bigint,
  p_low_stock_level integer, p_active boolean, p_initial_crates integer
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_before jsonb; v_after jsonb;
begin
  if auth.uid() is null or not public.has_pos_role(array['manager','admin']) then raise exception 'Not authorized'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 120
    or length(trim(coalesce(p_size_label,''))) not between 1 and 80
    or p_retail_price_cents < 0 or p_wholesale_price_cents < 0
    or p_low_stock_level < 0 or p_initial_crates < 0 then
    raise exception 'Invalid product details';
  end if;
  select to_jsonb(p) into v_before from public.products p where id=p_id;
  insert into public.products (id,name,size_label,description,retail_price_cents,wholesale_price_cents,low_stock_level,active)
  values (p_id,trim(p_name),trim(p_size_label),left(coalesce(p_description,''),500),p_retail_price_cents,
    p_wholesale_price_cents,p_low_stock_level,p_active)
  on conflict (id) do update set name=excluded.name,size_label=excluded.size_label,description=excluded.description,
    retail_price_cents=excluded.retail_price_cents,wholesale_price_cents=excluded.wholesale_price_cents,
    low_stock_level=excluded.low_stock_level,active=excluded.active,updated_at=now();
  if v_before is null then
    insert into public.inventory (product_id,crates) values (p_id,p_initial_crates);
    if p_initial_crates > 0 then
      insert into public.stock_movements(product_id,movement_type,crates_delta,previous_crates,new_crates,reason,actor_id)
      values (p_id,'initial_stock',p_initial_crates,0,p_initial_crates,'Initial product stock',auth.uid());
    end if;
  end if;
  select to_jsonb(p) into v_after from public.products p where id=p_id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,before_data,after_data)
  values (auth.uid(),case when v_before is null then 'product.created' else 'product.updated' end,
    'product',p_id,v_before,v_after);
end;
$$;

create or replace function public.save_pos_settings(p_data jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_before jsonb;
begin
  if auth.uid() is null or not public.has_pos_role(array['manager','admin']) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid settings'; end if;
  select data into v_before from public.pos_settings where id=1 for update;
  insert into public.pos_settings(id,data) values(1,p_data)
    on conflict(id) do update set data=excluded.data,updated_at=now();
  insert into public.audit_log(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'settings.updated','settings','1',v_before,p_data);
end;
$$;

create or replace function public.refund_pos_sale(
  p_sale_id uuid, p_amount_cents bigint, p_reason text, p_return_items jsonb, p_void boolean
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_item jsonb;
  v_line public.sale_items%rowtype;
  v_before integer;
  v_after integer;
  v_already_returned integer;
begin
  if auth.uid() is null or not public.has_pos_role(array['manager','admin']) then raise exception 'Not authorized'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if not found or v_sale.status in ('voided','refunded') then raise exception 'Sale cannot be refunded'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'A refund reason is required'; end if;
  if p_amount_cents <= 0 or p_amount_cents > v_sale.total_cents - coalesce(
    (select sum(amount_cents) from public.sale_adjustments where sale_id=p_sale_id and adjustment_type='refund'),0) then
    raise exception 'Refund amount exceeds the remaining sale value';
  end if;
  if p_void and (p_amount_cents <> v_sale.total_cents
    or exists(select 1 from public.sale_adjustments where sale_id=p_sale_id)) then
    raise exception 'Only an unrefunded sale can be voided for its full amount';
  end if;
  if p_void and exists (
    with sold as (
      select product_id, sum(crates)::integer as crates from public.sale_items where sale_id=p_sale_id group by product_id
    ), returned as (
      select value->>'productId' as product_id, sum((value->>'crates')::integer)::integer as crates
      from jsonb_array_elements(coalesce(p_return_items,'[]'::jsonb)) group by value->>'productId'
    )
    select 1 from sold full join returned using(product_id)
    where coalesce(sold.crates,0) <> coalesce(returned.crates,0)
  ) then
    raise exception 'A void must restore every crate on the original sale';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_return_items,'[]'::jsonb))
  loop
    select * into v_line from public.sale_items where sale_id=p_sale_id and product_id=v_item->>'productId';
    if not found or (v_item->>'crates') !~ '^[1-9][0-9]*$'
      then raise exception 'Invalid returned crate quantity'; end if;
    select coalesce(sum((returned.value->>'crates')::integer),0) into v_already_returned
      from public.sale_adjustments prior
      cross join lateral jsonb_array_elements(prior.returned_items) returned(value)
      where prior.sale_id=p_sale_id and returned.value->>'productId'=v_line.product_id;
    if (v_item->>'crates')::integer > v_line.crates - v_already_returned then
      raise exception 'Returned crates exceed the quantity still eligible for return';
    end if;
    select crates into v_before from public.inventory where product_id=v_line.product_id for update;
    v_after := v_before + (v_item->>'crates')::integer;
    update public.inventory set crates=v_after,updated_at=now() where product_id=v_line.product_id;
    insert into public.stock_movements(product_id,movement_type,crates_delta,previous_crates,new_crates,reason,reference,actor_id)
    values(v_line.product_id,'refund',(v_item->>'crates')::integer,v_before,v_after,left(trim(p_reason),500),v_sale.sale_number,auth.uid());
  end loop;
  insert into public.sale_adjustments(sale_id,adjustment_type,amount_cents,reason,returned_items,actor_id)
  values(p_sale_id,case when p_void then 'void' else 'refund' end,p_amount_cents,left(trim(p_reason),500),
    coalesce(p_return_items,'[]'::jsonb),auth.uid());
  update public.sales set status=case when p_void then 'voided'
    when coalesce((select sum(amount_cents) from public.sale_adjustments
      where sale_id=p_sale_id and adjustment_type='refund'),0) >= total_cents then 'refunded'
    else 'partially_refunded' end
  where id=p_sale_id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),case when p_void then 'sale.voided' else 'sale.refunded' end,
    'sale',p_sale_id::text,jsonb_build_object('status',v_sale.status),
    jsonb_build_object('amount_cents',p_amount_cents,'reason',left(trim(p_reason),500)));
end;
$$;

create or replace function public.collect_pos_debt(p_sale_id uuid, p_amount_cents bigint, p_method text, p_reference text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_sale public.sales%rowtype;
begin
  if auth.uid() is null or not public.has_pos_role(array['manager','admin']) then raise exception 'Not authorized'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if not found or v_sale.balance_due_cents <= 0 or p_amount_cents <= 0 or p_amount_cents > v_sale.balance_due_cents
    or p_method not in ('cash','mobile_money','card') then raise exception 'Invalid debt payment'; end if;
  update public.sales set amount_paid_cents=amount_paid_cents+p_amount_cents,
    balance_due_cents=balance_due_cents-p_amount_cents where id=p_sale_id;
  insert into public.payments(sale_id,method,amount_cents,reference,received_by)
    values(p_sale_id,case p_method when 'mobile_money' then 'mobile_money' else p_method end,p_amount_cents,left(coalesce(p_reference,''),100),auth.uid());
  insert into public.audit_log(actor_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'sale.debt_collected','sale',p_sale_id::text,
      jsonb_build_object('balance_due_cents',v_sale.balance_due_cents),
      jsonb_build_object('balance_due_cents',v_sale.balance_due_cents-p_amount_cents));
end;
$$;

create or replace function public.create_pos_profile(p_user_id uuid, p_display_name text, p_role text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_pos_role(array['admin']) then raise exception 'Not authorized'; end if;
  if p_role not in ('cashier','manager')
    or length(trim(coalesce(p_display_name,''))) not between 1 and 120 then
    raise exception 'Invalid staff profile';
  end if;
  insert into public.profiles(id,display_name,role) values(p_user_id,trim(p_display_name),p_role);
  insert into public.audit_log(actor_id,action,entity_type,entity_id,after_data)
    values(auth.uid(),'user.created','profile',p_user_id::text,jsonb_build_object('role',p_role));
end;
$$;

create or replace function public.update_pos_profile(p_target_id uuid, p_role text, p_active boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_before public.profiles%rowtype;
begin
  if auth.uid() is null or not public.has_pos_role(array['manager','admin']) or p_target_id=auth.uid() then
    raise exception 'Not authorized';
  end if;
  select * into v_before from public.profiles where id=p_target_id for update;
  if not found then raise exception 'Staff account not found'; end if;
  if v_before.role='admin' or (public.current_pos_role()='manager' and v_before.role<>'cashier')
    or (p_role is not null and p_role not in ('cashier','manager'))
    or (p_role='manager' and not public.has_pos_role(array['admin'])) then
    raise exception 'You cannot assign that staff role';
  end if;
  update public.profiles set role=coalesce(p_role,role),active=coalesce(p_active,active),updated_at=now()
    where id=p_target_id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'user.updated','profile',p_target_id::text,
    jsonb_build_object('role',v_before.role,'active',v_before.active),
    jsonb_build_object('role',coalesce(p_role,v_before.role),'active',coalesce(p_active,v_before.active)));
end;
$$;

create or replace function public.migrate_local_pos(
  p_settings jsonb, p_products jsonb, p_sales jsonb, p_stock_logs jsonb
)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_product jsonb; v_sale jsonb; v_item jsonb; v_log jsonb;
  v_sale_id uuid; v_product_id text; v_price bigint; v_subtotal bigint; v_paid bigint; v_balance bigint;
  v_inserted integer := 0; v_method text; v_sale_number text;
begin
  if auth.uid() is null or not public.has_pos_role(array['manager','admin']) then raise exception 'Not authorized'; end if;
  perform pg_advisory_xact_lock(8877665546);
  if exists(select 1 from public.products) or exists(select 1 from public.sales) then
    raise exception 'Migration stopped: the shared database already contains products or sales. No data was changed.';
  end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_typeof(p_sales) <> 'array'
    or jsonb_typeof(p_stock_logs) <> 'array' then raise exception 'Invalid local backup format'; end if;

  insert into public.pos_settings(id,data) values(1,coalesce(p_settings,'{}'::jsonb))
    on conflict(id) do nothing;
  for v_product in select value from jsonb_array_elements(p_products)
  loop
    v_product_id := left(v_product->>'id',80);
    if v_product_id is null or v_product_id='' then raise exception 'A local product has no identifier'; end if;
    insert into public.products(id,name,size_label,description,retail_price_cents,wholesale_price_cents,low_stock_level,active)
    values(v_product_id,left(coalesce(v_product->>'name','Product'),120),left(coalesce(v_product->>'sizeLabel','Egg'),80),
      left(coalesce(v_product->>'description',''),500),
      round((v_product->>'retailPrice')::numeric*100)::bigint,
      round((v_product->>'wholesalePrice')::numeric*100)::bigint,
      greatest(0,coalesce((v_product->>'lowStockLevel')::integer,0)),
      coalesce((v_product->>'active')::boolean,true));
    insert into public.inventory(product_id,crates)
    values(v_product_id,greatest(0,coalesce((v_product->>'stock')::integer,0)));
    v_inserted := v_inserted + 1;
  end loop;

  for v_sale in select value from jsonb_array_elements(p_sales)
  loop
    v_sale_id := gen_random_uuid();
    v_sale_number := left(coalesce(nullif(v_sale->>'saleNumber',''),
      'MIG-'||replace(v_sale_id::text,'-','')),80);
    v_subtotal := round((v_sale->>'subtotal')::numeric*100)::bigint;
    v_paid := round((coalesce(v_sale->'paymentDetails'->>'amountPaid','0'))::numeric*100)::bigint;
    v_balance := round((coalesce(v_sale->'paymentDetails'->>'balanceDue',
      greatest(0,(v_sale->>'grandTotal')::numeric-(v_paid/100.0))::text)::numeric)*100)::bigint;
    v_method := case lower(coalesce(v_sale->>'paymentMethod','cash'))
      when 'momo' then 'momo' when 'mobile money' then 'momo' when 'card' then 'card'
      when 'credit' then 'credit' when 'pay later (credit)' then 'credit'
      when 'split' then 'split' else 'cash' end;
    insert into public.sales(sale_number,idempotency_key,cashier_id,customer_name,customer_phone,price_type,
      subtotal_cents,discount_cents,total_cents,amount_paid_cents,balance_due_cents,payment_method,payment_details,sold_at)
    values(v_sale_number,gen_random_uuid(),auth.uid(),left(coalesce(v_sale->>'customerName',''),200),
      left(coalesce(v_sale->>'customerPhone',''),40),
      case when v_sale->>'priceType'='wholesale' then 'wholesale' else 'retail' end,
      greatest(0,v_subtotal),greatest(0,round((coalesce(v_sale->>'discountAmount','0'))::numeric*100)::bigint),
      greatest(0,round((v_sale->>'grandTotal')::numeric*100)::bigint),
      greatest(0,v_paid),greatest(0,v_balance),v_method,coalesce(v_sale->'paymentDetails','{}'::jsonb),
      coalesce(nullif(v_sale->>'timestamp','')::timestamptz,now()))
    returning id into v_sale_id;
    for v_item in select value from jsonb_array_elements(coalesce(v_sale->'items','[]'::jsonb))
    loop
      v_product_id := v_item->>'productId';
      if not exists(select 1 from public.products where id=v_product_id) then
        raise exception 'Sale % refers to missing local product %',v_sale_number,v_product_id;
      end if;
      v_price := round((v_item->>'unitPrice')::numeric*100)::bigint;
      insert into public.sale_items(sale_id,product_id,product_name,size_label,crates,unit_price_cents,line_total_cents)
      values(v_sale_id,v_product_id,left(coalesce(v_item->>'name','Product'),120),
        left(coalesce(v_item->>'sizeLabel',''),80),(v_item->>'crates')::integer,v_price,
        round((v_item->>'lineTotal')::numeric*100)::bigint);
    end loop;
    if v_paid > 0 then
      insert into public.payments(sale_id,method,amount_cents,details,received_by)
      values(v_sale_id,case v_method when 'momo' then 'mobile_money' when 'split' then 'cash' else v_method end,
        v_paid,coalesce(v_sale->'paymentDetails','{}'::jsonb),auth.uid());
    end if;
    v_inserted := v_inserted + 1;
  end loop;

  for v_log in select value from jsonb_array_elements(p_stock_logs)
  loop
    v_product_id := v_log->>'productId';
    if exists(select 1 from public.products where id=v_product_id) then
      insert into public.stock_movements(product_id,movement_type,crates_delta,previous_crates,new_crates,
        reason,reference,actor_id,created_at)
      values(v_product_id,case upper(v_log->>'type')
        when 'DELIVERY' then 'delivery' when 'SALE' then 'sale' when 'INITIAL_STOCK' then 'initial_stock'
        else 'adjustment' end,
        coalesce((v_log->>'cratesChanged')::integer,0),
        greatest(0,coalesce((v_log->>'previousStock')::integer,0)),
        greatest(0,coalesce((v_log->>'newStock')::integer,0)),
        left(coalesce(v_log->>'reason','Local history import'),500),
        left(coalesce(v_log->>'refId',''),100),auth.uid(),
        coalesce(nullif(v_log->>'timestamp','')::timestamptz,now()));
    end if;
  end loop;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'local_data.migrated','database','initial-import',
    jsonb_build_object('products',jsonb_array_length(p_products),'sales',jsonb_array_length(p_sales)));
  return v_inserted;
end;
$$;

grant execute on function public.create_pos_sale(uuid,text,text,text,jsonb,text,bigint,jsonb) to authenticated;
grant execute on function public.adjust_pos_stock(text,integer,text,text) to authenticated;
grant execute on function public.save_pos_product(text,text,text,text,bigint,bigint,integer,boolean,integer) to authenticated;
grant execute on function public.save_pos_settings(jsonb) to authenticated;
grant execute on function public.refund_pos_sale(uuid,bigint,text,jsonb,boolean) to authenticated;
grant execute on function public.collect_pos_debt(uuid,bigint,text,text) to authenticated;
grant execute on function public.create_pos_profile(uuid,text,text) to authenticated;
grant execute on function public.update_pos_profile(uuid,text,boolean) to authenticated;
grant execute on function public.migrate_local_pos(jsonb,jsonb,jsonb,jsonb) to authenticated;
revoke all on function public.create_pos_sale(uuid,text,text,text,jsonb,text,bigint,jsonb) from public, anon;
revoke all on function public.adjust_pos_stock(text,integer,text,text) from public, anon;
revoke all on function public.save_pos_product(text,text,text,text,bigint,bigint,integer,boolean,integer) from public, anon;
revoke all on function public.save_pos_settings(jsonb) from public, anon;
revoke all on function public.refund_pos_sale(uuid,bigint,text,jsonb,boolean) from public, anon;
revoke all on function public.collect_pos_debt(uuid,bigint,text,text) from public, anon;
revoke all on function public.create_pos_profile(uuid,text,text) from public, anon;
revoke all on function public.update_pos_profile(uuid,text,boolean) from public, anon;
revoke all on function public.migrate_local_pos(jsonb,jsonb,jsonb,jsonb) from public, anon;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.bootstrap_pos(jsonb,jsonb,jsonb,jsonb)',
    'public.record_pos_sale(jsonb,text)',
    'public.record_pos_stock_change(text,integer,boolean,text,text,text)',
    'public.mark_pos_sale_paid(text)',
    'public.reset_pos_data(jsonb,jsonb,jsonb)',
    'public.import_pos_backup(jsonb,jsonb,jsonb,jsonb)'
  ] loop
    if to_regprocedure(signature) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', signature);
    end if;
  end loop;
end $$;
