begin;

create extension if not exists pgtap with schema extensions;

select plan(118);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'schema-test-one@example.invalid',
    '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Teste"}'::jsonb, pg_catalog.now(), pg_catalog.now()
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'schema-test-two@example.invalid',
    '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
  )
on conflict (id) do nothing;

select ok(
  pg_catalog.to_regprocedure('public.complete_sale(uuid,jsonb,text,uuid,text)') is not null,
  'A função transacional de conclusão de venda existe'
);
select ok(
  pg_catalog.to_regprocedure('public.register_purchase_receipt(uuid,jsonb,uuid,timestamp with time zone,text)') is not null,
  'A função transacional de receção parcial existe'
);
select ok(
  pg_catalog.to_regprocedure('public.register_product_return(uuid,uuid,timestamp with time zone,uuid,text)') is not null,
  'A função de registo de devolução existe'
);
select ok(
  pg_catalog.to_regprocedure('public.approve_product_return(uuid,uuid)') is not null,
  'A função transacional de aprovação para revenda existe'
);
select ok(
  pg_catalog.to_regprocedure('public.reject_product_return(uuid)') is not null,
  'A função controlada para rejeitar devoluções existe'
);
select ok(
  exists (
    select 1 from public.profiles
     where id = '10000000-0000-4000-8000-000000000001'
  ) and exists (
    select 1 from public.app_settings
     where owner_id = '10000000-0000-4000-8000-000000000001'
  ),
  'O registo de utilizador cria perfil e definições'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

insert into public.products (id, owner_id, name)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Produto de teste automatizado'
);
insert into public.locations (id, owner_id, name)
values
  (
    '21000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Localização de teste automatizado'
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Segunda localização de teste'
  );
insert into public.suppliers (id, owner_id, name)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Fornecedor de teste automatizado'
);
insert into public.purchases (id, owner_id, supplier_id)
values (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001'
);
insert into public.purchase_items (
  id, owner_id, purchase_id, product_id, quantity_ordered, expected_unit_cost
)
values (
  '50000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  2, 40.00
);

select throws_ok(
  $$insert into public.products (owner_id, name)
    values ('10000000-0000-4000-8000-000000000002', 'Acesso cruzado')$$,
  '42501',
  null,
  'RLS impede inserir dados em nome de outro utilizador'
);

