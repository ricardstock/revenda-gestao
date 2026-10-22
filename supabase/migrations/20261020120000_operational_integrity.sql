-- Integrity, transactional operations and restricted access.
-- This migration has not been applied to any database.

alter table public.sales
  add column total_amount numeric(12, 2),
  add column completion_idempotency_key uuid,
  add column completion_request jsonb,
  add constraint sales_total_amount_check
    check (total_amount is null or total_amount > 0),
  add constraint sales_owner_completion_key_unique
    unique (owner_id, completion_idempotency_key);

alter table public.sale_item_units
  drop constraint sale_item_units_owner_unit_unique,
  add constraint sale_item_units_owner_sale_unit_unique
    unique (owner_id, sale_id, inventory_unit_id),
  add constraint sale_item_units_owner_event_unit_product_unique
    unique (owner_id, id, inventory_unit_id, product_id),
  add constraint sale_item_units_owner_sale_item_inventory_unique
    unique (owner_id, sale_id, sale_item_id, inventory_unit_id);

alter table public.purchase_receipts
  add column idempotency_key uuid,
  add column request_payload jsonb,
  add constraint purchase_receipts_owner_id_unique unique (owner_id, id),
  add constraint purchase_receipts_owner_idempotency_unique
    unique (owner_id, idempotency_key);

alter table public.purchase_items
  add constraint purchase_items_owner_id_unique unique (owner_id, id),
  add constraint purchase_items_owner_purchase_product_unique
    unique (owner_id, purchase_id, id, product_id);

alter table public.inventory_units
  add column internal_identifier text;

alter table public.sale_expenses
  add column idempotency_key uuid,
  add column request_payload jsonb,
  add constraint sale_expenses_owner_idempotency_unique
    unique (owner_id, idempotency_key);

alter table public.refunds
  add column idempotency_key uuid,
  add column request_payload jsonb,
  add constraint refunds_owner_idempotency_unique
    unique (owner_id, idempotency_key);

alter table public.purchase_receipt_items
  add column location_id uuid,
  add constraint purchase_receipt_items_owner_receipt_product_unique
    unique (owner_id, purchase_receipt_id, id, product_id),
  add constraint purchase_receipt_items_owner_receipt_line_unique
    unique (owner_id, purchase_receipt_id, purchase_item_id),
  drop constraint purchase_receipt_items_owner_purchase_item_fk,
  add constraint purchase_receipt_items_owner_purchase_item_product_fk
    foreign key (owner_id, purchase_id, purchase_item_id, product_id)
    references public.purchase_items (owner_id, purchase_id, id, product_id)
    on delete restrict,
  add constraint purchase_receipt_items_owner_location_fk
    foreign key (owner_id, location_id)
    references public.locations (owner_id, id) on delete restrict;

alter table public.product_returns
  add column idempotency_key uuid,
  add column request_payload jsonb,
  add constraint product_returns_owner_id_unique unique (owner_id, id),
  add constraint product_returns_owner_idempotency_unique
    unique (owner_id, idempotency_key);

alter table public.product_return_items
  add column sale_item_unit_id uuid,
  add constraint product_return_items_owner_id_unit_product_unique
    unique (owner_id, id, inventory_unit_id, product_id),
  add constraint product_return_items_owner_sold_assignment_unique
    unique (owner_id, sale_item_unit_id),
  add constraint product_return_items_owner_sale_assignment_fk
    foreign key (owner_id, sale_id, sale_item_id, inventory_unit_id)
    references public.sale_item_units
      (owner_id, sale_id, sale_item_id, inventory_unit_id)
      on delete restrict;

create table public.purchase_overdelivery_approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  purchase_item_id uuid not null,
  additional_quantity integer not null check (additional_quantity > 0),
  reason text not null check (length(trim(reason)) > 0),
  idempotency_key uuid not null,
  request_payload jsonb not null,
  approved_by uuid not null references auth.users (id) on delete restrict,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint purchase_overdelivery_approvals_owner_key_unique
    unique (owner_id, idempotency_key),
  constraint purchase_overdelivery_approvals_owner_item_id_unique
    unique (owner_id, purchase_item_id, id),
  constraint purchase_overdelivery_approvals_owner_item_fk
    foreign key (owner_id, purchase_item_id)
    references public.purchase_items (owner_id, id) on delete restrict
);

alter table public.sale_items
  add constraint sale_items_items_quantity_positive_check
check (quantity > 0);

alter table public.stock_movements
  add column purchase_receipt_id uuid,
  add column idempotency_key uuid,
  add column request_payload jsonb,
  drop constraint stock_movements_movement_type_check,
  add constraint stock_movements_movement_type_check
    check (movement_type in (
      'PURCHASE_RECEIPT',
      'SALE_COMPLETED',
      'RETURN_RECEIVED',
      'RETURN_APPROVED',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'LOCATION_TRANSFER'
    )),
  drop constraint stock_movements_source_check,
  drop constraint stock_movements_owner_receipt_item_fk,
  drop constraint stock_movements_owner_sale_unit_fk,
  drop constraint stock_movements_owner_return_item_fk,
  add constraint stock_movements_owner_receipt_event_fk
    foreign key (
      owner_id, purchase_receipt_id, purchase_receipt_item_id, product_id
    )
    references public.purchase_receipt_items
      (owner_id, purchase_receipt_id, id, product_id) on delete restrict,
  add constraint stock_movements_owner_sale_event_fk
    foreign key (owner_id, sale_item_unit_id, inventory_unit_id, product_id)
    references public.sale_item_units
      (owner_id, id, inventory_unit_id, product_id) on delete restrict,
  add constraint stock_movements_owner_return_event_fk
    foreign key (
      owner_id, product_return_item_id, inventory_unit_id, product_id
    )
    references public.product_return_items
      (owner_id, id, inventory_unit_id, product_id) on delete restrict,
  add constraint stock_movements_source_check check (
    (
      movement_type = 'PURCHASE_RECEIPT'
      and quantity_delta = 1
      and purchase_receipt_id is not null
      and purchase_receipt_item_id is not null
      and sale_item_unit_id is null
      and product_return_item_id is null
    )
    or (
      movement_type = 'SALE_COMPLETED'
      and quantity_delta = -1
      and purchase_receipt_id is null
      and purchase_receipt_item_id is null
      and sale_item_unit_id is not null
      and product_return_item_id is null
    )
    or (
      movement_type = 'RETURN_RECEIVED'
      and quantity_delta = 0
      and purchase_receipt_id is null
      and purchase_receipt_item_id is null
      and sale_item_unit_id is null
      and product_return_item_id is not null
    )
    or (
      movement_type = 'RETURN_APPROVED'
      and quantity_delta = 1
      and purchase_receipt_id is null
      and purchase_receipt_item_id is null
      and sale_item_unit_id is null
      and product_return_item_id is not null
    )
    or (
      movement_type = 'ADJUSTMENT_IN'
      and quantity_delta = 1
      and purchase_receipt_id is null
      and purchase_receipt_item_id is null
      and sale_item_unit_id is null
      and product_return_item_id is null
    )
    or (
      movement_type = 'ADJUSTMENT_OUT'
      and quantity_delta = -1
      and purchase_receipt_id is null
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
      and purchase_receipt_id is null
      and purchase_receipt_item_id is null
      and sale_item_unit_id is null
      and product_return_item_id is null
    )
  );

create unique index stock_movements_purchase_unit_once_idx
  on public.stock_movements (owner_id, inventory_unit_id)
  where movement_type = 'PURCHASE_RECEIPT';
create unique index stock_movements_sale_assignment_once_idx
  on public.stock_movements (owner_id, sale_item_unit_id)
  where sale_item_unit_id is not null;
create unique index stock_movements_return_item_once_idx
  on public.stock_movements (owner_id, product_return_item_id, movement_type)
  where product_return_item_id is not null;
create unique index stock_movements_owner_idempotency_unique
  on public.stock_movements (owner_id, idempotency_key)
  where idempotency_key is not null;
