# Revenda Gestão

Plataforma de gestão de revenda em desenvolvimento. Os fluxos disponíveis
guardam os registos no `localStorage` do browser para desenvolvimento e
avaliação. Este armazenamento não é adequado para dados comerciais reais.

## Executar a interface local

Requer Node.js e npm.

```powershell
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Os dados são persistidos
no armazenamento local do perfil do browser. Separadores do mesmo perfil
partilham alterações, mas não há contas, sincronização com servidor,
isolamento entre utilizadores ou cópias de segurança automáticas. A secção
Definições permite exportar uma cópia JSON e limpar o armazenamento local.

As vendas só descontam stock ao serem concluídas e exigem unidades disponíveis.
Pagamentos acumulados não podem exceder o total da venda; reembolsos acumulados
não podem exceder pagamentos ainda não reembolsados. Receções parciais criam
apenas as unidades recebidas e os movimentos ficam no histórico.

Os indicadores financeiros distinguem lucro bruto (venda menos custo de
compra), margem bruta (lucro bruto sobre o valor vendido) e rentabilidade sobre
o custo de compra. Percentagens sem denominador positivo são apresentadas como
indisponíveis; se faltar preço ou custo, o lucro correspondente também não é
inventado. Uma unidade devolvida e aprovada para revenda deixa de contar como
custo vendido.

O lucro líquido e o IVA são estimativas baseadas nas regras fiscais atualmente
codificadas por tipo de venda, não um apuramento contabilístico. As despesas
associadas a uma venda podem ser ligadas ao registo; despesas sem venda são
incluídas nos totais do período. IVA manualmente registado não é deduzido de
novo quando o indicador já desconta uma estimativa de IVA. Se o envio estiver
preenchido na venda, uma despesa associada na categoria Envios também não é
somada outra vez.

Antes de usar as estimativas para decisões fiscais, é necessário confirmar se
os preços incluem IVA, a incidência efetiva de cada regime (incluindo PRIVATE,
MARGIN, VAT23% e VAT0%), e o tratamento de IVA liquidado/dedutível e despesas
de IVA. Valores por receber correspondem ao total de vendas pendentes e
concluídas no período menos os pagamentos registados; compras correspondem ao
total encomendado, excluindo compras canceladas.

Não introduza dados pessoais ou comerciais reais neste modo. A exportação CSV
e os indicadores são operacionais e não substituem registos contabilísticos ou
cálculos fiscais.

## Preparação Supabase

Consulte [supabase/README.md](./supabase/README.md) para executar as migrações
e testes apenas num ambiente Supabase local descartável. Não ligue o CLI a um
projeto remoto nem execute `supabase db push` nesta etapa.

## Estado da etapa

- Interface, formulários e fluxos locais: disponíveis em modo de desenvolvimento.
- Persistência: `localStorage` do perfil do browser; não é uma base de dados segura.
- PostgreSQL/Supabase: clientes browser/servidor preparados; migrações e testes
  SQL não executados. A integração comercial e a autenticação continuam por
  implementar e validar.
- Regras fiscais: valores de IVA e lucro líquido são estimativas locais, por
  validar com contabilista; não servem como declaração fiscal.
- Publicação e autenticação para utilização real: ainda não configuradas.

Para validar as fórmulas financeiras locais:

```powershell
npm run test:financial
```
