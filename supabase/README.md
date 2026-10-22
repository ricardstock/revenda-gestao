# Supabase — preparação local

Este diretório contém uma configuração local e uma **proposta de esquema por
rever**. A migração SQL não foi aplicada, local nem remotamente. A aplicação já
tem a estrutura dos clientes Supabase e a renovação de sessão por `proxy.ts`,
mas ainda não implementa início de sessão, operações comerciais, persistência
de dados comerciais nem rotina de backup.

## Conteúdo

- `config.toml`: configuração para o Supabase CLI local.
- `migrations/20261019000000_initial_schema.sql`: esquema candidato, com chaves,
  restrições, índices e Row Level Security (RLS).
- `migrations/20261020120000_operational_integrity.sql`: funções transacionais,
  políticas de escrita restrita, auditoria controlada e invariantes adicionais.
- `tests/database.test.sql`: testes SQL pgTAP para os cenários operacionais
  críticos.
- `.env.example` na raiz: nomes de variáveis sem credenciais.
- `app/lib/supabase/`: clientes separados para browser e servidor, configuração
  das variáveis e suporte de cookies para o Proxy.
- `proxy.ts` na raiz: renovação de sessão Supabase para o Next.js 16.

## Ambiente local descartável

1. Instalar Docker Desktop e o Supabase CLI apenas se quiser executar a stack
   local. Não é necessário contratar alojamento ou um plano pago.
2. Confirmar que Docker está ativo e iniciar a stack:

   ```powershell
   npx supabase start
   ```

3. Aplicar as migrações **apenas à base local descartável**. `db reset` apaga
   os dados dessa base local e recria-a a partir das migrações:

   ```powershell
   npx supabase db reset
   ```

4. Executar os testes pgTAP contra a base local:

   ```powershell
   npx supabase test db
   ```

5. Verificar o resultado completo dos testes e corrigir falhas antes de
   considerar qualquer aplicação noutro ambiente.

Estes comandos destinam-se ao projeto Supabase local iniciado na própria
máquina. Não executar `supabase link`, `supabase db push` ou qualquer operação
remota nesta etapa. Nunca usar `db reset` numa base com dados que se queira
preservar.

Para a futura aplicação Next.js, usar os nomes `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` de `.env.example`. O `.env.local` não é
versionado. Não é necessária uma chave `service_role` para os fluxos previstos:
as funções transacionais validam `auth.uid()` e são concedidas ao papel
`authenticated`.

## Estrutura de integração Next.js

A estrutura usa `@supabase/ssr` e `@supabase/supabase-js`, seguindo a
documentação oficial para o App Router:

- `app/lib/supabase/client.ts` cria o cliente para Client Components.
- `app/lib/supabase/server.ts` cria um cliente por pedido para Server
  Components, Server Actions e Route Handlers, usando cookies.
- `proxy.ts` usa `auth.getClaims()` para validar/renovar a sessão e propaga
  cookies e cabeçalhos de cache. Não implementa início de sessão nem protege
  páginas por utilizador.

