create table if not exists public.pos_settings (
  id integer primary key check (id = 1),
  data jsonb not null
);

create table if not exists public.pos_products (
  id text primary key,
  data jsonb not null
);

create table if not exists public.pos_sales (
  id text primary key,
  sale_number text not null unique,
  sold_at timestamptz not null,
  data jsonb not null
);

create table if not exists public.pos_stock_logs (
  id text primary key,
  logged_at timestamptz not null,
  product_id text not null,
  data jsonb not null
);

alter table public.pos_settings enable row level security;
alter table public.pos_products enable row level security;
alter table public.pos_sales enable row level security;
alter table public.pos_stock_logs enable row level security;

drop policy if exists "Authenticated POS staff can access settings" on public.pos_settings;
drop policy if exists "Authenticated POS staff can access products" on public.pos_products;
drop policy if exists "Authenticated POS staff can access sales" on public.pos_sales;
drop policy if exists "Authenticated POS staff can access stock logs" on public.pos_stock_logs;
drop policy if exists "Public POS access settings" on public.pos_settings;
drop policy if exists "Public POS access products" on public.pos_products;
drop policy if exists "Public POS access sales" on public.pos_sales;
drop policy if exists "Public POS access stock logs" on public.pos_stock_logs;

create policy "Public POS access settings"
  on public.pos_settings for all to anon, authenticated
  using (true) with check (true);
create policy "Public POS access products"
  on public.pos_products for all to anon, authenticated
  using (true) with check (true);
create policy "Public POS access sales"
  on public.pos_sales for all to anon, authenticated
  using (true) with check (true);
create policy "Public POS access stock logs"
  on public.pos_stock_logs for all to anon, authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.pos_settings to anon, authenticated;
grant select, insert, update, delete on public.pos_products to anon, authenticated;
grant select, insert, update, delete on public.pos_sales to anon, authenticated;
grant select, insert, update, delete on public.pos_stock_logs to anon, authenticated;

create or replace function public.bootstrap_pos(
  p_settings jsonb,
  p_products jsonb,
  p_sales jsonb,
  p_stock_logs jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product jsonb;
  v_sale jsonb;
  v_log jsonb;
begin
  if auth.role() not in ('anon', 'authenticated') then
    raise exception 'POS access is not enabled for this role';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(8877665544);
  if exists (select 1 from public.pos_settings where id = 1) then
    return;
  end if;

  insert into public.pos_settings (id, data) values (1, p_settings);
  for v_product in select value from jsonb_array_elements(p_products)
  loop
    insert into public.pos_products (id, data)
    values (v_product->>'id', v_product)
    on conflict (id) do nothing;
  end loop;
  for v_sale in select value from jsonb_array_elements(p_sales)
  loop
    insert into public.pos_sales (id, sale_number, sold_at, data)
    values (v_sale->>'id', v_sale->>'saleNumber', (v_sale->>'timestamp')::timestamptz, v_sale)
    on conflict (id) do nothing;
  end loop;
  for v_log in select value from jsonb_array_elements(p_stock_logs)
  loop
    insert into public.pos_stock_logs (id, logged_at, product_id, data)
    values (v_log->>'id', (v_log->>'timestamp')::timestamptz, v_log->>'productId', v_log)
    on conflict (id) do nothing;
  end loop;
end;
$$;

create or replace function public.record_pos_sale(p_sale jsonb, p_cashier text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sale jsonb := p_sale;
  v_item jsonb;
  v_product jsonb;
  v_products jsonb := '[]'::jsonb;
  v_logs jsonb := '[]'::jsonb;
  v_quantity integer;
  v_previous integer;
  v_new_stock integer;
  v_sale_date date := (now() at time zone 'utc')::date;
  v_sale_number text;
  v_sequence integer;
  v_sale_id text := 'SALE-' || gen_random_uuid()::text;
  v_timestamp timestamptz := now();
  v_log jsonb;
begin
  if auth.role() not in ('anon', 'authenticated') then
    raise exception 'POS access is not enabled for this role';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_sale_date::text));
  perform pg_catalog.pg_advisory_xact_lock(8877665545);

  select count(*) + 1 into v_sequence from public.pos_sales
    where sold_at >= v_sale_date::timestamptz
      and sold_at < (v_sale_date + 1)::timestamptz;
  v_sale_number := 'SF-' || to_char(v_sale_date, 'YYYYMMDD') || '-' || lpad(v_sequence::text, 3, '0');

  for v_item in select value from jsonb_array_elements(p_sale->'items')
  loop
    v_quantity := (v_item->>'crates')::integer;
    if v_quantity <= 0 then
      raise exception 'Sale quantities must be positive whole crates';
    end if;

    select data into v_product from public.pos_products
      where id = v_item->>'productId' for update;
    if not found then
      raise exception 'Product % does not exist', v_item->>'name';
    end if;
    v_previous := (v_product->>'stock')::integer;
    if v_previous < v_quantity then
      raise exception 'Insufficient stock for %: % crate(s) available',
        v_product->>'name', v_previous;
    end if;
    v_new_stock := v_previous - v_quantity;
    v_product := pg_catalog.jsonb_set(v_product, '{stock}', to_jsonb(v_new_stock));
    update public.pos_products set data = v_product where id = v_item->>'productId';
    v_products := v_products || pg_catalog.jsonb_build_array(v_product);

    v_log := pg_catalog.jsonb_build_object(
      'id', 'log-' || gen_random_uuid()::text,
      'timestamp', v_timestamp,
      'productId', v_item->>'productId',
      'productName', v_product->>'name',
      'type', 'SALE',
      'cratesChanged', -v_quantity,
      'previousStock', v_previous,
      'newStock', v_new_stock,
      'reason', 'Sale',
      'refId', v_sale_number,
      'cashier', p_cashier
    );
    insert into public.pos_stock_logs (id, logged_at, product_id, data)
    values (v_log->>'id', v_timestamp, v_item->>'productId', v_log);
    v_logs := v_logs || pg_catalog.jsonb_build_array(v_log);
  end loop;

  v_sale := v_sale || pg_catalog.jsonb_build_object(
    'id', v_sale_id,
    'saleNumber', v_sale_number,
    'timestamp', v_timestamp,
    'cashier', p_cashier,
    'status', 'COMPLETED'
  );
  v_sale := pg_catalog.jsonb_set(v_sale, '{items}', coalesce(v_sale->'items', '[]'::jsonb));
  insert into public.pos_sales (id, sale_number, sold_at, data)
  values (v_sale_id, v_sale_number, v_timestamp, v_sale);
  return pg_catalog.jsonb_build_object(
    'sale', v_sale, 'products', v_products, 'logs', v_logs
  );