select is(
  public.register_purchase_receipt(
    '40000000-0000-4000-8000-000000000001',
    '[{"purchase_item_id":"50000000-0000-4000-8000-000000000001","quantity_received":1,"unit_cost":40.00}]'::jsonb,
    '60000000-0000-4000-8000-000000000001',
    '2026-01-01 10:00:00+00',
    'Primeira receção de teste'
  ),
  public.register_purchase_receipt(
    '40000000-0000-4000-8000-000000000001',
    '[{"purchase_item_id":"50000000-0000-4000-8000-000000000001","quantity_received":1,"unit_cost":40.00}]'::jsonb,
    '60000000-0000-4000-8000-000000000001',
    '2026-01-01 10:00:00+00',
    'Primeira receção de teste'
  ),
  'Repetir a mesma chave de receção é idempotente'
);
select throws_ok(
  $$select public.register_purchase_receipt(
      '40000000-0000-4000-8000-000000000001',
      '[{"purchase_item_id":"50000000-0000-4000-8000-000000000001","quantity_received":1,"unit_cost":40.00}]'::jsonb,
      '60000000-0000-4000-8000-000000000001',
      '2026-01-01 10:00:00+00',
      'Notas diferentes'
    )$$,
  '23505',
  null,
  'A chave de receção não pode ser reutilizada com notas diferentes'
);
select throws_ok(
  $$select public.register_purchase_receipt(
      '40000000-0000-4000-8000-000000000001',
      '[{"purchase_item_id":"50000000-0000-4000-8000-000000000001","quantity_received":1,"unit_cost":40.00}]'::jsonb,
      '60000000-0000-4000-8000-000000000001',
      '2026-01-01 10:01:00+00',
      'Primeira receção de teste'
    )$$,
  '23505',
  null,
  'A chave de receção não pode ser reutilizada com outra data'
);
select is(
  (select count(*) from public.inventory_units
    where owner_id = '10000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Uma receção de uma unidade cria uma unidade e não duplica stock'
);
select is(
  (select count(*) from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and movement_type = 'PURCHASE_RECEIPT'),
  1::bigint,
  'A receção cria um único movimento por unidade'
);
select throws_ok(
  $$select public.register_purchase_receipt(
      '40000000-0000-4000-8000-000000000001',
      '[{"purchase_item_id":"50000000-0000-4000-8000-000000000001","quantity_received":2,"unit_cost":40.00}]'::jsonb,
      '60000000-0000-4000-8000-000000000002',
      '2026-01-02 10:00:00+00',
      null
    )$$,
  '23514',
  null,
  'Não se recebe acima da quantidade encomendada sem aprovação'
);

select is(
  public.approve_purchase_overdelivery(
    '50000000-0000-4000-8000-000000000001',
    1,
    'Exceção de excesso aprovada para teste',
    '70000000-0000-4000-8000-000000000001'
  ),
  public.approve_purchase_overdelivery(
    '50000000-0000-4000-8000-000000000001',
    1,
    'Exceção de excesso aprovada para teste',
    '70000000-0000-4000-8000-000000000001'
  ),
  'A aprovação de excedente é idempotente'
);
select is(
  (select count(*) from public.inventory_units
    where owner_id = '10000000-0000-4000-8000-000000000001'),
  1::bigint,
  'A aprovação de excedente por si só não cria stock'
);
select ok(
  public.register_purchase_receipt(
    '40000000-0000-4000-8000-000000000001',
    '[{"purchase_item_id":"50000000-0000-4000-8000-000000000001","quantity_received":1,"unit_cost":41.25,"units":[{"unit_cost":41.25,"internal_identifier":"TEST-UNIT-001","serial_number":"TEST-SERIAL-001"}]}]'::jsonb,
    '60000000-0000-4000-8000-000000000003',
    '2026-01-03 10:00:00+00',
    'Segunda receção de teste'
  ) is not null,
  'A receção parcial restante pode ser registada'
);
select is(
  (select count(*) from public.inventory_units
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and acquisition_cost in (40.00, 41.25)),
  2::bigint,
  'Cada unidade conserva o custo específico da respetiva receção'
);
select is(
  (select internal_identifier from public.inventory_units
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and internal_identifier = 'TEST-UNIT-001'),
  'TEST-UNIT-001',
  'A receção pode conservar o identificador interno da unidade'
);
select is(
  (select serial_number from public.inventory_units
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and serial_number = 'TEST-SERIAL-001'),
  'TEST-SERIAL-001',
  'A receção pode conservar o número de série da unidade'
);
select is(
  (select status from public.purchases
    where id = '40000000-0000-4000-8000-000000000001'),
  'PARTIALLY_RECEIVED',
  'A compra continua aberta até receber o excedente aprovado'
);
select ok(
  public.register_purchase_receipt(
    '40000000-0000-4000-8000-000000000001',
    '[{"purchase_item_id":"50000000-0000-4000-8000-000000000001","quantity_received":1,"unit_cost":42.00}]'::jsonb,
    '60000000-0000-4000-8000-000000000004',
    '2026-01-04 10:00:00+00',
    'Receção do excedente aprovado'
  ) is not null,
  'A unidade de excedente aprovada pode ser recebida depois da quantidade encomendada'
);
select is(
  (select status from public.purchases
    where id = '40000000-0000-4000-8000-000000000001'),
  'RECEIVED',
  'A compra fecha após receber toda a quantidade autorizada'
);
select is(
  (select count(*) from public.inventory_units
    where owner_id = '10000000-0000-4000-8000-000000000001'),
  3::bigint,
  'A receção do excedente aprovado cria a unidade adicional'
);
select throws_ok(
  $$select public.approve_purchase_overdelivery(
      '50000000-0000-4000-8000-000000000001',
      2,
      'Pedido diferente para a mesma chave',
      '70000000-0000-4000-8000-000000000001'
    )$$,
  '23505',
  null,
  'Uma chave de aprovação não pode ser reutilizada com dados diferentes'
);

insert into public.sales (
  id, owner_id, sale_type, total_amount
)
values (
  '80000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'PRIVATE', 100.00
);
insert into public.sale_items (
  id, owner_id, sale_id, product_id, quantity, unit_sale_price
)
values (
  '90000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  2, 50.00
);

select is(
  (select count(*) from public.sale_item_units
    where owner_id = '10000000-0000-4000-8000-000000000001'),
  0::bigint,
  'Uma venda pendente não associa nem reserva unidades'
);
select throws_ok(
  $$select public.complete_sale(
      '80000000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'sale_item_id', '90000000-0000-4000-8000-000000000001',
        'inventory_unit_ids', jsonb_build_array(
          (select id from public.inventory_units
            where owner_id = '10000000-0000-4000-8000-000000000001'
            order by acquisition_cost limit 1)
        )
      )),
      'BANK_TRANSFER',
      'a0000000-0000-4000-8000-000000000001',
      null
    )$$,
  '23514',
  null,
  'Não se conclui a venda com menos unidades do que a quantidade da linha'
);
select is(
  (select status from public.sales
    where id = '80000000-0000-4000-8000-000000000001'),
  'PENDING',
  'Uma falha de conclusão deixa a venda pendente'
);