Antes de usar estes clientes, configurar `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no `.env.local` com os valores do
projeto. Se faltarem, o código apresenta um erro de configuração explícito.
O cliente browser recebe apenas a chave publicável. Uma chave privilegiada
contorna RLS e não deve ser usada no browser nem nas rotas normais da aplicação.

Esta etapa não consulta tabelas nem usa funções SQL: o esquema ainda é uma
proposta por rever e as migrações não foram executadas. O build local não
confirma conectividade, credenciais, configuração de Auth ou existência do
esquema no Supabase remoto.

## Modelo de acesso e operações

Todas as funções `SECURITY DEFINER` usam `search_path` vazio, qualificam os
objetos e validam explicitamente `auth.uid()`. As tabelas operacionais permitem
leitura dos registos próprios; as tabelas de inventário, movimentos, pagamentos,
devoluções, reembolsos e auditoria não permitem escrita direta pelo papel
`authenticated`. Vendas e compras permanecem editáveis apenas nos estados de
rascunho permitidos.

- `complete_sale` bloqueia a venda, linhas e unidades por ordem determinística,
  valida correspondência de quantidade/produto/estado, cria uma única
  associação por unidade, um pagamento integral e movimentos de saída. A chave
  de idempotência deve ser reutilizada apenas para repetir o mesmo pedido.
- `record_sale_expense` e `update_sale_expense` mantêm despesas auditáveis em
  vendas não canceladas. O registo usa chave de idempotência; os valores são
  despesas operacionais e não calculam nem alteram impostos.
- `register_sale_refund` e `update_sale_refund` associam reembolsos a vendas
  concluídas e, opcionalmente, a uma devolução da mesma venda. O total
  acumulado não pode exceder o pagamento registado; estes registos não
  implementam regras fiscais.
- `cancel_sale` só cancela vendas pendentes sem pagamentos, unidades vendidas,
  devoluções ou reembolsos. `cancel_purchase` só cancela compras abertas sem
  receções. Ambos preservam linhas, registos e auditoria e são idempotentes.
- `register_stock_adjustment_in` cria uma unidade física disponível e exige
  produto, localização ativa, custo de aquisição, motivo e chave idempotente.
  `register_stock_adjustment_out` só remove do stock vendável uma unidade
  disponível identificada. `transfer_inventory_unit` só transfere unidades
  disponíveis localizadas para outra localização ativa. Cada operação altera a
  unidade e regista um movimento numa única transação.
- `register_purchase_receipt` bloqueia a compra e linhas, verifica o limite
  recebido e as aprovações explícitas de excedente, cria uma unidade e
  movimento por quantidade recebida, cada qual com custo de aquisição próprio.
  Opcionalmente, o pedido pode indicar um array `units` com custo,
  `internal_identifier` e `serial_number` por unidade; quando omitido, usa-se
  o custo da linha para todas as unidades.
- `approve_purchase_overdelivery` regista quantidade, justificação, utilizador
  aprovador e chave de idempotência. Como a versão inicial é para um único
  utilizador, não existe uma segunda pessoa aprovadora.
- `register_product_return` regista uma devolução pendente por unidade e
  impede repeti-la para a mesma associação de venda. `approve_product_return`
  só repõe a disponibilidade e cria entrada de stock após confirmação. A
  receção da unidade devolvida gera primeiro um movimento de quantidade zero,
  sem a tornar vendável. `reject_product_return` marca a devolução como não
  revendável e a unidade como `NOT_FOR_SALE`, sem repor stock.
- Uma compra só passa a `RECEIVED` depois de recebida toda a quantidade
  encomendada e todo o excedente aprovado.
- O trigger `write_audit_log` regista inserções, atualizações e eliminações
  relevantes. O papel `authenticated` apenas pode consultar o histórico.
- O trigger `create_profile_for_new_user` cria perfil e definições a partir de
  um novo registo em `auth.users`.

## Decisões provisórias e limites

- Um excedente só é aceite após chamada explícita a
  `approve_purchase_overdelivery`, com justificação; nesta versão, o utilizador
  autenticado é também o aprovador. É uma decisão provisória para o cenário de
  utilizador único.
- `sales.total_amount` é o total a pagar confirmado pelo utilizador. A função
  valida que o único pagamento corresponde a esse valor, mas não calcula nem
  declara regras fiscais.
- As receções criam unidades como `READY_TO_SHIP`, uma vez que a regra do
  negócio não exige inspeção prévia. Um estado alternativo de chegada ainda
  não faz parte da operação automática.
- A auditoria guarda snapshots dos registos afetados, que podem conter dados
  pessoais. O acesso está limitado ao proprietário; retenção e minimização
  precisam de ser aprovadas antes de usar dados reais.
- A IA não tem ainda um papel técnico separado. Antes de a ligar, deve usar uma
  API/vistas de leitura dedicadas, sem acesso às funções de escrita.
- Os testes SQL cobrem reexecução e estados concorrentes observáveis em
  sequência; uma prova real de duas transações simultâneas ainda precisa de um
  teste de concorrência com duas sessões PostgreSQL.
- Não foi possível validar estas migrações num PostgreSQL nesta máquina se as
  ferramentas locais não estiverem disponíveis. Passar lint/build da aplicação
  não valida SQL, RLS, concorrência nem backups.
