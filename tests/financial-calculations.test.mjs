import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const sourcePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "app",
  "lib",
  "local-data.ts",
);
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const localDataModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const {
  calculateProfitability,
  calculateOperationalMetrics,
  calculateSaleFinancialMetrics,
  emptyLocalData,
  saleOutstanding,
  duplicateProductWithStock,
  duplicateSaleWithPayments,
} = localDataModule;

function makeSale(id, saleType = "PRIVATE", unitPrice = 125, unitCost = 95) {
  return {
    id,
    createdAt: "",
    soldAt: "2026-10-20",
    customerId: "",
    buyerName: "",
    saleType,
    invoiceNumber: "",
    notes: "",
    status: "COMPLETED",
    shippingCost: 0,
    lines: [{
      productId: "",
      quantity: 1,
      unitPrice,
      unitCost,
      unitIds: [],
    }],
  };
}

test("separa lucro bruto, margem bruta e rentabilidade sobre custo", () => {
  const sale = makeSale("sale");
  const metrics = calculateSaleFinancialMetrics(sale, {
    ...emptyLocalData,
    sales: [sale],
  });

  assert.equal(metrics.grossProfit, 30);
  assert.equal(metrics.grossMarginPercent, 24);
  assert.equal(Number(metrics.returnOnCostPercent.toFixed(2)), 31.58);
});

test("calcula líquido estimado sem descontar de novo a despesa IVA", () => {
  const sale = makeSale("sale");
  const data = {
    ...emptyLocalData,
    sales: [sale],
    expenses: [
      { id: "fee", saleId: sale.id, category: "Fees / comissões", description: "Comissão", amount: 3, incurredAt: sale.soldAt },
      { id: "vat", saleId: sale.id, category: "IVA", description: "IVA", amount: 7, incurredAt: sale.soldAt },
      { id: "shipping", saleId: sale.id, category: "Envios", description: "Portes", amount: 2, incurredAt: sale.soldAt },
    ],
  };
  const metrics = calculateSaleFinancialMetrics({ ...sale, shippingCost: 5 }, data);

  assert.equal(metrics.netProfitEstimate, 22);
  assert.equal(calculateSaleFinancialMetrics(sale, data).netProfitEstimate, 25);
  assert.equal(Number(metrics.returnOnCostPercent.toFixed(2)), 21.36);
});

test("mantém estimativas distintas por tipo de venda", () => {
  const data = { ...emptyLocalData };

  assert.equal(calculateSaleFinancialMetrics(makeSale("private", "PRIVATE"), data).vatEstimate, 0);
  assert.equal(calculateSaleFinancialMetrics(makeSale("vat0", "VAT0%"), data).vatEstimate, 0);
  assert.equal(calculateSaleFinancialMetrics(makeSale("vat23", "VAT23%"), data).vatEstimate, 23.37);
  assert.equal(calculateSaleFinancialMetrics(makeSale("margin", "MARGIN"), data).vatEstimate, 5.61);
});

test("extrai IVA incluído do preço final VAT23% e arredonda a cêntimos", () => {
  const sale = makeSale("vat23-included", "VAT23%", 123, 95);
  const metrics = calculateSaleFinancialMetrics(sale, {
    ...emptyLocalData,
    sales: [sale],
  });

  assert.equal(metrics.vatEstimate, 23);
  assert.equal(metrics.grossProfit, 28);
  assert.equal(Number(metrics.grossMarginPercent.toFixed(2)), 22.76);
  assert.equal(metrics.netProfitEstimate, 5);

  const roundedSale = makeSale("vat23-rounded", "VAT23%", 10, 0);
  assert.equal(
    calculateSaleFinancialMetrics(roundedSale, emptyLocalData).vatEstimate,
    1.87,
  );
});

test("extrai IVA incluído apenas da margem positiva do regime MARGIN", () => {
  const sale = makeSale("margin-included", "MARGIN", 125, 95);
  const metrics = calculateSaleFinancialMetrics(sale, {
    ...emptyLocalData,
    sales: [sale],
  });

  assert.equal(metrics.vatEstimate, 5.61);
  assert.equal(metrics.grossProfit, 30);
  assert.equal(metrics.grossMarginPercent, 24);
  assert.equal(metrics.netProfitEstimate, 24.39);

  const lossSale = makeSale("margin-loss", "MARGIN", 90, 95);
  assert.equal(
    calculateSaleFinancialMetrics(lossSale, emptyLocalData).vatEstimate,
    0,
  );
});