select ok(
  public.complete_sale(
    '80000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'sale_item_id', '90000000-0000-4000-8000-000000000001',
      'inventory_unit_ids', (
        select pg_catalog.jsonb_agg(id order by acquisition_cost, id)
          from (
            select id, acquisition_cost
              from public.inventory_units
             where owner_id = '10000000-0000-4000-8000-000000000001'
             order by acquisition_cost, id
             limit 2
          ) available_units
      )
    )),
    'BANK_TRANSFER',
    'a0000000-0000-4000-8000-000000000002',
    'REF-TEST'
  ) is not null,
  'A venda com as unidades e o pagamento integral conclui'
);
select is(
  public.complete_sale(
    '80000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'sale_item_id', '90000000-0000-4000-8000-000000000001',
      'inventory_unit_ids', (
        select pg_catalog.jsonb_agg(id order by acquisition_cost, id)
          from (
            select id, acquisition_cost
              from public.inventory_units
             where owner_id = '10000000-0000-4000-8000-000000000001'
             order by acquisition_cost, id
             limit 2
          ) available_units
      )
    )),
    'BANK_TRANSFER',
    'a0000000-0000-4000-8000-000000000002',
    'REF-TEST'
  ),
  '80000000-0000-4000-8000-000000000001'::uuid,
  'Repetir a conclusão com a mesma chave e pedido é idempotente'
);
select throws_ok(
  $$select public.complete_sale(
      '80000000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'sale_item_id', '90000000-0000-4000-8000-000000000001',
        'inventory_unit_ids', (
          select pg_catalog.jsonb_agg(id order by acquisition_cost, id)
            from (
              select id, acquisition_cost
                from public.inventory_units
               where owner_id = '10000000-0000-4000-8000-000000000001'
               order by acquisition_cost, id
               limit 2
            ) available_units
        )
      )),
      'CASH',
      'a0000000-0000-4000-8000-000000000002',
      'REF-DIFFERENTE'
    )$$,
  '23505',
  null,
  'A chave de conclusão não pode ser reutilizada com pagamento diferente'
);
select is(
  (select count(*) from public.sale_payments
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and sale_id = '80000000-0000-4000-8000-000000000001'),
  1::bigint,
  'A conclusão gera um único pagamento integral'
);
select is(
  (select count(*) from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and movement_type = 'SALE_COMPLETED'),
  2::bigint,
  'A conclusão cria exatamente um movimento de saída por unidade'
);
select throws_ok(
  $$update public.sales
       set status = 'COMPLETED'
     where id = '80000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'O utilizador não pode concluir vendas por atualização direta'
);
select throws_ok(
  $$insert into public.stock_movements (
       owner_id, inventory_unit_id, product_id, movement_type, quantity_delta,
       purchase_receipt_id, purchase_receipt_item_id
     )
     select owner_id, id, product_id, 'PURCHASE_RECEIPT', 1,
            'b0000000-0000-4000-8000-000000000001',
            purchase_receipt_item_id
       from public.inventory_units
      where owner_id = '10000000-0000-4000-8000-000000000001'
      limit 1$$,
  '42501',
  null,
  'O utilizador não pode inserir movimentos de stock diretamente'
);

insert into public.sales (
  id, owner_id, sale_type, total_amount
)
values (
  '80000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'PRIVATE', 50.00
);
insert into public.sale_items (
  id, owner_id, sale_id, product_id, quantity, unit_sale_price
)
values (
  '90000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  1, 50.00
);
select throws_ok(
  $$select public.complete_sale(
      '80000000-0000-4000-8000-000000000002',
      jsonb_build_array(jsonb_build_object(
        'sale_item_id', '90000000-0000-4000-8000-000000000002',
        'inventory_unit_ids', jsonb_build_array(
          (select inventory_unit_id from public.sale_item_units
            where owner_id = '10000000-0000-4000-8000-000000000001'
            order by id limit 1)
        )
      )),
      'CASH',
      'a0000000-0000-4000-8000-000000000003',
      null
    )$$,
  '23514',
  null,
  'Uma unidade já vendida não pode ser associada a uma segunda venda'
);

