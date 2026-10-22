-- Allows several payments per sale (partial payments) and adds the sale
-- fields used by the application: shipping charged, tracking and invoice.

alter table public.sale_payments
  drop constraint sale_payments_one_per_sale;

alter table public.sales
  add column shipping_charged numeric(12, 2) not null default 0
    check (shipping_charged >= 0),
  add column tracking_code text,
  add column invoice_number text;

grant insert (shipping_charged, tracking_code, invoice_number),
      update (shipping_charged, tracking_code, invoice_number)
  on public.sales to authenticated;

create index sales_owner_tracking_code_idx
  on public.sales (owner_id, tracking_code)
  where tracking_code is not null;

create or replace function public.record_sale_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_method text,
  p_paid_at timestamptz default now(),
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sale_state text;
  sale_total numeric(12, 2);
  already_paid numeric(12, 2);
  payment_id uuid;
begin
  if actor is null then
    raise exception 'É necessária uma sessão autenticada'
      using errcode = '28000';
  end if;
  if p_sale_id is null or p_paid_at is null
     or p_amount is null or p_amount <= 0
     or p_amount <> pg_catalog.round(p_amount, 2)
     or p_method is null
     or p_method not in ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER') then
    raise exception 'Os dados do pagamento são inválidos'
      using errcode = '22023';
  end if;

  select status, total_amount into sale_state, sale_total
    from public.sales
   where owner_id = actor and id = p_sale_id
   for update;
  if not found then
    raise exception 'Venda não encontrada'
      using errcode = 'P0002';
  end if;
  if sale_state = 'CANCELLED' then
    raise exception 'Não é possível registar pagamentos numa venda cancelada'
      using errcode = '23514';
  end if;

  select coalesce(pg_catalog.sum(amount), 0) into already_paid
    from public.sale_payments
   where owner_id = actor and sale_id = p_sale_id;
  if sale_total is not null and already_paid + p_amount > sale_total then
    raise exception 'O pagamento excede o total da venda'
      using errcode = '23514';
  end if;

  insert into public.sale_payments (
    owner_id, sale_id, amount, method, paid_at, reference
  )
  values (actor, p_sale_id, p_amount, p_method, p_paid_at, p_reference)
  returning id into payment_id;

  return payment_id;
end;
$$;

revoke all on function public.record_sale_payment(uuid, numeric, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_sale_payment(uuid, numeric, text, timestamptz, text)
  to authenticated;