test("calcula MARGIN com e sem portes sem incluir portes na margem tributável", () => {
  const withShipping = makeSale("margin-shipping", "MARGIN", 300, 200);
  withShipping.shippingCost = 5;
  const withShippingMetrics = calculateSaleFinancialMetrics(withShipping, {
    ...emptyLocalData,
    sales: [withShipping],
  });

  assert.equal(withShippingMetrics.grossProfit, 100);
  assert.equal(withShippingMetrics.vatEstimate, 18.7);
  assert.equal(withShippingMetrics.netProfitEstimate, 76.3);
  assert.equal(withShippingMetrics.grossMarginPercent, 33.33333333333333);
  assert.equal(Number(withShippingMetrics.netMarginPercent.toFixed(2)), 25.43);
  assert.equal(Number(withShippingMetrics.returnOnCostPercent?.toFixed(2)), 37.22);
  const aggregate = calculateProfitability({
    ...emptyLocalData,
    sales: [withShipping],
  }, [withShipping]);
  assert.equal(Number(aggregate.netMarginPercent?.toFixed(2)), 25.43);
  assert.equal(Number(aggregate.returnOnCostPercent?.toFixed(2)), 37.22);

  const withoutShipping = makeSale("margin-no-shipping", "MARGIN", 300, 200);
  const withoutShippingMetrics = calculateSaleFinancialMetrics(withoutShipping, {
    ...emptyLocalData,
    sales: [withoutShipping],
  });
  assert.equal(withoutShippingMetrics.vatEstimate, 18.7);
  assert.equal(withoutShippingMetrics.netProfitEstimate, 81.3);
});

test("calcula VAT23% sobre receita sem IVA antes de custos e despesas", () => {
  const sale = makeSale("vat23-net-revenue", "VAT23%", 400, 200);
  sale.shippingCost = 5;
  const data = {
    ...emptyLocalData,
    sales: [sale],
    expenses: [{
      id: "fee",
      saleId: sale.id,
      category: "Fees / comissões",
      description: "Comissão",
      amount: 10,
      incurredAt: sale.soldAt,
    }],
  };
  const metrics = calculateSaleFinancialMetrics(sale, data);

  assert.equal(metrics.vatEstimate, 74.8);
  assert.equal(Number((metrics.revenue - metrics.vatEstimate).toFixed(2)), 325.2);
  assert.equal(metrics.grossProfit, 200);
  assert.equal(metrics.netProfitEstimate, 110.2);
});

test("calcula VAT0% sem IVA estimado e desconta custos e despesas uma vez", () => {
  const sale = makeSale("vat0-costs", "VAT0%", 45, 25);
  const metrics = calculateSaleFinancialMetrics(sale, {
    ...emptyLocalData,
    sales: [sale],
  });

  assert.equal(metrics.vatEstimate, 0);
  assert.equal(metrics.netProfitEstimate, 20);
});

test("marcar como pago regista apenas o saldo em falta sem duplicar pagamentos existentes", () => {
  const sale = makeSale("payment-balance", "VAT0%", 100, 50);
  const payments = [{
    id: "first-payment",
    saleId: sale.id,
    amount: 35,
    method: "OTHER",
    paidAt: sale.soldAt,
    reference: "",
  }];

  assert.equal(saleOutstanding(sale, payments), 65);
  assert.equal(saleOutstanding(sale, [...payments, {
    id: "settlement",
    saleId: sale.id,
    amount: saleOutstanding(sale, payments),
    method: "OTHER",
    paidAt: sale.soldAt,
    reference: "",
  }]), 0);
});

test("não duplica portes declarados no campo da venda e nas despesas", () => {
  const sale = makeSale("shipping-not-duplicated", "PRIVATE", 100, 50);
  sale.shippingCost = 5;
  const metrics = calculateSaleFinancialMetrics(sale, {
    ...emptyLocalData,
    sales: [sale],
    expenses: [
      { id: "shipping", saleId: sale.id, category: "Envios", description: "Portes", amount: 5, incurredAt: sale.soldAt },
      { id: "fee", saleId: sale.id, category: "Fees", description: "Comissão", amount: 3, incurredAt: sale.soldAt },
    ],
  });

  assert.equal(metrics.shipping, 5);
  assert.equal(metrics.expenses, 3);
  assert.equal(metrics.netProfitEstimate, 42);
  assert.equal(Number(metrics.returnOnCostPercent.toFixed(2)), 72.41);
});