select is(
  public.register_product_return(
    (select id from public.sale_item_units
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and sale_id = '80000000-0000-4000-8000-000000000001'
      order by id limit 1),
    'c0000000-0000-4000-8000-000000000001',
    '2026-01-04 10:00:00+00',
    '21000000-0000-4000-8000-000000000001',
    'Devolução de teste'
  ),
  public.register_product_return(
    (select id from public.sale_item_units
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and sale_id = '80000000-0000-4000-8000-000000000001'
      order by id limit 1),
    'c0000000-0000-4000-8000-000000000001',
    '2026-01-04 10:00:00+00',
    '21000000-0000-4000-8000-000000000001',
    'Devolução de teste'
  ),
  'Registar novamente a mesma devolução com a mesma chave é idempotente'
);
select throws_ok(
  $$select public.register_product_return(
      (select id from public.sale_item_units
        where owner_id = '10000000-0000-4000-8000-000000000001'
          and sale_id = '80000000-0000-4000-8000-000000000001'
        order by id limit 1),
      'c0000000-0000-4000-8000-000000000001',
      '2026-01-04 10:01:00+00',
      '21000000-0000-4000-8000-000000000001',
      'Devolução de teste'
    )$$,
  '23505',
  null,
  'A chave de devolução não pode ser reutilizada com outra data'
);
select is(
  (select operational_status from public.inventory_units
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and id = (
        select inventory_unit_id from public.product_return_items
         where owner_id = '10000000-0000-4000-8000-000000000001'
         limit 1
      )),
  'RETURNED_PENDING_REVIEW',
  'Uma unidade devolvida fica indisponível antes da aprovação'
);
select throws_ok(
  $$select public.register_product_return(
      (select id from public.sale_item_units
        where owner_id = '10000000-0000-4000-8000-000000000001'
          and sale_id = '80000000-0000-4000-8000-000000000001'
        order by id limit 1),
      'c0000000-0000-4000-8000-000000000002',
      '2026-01-04 10:01:00+00',
      null,
      'Devolução duplicada'
    )$$,
  '23514',
  null,
  'A mesma unidade vendida não pode gerar uma segunda devolução'
);
select ok(
  public.approve_product_return(
    (select id from public.product_return_items
      where owner_id = '10000000-0000-4000-8000-000000000001'
      limit 1),
    null
  ) is not null,
  'A aprovação para revenda cria um movimento de entrada'
);
select is(
  public.approve_product_return(
    (select id from public.product_return_items
      where owner_id = '10000000-0000-4000-8000-000000000001'
      limit 1),
    null
  ),
  (select id from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and movement_type = 'RETURN_APPROVED'
    limit 1),
  'Repetir a aprovação não duplica o movimento'
);
select throws_ok(
  $$select public.approve_product_return(
      (select id from public.product_return_items
        where owner_id = '10000000-0000-4000-8000-000000000001'
        limit 1),
      '21000000-0000-4000-8000-000000000099'
    )$$,
  '23505',
  null,
  'A repetição da aprovação não pode solicitar uma localização diferente'
);
select is(
  (select operational_status from public.inventory_units
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and id = (
        select inventory_unit_id from public.product_return_items
         where owner_id = '10000000-0000-4000-8000-000000000001'
         limit 1
      )),
  'READY_TO_SHIP',
  'Só após aprovação a unidade devolvida fica disponível'
);
select is(
  public.register_product_return(
    (select id from public.sale_item_units
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and sale_id = '80000000-0000-4000-8000-000000000001'
      order by id desc limit 1),
    'c0000000-0000-4000-8000-000000000003',
    '2026-01-05 10:00:00+00',
    null,
    'Devolução não revendável'
  ),
  public.register_product_return(
    (select id from public.sale_item_units
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and sale_id = '80000000-0000-4000-8000-000000000001'
      order by id desc limit 1),
    'c0000000-0000-4000-8000-000000000003',
    '2026-01-05 10:00:00+00',
    null,
    'Devolução não revendável'
  ),
  'A segunda unidade vendida pode ser registada para inspeção'
);
select is(
  public.reject_product_return(
    (select id from public.product_return_items
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and sale_item_unit_id = (
          select id from public.sale_item_units
           where owner_id = '10000000-0000-4000-8000-000000000001'
             and sale_id = '80000000-0000-4000-8000-000000000001'
           order by id desc limit 1
        ))
  ),
  (select id from public.product_return_items
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and sale_item_unit_id = (
        select id from public.sale_item_units
         where owner_id = '10000000-0000-4000-8000-000000000001'
           and sale_id = '80000000-0000-4000-8000-000000000001'
         order by id desc limit 1
      )),
  'Uma devolução pode ser marcada como não revendável'
);
select is(
  public.reject_product_return(
    (select id from public.product_return_items
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and sale_item_unit_id = (
          select id from public.sale_item_units
           where owner_id = '10000000-0000-4000-8000-000000000001'
             and sale_id = '80000000-0000-4000-8000-000000000001'
           order by id desc limit 1
        ))
  ),
  (select id from public.product_return_items
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and sale_item_unit_id = (
        select id from public.sale_item_units
         where owner_id = '10000000-0000-4000-8000-000000000001'
           and sale_id = '80000000-0000-4000-8000-000000000001'
         order by id desc limit 1
      )),
  'Repetir a rejeição da devolução não altera o resultado'
);
select is(
  (select status from public.product_returns
    where id = (
      select product_return_id from public.product_return_items
       where owner_id = '10000000-0000-4000-8000-000000000001'
         and sale_item_unit_id = (
           select id from public.sale_item_units
            where owner_id = '10000000-0000-4000-8000-000000000001'
              and sale_id = '80000000-0000-4000-8000-000000000001'
            order by id desc limit 1
         )
    )),
  'NOT_RESALEABLE',
  'O estado da devolução regista a decisão de não revenda'
);
select is(
  (select operational_status from public.inventory_units
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and id = (
        select inventory_unit_id from public.product_return_items
         where owner_id = '10000000-0000-4000-8000-000000000001'
           and sale_item_unit_id = (
             select id from public.sale_item_units
              where owner_id = '10000000-0000-4000-8000-000000000001'
                and sale_id = '80000000-0000-4000-8000-000000000001'
              order by id desc limit 1
           )
      )),
  'NOT_FOR_SALE',
  'Uma unidade não revendável não volta a ficar disponível em stock'
);
select throws_ok(
  $$select public.approve_product_return(
      (select id from public.product_return_items
        where owner_id = '10000000-0000-4000-8000-000000000001'
          and sale_item_unit_id = (
            select id from public.sale_item_units
             where owner_id = '10000000-0000-4000-8000-000000000001'
               and sale_id = '80000000-0000-4000-8000-000000000001'
             order by id desc limit 1
          )),
      null
    )$$,
  '23514',
  null,
  'Uma devolução não revendável não pode ser aprovada para revenda'
);
select is(
  (select current_location_id from public.inventory_units
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and id = (
        select inventory_unit_id from public.product_return_items
         where owner_id = '10000000-0000-4000-8000-000000000001'
         limit 1
      )),
  '21000000-0000-4000-8000-000000000001'::uuid,
  'A aprovação sem nova localização conserva o local onde a devolução foi recebida'
);
select is(
  (select count(*) from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and movement_type = 'RETURN_APPROVED'),
  1::bigint,
  'A aprovação gera um único movimento de retorno'
);
select is(
  (select count(*) from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and movement_type = 'RETURN_RECEIVED'),
  2::bigint,
  'O recebimento da devolução fica no histórico sem repor stock'
);
select ok(
  (select count(*) from public.audit_log
    where owner_id = '10000000-0000-4000-8000-000000000001') > 0,
  'As operações controladas geram registos de auditoria'
);
select ok(
  exists (
    select 1 from public.audit_log
     where owner_id = '10000000-0000-4000-8000-000000000001'
       and entity_table = 'app_settings'
       and entity_id = '10000000-0000-4000-8000-000000000001'
  ),
  'A auditoria identifica app_settings pelo owner_id'
);