create unique index inventory_units_owner_internal_identifier_idx
  on public.inventory_units (owner_id, internal_identifier)
  where internal_identifier is not null;
create unique index inventory_units_owner_serial_number_idx
  on public.inventory_units (owner_id, serial_number)
  where serial_number is not null;
create index purchase_overdelivery_approvals_item_idx
  on public.purchase_overdelivery_approvals (owner_id, purchase_item_id);

alter table public.purchase_overdelivery_approvals enable row level security;
create policy "Owners can read overdelivery approvals"
  on public.purchase_overdelivery_approvals
  for select to authenticated
  using (owner_id = (select auth.uid()));

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), '')
  );

  insert into public.app_settings (owner_id)
  values (new.id);

  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_record jsonb;
  new_record jsonb;
  row_owner uuid;
  row_id uuid;
  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new_record := pg_catalog.to_jsonb(new);
    row_owner := (new_record ->> 'owner_id')::uuid;
    row_id := coalesce(
      (new_record ->> 'id')::uuid,
      (new_record ->> 'owner_id')::uuid
    );
  elsif tg_op = 'UPDATE' then
    old_record := pg_catalog.to_jsonb(old);
    new_record := pg_catalog.to_jsonb(new);
    row_owner := (new_record ->> 'owner_id')::uuid;
    row_id := coalesce(
      (new_record ->> 'id')::uuid,
      (new_record ->> 'owner_id')::uuid
    );
  else
    old_record := pg_catalog.to_jsonb(old);
    row_owner := (old_record ->> 'owner_id')::uuid;
    row_id := coalesce(
      (old_record ->> 'id')::uuid,
      (old_record ->> 'owner_id')::uuid
    );
  end if;

  if row_owner is null then
    raise exception 'Não foi possível determinar o proprietário para a auditoria'
      using errcode = '23514';
  end if;

  insert into public.audit_log (
    owner_id,
    actor_user_id,
    action,
    entity_table,
    entity_id,
    old_values,
    new_values
  )
  values (
    row_owner,
    actor,
    tg_op,
    tg_table_name,
    row_id,
    old_record,
    new_record
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.write_audit_log() from public, anon, authenticated;

create or replace function public.guard_sale_item_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_owner uuid;
  parent_sale uuid;
  parent_status text;
begin
  if tg_op = 'UPDATE'
     and (new.owner_id, new.sale_id) is distinct from (old.owner_id, old.sale_id) then
    raise exception 'Não é permitido mover uma linha para outra venda'
      using errcode = '23514';
  end if;

  parent_owner := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  parent_sale := case when tg_op = 'DELETE' then old.sale_id else new.sale_id end;

  select status into parent_status
    from public.sales
   where owner_id = parent_owner and id = parent_sale
   for update;

  if not found or parent_status <> 'PENDING' then
    raise exception 'Só é possível alterar artigos de uma venda pendente'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.guard_purchase_item_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_owner uuid;
  parent_purchase uuid;
  parent_status text;
begin
  if tg_op = 'UPDATE'
     and (new.owner_id, new.purchase_id) is distinct from
         (old.owner_id, old.purchase_id) then
    raise exception 'Não é permitido mover uma linha para outra compra'
      using errcode = '23514';
  end if;

  parent_owner := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  parent_purchase := case when tg_op = 'DELETE' then old.purchase_id else new.purchase_id end;

  select status into parent_status
    from public.purchases
   where owner_id = parent_owner and id = parent_purchase
   for update;

  if not found or parent_status <> 'OPEN' then
    raise exception 'Só é possível alterar artigos de uma compra ainda aberta'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_sale_item_draft() from public, anon, authenticated;
revoke all on function public.guard_purchase_item_draft() from public, anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'app_settings',
    'products',
    'locations',
    'suppliers',
    'customers',
    'purchases',
    'inventory_units',
    'sales',
    'product_returns'
  ]
  loop
    execute pg_catalog.format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

create trigger guard_sale_item_draft
  before insert or update or delete on public.sale_items
  for each row execute function public.guard_sale_item_draft();
create trigger guard_purchase_item_draft
  before insert or update or delete on public.purchase_items
  for each row execute function public.guard_purchase_item_draft();

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
    'purchase_overdelivery_approvals',
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
    execute pg_catalog.format(
      'create trigger audit_row_changes after insert or update or delete on public.%I for each row execute function public.write_audit_log()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.approve_purchase_overdelivery(
  p_purchase_item_id uuid,
  p_additional_quantity integer,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  purchase_owner uuid;
  purchase_state text;
  existing_id uuid;
  approval_id uuid;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  if p_additional_quantity is null or p_additional_quantity <= 0
     or p_idempotency_key is null
     or p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) = 0 then
    raise exception 'A quantidade, a justificação e a chave de idempotência são obrigatórias'
      using errcode = '22023';
  end if;

  select p.owner_id, p.status
    into purchase_owner, purchase_state
    from public.purchase_items pi
    join public.purchases p
      on p.owner_id = pi.owner_id and p.id = pi.purchase_id
   where pi.owner_id = actor and pi.id = p_purchase_item_id
   for update of p, pi;

  if not found then
    raise exception 'Linha de compra não encontrada'
      using errcode = 'P0002';
  end if;

  select id into existing_id
    from public.purchase_overdelivery_approvals
   where owner_id = actor and idempotency_key = p_idempotency_key;
  if existing_id is not null then
    if not exists (
      select 1
        from public.purchase_overdelivery_approvals a
       where a.owner_id = actor
         and a.id = existing_id
         and a.request_payload = pg_catalog.jsonb_build_object(
           'purchase_item_id', p_purchase_item_id,
           'additional_quantity', p_additional_quantity,
           'reason', p_reason
         )
    ) then
      raise exception 'Chave de idempotência reutilizada com dados diferentes'
        using errcode = '23505';
    end if;
    return existing_id;
  end if;

  if purchase_state not in ('OPEN', 'PARTIALLY_RECEIVED') then
    raise exception 'Só é possível aprovar excedente numa compra aberta'
      using errcode = '23514';
  end if;

  insert into public.purchase_overdelivery_approvals (
    owner_id, purchase_item_id, additional_quantity, reason,
    idempotency_key, request_payload, approved_by
  )
  values (
    purchase_owner, p_purchase_item_id, p_additional_quantity, p_reason,
    p_idempotency_key,
    pg_catalog.jsonb_build_object(
      'purchase_item_id', p_purchase_item_id,
      'additional_quantity', p_additional_quantity,
      'reason', p_reason
    ),
    actor
  )
  returning id into approval_id;

  return approval_id;
end;
$$;

