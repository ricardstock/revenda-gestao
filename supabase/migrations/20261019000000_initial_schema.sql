-- Proposta inicial para revisão. Ainda não aplicada a qualquer base de dados.
-- Um utilizador autenticado é o proprietário de todos os registos.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  owner_id uuid primary key references public.profiles (id) on delete restrict,
  locale text not null default 'pt-PT' check (locale = 'pt-PT'),
  currency char(3) not null default 'EUR' check (currency = 'EUR'),
  time_zone text not null default 'Europe/Lisbon',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  sku text,
  name text not null check (length(trim(name)) > 0),
  brand text,
  model text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_owner_id_id_unique unique (owner_id, id),
  constraint products_owner_sku_unique unique (owner_id, sku)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_owner_id_id_unique unique (owner_id, id),
  constraint locations_owner_name_unique unique (owner_id, name)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  email text,
  phone text,
  tax_identifier text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_owner_id_id_unique unique (owner_id, id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  email text,
  phone text,
  tax_identifier text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_owner_id_id_unique unique (owner_id, id)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  supplier_id uuid not null,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
  ordered_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchases_owner_id_id_unique unique (owner_id, id),
  constraint purchases_owner_supplier_fk
    foreign key (owner_id, supplier_id)
    references public.suppliers (owner_id, id) on delete restrict
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  purchase_id uuid not null,
  product_id uuid not null,
  quantity_ordered integer not null check (quantity_ordered > 0),
  expected_unit_cost numeric(12, 2) not null check (expected_unit_cost >= 0),
  notes text,
  created_at timestamptz not null default now(),
  constraint purchase_items_owner_purchase_item_unique
    unique (owner_id, purchase_id, id),
  constraint purchase_items_owner_purchase_fk
    foreign key (owner_id, purchase_id)
    references public.purchases (owner_id, id) on delete restrict,
  constraint purchase_items_owner_product_fk
    foreign key (owner_id, product_id)
    references public.products (owner_id, id) on delete restrict
);

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  purchase_id uuid not null,
  received_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  constraint purchase_receipts_owner_purchase_receipt_unique
    unique (owner_id, purchase_id, id),
  constraint purchase_receipts_owner_purchase_fk
    foreign key (owner_id, purchase_id)
    references public.purchases (owner_id, id) on delete restrict
);

create table public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  purchase_id uuid not null,
  purchase_receipt_id uuid not null,
  purchase_item_id uuid not null,
  product_id uuid not null,
  quantity_received integer not null check (quantity_received > 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  constraint purchase_receipt_items_owner_receipt_item_product_unique
    unique (owner_id, id, product_id),
  constraint purchase_receipt_items_owner_receipt_fk
    foreign key (owner_id, purchase_id, purchase_receipt_id)
    references public.purchase_receipts (owner_id, purchase_id, id) on delete restrict,
  constraint purchase_receipt_items_owner_purchase_item_fk
    foreign key (owner_id, purchase_id, purchase_item_id)
    references public.purchase_items (owner_id, purchase_id, id) on delete restrict,
  constraint purchase_receipt_items_owner_product_fk
    foreign key (owner_id, product_id)
    references public.products (owner_id, id) on delete restrict
);