test("retorno aprovado para revenda preserva o custo em stock e contabiliza o reembolso", () => {
  const sale = makeSale("returned-resalable", "PRIVATE", 100, 60);
  sale.lines[0].unitIds = ["unit-returned"];
  const data = {
    ...emptyLocalData,
    sales: [sale],
    units: [{
      id: "unit-returned",
      productId: "",
      internalIdentifier: "",
      serialNumber: "",
      acquisitionCost: 60,
      locationId: "",
      status: "RETURNED_PENDING_REVIEW",
      acquiredAt: sale.soldAt,
    }],
    returns: [{
      id: "return",
      saleId: sale.id,
      unitId: "unit-returned",
      receivedAt: sale.soldAt,
      status: "APPROVED_FOR_RESALE",
    }],
    refunds: [{
      id: "refund",
      saleId: sale.id,
      returnId: "return",
      amount: 100,
      method: "OTHER",
      refundedAt: sale.soldAt,
      reference: "",
      notes: "",
    }],
  };
  const metrics = calculateSaleFinancialMetrics(sale, data);

  assert.equal(metrics.cost, 0);
  assert.equal(metrics.refunds, 100);
  assert.equal(metrics.netProfitEstimate, 0);
});

test("operational totals include completed sales only, not pending or cancelled sales", () => {
  const completed = makeSale("completed", "VAT0%", 100, 40);
  const pending = { ...makeSale("pending", "VAT0%", 200, 40), status: "PENDING" };
  const cancelled = { ...makeSale("cancelled", "VAT0%", 300, 40), status: "CANCELLED" };
  const data = {
    ...emptyLocalData,
    sales: [completed, pending, cancelled],
    expenses: [
      { id: "completed-expense", saleId: completed.id, category: "Fees", description: "Comissão", amount: 5, incurredAt: completed.soldAt },
      { id: "pending-expense", saleId: pending.id, category: "Fees", description: "Comissão", amount: 20, incurredAt: pending.soldAt },
      { id: "cancelled-expense", saleId: cancelled.id, category: "Fees", description: "Comissão", amount: 30, incurredAt: cancelled.soldAt },
    ],
    refunds: [
      { id: "pending-refund", saleId: pending.id, returnId: "", amount: 10, method: "OTHER", refundedAt: pending.soldAt, reference: "", notes: "" },
      { id: "cancelled-refund", saleId: cancelled.id, returnId: "", amount: 15, method: "OTHER", refundedAt: cancelled.soldAt, reference: "", notes: "" },
    ],
  };
  const metrics = calculateOperationalMetrics(data, "2026-10-01", "2026-10-31");

  assert.equal(metrics.salesCount, 1);
  assert.equal(metrics.revenue, 100);
  assert.equal(metrics.grossProfit, 60);
  assert.equal(metrics.netProfitEstimate, 55);
  assert.equal(metrics.outstanding, 300);
});

test("duplica um produto com novas unidades equivalentes e SKU único", () => {
  const product = {
    id: "product",
    name: "Ténis",
    sku: "SKU-1",
    size: "42",
    brand: "Marca",
    active: true,
    purchaseType: "MARGIN",
    supplierId: "supplier",
  };
  const data = {
    ...emptyLocalData,
    products: [product, { ...product, id: "existing-copy", sku: "SKU-1-COPIA" }],
    units: [
      {
        id: "ready-1",
        productId: product.id,
        internalIdentifier: "A",
        serialNumber: "",
        acquisitionCost: 50,
        locationId: "location",
        status: "READY_TO_SHIP",
        acquiredAt: "2026-10-01",
        supplierId: "supplier",
      },
      {
        id: "ready-2",
        productId: product.id,
        internalIdentifier: "B",
        serialNumber: "",
        acquisitionCost: 55,
        locationId: "location",
        status: "READY_TO_SHIP",
        acquiredAt: "2026-10-02",
        supplierId: "supplier",
      },
      {
        id: "sold",
        productId: product.id,
        internalIdentifier: "C",
        serialNumber: "",
        acquisitionCost: 60,
        locationId: "location",
        status: "SOLD",
        acquiredAt: "2026-10-03",
        supplierId: "supplier",
      },
    ],
  };
  const duplicated = duplicateProductWithStock(data, product.id);
  const copy = duplicated.products.at(-1);
  const copiedUnits = duplicated.units.filter((unit) => unit.productId === copy.id);

  assert.equal(copy.name, product.name);
  assert.equal(copy.size, product.size);
  assert.equal(copy.sku, "SKU-1-COPIA-2");
  assert.equal(copiedUnits.length, 2);
  assert.deepEqual(copiedUnits.map((unit) => unit.acquisitionCost), [50, 55]);
  assert.equal(new Set(copiedUnits.map((unit) => unit.id)).size, 2);
  assert.equal(duplicated.movements.length, 2);
});