select ok(
  pg_catalog.to_regprocedure(
    'public.record_sale_expense(uuid,text,text,numeric,uuid,timestamp with time zone)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.update_sale_expense(uuid,text,text,numeric,timestamp with time zone)'
  ) is not null,
  'Existem funções controladas para registar e editar despesas'
);
select ok(
  pg_catalog.to_regprocedure(
    'public.register_sale_refund(uuid,numeric,text,uuid,uuid,timestamp with time zone,text,text)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.update_sale_refund(uuid,numeric,text,uuid,timestamp with time zone,text,text)'
  ) is not null,
  'Existem funções controladas para registar e atualizar reembolsos'
);
select ok(
  pg_catalog.to_regprocedure('public.cancel_sale(uuid)') is not null
  and pg_catalog.to_regprocedure('public.cancel_purchase(uuid)') is not null,
  'Existem funções controladas para cancelar vendas e compras'
);
select ok(
  pg_catalog.to_regprocedure(
    'public.register_stock_adjustment_in(uuid,uuid,numeric,text,uuid,timestamp with time zone,text,text)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.register_stock_adjustment_out(uuid,text,uuid,timestamp with time zone)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.transfer_inventory_unit(uuid,uuid,text,uuid,timestamp with time zone)'
  ) is not null,
  'Existem funções controladas para ajustes e transferências de stock'
);