create or replace function public.register_purchase_receipt(
  p_purchase_id uuid,
  p_receipt_items jsonb,
  p_idempotency_key uuid,
  p_received_at timestamptz default now(),
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  purchase_state text;
  receipt_id uuid;
  receipt_line_id uuid;
  line jsonb;
  item_id uuid;
  item_product_id uuid;
  received_quantity integer;
  line_unit_cost numeric(12, 2);
  line_location_id uuid;
  unit_detail jsonb;
  ordered_quantity integer;
  already_received bigint;
  approved_extra bigint;
  received_total bigint;
  all_lines_received boolean;
  existing_payload jsonb;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  if p_purchase_id is null or p_idempotency_key is null
     or p_received_at is null
     or p_receipt_items is null
     or pg_catalog.jsonb_typeof(p_receipt_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_receipt_items) = 0 then
    raise exception 'Compra, chave de idempotência e linhas de receção são obrigatórias'
      using errcode = '22023';
  end if;

  select status into purchase_state
    from public.purchases
   where owner_id = actor and id = p_purchase_id
   for update;
  if not found then
    raise exception 'Compra não encontrada'
      using errcode = 'P0002';
  end if;

  select id, request_payload into receipt_id, existing_payload
    from public.purchase_receipts
   where owner_id = actor and idempotency_key = p_idempotency_key;
  if receipt_id is not null then
    if existing_payload is distinct from pg_catalog.jsonb_build_object(
      'purchase_id', p_purchase_id,
      'receipt_items', p_receipt_items,
      'received_at', p_received_at,
      'notes', p_notes
    ) then
      raise exception 'Chave de idempotência reutilizada com dados diferentes'
        using errcode = '23505';
    end if;
    return receipt_id;
  end if;

  if purchase_state not in ('OPEN', 'PARTIALLY_RECEIVED') then
    raise exception 'A compra não aceita novas receções'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_receipt_items) as e(value)
     where pg_catalog.jsonb_typeof(e.value) <> 'object'
        or not (e.value ? 'purchase_item_id')
        or not (e.value ? 'quantity_received')
        or not (e.value ? 'unit_cost')
  ) then
    raise exception 'Cada linha deve indicar produto comprado, quantidade e custo unitário'
      using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(*) <>
           pg_catalog.count(distinct (e.value ->> 'purchase_item_id')::uuid)
      from pg_catalog.jsonb_array_elements(p_receipt_items) as e(value)
  ) then
    raise exception 'Uma receção não pode repetir a mesma linha de compra'
      using errcode = '22023';
  end if;

  insert into public.purchase_receipts (
    owner_id, purchase_id, idempotency_key, request_payload, received_at, notes
  )
  values (
    actor, p_purchase_id, p_idempotency_key,
    pg_catalog.jsonb_build_object(
      'purchase_id', p_purchase_id,
      'receipt_items', p_receipt_items,
      'received_at', p_received_at,
      'notes', p_notes
    ),
    p_received_at, p_notes
  )
  returning id into receipt_id;

  for line in select value from pg_catalog.jsonb_array_elements(p_receipt_items)
  loop
    item_id := (line ->> 'purchase_item_id')::uuid;
    received_quantity := (line ->> 'quantity_received')::integer;
    line_unit_cost := (line ->> 'unit_cost')::numeric(12, 2);
    line_location_id := nullif(line ->> 'location_id', '')::uuid;

    if received_quantity is null or received_quantity <= 0
       or line_unit_cost is null or line_unit_cost < 0 then
      raise exception 'Quantidade e custo da receção inválidos'
        using errcode = '22023';
    end if;

    select pi.product_id, pi.quantity_ordered
      into item_product_id, ordered_quantity
      from public.purchase_items pi
     where pi.owner_id = actor
       and pi.purchase_id = p_purchase_id
       and pi.id = item_id
     for update;
    if not found then
      raise exception 'A linha recebida não pertence à compra indicada'
        using errcode = '23503';
    end if;

    if line_location_id is not null and not exists (
      select 1 from public.locations l
       where l.owner_id = actor and l.id = line_location_id and l.is_active
    ) then
      raise exception 'A localização indicada não existe ou está inativa'
        using errcode = '23503';
    end if;
    if line ? 'units' then
      if pg_catalog.jsonb_typeof(line -> 'units') <> 'array'
         or pg_catalog.jsonb_array_length(line -> 'units') <> received_quantity
         or exists (
           select 1
             from pg_catalog.jsonb_array_elements(line -> 'units') as unit(value)
            where pg_catalog.jsonb_typeof(unit.value) <> 'object'
              or (
                unit.value ? 'unit_cost'
                and (
                  (unit.value ->> 'unit_cost')::numeric(12, 2) < 0
                  or (unit.value ->> 'unit_cost')::numeric(12, 2) is null
                )
              )
         ) then
        raise exception 'Os detalhes individuais têm de ser objetos válidos e corresponder à quantidade recebida'
          using errcode = '22023';
      end if;
    end if;

    select coalesce(pg_catalog.sum(pri.quantity_received), 0)
      into already_received
      from public.purchase_receipt_items pri
     where pri.owner_id = actor and pri.purchase_item_id = item_id;

    select coalesce(pg_catalog.sum(approval.additional_quantity), 0)
      into approved_extra
      from public.purchase_overdelivery_approvals approval
     where approval.owner_id = actor and approval.purchase_item_id = item_id;

    if already_received + received_quantity > ordered_quantity + approved_extra then
      raise exception 'A quantidade excede a encomenda e qualquer excedente aprovado'
        using errcode = '23514';
    end if;

    insert into public.purchase_receipt_items (
      owner_id, purchase_id, purchase_receipt_id, purchase_item_id,
      product_id, quantity_received, unit_cost, location_id
    )
    values (
      actor, p_purchase_id, receipt_id, item_id,
      item_product_id, received_quantity, line_unit_cost, line_location_id
    )
    returning id into receipt_line_id;

    if line ? 'units' then
      for unit_detail in
        select value from pg_catalog.jsonb_array_elements(line -> 'units')
      loop
        insert into public.inventory_units (
          owner_id, product_id, purchase_receipt_item_id, current_location_id,
          acquisition_cost, operational_status, internal_identifier, serial_number
        )
        values (
          actor, item_product_id, receipt_line_id, line_location_id,
          coalesce((unit_detail ->> 'unit_cost')::numeric(12, 2), line_unit_cost),
          'READY_TO_SHIP',
          nullif(pg_catalog.btrim(unit_detail ->> 'internal_identifier'), ''),
          nullif(pg_catalog.btrim(unit_detail ->> 'serial_number'), '')
        );
      end loop;
    else
      insert into public.inventory_units (
        owner_id, product_id, purchase_receipt_item_id, current_location_id,
        acquisition_cost, operational_status
      )
      select actor, item_product_id, receipt_line_id, line_location_id,
             line_unit_cost, 'READY_TO_SHIP'
        from pg_catalog.generate_series(1, received_quantity);
    end if;

    insert into public.stock_movements (
      owner_id, inventory_unit_id, product_id, movement_type, quantity_delta,
      to_location_id, purchase_receipt_id, purchase_receipt_item_id, notes
    )
    select actor, iu.id, item_product_id, 'PURCHASE_RECEIPT', 1,
           line_location_id, receipt_id, receipt_line_id, p_notes
      from public.inventory_units iu
     where iu.owner_id = actor
       and iu.purchase_receipt_item_id = receipt_line_id;
  end loop;

  select not exists (
    select 1
      from public.purchase_items pi
     where pi.owner_id = actor
       and pi.purchase_id = p_purchase_id
       and (
         select coalesce(pg_catalog.sum(pri.quantity_received), 0)
           from public.purchase_receipt_items pri
          where pri.owner_id = actor and pri.purchase_item_id = pi.id
       ) < pi.quantity_ordered + (
         select coalesce(pg_catalog.sum(approval.additional_quantity), 0)
           from public.purchase_overdelivery_approvals approval
          where approval.owner_id = actor
            and approval.purchase_item_id = pi.id
       )
  )
  into all_lines_received;

  update public.purchases
     set status = case when all_lines_received then 'RECEIVED'
                       else 'PARTIALLY_RECEIVED' end,
         updated_at = pg_catalog.now()
   where owner_id = actor and id = p_purchase_id;

  return receipt_id;
end;
$$;