create table public.inventory_units (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  product_id uuid not null,
  purchase_receipt_item_id uuid,
  current_location_id uuid,
  acquisition_cost numeric(12, 2) not null check (acquisition_cost >= 0),
  operational_status text not null
    check (operational_status in (
      'READY_TO_SHIP',
      'NEEDS_INSPECTION',
      'NOT_FOR_SALE',
      'SOLD',
      'RETURNED_PENDING_REVIEW'
    )),
  serial_number text,
  acquired_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_units_owner_id_id_unique unique (owner_id, id),
  constraint inventory_units_owner_id_product_unique unique (owner_id, id, product_id),
  constraint inventory_units_owner_product_fk
    foreign key (owner_id, product_id)
    references public.products (owner_id, id) on delete restrict,
  constraint inventory_units_owner_receipt_item_fk
    foreign key (owner_id, purchase_receipt_item_id, product_id)
    references public.purchase_receipt_items (owner_id, id, product_id) on delete restrict,
  constraint inventory_units_owner_location_fk
    foreign key (owner_id, current_location_id)
    references public.locations (owner_id, id) on delete restrict
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  customer_id uuid,
  sale_type text not null
    check (sale_type in ('PRIVATE', 'MARGIN', 'VAT23%', 'VAT0%')),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'COMPLETED', 'CANCELLED')),
  sold_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_owner_id_id_unique unique (owner_id, id),
  constraint sales_owner_customer_fk
    foreign key (owner_id, customer_id)
    references public.customers (owner_id, id) on delete restrict,
  constraint sales_completed_at_status_check
    check ((status = 'COMPLETED') = (completed_at is not null))
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  sale_id uuid not null,
  product_id uuid not null,
  quantity integer not null check (quantity > 0),
  unit_sale_price numeric(12, 2) not null check (unit_sale_price >= 0),
  notes text,
  created_at timestamptz not null default now(),
  constraint sale_items_owner_sale_item_unique unique (owner_id, sale_id, id),
  constraint sale_items_owner_sale_product_unique
    unique (owner_id, sale_id, id, product_id),
  constraint sale_items_owner_sale_fk
    foreign key (owner_id, sale_id)
    references public.sales (owner_id, id) on delete restrict,
  constraint sale_items_owner_product_fk
    foreign key (owner_id, product_id)
    references public.products (owner_id, id) on delete restrict
);

create table public.sale_item_units (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  sale_id uuid not null,
  sale_item_id uuid not null,
  inventory_unit_id uuid not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  constraint sale_item_units_owner_id_id_unique unique (owner_id, id),
  constraint sale_item_units_owner_id_product_unique unique (owner_id, id, product_id),
  constraint sale_item_units_owner_unit_unique unique (owner_id, inventory_unit_id),
  constraint sale_item_units_owner_sale_unit_product_unique
    unique (owner_id, sale_id, sale_item_id, inventory_unit_id, product_id),
  constraint sale_item_units_owner_sale_item_fk
    foreign key (owner_id, sale_id, sale_item_id, product_id)
    references public.sale_items (owner_id, sale_id, id, product_id) on delete restrict,
  constraint sale_item_units_owner_inventory_unit_fk
    foreign key (owner_id, inventory_unit_id, product_id)
    references public.inventory_units (owner_id, id, product_id) on delete restrict
);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  sale_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null
    check (method in ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER')),
  paid_at timestamptz not null default now(),
  reference text,
  created_at timestamptz not null default now(),
  constraint sale_payments_one_per_sale unique (owner_id, sale_id),
  constraint sale_payments_owner_sale_fk
    foreign key (owner_id, sale_id)
    references public.sales (owner_id, id) on delete restrict
);

create table public.sale_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  sale_id uuid not null,
  category text not null
    check (category in ('SHIPPING', 'COMMISSION', 'FEE', 'OTHER')),
  description text not null check (length(trim(description)) > 0),
  amount numeric(12, 2) not null check (amount >= 0),
  incurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sale_expenses_owner_id_id_unique unique (owner_id, id),
  constraint sale_expenses_owner_sale_fk
    foreign key (owner_id, sale_id)
    references public.sales (owner_id, id) on delete restrict
);

create table public.product_returns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  sale_id uuid not null,
  status text not null default 'PENDING_REVIEW'
    check (status in ('PENDING_REVIEW', 'APPROVED_FOR_RESALE', 'NOT_RESALEABLE')),
  received_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_returns_owner_sale_return_unique
    unique (owner_id, sale_id, id),
  constraint product_returns_owner_sale_fk
    foreign key (owner_id, sale_id)
    references public.sales (owner_id, id) on delete restrict
);