test("duplica venda e pagamentos com IDs independentes, sem copiar outras relações", () => {
  const sale = makeSale("sale", "VAT0%", 45, 25);
  const payment = {
    id: "payment",
    saleId: sale.id,
    amount: 20,
    method: "CASH",
    paidAt: sale.soldAt,
    reference: "REF",
  };
  const data = {
    ...emptyLocalData,
    sales: [sale],
    payments: [payment],
    expenses: [{
      id: "expense",
      saleId: sale.id,
      category: "Fee",
      description: "Comissão",
      amount: 2,
      incurredAt: sale.soldAt,
    }],
    refunds: [{
      id: "refund",
      saleId: sale.id,
      returnId: "return",
      amount: 1,
      method: "CASH",
      refundedAt: sale.soldAt,
      reference: "",
      notes: "",
    }],
  };
  const duplicated = duplicateSaleWithPayments(data, sale.id);
  const copy = duplicated.sales[0];
  const copiedPayment = duplicated.payments[0];

  assert.notEqual(copy.id, sale.id);
  assert.equal(copy.saleType, sale.saleType);
  assert.deepEqual(copy.lines, sale.lines);
  assert.notEqual(copiedPayment.id, payment.id);
  assert.equal(copiedPayment.saleId, copy.id);
  assert.equal(copiedPayment.amount, payment.amount);
  assert.equal(duplicated.payments.length, 2);
  assert.equal(duplicated.expenses.length, 1);
  assert.equal(duplicated.refunds.length, 1);
});

test("não divide por zero quando venda ou custo são zero", () => {
  const sale = makeSale("zero", "PRIVATE", 0, 0);
  const metrics = calculateSaleFinancialMetrics(sale, {
    ...emptyLocalData,
    sales: [sale],
  });

  assert.equal(metrics.grossProfit, 0);
  assert.equal(metrics.grossMarginPercent, null);
  assert.equal(metrics.returnOnCostPercent, null);
  const freeAcquisition = calculateSaleFinancialMetrics(
    makeSale("free", "PRIVATE", 100, 0),
    emptyLocalData,
  );
  assert.equal(freeAcquisition.grossMarginPercent, 100);
  assert.equal(freeAcquisition.returnOnCostPercent, null);
});

test("não inventa lucro nem IVA de margem quando o custo está em falta", () => {
  const sale = makeSale("missing-cost", "MARGIN");
  sale.lines[0].unitCost = undefined;
  const metrics = calculateSaleFinancialMetrics(sale, {
    ...emptyLocalData,
    sales: [sale],
  });

  assert.equal(metrics.cost, null);
  assert.equal(metrics.grossProfit, null);
  assert.equal(metrics.netProfitEstimate, null);
  assert.equal(metrics.vatEstimate, null);
  const missingPriceSale = makeSale("missing-price", "VAT23%");
  missingPriceSale.lines[0].unitPrice = undefined;
  const missingPrice = calculateSaleFinancialMetrics(missingPriceSale, {
    ...emptyLocalData,
    sales: [missingPriceSale],
  });
  assert.equal(missingPrice.revenue, null);
  assert.equal(missingPrice.grossProfit, null);
  assert.equal(missingPrice.vatEstimate, null);
  assert.equal(missingPrice.netProfitEstimate, null);
});

test("marca totais do período incompletos se alguma venda não tiver custo", () => {
  const knownSale = makeSale("known");
  const unknownSale = makeSale("unknown", "PRIVATE", 50);
  unknownSale.lines[0].unitCost = undefined;
  const sales = [knownSale, unknownSale];
  const metrics = calculateProfitability({
    ...emptyLocalData,
    sales,
  }, sales);

  assert.equal(metrics.grossProfit, null);
  assert.equal(metrics.grossMarginPercent, null);
  assert.equal(metrics.returnOnCostPercent, null);
  assert.equal(metrics.netProfitEstimate, null);
});