create or replace function public.complete_sale(
  p_sale_id uuid,
  p_unit_assignments jsonb,
  p_payment_method text,
  p_idempotency_key uuid,
  p_payment_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sale_owner uuid;
  sale_state text;
  declared_total numeric(12, 2);
  existing_key uuid;
  existing_request jsonb;
  item jsonb;
  sale_line_id uuid;
  unit_id uuid;
  item_product_id uuid;
  expected_quantity integer;
  assigned_count bigint;
  movement_location uuid;
  payment_id uuid;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  if p_sale_id is null or p_idempotency_key is null
     or p_payment_method is null
     or p_payment_method not in ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER')
     or p_unit_assignments is null
     or pg_catalog.jsonb_typeof(p_unit_assignments) <> 'array'
     or pg_catalog.jsonb_array_length(p_unit_assignments) = 0 then
    raise exception 'Venda, método de pagamento, chave e unidades são obrigatórios'
      using errcode = '22023';
  end if;

  select owner_id, status, total_amount, completion_idempotency_key,
         completion_request
    into sale_owner, sale_state, declared_total, existing_key, existing_request
    from public.sales
   where owner_id = actor and id = p_sale_id
   for update;
  if not found then
    raise exception 'Venda não encontrada'
      using errcode = 'P0002';
  end if;

  if sale_state = 'COMPLETED' then
    if existing_key = p_idempotency_key then
      if existing_request is distinct from pg_catalog.jsonb_build_object(
        'sale_id', p_sale_id,
        'unit_assignments', p_unit_assignments,
        'payment_method', p_payment_method,
        'payment_reference', p_payment_reference
      ) then
        raise exception 'Chave de idempotência reutilizada com dados diferentes'
          using errcode = '23505';
      end if;
      return p_sale_id;
    end if;
    raise exception 'A venda já foi concluída com outra chave de idempotência'
      using errcode = '23505';
  end if;
  if sale_state <> 'PENDING' then
    raise exception 'Só é possível concluir uma venda pendente'
      using errcode = '23514';
  end if;
  if declared_total is null or declared_total <= 0 then
    raise exception 'O total a pagar confirmado é obrigatório antes da conclusão'
      using errcode = '23514';
  end if;
  if pg_catalog.jsonb_typeof(p_unit_assignments) <> 'array'
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(p_unit_assignments) as e(value)
        where pg_catalog.jsonb_typeof(e.value) <> 'object'
           or not (e.value ? 'sale_item_id')
           or not (e.value ? 'inventory_unit_ids')
           or pg_catalog.jsonb_typeof(e.value -> 'inventory_unit_ids') <> 'array'
     ) then
    raise exception 'Cada linha deve conter o identificador da venda e a lista de unidades'
      using errcode = '22023';
  end if;

  perform 1
    from public.sale_items si
   where si.owner_id = actor and si.sale_id = p_sale_id
   order by si.id
   for update;

  if (
    select pg_catalog.count(*) <>
           pg_catalog.count(distinct (e.value ->> 'sale_item_id')::uuid)
      from pg_catalog.jsonb_array_elements(p_unit_assignments) as e(value)
  ) then
    raise exception 'Uma linha de venda não pode ser repetida nas associações'
      using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct unit_ids.id::uuid)
      from pg_catalog.jsonb_array_elements(p_unit_assignments) as e(value)
      cross join lateral pg_catalog.jsonb_array_elements_text(
        e.value -> 'inventory_unit_ids'
      ) as unit_ids(id)
  ) then
    raise exception 'Uma unidade não pode ser repetida na mesma conclusão'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.sale_items si
      left join (
        select (e.value ->> 'sale_item_id')::uuid as sale_item_id,
               pg_catalog.count(unit_ids.id) as assigned_quantity
          from pg_catalog.jsonb_array_elements(p_unit_assignments) as e(value)
          left join lateral pg_catalog.jsonb_array_elements_text(
            e.value -> 'inventory_unit_ids'
          ) as unit_ids(id) on true
         group by (e.value ->> 'sale_item_id')::uuid
      ) assigned on assigned.sale_item_id = si.id
     where si.owner_id = actor and si.sale_id = p_sale_id
       and coalesce(assigned.assigned_quantity, 0) <> si.quantity
  ) or exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_unit_assignments) as e(value)
      left join public.sale_items si
        on si.owner_id = actor
       and si.sale_id = p_sale_id
       and si.id = (e.value ->> 'sale_item_id')::uuid
     where si.id is null
  ) then
    raise exception 'Cada linha de venda tem de receber exatamente a quantidade de unidades indicada'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.sale_items si
     where si.owner_id = actor and si.sale_id = p_sale_id
  ) then
    raise exception 'Não é possível concluir uma venda sem artigos'
      using errcode = '23514';
  end if;

  perform 1
    from public.inventory_units iu
   where iu.owner_id = actor
     and iu.id in (
       select unit_ids.id::uuid
         from pg_catalog.jsonb_array_elements(p_unit_assignments) as e(value)
         cross join lateral pg_catalog.jsonb_array_elements_text(
           e.value -> 'inventory_unit_ids'
         ) as unit_ids(id)
     )
   order by iu.id
   for update;

  for item in
    select value
      from pg_catalog.jsonb_array_elements(p_unit_assignments)
     order by value ->> 'sale_item_id'
  loop
    sale_line_id := (item ->> 'sale_item_id')::uuid;
    select product_id, quantity into item_product_id, expected_quantity
      from public.sale_items
     where owner_id = actor and sale_id = p_sale_id and id = sale_line_id;

    for unit_id in
      select value::uuid
        from pg_catalog.jsonb_array_elements_text(item -> 'inventory_unit_ids')
       order by value
    loop
      select current_location_id into movement_location
        from public.inventory_units
       where owner_id = actor and id = unit_id and product_id = item_product_id
         and operational_status = 'READY_TO_SHIP'
       for update;
      if not found then
        raise exception 'Uma unidade não existe, não corresponde ao produto ou não está disponível'
          using errcode = '23514';
      end if;

      insert into public.sale_item_units (
        owner_id, sale_id, sale_item_id, inventory_unit_id, product_id
      )
      values (actor, p_sale_id, sale_line_id, unit_id, item_product_id);

      insert into public.stock_movements (
        owner_id, inventory_unit_id, product_id, movement_type,
        quantity_delta, from_location_id, sale_item_unit_id, notes
      )
      select actor, unit_id, item_product_id, 'SALE_COMPLETED',
             -1, movement_location, siu.id, 'Conclusão de venda'
        from public.sale_item_units siu
       where siu.owner_id = actor
         and siu.sale_id = p_sale_id
         and siu.sale_item_id = sale_line_id
         and siu.inventory_unit_id = unit_id;

      update public.inventory_units
         set operational_status = 'SOLD',
             current_location_id = null,
             updated_at = pg_catalog.now()
       where owner_id = actor and id = unit_id;
    end loop;
  end loop;

  insert into public.sale_payments (
    owner_id, sale_id, amount, method, paid_at, reference
  )
  select actor, p_sale_id, remaining.amount, p_payment_method,
         pg_catalog.now(), p_payment_reference
    from (
      select declared_total - coalesce(pg_catalog.sum(p.amount), 0) as amount
        from public.sale_payments p
       where p.owner_id = actor and p.sale_id = p_sale_id
    ) remaining
   where remaining.amount > 0
  returning id into payment_id;

  update public.sales
     set status = 'COMPLETED',
         completed_at = pg_catalog.now(),
         completion_idempotency_key = p_idempotency_key,
     completion_request = pg_catalog.jsonb_build_object(
       'sale_id', p_sale_id,
       'unit_assignments', p_unit_assignments,
       'payment_method', p_payment_method,
       'payment_reference', p_payment_reference
     ),
     updated_at = pg_catalog.now()
   where owner_id = actor and id = p_sale_id;

  return p_sale_id;
end;
$$;