create table public.product_return_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  product_return_id uuid not null,
  sale_id uuid not null,
  sale_item_id uuid not null,
  inventory_unit_id uuid not null,
  product_id uuid not null,
  resale_approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  constraint product_return_items_owner_id_unique unique (owner_id, id),
  constraint product_return_items_owner_return_item_unique
    unique (owner_id, product_return_id, id),
  constraint product_return_items_owner_sale_fk
    foreign key (owner_id, sale_id, product_return_id)
    references public.product_returns (owner_id, sale_id, id) on delete restrict,
  constraint product_return_items_owner_sale_item_fk
    foreign key (owner_id, sale_id, sale_item_id, product_id)
    references public.sale_items (owner_id, sale_id, id, product_id) on delete restrict,
  constraint product_return_items_owner_inventory_unit_fk
    foreign key (owner_id, inventory_unit_id, product_id)
    references public.inventory_units (owner_id, id, product_id) on delete restrict,
  constraint product_return_items_owner_sold_unit_fk
    foreign key (owner_id, sale_id, sale_item_id, inventory_unit_id, product_id)
    references public.sale_item_units
      (owner_id, sale_id, sale_item_id, inventory_unit_id, product_id)
      on delete restrict
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  sale_id uuid not null,
  product_return_id uuid,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null
    check (method in ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER')),
  refunded_at timestamptz not null default now(),
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  constraint refunds_owner_id_id_unique unique (owner_id, id),
  constraint refunds_owner_sale_fk
    foreign key (owner_id, sale_id)
    references public.sales (owner_id, id) on delete restrict,
  constraint refunds_owner_return_fk
    foreign key (owner_id, sale_id, product_return_id)
    references public.product_returns (owner_id, sale_id, id) on delete restrict
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  inventory_unit_id uuid not null,
  product_id uuid not null,
  movement_type text not null
    check (movement_type in (
      'PURCHASE_RECEIPT',
      'SALE_COMPLETED',
      'RETURN_APPROVED',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'LOCATION_TRANSFER'
    )),
  quantity_delta smallint not null
    check (quantity_delta in (-1, 0, 1)),
  from_location_id uuid,
  to_location_id uuid,
  purchase_receipt_item_id uuid,
  sale_item_unit_id uuid,
  product_return_item_id uuid,
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  constraint stock_movements_owner_id_id_unique unique (owner_id, id),
  constraint stock_movements_owner_unit_fk
    foreign key (owner_id, inventory_unit_id, product_id)
    references public.inventory_units (owner_id, id, product_id) on delete restrict,
  constraint stock_movements_owner_from_location_fk
    foreign key (owner_id, from_location_id)
    references public.locations (owner_id, id) on delete restrict,
  constraint stock_movements_owner_to_location_fk
    foreign key (owner_id, to_location_id)
    references public.locations (owner_id, id) on delete restrict,
  constraint stock_movements_owner_receipt_item_fk
    foreign key (owner_id, purchase_receipt_item_id, product_id)
    references public.purchase_receipt_items (owner_id, id, product_id) on delete restrict,
  constraint stock_movements_owner_sale_unit_fk
    foreign key (owner_id, sale_item_unit_id, product_id)
    references public.sale_item_units (owner_id, id, product_id) on delete restrict,
  constraint stock_movements_owner_return_item_fk
    foreign key (owner_id, product_return_item_id)
    references public.product_return_items (owner_id, id) on delete restrict,
  constraint stock_movements_source_check check (
    (
      movement_type = 'PURCHASE_RECEIPT'
      and quantity_delta = 1
      and purchase_receipt_item_id is not null
      and sale_item_unit_id is null
      and product_return_item_id is null
    )
    or (
      movement_type = 'SALE_COMPLETED'
      and quantity_delta = -1
      and purchase_receipt_item_id is null
      and sale_item_unit_id is not null
      and product_return_item_id is null
    )
    or (
      movement_type = 'RETURN_APPROVED'
      and quantity_delta = 1
      and purchase_receipt_item_id is null
      and sale_item_unit_id is null
      and product_return_item_id is not null
    )
    or (
      movement_type = 'ADJUSTMENT_IN'
      and quantity_delta = 1
      and purchase_receipt_item_id is null
      and sale_item_unit_id is null
      and product_return_item_id is null
    )
    or (
      movement_type = 'ADJUSTMENT_OUT'
      and quantity_delta = -1
      and purchase_receipt_item_id is null
      and sale_item_unit_id is null
      and product_return_item_id is null
    )
    or (
      movement_type = 'LOCATION_TRANSFER'
      and quantity_delta = 0
      and from_location_id is not null
      and to_location_id is not null
      and from_location_id <> to_location_id
      and purchase_receipt_item_id is null
      and sale_item_unit_id is null
      and product_return_item_id is null
    )
  )
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (length(trim(action)) > 0),
  entity_table text not null check (length(trim(entity_table)) > 0),
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  occurred_at timestamptz not null default now()
);