end;
$$;

create or replace function public.record_pos_stock_change(
  p_product_id text,
  p_quantity integer,
  p_is_target boolean,
  p_type text,
  p_reason text,
  p_cashier text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product jsonb;
  v_previous integer;
  v_new_stock integer;
  v_difference integer;
  v_timestamp timestamptz := now();
  v_log jsonb;
begin
  if auth.role() not in ('anon', 'authenticated') then
    raise exception 'POS access is not enabled for this role';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(8877665545);
  select data into v_product from public.pos_products
    where id = p_product_id for update;
  if not found then
    raise exception 'Product not found';
  end if;
  v_previous := (v_product->>'stock')::integer;
  v_new_stock := case when p_is_target then p_quantity else v_previous + p_quantity end;
  if v_new_stock < 0 then
    raise exception 'Stock cannot be negative';
  end if;
  v_difference := v_new_stock - v_previous;
  if v_difference = 0 then
    return pg_catalog.jsonb_build_object(
      'product', v_product, 'log', null, 'previousStock', v_previous,
      'newStock', v_new_stock, 'difference', 0
    );
  end if;
  v_product := pg_catalog.jsonb_set(v_product, '{stock}', to_jsonb(v_new_stock));
  update public.pos_products set data = v_product where id = p_product_id;
  v_log := pg_catalog.jsonb_build_object(
    'id', 'log-' || gen_random_uuid()::text,
    'timestamp', v_timestamp,
    'productId', p_product_id,
    'productName', v_product->>'name',
    'type', p_type,
    'cratesChanged', v_difference,
    'previousStock', v_previous,
    'newStock', v_new_stock,
    'reason', p_reason,
    'cashier', p_cashier
  );
  insert into public.pos_stock_logs (id, logged_at, product_id, data)
  values (v_log->>'id', v_timestamp, p_product_id, v_log);
  return pg_catalog.jsonb_build_object(
    'product', v_product, 'log', v_log, 'previousStock', v_previous,
    'newStock', v_new_stock, 'difference', v_difference
  );
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.pos_settings;
exception when duplicate_object then
  null;
end;
$$;
do $$
begin
  alter publication supabase_realtime add table public.pos_products;
exception when duplicate_object then
  null;
end;
$$;
do $$
begin
  alter publication supabase_realtime add table public.pos_sales;
exception when duplicate_object then
  null;
end;
$$;
do $$
begin
  alter publication supabase_realtime add table public.pos_stock_logs;
exception when duplicate_object then
  null;
end;
$$;

create or replace function public.mark_pos_sale_paid(p_sale_number text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sale jsonb;
begin
  if auth.role() not in ('anon', 'authenticated') then
    raise exception 'POS access is not enabled for this role';
  end if;
  select data into v_sale from public.pos_sales
    where sale_number = p_sale_number for update;
  if not found then
    raise exception 'Sale not found';
  end if;
  v_sale := v_sale || pg_catalog.jsonb_build_object(
    'status', 'PAID', 'paidTimestamp', now()
  );
  v_sale := pg_catalog.jsonb_set(v_sale, '{paymentDetails}',
    coalesce(v_sale->'paymentDetails', '{}'::jsonb) || pg_catalog.jsonb_build_object(
      'amountPaid', (v_sale->>'grandTotal')::numeric,
      'balanceDue', 0
    ));
  update public.pos_sales set data = v_sale where sale_number = p_sale_number;
  return v_sale;
end;
$$;

create or replace function public.reset_pos_data(
  p_settings jsonb,
  p_products jsonb,
  p_stock_logs jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product jsonb;
  v_log jsonb;
begin
  if auth.role() not in ('anon', 'authenticated') then
    raise exception 'POS access is not enabled for this role';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(8877665545);
  delete from public.pos_sales;
  delete from public.pos_stock_logs;
  delete from public.pos_products;
  delete from public.pos_settings;
  insert into public.pos_settings (id, data) values (1, p_settings);
  for v_product in select value from jsonb_array_elements(p_products)
  loop
    insert into public.pos_products (id, data) values (v_product->>'id', v_product);
  end loop;
  for v_log in select value from jsonb_array_elements(p_stock_logs)
  loop
    insert into public.pos_stock_logs (id, logged_at, product_id, data)
    values (v_log->>'id', (v_log->>'timestamp')::timestamptz, v_log->>'productId', v_log);
  end loop;
end;
$$;

create or replace function public.import_pos_backup(
  p_settings jsonb,
  p_products jsonb,
  p_sales jsonb,
  p_stock_logs jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product jsonb;
  v_sale jsonb;
  v_log jsonb;
begin
  if auth.role() not in ('anon', 'authenticated') then
    raise exception 'POS access is not enabled for this role';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(8877665545);
  delete from public.pos_sales;
  delete from public.pos_stock_logs;
  delete from public.pos_products;
  delete from public.pos_settings;
  insert into public.pos_settings (id, data) values (1, p_settings);
  for v_product in select value from jsonb_array_elements(p_products)
  loop
    insert into public.pos_products (id, data) values (v_product->>'id', v_product);
  end loop;
  for v_sale in select value from jsonb_array_elements(p_sales)
  loop
    insert into public.pos_sales (id, sale_number, sold_at, data)
    values (v_sale->>'id', v_sale->>'saleNumber', (v_sale->>'timestamp')::timestamptz, v_sale);
  end loop;
  for v_log in select value from jsonb_array_elements(p_stock_logs)
  loop
    insert into public.pos_stock_logs (id, logged_at, product_id, data)
    values (v_log->>'id', (v_log->>'timestamp')::timestamptz, v_log->>'productId', v_log);
  end loop;
end;
$$;

revoke all on function public.bootstrap_pos(jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.record_pos_sale(jsonb, text) from public, anon;
revoke all on function public.record_pos_stock_change(text, integer, boolean, text, text, text) from public, anon;
revoke all on function public.mark_pos_sale_paid(text) from public, anon;
revoke all on function public.reset_pos_data(jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.import_pos_backup(jsonb, jsonb, jsonb, jsonb) from public, anon;

grant execute on function public.bootstrap_pos(jsonb, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.record_pos_sale(jsonb, text) to anon, authenticated;
grant execute on function public.record_pos_stock_change(text, integer, boolean, text, text, text) to anon, authenticated;
grant execute on function public.mark_pos_sale_paid(text) to anon, authenticated;
grant execute on function public.reset_pos_data(jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.import_pos_backup(jsonb, jsonb, jsonb, jsonb) to anon, authenticated;