create or replace function public.register_product_return(
  p_sale_item_unit_id uuid,
  p_idempotency_key uuid,
  p_received_at timestamptz default now(),
  p_location_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sale_id_value uuid;
  sale_item_id_value uuid;
  unit_id uuid;
  product_id_value uuid;
  unit_status text;
  return_id uuid;
  existing_payload jsonb;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  if p_sale_item_unit_id is null or p_idempotency_key is null or p_received_at is null then
    raise exception 'Unidade vendida, data e chave de idempotência são obrigatórias'
      using errcode = '22023';
  end if;

  select siu.sale_id, siu.sale_item_id, siu.inventory_unit_id, siu.product_id,
         iu.operational_status
    into sale_id_value, sale_item_id_value, unit_id, product_id_value, unit_status
    from public.sale_item_units siu
    join public.inventory_units iu
      on iu.owner_id = siu.owner_id and iu.id = siu.inventory_unit_id
   where siu.owner_id = actor and siu.id = p_sale_item_unit_id
   for update of iu;
  if not found then
    raise exception 'Unidade vendida não encontrada'
      using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.sales s
     where s.owner_id = actor and s.id = sale_id_value and s.status = 'COMPLETED'
  ) then
    raise exception 'Só pode ser devolvida uma unidade de uma venda concluída'
      using errcode = '23514';
  end if;

  select id, request_payload into return_id, existing_payload
    from public.product_returns
   where owner_id = actor and idempotency_key = p_idempotency_key;
  if return_id is not null then
    if existing_payload is distinct from pg_catalog.jsonb_build_object(
      'sale_item_unit_id', p_sale_item_unit_id,
      'received_at', p_received_at,
      'location_id', p_location_id,
      'notes', p_notes
    ) then
      raise exception 'Chave de idempotência reutilizada com dados diferentes'
        using errcode = '23505';
    end if;
    return return_id;
  end if;

  if unit_status <> 'SOLD' then
    raise exception 'A unidade não está num estado que permita registar uma devolução'
      using errcode = '23514';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations l
     where l.owner_id = actor and l.id = p_location_id and l.is_active
  ) then
    raise exception 'A localização indicada não existe ou está inativa'
      using errcode = '23503';
  end if;

  insert into public.product_returns (
    owner_id, sale_id, idempotency_key, request_payload, status, received_at, notes
  )
  values (
    actor, sale_id_value, p_idempotency_key,
    pg_catalog.jsonb_build_object(
      'sale_item_unit_id', p_sale_item_unit_id,
      'received_at', p_received_at,
      'location_id', p_location_id,
      'notes', p_notes
    ),
    'PENDING_REVIEW', p_received_at, p_notes
  )
  returning id into return_id;

  insert into public.product_return_items (
    owner_id, product_return_id, sale_id, sale_item_id, inventory_unit_id,
    product_id, sale_item_unit_id, notes
  )
  values (
    actor, return_id, sale_id_value, sale_item_id_value, unit_id,
    product_id_value, p_sale_item_unit_id, p_notes
  );

  insert into public.stock_movements (
    owner_id, inventory_unit_id, product_id, movement_type, quantity_delta,
    to_location_id, product_return_item_id, notes
  )
  select actor, pri.inventory_unit_id, pri.product_id, 'RETURN_RECEIVED',
         0, p_location_id, pri.id, 'Devolução recebida; aguarda aprovação'
    from public.product_return_items pri
   where pri.owner_id = actor
     and pri.product_return_id = return_id;

  update public.inventory_units
     set operational_status = 'RETURNED_PENDING_REVIEW',
         current_location_id = p_location_id,
         updated_at = pg_catalog.now()
   where owner_id = actor and id = unit_id;

  return return_id;
end;
$$;

create or replace function public.reject_product_return(
  p_return_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  return_item record;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;

  select pri.id, pri.product_return_id, pri.resale_approved_at,
         pr.status as return_status, iu.operational_status as unit_status
    into return_item
    from public.product_return_items pri
    join public.product_returns pr
      on pr.owner_id = pri.owner_id and pr.id = pri.product_return_id
    join public.inventory_units iu
      on iu.owner_id = pri.owner_id and iu.id = pri.inventory_unit_id
   where pri.owner_id = actor and pri.id = p_return_item_id
   for update of pri, pr, iu;
  if not found then
    raise exception 'Linha de devolução não encontrada'
      using errcode = 'P0002';
  end if;

  if return_item.return_status = 'NOT_RESALEABLE'
     and return_item.unit_status = 'NOT_FOR_SALE' then
    return return_item.id;
  end if;
  if return_item.resale_approved_at is not null
     or return_item.return_status = 'APPROVED_FOR_RESALE' then
    raise exception 'Uma devolução aprovada para revenda não pode ser rejeitada'
      using errcode = '23514';
  end if;
  if return_item.return_status <> 'PENDING_REVIEW'
     or return_item.unit_status <> 'RETURNED_PENDING_REVIEW' then
    raise exception 'A devolução não está pendente de revisão'
      using errcode = '23514';
  end if;

  update public.product_returns
     set status = 'NOT_RESALEABLE',
         updated_at = pg_catalog.now()
   where owner_id = actor and id = return_item.product_return_id;

  update public.inventory_units iu
     set operational_status = 'NOT_FOR_SALE',
         updated_at = pg_catalog.now()
    from public.product_return_items pri
   where pri.owner_id = actor
     and pri.id = return_item.id
     and iu.owner_id = pri.owner_id
     and iu.id = pri.inventory_unit_id;

  return return_item.id;
end;
$$;

create or replace function public.approve_product_return(
  p_return_item_id uuid,
  p_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  return_item record;
  movement_id uuid;
  approved_location_id uuid;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;

  select pri.id, pri.product_return_id, pri.inventory_unit_id, pri.product_id,
         pri.resale_approved_at, iu.operational_status, iu.current_location_id
    into return_item
    from public.product_return_items pri
    join public.inventory_units iu
      on iu.owner_id = pri.owner_id and iu.id = pri.inventory_unit_id
   where pri.owner_id = actor and pri.id = p_return_item_id
   for update of pri, iu;
  if not found then
    raise exception 'Linha de devolução não encontrada'
      using errcode = 'P0002';
  end if;
  if return_item.resale_approved_at is not null then
    select id, to_location_id
      into movement_id, approved_location_id
      from public.stock_movements
     where owner_id = actor
       and product_return_item_id = p_return_item_id
       and movement_type = 'RETURN_APPROVED';
    if movement_id is not null then
      if approved_location_id is distinct from
         coalesce(p_location_id, return_item.current_location_id) then
        raise exception 'A devolução já foi aprovada com outra localização'
          using errcode = '23505';
      end if;
      return movement_id;
    end if;
    raise exception 'Devolução já aprovada sem movimento de stock correspondente'
      using errcode = '23514';
  end if;
  if return_item.operational_status <> 'RETURNED_PENDING_REVIEW' then
    raise exception 'A unidade não está pendente de inspeção de devolução'
      using errcode = '23514';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations l
     where l.owner_id = actor and l.id = p_location_id and l.is_active
  ) then
    raise exception 'A localização indicada não existe ou está inativa'
      using errcode = '23503';
  end if;
  approved_location_id := coalesce(p_location_id, return_item.current_location_id);

  update public.product_return_items
     set resale_approved_at = pg_catalog.now()
   where owner_id = actor and id = p_return_item_id;

  update public.product_returns
     set status = 'APPROVED_FOR_RESALE',
         updated_at = pg_catalog.now()
   where owner_id = actor and id = return_item.product_return_id;

  insert into public.stock_movements (
    owner_id, inventory_unit_id, product_id, movement_type, quantity_delta,
    from_location_id, to_location_id, product_return_item_id, notes
  )
  values (
    actor, return_item.inventory_unit_id, return_item.product_id,
    'RETURN_APPROVED', 1, return_item.current_location_id,
    approved_location_id, p_return_item_id, 'Devolução aprovada para revenda'
  )
  returning id into movement_id;

  update public.inventory_units
     set operational_status = 'READY_TO_SHIP',
         current_location_id = approved_location_id,
         updated_at = pg_catalog.now()
   where owner_id = actor and id = return_item.inventory_unit_id;

  return movement_id;
end;
$$;

create or replace function public.record_sale_expense(
  p_sale_id uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_idempotency_key uuid,
  p_incurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sale_state text;
  expense_id uuid;
  existing_payload jsonb;
  request_value jsonb;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  if p_sale_id is null or p_idempotency_key is null
     or p_category is null
     or p_category not in ('SHIPPING', 'COMMISSION', 'FEE', 'OTHER')
     or p_description is null or pg_catalog.length(pg_catalog.btrim(p_description)) = 0
     or p_amount is null or p_amount < 0
     or p_amount <> pg_catalog.round(p_amount, 2)
     or p_incurred_at is null then
    raise exception 'Os dados da despesa são inválidos'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text || p_idempotency_key::text, 0)
  );
  request_value := pg_catalog.jsonb_build_object(
    'sale_id', p_sale_id,
    'category', p_category,
    'description', p_description,
    'amount', p_amount,
    'incurred_at', p_incurred_at
  );
  select id, request_payload
    into expense_id, existing_payload
    from public.sale_expenses
   where owner_id = actor and idempotency_key = p_idempotency_key;
  if expense_id is not null then
    if existing_payload is distinct from request_value then
      raise exception 'Chave de idempotência reutilizada com dados diferentes'
        using errcode = '23505';
    end if;
    return expense_id;
  end if;

  select status into sale_state
    from public.sales
   where owner_id = actor and id = p_sale_id
   for update;
  if not found then
    raise exception 'Venda não encontrada'
      using errcode = 'P0002';
  end if;
  if sale_state = 'CANCELLED' then
    raise exception 'Não é possível registar despesas numa venda cancelada'
      using errcode = '23514';
  end if;

  insert into public.sale_expenses (
    owner_id, sale_id, category, description, amount, incurred_at,
    idempotency_key, request_payload
  )
  values (
    actor, p_sale_id, p_category, pg_catalog.btrim(p_description),
    p_amount, p_incurred_at, p_idempotency_key, request_value
  )
  returning id into expense_id;
  return expense_id;