create index products_owner_active_name_idx
  on public.products (owner_id, is_active, name);
create index locations_owner_active_name_idx
  on public.locations (owner_id, is_active, name);
create index suppliers_owner_name_idx
  on public.suppliers (owner_id, name);
create index customers_owner_name_idx
  on public.customers (owner_id, name);
create index purchases_owner_status_ordered_idx
  on public.purchases (owner_id, status, ordered_at desc);
create index purchases_owner_supplier_idx
  on public.purchases (owner_id, supplier_id);
create index purchase_items_owner_purchase_idx
  on public.purchase_items (owner_id, purchase_id);
create index purchase_items_owner_product_idx
  on public.purchase_items (owner_id, product_id);
create index purchase_receipts_owner_purchase_received_idx
  on public.purchase_receipts (owner_id, purchase_id, received_at desc);
create index purchase_receipt_items_owner_item_idx
  on public.purchase_receipt_items (owner_id, purchase_item_id);
create index inventory_units_owner_product_status_idx
  on public.inventory_units (owner_id, product_id, operational_status);
create index inventory_units_owner_location_status_idx
  on public.inventory_units (owner_id, current_location_id, operational_status);
create index inventory_units_owner_receipt_item_idx
  on public.inventory_units (owner_id, purchase_receipt_item_id);
create index sales_owner_status_sold_at_idx
  on public.sales (owner_id, status, sold_at desc);
create index sales_owner_customer_sold_at_idx
  on public.sales (owner_id, customer_id, sold_at desc);
create index sale_items_owner_sale_idx
  on public.sale_items (owner_id, sale_id);
create index sale_items_owner_product_idx
  on public.sale_items (owner_id, product_id);
create index sale_item_units_owner_sale_item_idx
  on public.sale_item_units (owner_id, sale_id, sale_item_id);
create index sale_payments_owner_paid_at_idx
  on public.sale_payments (owner_id, paid_at desc);
create index sale_expenses_owner_sale_incurred_idx
  on public.sale_expenses (owner_id, sale_id, incurred_at desc);
create index product_returns_owner_sale_received_idx
  on public.product_returns (owner_id, sale_id, received_at desc);
create index product_return_items_owner_inventory_unit_idx
  on public.product_return_items (owner_id, inventory_unit_id);
create index refunds_owner_sale_refunded_idx
  on public.refunds (owner_id, sale_id, refunded_at desc);
create index stock_movements_owner_unit_occurred_idx
  on public.stock_movements (owner_id, inventory_unit_id, occurred_at desc);
create index stock_movements_owner_product_occurred_idx
  on public.stock_movements (owner_id, product_id, occurred_at desc);
create index audit_log_owner_entity_occurred_idx
  on public.audit_log (owner_id, entity_table, entity_id, occurred_at desc);

alter table public.profiles enable row level security;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'app_settings',
    'products',
    'locations',
    'suppliers',
    'customers',
    'purchases',
    'purchase_items',
    'purchase_receipts',
    'purchase_receipt_items',
    'inventory_units',
    'sales',
    'sale_items',
    'sale_item_units',
    'sale_payments',
    'sale_expenses',
    'product_returns',
    'product_return_items',
    'refunds',
    'stock_movements'
  ]
  loop
    execute format(
      'alter table public.%I enable row level security',
      table_name
    );
    execute format(
      'create policy "Owner access" on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
      table_name
    );
  end loop;
end;
$$;

alter table public.audit_log enable row level security;
create policy "Users can read their own audit log"
  on public.audit_log for select to authenticated
  using (owner_id = (select auth.uid()));