select is(
  public.record_sale_expense(
    '80000000-0000-4000-8000-000000000001',
    'SHIPPING',
    'Portes de envio',
    5.50,
    'd0000000-0000-4000-8000-000000000001',
    '2026-01-06 10:00:00+00'
  ),
  public.record_sale_expense(
    '80000000-0000-4000-8000-000000000001',
    'SHIPPING',
    'Portes de envio',
    5.50,
    'd0000000-0000-4000-8000-000000000001',
    '2026-01-06 10:00:00+00'
  ),
  'Repetir o registo de despesa com a mesma chave não duplica a linha'
);
select throws_ok(
  $$select public.record_sale_expense(
      '80000000-0000-4000-8000-000000000001',
      'SHIPPING',
      'Portes de envio diferentes',
      5.50,
      'd0000000-0000-4000-8000-000000000001',
      '2026-01-06 10:00:00+00'
    )$$,
  '23505',
  null,
  'A chave de despesa não pode ser reutilizada com dados diferentes'
);
select is(
  public.update_sale_expense(
    (select id from public.sale_expenses
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and idempotency_key = 'd0000000-0000-4000-8000-000000000001'),
    'FEE',
    'Taxa de serviço',
    6.25,
    '2026-01-07 10:00:00+00'
  ),
  (select id from public.sale_expenses
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000001'),
  'A despesa existente pode ser atualizada de forma controlada'
);
select is(
  (select amount from public.sale_expenses
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000001'),
  6.25::numeric,
  'A atualização conserva o novo valor da despesa sem recalcular impostos'
);
select ok(
  exists (
    select 1 from public.audit_log
     where owner_id = '10000000-0000-4000-8000-000000000001'
       and entity_table = 'sale_expenses'
       and action = 'UPDATE'
  ),
  'A edição de despesas fica registada na auditoria'
);
select throws_ok(
  $$insert into public.sale_expenses (
      owner_id, sale_id, category, description, amount
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      'OTHER',
      'Escrita direta proibida',
      1.00
    )$$,
  '42501',
  null,
  'O utilizador não pode criar despesas diretamente'
);
select throws_ok(
  $$update public.sale_expenses
       set amount = 99.00
     where owner_id = '10000000-0000-4000-8000-000000000001'
       and idempotency_key = 'd0000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'O utilizador não pode editar despesas diretamente'
);

select is(
  public.register_sale_refund(
    '80000000-0000-4000-8000-000000000001',
    25.00,
    'BANK_TRANSFER',
    'd0000000-0000-4000-8000-000000000002',
    (select id from public.product_returns
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and sale_id = '80000000-0000-4000-8000-000000000001'
      order by created_at limit 1),
    '2026-01-08 10:00:00+00',
    'REFUND-1',
    'Reembolso parcial'
  ),
  public.register_sale_refund(
    '80000000-0000-4000-8000-000000000001',
    25.00,
    'BANK_TRANSFER',
    'd0000000-0000-4000-8000-000000000002',
    (select id from public.product_returns
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and sale_id = '80000000-0000-4000-8000-000000000001'
      order by created_at limit 1),
    '2026-01-08 10:00:00+00',
    'REFUND-1',
    'Reembolso parcial'
  ),
  'Repetir o mesmo reembolso com a mesma chave não duplica a linha'
);
select throws_ok(
  $$select public.register_sale_refund(
      '80000000-0000-4000-8000-000000000001',
      25.00,
      'CASH',
      'd0000000-0000-4000-8000-000000000002',
      null,
      '2026-01-08 10:00:00+00',
      null,
      null
    )$$,
  '23505',
  null,
  'A chave de reembolso não pode ser reutilizada com dados diferentes'
);
select is(
  public.update_sale_refund(
    (select id from public.refunds
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and idempotency_key = 'd0000000-0000-4000-8000-000000000002'),
    30.00,
    'CASH',
    (select id from public.product_returns
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and sale_id = '80000000-0000-4000-8000-000000000001'
      order by created_at limit 1),
    '2026-01-09 10:00:00+00',
    'REFUND-1-UPDATED',
    'Reembolso atualizado'
  ),
  (select id from public.refunds
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000002'),
  'O reembolso pode ser atualizado sem alterar a venda associada'
);
select is(
  (select amount from public.refunds
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000002'),
  30.00::numeric,
  'A atualização conserva o valor do reembolso'
);
select ok(
  public.register_sale_refund(
    '80000000-0000-4000-8000-000000000001',
    70.00,
    'CASH',
    'd0000000-0000-4000-8000-000000000003'
  ) is not null,
  'O reembolso pode atingir, sem exceder, o total pago'
);
select throws_ok(
  $$select public.register_sale_refund(
      '80000000-0000-4000-8000-000000000001',
      0.01,
      'CASH',
      'd0000000-0000-4000-8000-000000000004'
    )$$,
  '23514',
  null,
  'O total de reembolsos não pode ultrapassar o pagamento da venda'
);
select throws_ok(
  $$select public.update_sale_refund(
      (select id from public.refunds
        where owner_id = '10000000-0000-4000-8000-000000000001'
          and idempotency_key = 'd0000000-0000-4000-8000-000000000002'),
      31.00,
      'CASH',
      null,
      '2026-01-09 10:00:00+00',
      null,
      null
    )$$,
  '23514',
  null,
  'A atualização também respeita o limite total de reembolso'
);
select is(
  (select sum(amount) from public.refunds
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and sale_id = '80000000-0000-4000-8000-000000000001'),
  100.00::numeric,
  'Os reembolsos acumulados correspondem ao limite pago'
);
select ok(
  exists (
    select 1 from public.audit_log
     where owner_id = '10000000-0000-4000-8000-000000000001'
       and entity_table = 'refunds'
       and action = 'UPDATE'
  ),
  'A edição de reembolsos fica registada na auditoria'
);
select throws_ok(
  $$insert into public.refunds (
      owner_id, sale_id, amount, method
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      1.00,
      'OTHER'
    )$$,
  '42501',
  null,
  'O utilizador não pode criar reembolsos diretamente'
);
select throws_ok(
  $$update public.refunds
       set amount = 99.00
     where owner_id = '10000000-0000-4000-8000-000000000001'
       and idempotency_key = 'd0000000-0000-4000-8000-000000000002'$$,
  '42501',
  null,
  'O utilizador não pode editar reembolsos diretamente'
);

insert into public.sales (id, owner_id, sale_type, total_amount)
values (
  '80000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  'PRIVATE',
  20.00
);
insert into public.sale_items (
  id, owner_id, sale_id, product_id, quantity, unit_sale_price
)
values (
  '90000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000001',
  1,
  20.00
);
select is(
  public.cancel_sale('80000000-0000-4000-8000-000000000003'),
  '80000000-0000-4000-8000-000000000003'::uuid,
  'Uma venda pendente pode ser cancelada sem apagar o registo'
);
select is(
  public.cancel_sale('80000000-0000-4000-8000-000000000003'),
  '80000000-0000-4000-8000-000000000003'::uuid,
  'Repetir o cancelamento de venda é idempotente'
);
select is(
  (select count(*) from public.sale_items
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and sale_id = '80000000-0000-4000-8000-000000000003'),
  1::bigint,
  'O cancelamento preserva as linhas da venda'
);
select throws_ok(
  $$select public.cancel_sale('80000000-0000-4000-8000-000000000001')$$,
  '23514',
  null,
  'Uma venda concluída não pode ser cancelada'
);
select throws_ok(
  $$update public.sales
       set status = 'CANCELLED'
     where id = '80000000-0000-4000-8000-000000000003'$$,
  '42501',
  null,
  'O utilizador não pode cancelar vendas por atualização direta'
);
select throws_ok(
  $$select public.record_sale_expense(
      '80000000-0000-4000-8000-000000000003',
      'OTHER',
      'Despesa após cancelamento',
      1.00,
      'd0000000-0000-4000-8000-000000000005'
    )$$,
  '23514',
  null,
  'Não se podem registar despesas numa venda cancelada'
);

insert into public.purchases (id, owner_id, supplier_id)
values (
  '40000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001'
);
insert into public.purchase_items (
  id, owner_id, purchase_id, product_id, quantity_ordered, expected_unit_cost
)
values (
  '50000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  1,
  20.00
);
select is(
  public.cancel_purchase('40000000-0000-4000-8000-000000000002'),
  '40000000-0000-4000-8000-000000000002'::uuid,
  'Uma compra aberta sem receções pode ser cancelada'
);
select is(
  (select status from public.purchases
    where id = '40000000-0000-4000-8000-000000000002'),
  'CANCELLED',
  'O cancelamento altera o estado sem apagar a compra'
);
select is(
  public.cancel_purchase('40000000-0000-4000-8000-000000000002'),
  '40000000-0000-4000-8000-000000000002'::uuid,
  'Repetir o cancelamento de compra é idempotente'
);
select is(
  (select count(*) from public.purchase_items
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and purchase_id = '40000000-0000-4000-8000-000000000002'),
  1::bigint,
  'O cancelamento preserva as linhas da compra'
);
select throws_ok(
  $$select public.cancel_purchase('40000000-0000-4000-8000-000000000001')$$,
  '23514',
  null,
  'Uma compra já recebida não pode ser cancelada'
);
select throws_ok(
  $$update public.purchases
       set status = 'CANCELLED'
     where id = '40000000-0000-4000-8000-000000000002'$$,
  '42501',
  null,
  'O utilizador não pode cancelar compras por atualização direta'
);
select throws_ok(
  $$select public.register_purchase_receipt(
      '40000000-0000-4000-8000-000000000002',
      '[{"purchase_item_id":"50000000-0000-4000-8000-000000000002","quantity_received":1,"unit_cost":20.00}]'::jsonb,
      '60000000-0000-4000-8000-000000000005'
    )$$,
  '23514',
  null,
  'Uma compra cancelada não aceita novas receções'
);

select ok(
  public.register_stock_adjustment_in(
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000002',
    15.00,
    'Unidade encontrada no inventário físico',
    'd0000000-0000-4000-8000-000000000006',
    '2026-01-10 10:00:00+00',
    'ADJ-UNIT-001',
    'ADJ-SERIAL-001'
  ) is not null,
  'O ajuste de entrada cria uma unidade física e um movimento'
);
select is(
  public.register_stock_adjustment_in(
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000002',
    15.00,
    'Unidade encontrada no inventário físico',
    'd0000000-0000-4000-8000-000000000006',
    '2026-01-10 10:00:00+00',
    'ADJ-UNIT-001',
    'ADJ-SERIAL-001'
  ),
  (select id from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000006'),
  'Repetir um ajuste de entrada devolve o mesmo movimento'
);
select throws_ok(
  $$select public.register_stock_adjustment_in(
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000002',
      16.00,
      'Custo diferente',
      'd0000000-0000-4000-8000-000000000006'
    )$$,
  '23505',
  null,
  'A chave do ajuste não pode ser reutilizada com dados diferentes'
);
select is(
  (select iu.acquisition_cost
     from public.inventory_units iu
     join public.stock_movements sm
       on sm.owner_id = iu.owner_id and sm.inventory_unit_id = iu.id
    where sm.owner_id = '10000000-0000-4000-8000-000000000001'
      and sm.idempotency_key = 'd0000000-0000-4000-8000-000000000006'),
  15.00::numeric,
  'A unidade de ajuste conserva o custo e a ligação ao movimento'
);
select is(
  (select movement_type from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000006'),
  'ADJUSTMENT_IN',
  'O ajuste de entrada conserva o tipo de movimento'
);
select is(
  (select quantity_delta from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000006'),
  1::smallint,
  'O ajuste de entrada regista uma unidade positiva'
);
select is(
  public.register_stock_adjustment_out(
    (select inventory_unit_id from public.stock_movements
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and idempotency_key = 'd0000000-0000-4000-8000-000000000006'),
    'Unidade removida da contagem disponível',
    'd0000000-0000-4000-8000-000000000007',
    '2026-01-11 10:00:00+00'
  ),
  public.register_stock_adjustment_out(
    (select inventory_unit_id from public.stock_movements
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and idempotency_key = 'd0000000-0000-4000-8000-000000000006'),
    'Unidade removida da contagem disponível',
    'd0000000-0000-4000-8000-000000000007',
    '2026-01-11 10:00:00+00'
  ),
  'Repetir um ajuste de saída devolve o mesmo movimento'
);
select is(
  (select operational_status from public.inventory_units
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and internal_identifier = 'ADJ-UNIT-001'),
  'NOT_FOR_SALE',
  'O ajuste de saída retira a unidade do stock vendável sem a apagar'
);
select is(
  (select quantity_delta from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000007'),
  -1::smallint,
  'O ajuste de saída regista uma unidade negativa'
);
select throws_ok(
  $$select public.register_stock_adjustment_out(
      (select inventory_unit_id from public.stock_movements
        where owner_id = '10000000-0000-4000-8000-000000000001'
          and idempotency_key = 'd0000000-0000-4000-8000-000000000006'),
      'Segunda saída',
      'd0000000-0000-4000-8000-000000000008'
    )$$,
  '23514',
  null,
  'Uma unidade indisponível não pode sofrer novo ajuste de saída'
);

select ok(
  public.transfer_inventory_unit(
    (select id from public.inventory_units
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and operational_status = 'READY_TO_SHIP'
        and current_location_id = '21000000-0000-4000-8000-000000000001'
      order by id limit 1),
    '21000000-0000-4000-8000-000000000002',
    'Transferência entre localizações',
    'd0000000-0000-4000-8000-000000000009',
    '2026-01-12 10:00:00+00'
  ) is not null,
  'Uma unidade disponível pode ser transferida'
);
select is(
  public.transfer_inventory_unit(
    (select inventory_unit_id from public.stock_movements
      where owner_id = '10000000-0000-4000-8000-000000000001'
        and idempotency_key = 'd0000000-0000-4000-8000-000000000009'),
    '21000000-0000-4000-8000-000000000002',
    'Transferência entre localizações',
    'd0000000-0000-4000-8000-000000000009',
    '2026-01-12 10:00:00+00'
  ),
  (select id from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000009'),
  'Repetir uma transferência devolve o mesmo movimento'
);
select is(
  (select current_location_id from public.inventory_units
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and id = (
        select inventory_unit_id from public.stock_movements
         where owner_id = '10000000-0000-4000-8000-000000000001'
           and idempotency_key = 'd0000000-0000-4000-8000-000000000009'
      )),
  '21000000-0000-4000-8000-000000000002'::uuid,
  'A transferência atualiza a localização da unidade'
);
select is(
  (select quantity_delta from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000009'),
  0::smallint,
  'A transferência não altera a quantidade total de stock'
);
select is(
  (select from_location_id from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000009'),
  '21000000-0000-4000-8000-000000000001'::uuid,
  'O movimento de transferência conserva a localização de origem'
);
select is(
  (select to_location_id from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000009'),
  '21000000-0000-4000-8000-000000000002'::uuid,
  'O movimento de transferência conserva a localização de destino'
);
select throws_ok(
  $$select public.transfer_inventory_unit(
      (select inventory_unit_id from public.stock_movements
        where owner_id = '10000000-0000-4000-8000-000000000001'
          and idempotency_key = 'd0000000-0000-4000-8000-000000000009'),
      '21000000-0000-4000-8000-000000000002',
      'Transferência para o mesmo local',
      'd0000000-0000-4000-8000-000000000010'
    )$$,
  '22023',
  null,
  'Uma transferência não pode ter a mesma origem e destino'
);

select pg_catalog.set_config(
  'test.unit_id',
  (select inventory_unit_id::text from public.stock_movements
    where owner_id = '10000000-0000-4000-8000-000000000001'
      and idempotency_key = 'd0000000-0000-4000-8000-000000000006'),
  true
);
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*) from public.products),
  0::bigint,
  'RLS não revela produtos de outro utilizador'
);
select is(
  (select count(*) from public.sales),
  0::bigint,
  'RLS não revela vendas de outro utilizador'
);
select is(
  (select count(*) from public.sale_expenses),
  0::bigint,
  'RLS não revela despesas de outro utilizador'
);
select is(
  (select count(*) from public.refunds),
  0::bigint,
  'RLS não revela reembolsos de outro utilizador'
);
select is(
  (select count(*) from public.stock_movements),
  0::bigint,
  'RLS não revela movimentos de stock de outro utilizador'
);
select throws_ok(
  $$select public.cancel_sale('80000000-0000-4000-8000-000000000001')$$,
  'P0002',
  null,
  'Uma função controlada não permite cancelar venda de outro utilizador'
);
select throws_ok(
  $$select public.record_sale_expense(
      '80000000-0000-4000-8000-000000000001',
      'OTHER',
      'Tentativa cross-owner',
      1.00,
      'd0000000-0000-4000-8000-000000000011'
    )$$,
  'P0002',
  null,
  'Uma função controlada não permite criar despesa para venda de outro utilizador'
);
select throws_ok(
  $$select public.register_sale_refund(
      '80000000-0000-4000-8000-000000000001',
      1.00,
      'OTHER',
      'd0000000-0000-4000-8000-000000000013'
    )$$,
  'P0002',
  null,
  'Uma função controlada não permite reembolsar venda de outro utilizador'
);
select throws_ok(
  $$select public.register_stock_adjustment_out(
      current_setting('test.unit_id')::uuid,
      'Tentativa cross-owner',
      'd0000000-0000-4000-8000-000000000012'
    )$$,
  'P0002',
  null,
  'Uma função controlada não permite ajustar stock de outro utilizador'
);
select throws_ok(
  $$select public.cancel_purchase('40000000-0000-4000-8000-000000000002')$$,
  'P0002',
  null,
  'Uma função controlada não permite cancelar compra de outro utilizador'
);

select ok(
  pg_catalog.to_regprocedure('public.record_sale_payment(uuid,numeric,text,timestamp with time zone,text)') is not null,
  'A função de pagamentos parciais existe'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'sale_payments_one_per_sale'
  ),
  'Uma venda pode ter vários pagamentos'
);

select * from finish();
rollback;