end;
$$;

create or replace function public.update_sale_expense(
  p_expense_id uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_incurred_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sale_id_value uuid;
  sale_state text;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  if p_expense_id is null
     or p_category is null
     or p_category not in ('SHIPPING', 'COMMISSION', 'FEE', 'OTHER')
     or p_description is null or pg_catalog.length(pg_catalog.btrim(p_description)) = 0
     or p_amount is null or p_amount < 0
     or p_amount <> pg_catalog.round(p_amount, 2)
     or p_incurred_at is null then
    raise exception 'Os dados da despesa são inválidos'
      using errcode = '22023';
  end if;

  select sale_id into sale_id_value
    from public.sale_expenses
   where owner_id = actor and id = p_expense_id;
  if not found then
    raise exception 'Despesa não encontrada'
      using errcode = 'P0002';
  end if;
  select status into sale_state
    from public.sales
   where owner_id = actor and id = sale_id_value
   for update;
  if not found then
    raise exception 'Venda da despesa não encontrada'
      using errcode = 'P0002';
  end if;
  if sale_state = 'CANCELLED' then
    raise exception 'Não é possível editar despesas de uma venda cancelada'
      using errcode = '23514';
  end if;

  update public.sale_expenses
     set category = p_category,
         description = pg_catalog.btrim(p_description),
         amount = p_amount,
         incurred_at = p_incurred_at
   where owner_id = actor and id = p_expense_id;
  return p_expense_id;
end;
$$;

create or replace function public.register_sale_refund(
  p_sale_id uuid,
  p_amount numeric,
  p_method text,
  p_idempotency_key uuid,
  p_product_return_id uuid default null,
  p_refunded_at timestamptz default now(),
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sale_state text;
  paid_amount numeric(12, 2);
  refunded_amount numeric(12, 2);
  refund_id uuid;
  existing_payload jsonb;
  request_value jsonb;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  if p_sale_id is null or p_idempotency_key is null
     or p_amount is null or p_amount <= 0
     or p_amount <> pg_catalog.round(p_amount, 2)
     or p_method is null
     or p_method not in ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER')
     or p_refunded_at is null then
    raise exception 'Os dados do reembolso são inválidos'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text || p_idempotency_key::text, 0)
  );
  request_value := pg_catalog.jsonb_build_object(
    'sale_id', p_sale_id,
    'amount', p_amount,
    'method', p_method,
    'product_return_id', p_product_return_id,
    'refunded_at', p_refunded_at,
    'reference', p_reference,
    'notes', p_notes
  );
  select id, request_payload
    into refund_id, existing_payload
    from public.refunds
   where owner_id = actor and idempotency_key = p_idempotency_key;
  if refund_id is not null then
    if existing_payload is distinct from request_value then
      raise exception 'Chave de idempotência reutilizada com dados diferentes'
        using errcode = '23505';
    end if;
    return refund_id;
  end if;

  select status into sale_state
    from public.sales
   where owner_id = actor and id = p_sale_id
   for update;
  if not found then
    raise exception 'Venda não encontrada'
      using errcode = 'P0002';
  end if;
  if sale_state <> 'COMPLETED' then
    raise exception 'Só é possível reembolsar uma venda concluída'
      using errcode = '23514';
  end if;
  select coalesce(pg_catalog.sum(amount), 0)
    into paid_amount
    from public.sale_payments
   where owner_id = actor and sale_id = p_sale_id;
  select coalesce(pg_catalog.sum(amount), 0)
    into refunded_amount
    from public.refunds
   where owner_id = actor and sale_id = p_sale_id;
  if p_product_return_id is not null and not exists (
    select 1 from public.product_returns
     where owner_id = actor
       and id = p_product_return_id
       and sale_id = p_sale_id
  ) then
    raise exception 'A devolução indicada não pertence à venda'
      using errcode = '23503';
  end if;
  if paid_amount <= 0 or refunded_amount + p_amount > paid_amount then
    raise exception 'O total de reembolsos não pode exceder o pagamento registado'
      using errcode = '23514';
  end if;

  insert into public.refunds (
    owner_id, sale_id, product_return_id, amount, method, refunded_at,
    reference, notes, idempotency_key, request_payload
  )
  values (
    actor, p_sale_id, p_product_return_id, p_amount, p_method, p_refunded_at,
    p_reference, p_notes, p_idempotency_key, request_value
  )
  returning id into refund_id;
  return refund_id;
end;
$$;

create or replace function public.update_sale_refund(
  p_refund_id uuid,
  p_amount numeric,
  p_method text,
  p_product_return_id uuid,
  p_refunded_at timestamptz,
  p_reference text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sale_id_value uuid;
  sale_state text;
  paid_amount numeric(12, 2);
  other_refunds numeric(12, 2);
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  if p_refund_id is null
     or p_amount is null or p_amount <= 0
     or p_amount <> pg_catalog.round(p_amount, 2)
     or p_method is null
     or p_method not in ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER')
     or p_refunded_at is null then
    raise exception 'Os dados do reembolso são inválidos'
      using errcode = '22023';
  end if;

  select sale_id into sale_id_value
    from public.refunds
   where owner_id = actor and id = p_refund_id;
  if not found then
    raise exception 'Reembolso não encontrado'
      using errcode = 'P0002';
  end if;
  select status into sale_state
    from public.sales
   where owner_id = actor and id = sale_id_value
   for update;
  if not found then
    raise exception 'Venda do reembolso não encontrada'
      using errcode = 'P0002';
  end if;
  if sale_state <> 'COMPLETED' then
    raise exception 'Só é possível editar reembolsos de uma venda concluída'
      using errcode = '23514';
  end if;

  select coalesce(pg_catalog.sum(amount), 0)
    into paid_amount
    from public.sale_payments
   where owner_id = actor and sale_id = sale_id_value;
  select coalesce(pg_catalog.sum(amount), 0)
    into other_refunds
    from public.refunds
   where owner_id = actor and sale_id = sale_id_value
     and id <> p_refund_id;
  if p_product_return_id is not null and not exists (
    select 1 from public.product_returns
     where owner_id = actor
       and id = p_product_return_id
       and sale_id = sale_id_value
  ) then
    raise exception 'A devolução indicada não pertence à venda'
      using errcode = '23503';
  end if;
  if paid_amount <= 0 or other_refunds + p_amount > paid_amount then
    raise exception 'O total de reembolsos não pode exceder o pagamento registado'
      using errcode = '23514';
  end if;

  update public.refunds
     set amount = p_amount,
         method = p_method,
         product_return_id = p_product_return_id,
         refunded_at = p_refunded_at,
         reference = p_reference,
         notes = p_notes
   where owner_id = actor and id = p_refund_id;
  return p_refund_id;
end;
$$;

create or replace function public.cancel_sale(p_sale_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sale_state text;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  select status into sale_state
    from public.sales
   where owner_id = actor and id = p_sale_id
   for update;
  if not found then
    raise exception 'Venda não encontrada'
      using errcode = 'P0002';
  end if;
  if sale_state = 'CANCELLED' then
    return p_sale_id;
  end if;
  if sale_state <> 'PENDING'
     or exists (
       select 1 from public.sale_item_units
        where owner_id = actor and sale_id = p_sale_id
     )
     or exists (
       select 1 from public.sale_payments
        where owner_id = actor and sale_id = p_sale_id
     )
     or exists (
       select 1 from public.product_returns
        where owner_id = actor and sale_id = p_sale_id
     )
     or exists (
       select 1 from public.refunds
        where owner_id = actor and sale_id = p_sale_id
     ) then
    raise exception 'Só é possível cancelar uma venda pendente sem movimentos irreversíveis'
      using errcode = '23514';
  end if;

  update public.sales
     set status = 'CANCELLED'
   where owner_id = actor and id = p_sale_id;
  return p_sale_id;
end;
$$;

create or replace function public.cancel_purchase(p_purchase_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  purchase_state text;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  select status into purchase_state
    from public.purchases
   where owner_id = actor and id = p_purchase_id
   for update;
  if not found then
    raise exception 'Compra não encontrada'
      using errcode = 'P0002';
  end if;
  if purchase_state = 'CANCELLED' then
    return p_purchase_id;
  end if;
  if purchase_state <> 'OPEN'
     or exists (
       select 1 from public.purchase_receipts
        where owner_id = actor and purchase_id = p_purchase_id
     ) then
    raise exception 'Só é possível cancelar uma compra aberta sem receções'
      using errcode = '23514';
  end if;

  update public.purchases
     set status = 'CANCELLED'
   where owner_id = actor and id = p_purchase_id;
  return p_purchase_id;
end;
$$;

create or replace function public.register_stock_adjustment_in(
  p_product_id uuid,
  p_location_id uuid,
  p_acquisition_cost numeric,
  p_reason text,
  p_idempotency_key uuid,
  p_occurred_at timestamptz default now(),
  p_internal_identifier text default null,
  p_serial_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  inventory_unit_id uuid;
  movement_id uuid;
  existing_payload jsonb;
  request_value jsonb;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  if p_product_id is null or p_location_id is null
     or p_acquisition_cost is null or p_acquisition_cost < 0
     or p_acquisition_cost <> pg_catalog.round(p_acquisition_cost, 2)
     or p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) = 0
     or p_idempotency_key is null or p_occurred_at is null then
    raise exception 'Os dados do ajuste de entrada são inválidos'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text || p_idempotency_key::text, 0)
  );
  request_value := pg_catalog.jsonb_build_object(
    'product_id', p_product_id,
    'location_id', p_location_id,
    'acquisition_cost', p_acquisition_cost,
    'reason', p_reason,
    'occurred_at', p_occurred_at,
    'internal_identifier', p_internal_identifier,
    'serial_number', p_serial_number
  );
  select sm.id, sm.inventory_unit_id, sm.request_payload
    into movement_id, inventory_unit_id, existing_payload
    from public.stock_movements sm
   where sm.owner_id = actor and sm.idempotency_key = p_idempotency_key;
  if movement_id is not null then
    if existing_payload is distinct from request_value
       or not exists (
         select 1 from public.stock_movements
          where owner_id = actor and id = movement_id
            and movement_type = 'ADJUSTMENT_IN'
       ) then
      raise exception 'Chave de idempotência reutilizada com dados diferentes'
        using errcode = '23505';
    end if;
    return movement_id;
  end if;

  perform 1 from public.products
   where owner_id = actor and id = p_product_id
   for key share;
  if not found then
    raise exception 'Produto não encontrado'
      using errcode = 'P0002';
  end if;
  perform 1 from public.locations
   where owner_id = actor and id = p_location_id and is_active
   for key share;
  if not found then
    raise exception 'A localização indicada não existe ou está inativa'
      using errcode = '23503';
  end if;

  insert into public.inventory_units (
    owner_id, product_id, current_location_id, acquisition_cost,
    operational_status, internal_identifier, serial_number
  )
  values (
    actor, p_product_id, p_location_id, p_acquisition_cost,
    'READY_TO_SHIP', nullif(pg_catalog.btrim(p_internal_identifier), ''),
    nullif(pg_catalog.btrim(p_serial_number), '')
  )
  returning id into inventory_unit_id;

  insert into public.stock_movements (
    owner_id, inventory_unit_id, product_id, movement_type, quantity_delta,
    to_location_id, occurred_at, notes, idempotency_key, request_payload
  )
  values (
    actor, inventory_unit_id, p_product_id, 'ADJUSTMENT_IN', 1,
    p_location_id, p_occurred_at, pg_catalog.btrim(p_reason),
    p_idempotency_key, request_value
  )
  returning id into movement_id;
  return movement_id;
end;
$$;

create or replace function public.register_stock_adjustment_out(
  p_inventory_unit_id uuid,
  p_reason text,
  p_idempotency_key uuid,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  unit_product_id uuid;
  unit_location_id uuid;
  unit_status text;
  movement_id uuid;
  existing_payload jsonb;
  request_value jsonb;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  if p_inventory_unit_id is null or p_idempotency_key is null
     or p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) = 0
     or p_occurred_at is null then
    raise exception 'Os dados do ajuste de saída são inválidos'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text || p_idempotency_key::text, 0)
  );
  request_value := pg_catalog.jsonb_build_object(
    'inventory_unit_id', p_inventory_unit_id,
    'reason', p_reason,
    'occurred_at', p_occurred_at
  );
  select id, request_payload
    into movement_id, existing_payload
    from public.stock_movements
   where owner_id = actor and idempotency_key = p_idempotency_key;
  if movement_id is not null then
    if existing_payload is distinct from request_value
       or not exists (
         select 1 from public.stock_movements
          where owner_id = actor and id = movement_id
            and movement_type = 'ADJUSTMENT_OUT'
       ) then
      raise exception 'Chave de idempotência reutilizada com dados diferentes'
        using errcode = '23505';
    end if;
    return movement_id;
  end if;

  select product_id, current_location_id, operational_status
    into unit_product_id, unit_location_id, unit_status
    from public.inventory_units
   where owner_id = actor and id = p_inventory_unit_id
   for update;
  if not found then
    raise exception 'Unidade de inventário não encontrada'
      using errcode = 'P0002';
  end if;
  if unit_status <> 'READY_TO_SHIP' then
    raise exception 'Só é possível ajustar para saída uma unidade disponível'
      using errcode = '23514';
  end if;

  insert into public.stock_movements (
    owner_id, inventory_unit_id, product_id, movement_type, quantity_delta,
    from_location_id, occurred_at, notes, idempotency_key, request_payload
  )
  values (
    actor, p_inventory_unit_id, unit_product_id, 'ADJUSTMENT_OUT', -1,
    unit_location_id, p_occurred_at, pg_catalog.btrim(p_reason),
    p_idempotency_key, request_value
  )
  returning id into movement_id;

  update public.inventory_units
     set operational_status = 'NOT_FOR_SALE',
         updated_at = pg_catalog.now()
   where owner_id = actor and id = p_inventory_unit_id;
  return movement_id;
end;
$$;

create or replace function public.transfer_inventory_unit(
  p_inventory_unit_id uuid,
  p_to_location_id uuid,
  p_reason text,
  p_idempotency_key uuid,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  unit_product_id uuid;
  from_location_id uuid;
  unit_status text;
  movement_id uuid;
  existing_payload jsonb;
  request_value jsonb;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  if p_inventory_unit_id is null or p_to_location_id is null
     or p_idempotency_key is null
     or p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) = 0
     or p_occurred_at is null then
    raise exception 'Os dados da transferência são inválidos'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text || p_idempotency_key::text, 0)
  );
  request_value := pg_catalog.jsonb_build_object(
    'inventory_unit_id', p_inventory_unit_id,
    'to_location_id', p_to_location_id,
    'reason', p_reason,
    'occurred_at', p_occurred_at
  );
  select id, request_payload
    into movement_id, existing_payload
    from public.stock_movements
   where owner_id = actor and idempotency_key = p_idempotency_key;
  if movement_id is not null then
    if existing_payload is distinct from request_value
       or not exists (
         select 1 from public.stock_movements
          where owner_id = actor and id = movement_id
            and movement_type = 'LOCATION_TRANSFER'
       ) then
      raise exception 'Chave de idempotência reutilizada com dados diferentes'
        using errcode = '23505';
    end if;
    return movement_id;
  end if;

  select product_id, current_location_id, operational_status
    into unit_product_id, from_location_id, unit_status
    from public.inventory_units
   where owner_id = actor and id = p_inventory_unit_id
   for update;
  if not found then
    raise exception 'Unidade de inventário não encontrada'
      using errcode = 'P0002';
  end if;
  if unit_status <> 'READY_TO_SHIP' or from_location_id is null then
    raise exception 'Só é possível transferir uma unidade disponível e localizada'
      using errcode = '23514';
  end if;
  perform 1 from public.locations
   where owner_id = actor and id = p_to_location_id and is_active
   for key share;
  if not found then
    raise exception 'A localização de destino não existe ou está inativa'
      using errcode = '23503';
  end if;
  if from_location_id = p_to_location_id then
    raise exception 'A localização de destino tem de ser diferente da origem'
      using errcode = '22023';
  end if;

  insert into public.stock_movements (
    owner_id, inventory_unit_id, product_id, movement_type, quantity_delta,
    from_location_id, to_location_id, occurred_at, notes,
    idempotency_key, request_payload
  )
  values (
    actor, p_inventory_unit_id, unit_product_id, 'LOCATION_TRANSFER', 0,
    from_location_id, p_to_location_id, p_occurred_at,
    pg_catalog.btrim(p_reason), p_idempotency_key, request_value
  )
  returning id into movement_id;

  update public.inventory_units
     set current_location_id = p_to_location_id,
         updated_at = pg_catalog.now()
   where owner_id = actor and id = p_inventory_unit_id;
  return movement_id;
end;
$$;

-- Users may read their own rows, but sensitive tables are only changed by
-- controlled functions. Draft records remain editable until their first
-- irreversible transition.
revoke all on all tables in schema public from anon, authenticated;
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

grant update (display_name) on public.profiles to authenticated;
grant update (locale, currency, time_zone)
  on public.app_settings to authenticated;
grant insert (id, owner_id, sku, name, brand, model, notes, is_active),
      update (sku, name, brand, model, notes, is_active),
      delete on public.products to authenticated;
grant insert (id, owner_id, name, description, is_active),
      update (name, description, is_active),
      delete on public.locations to authenticated;
grant insert (id, owner_id, name, email, phone, tax_identifier, address, notes, is_active),
      update (name, email, phone, tax_identifier, address, notes, is_active),
      delete on public.suppliers, public.customers to authenticated;
grant insert (id, owner_id, supplier_id, ordered_at, notes),
      update (supplier_id, ordered_at, notes),
      delete on public.purchases to authenticated;
grant insert (id, owner_id, purchase_id, product_id, quantity_ordered,
              expected_unit_cost, notes),
      update (product_id, quantity_ordered, expected_unit_cost, notes),
      delete on public.purchase_items to authenticated;
grant insert (id, owner_id, customer_id, sale_type, sold_at, notes, total_amount),
      update (customer_id, sale_type, sold_at, notes, total_amount),
      delete on public.sales to authenticated;
grant insert (id, owner_id, sale_id, product_id, quantity, unit_sale_price, notes),
      update (product_id, quantity, unit_sale_price, notes),
      delete on public.sale_items to authenticated;

drop policy "Owner access" on public.app_settings;
create policy "Owners can read settings"
  on public.app_settings for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners can update settings"
  on public.app_settings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy "Owner access" on public.products;
create policy "Owners can read products"
  on public.products for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners can manage products"
  on public.products for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy "Owner access" on public.locations;
create policy "Owners can read locations"
  on public.locations for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners can manage locations"
  on public.locations for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy "Owner access" on public.suppliers;
create policy "Owners can read suppliers"
  on public.suppliers for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners can manage suppliers"
  on public.suppliers for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy "Owner access" on public.customers;
create policy "Owners can read customers"
  on public.customers for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners can manage customers"
  on public.customers for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy "Owner access" on public.purchases;
create policy "Owners can read purchases"
  on public.purchases for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners can create open purchases"
  on public.purchases for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'OPEN');
create policy "Owners can edit open purchases"
  on public.purchases for update to authenticated
  using (owner_id = (select auth.uid()) and status = 'OPEN')
  with check (owner_id = (select auth.uid()) and status = 'OPEN');
create policy "Owners can delete open purchases"
  on public.purchases for delete to authenticated
  using (owner_id = (select auth.uid()) and status = 'OPEN');

drop policy "Owner access" on public.purchase_items;
create policy "Owners can read purchase items"
  on public.purchase_items for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners can manage items of open purchases"
  on public.purchase_items for all to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.purchases p
       where p.owner_id = purchase_items.owner_id
         and p.id = purchase_items.purchase_id
         and p.status = 'OPEN'
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.purchases p
       where p.owner_id = purchase_items.owner_id
         and p.id = purchase_items.purchase_id
         and p.status = 'OPEN'
    )
  );

drop policy "Owner access" on public.sales;
create policy "Owners can read sales"
  on public.sales for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners can create pending sales"
  on public.sales for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'PENDING');
create policy "Owners can edit pending sales"
  on public.sales for update to authenticated
  using (owner_id = (select auth.uid()) and status = 'PENDING')
  with check (owner_id = (select auth.uid()) and status = 'PENDING');
create policy "Owners can delete pending sales"
  on public.sales for delete to authenticated
  using (owner_id = (select auth.uid()) and status = 'PENDING');

drop policy "Owner access" on public.sale_items;
create policy "Owners can read sale items"
  on public.sale_items for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners can manage items of pending sales"
  on public.sale_items for all to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.sales s
       where s.owner_id = sale_items.owner_id
         and s.id = sale_items.sale_id
         and s.status = 'PENDING'
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.sales s
       where s.owner_id = sale_items.owner_id
         and s.id = sale_items.sale_id
         and s.status = 'PENDING'
    )
  );

drop policy "Owner access" on public.sale_item_units;
create policy "Owners can read sale item units"
  on public.sale_item_units for select to authenticated
  using (owner_id = (select auth.uid()));

do $$
declare
  function_name text;
begin
  foreach function_name in array array[
    'approve_purchase_overdelivery(uuid, integer, text, uuid)',
    'register_purchase_receipt(uuid, jsonb, uuid, timestamp with time zone, text)',
    'complete_sale(uuid, jsonb, text, uuid, text)',
    'register_product_return(uuid, uuid, timestamp with time zone, uuid, text)',
    'approve_product_return(uuid, uuid)',
    'reject_product_return(uuid)',
    'record_sale_expense(uuid, text, text, numeric, uuid, timestamp with time zone)',
    'update_sale_expense(uuid, text, text, numeric, timestamp with time zone)',
    'register_sale_refund(uuid, numeric, text, uuid, uuid, timestamp with time zone, text, text)',
    'update_sale_refund(uuid, numeric, text, uuid, timestamp with time zone, text, text)',
    'cancel_sale(uuid)',
    'cancel_purchase(uuid)',
    'register_stock_adjustment_in(uuid, uuid, numeric, text, uuid, timestamp with time zone, text, text)',
    'register_stock_adjustment_out(uuid, text, uuid, timestamp with time zone)',
    'transfer_inventory_unit(uuid, uuid, text, uuid, timestamp with time zone)'
  ]
  loop
    execute pg_catalog.format(
      'revoke all on function public.%s from public, anon, authenticated',
      function_name
    );
    execute pg_catalog.format(
      'grant execute on function public.%s to authenticated',
      function_name
    );
  end loop;
end;
$$;
