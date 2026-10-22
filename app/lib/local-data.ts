export type SaleStatus = "PENDING" | "COMPLETED" | "CANCELLED";
export type PurchaseStatus =
  | "OPEN"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";
export type UnitStatus =
  | "READY_TO_SHIP"
  | "SOLD"
  | "NOT_FOR_SALE"
  | "RETURNED_PENDING_REVIEW";

export type Product = {
  id: string;
  name: string;
  sku: string;
  brand: string;
  active: boolean;
  size?: string;
  imageUrl?: string;
  purchaseType?: "VAT0%" | "PRIVATE" | "MARGIN";
  supplierId?: string;
};

export type IncomingStockItem = {
  id: string;
  sku: string;
  size: string;
  name: string;
  quantity: number;
  unitCost: number;
  purchaseType: NonNullable<Product["purchaseType"]>;
  supplierId: string;
  orderedAt: string;
  trackingUrl: string;
  imageUrl: string;
  receivedAt?: string;
};

export type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

export type Supplier = Contact & {
  discord?: string;
  active?: boolean;
};

export type Customer = Contact & {
  active?: boolean;
};

export type Location = { id: string; name: string };
export type SaleLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
  unitIds: string[];
  sku?: string;
  size?: string;
  productName?: string;
  unitCost?: number;
};

export type Sale = {
  id: string;
  createdAt: string;
  soldAt: string;
  customerId: string;
  buyerName?: string;
  saleType: "PRIVATE" | "MARGIN" | "VAT23%" | "VAT0%";
  invoiceNumber: string;
  declared?: string;
  shippingCost?: number;
  supplierId?: string;
  trackingUrl?: string;
  notes: string;
  status: SaleStatus;
  lines: SaleLine[];
};

export type PurchaseLine = {
  productId: string;
  quantity: number;
  unitCost: number;
  received: number;
};

export type Purchase = {
  id: string;
  createdAt: string;
  orderedAt: string;
  supplierId: string;
  orderNumber: string;
  expectedAt: string;
  tracking: string;
  notes: string;
  status: PurchaseStatus;
  lines: PurchaseLine[];
};

export type InventoryUnit = {
  id: string;
  productId: string;
  internalIdentifier: string;
  serialNumber: string;
  acquisitionCost: number;
  locationId: string;
  status: UnitStatus;
  acquiredAt: string;
  supplierId?: string;
  acquisitionBatchId?: string;
  incomingProductId?: string;
};

export type StockMovement = {
  id: string;
  unitId: string;
  type:
    | "PURCHASE_RECEIPT"
    | "SALE_COMPLETED"
    | "RETURN_RECEIVED"
    | "ADJUSTMENT_IN"
    | "ADJUSTMENT_OUT"
    | "LOCATION_TRANSFER";
  quantityDelta: -1 | 0 | 1;
  fromLocationId: string;
  toLocationId: string;
  occurredAt: string;
  notes: string;
};

export type Payment = {
  id: string;
  saleId: string;
  amount: number;
  method: "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
  paidAt: string;
  reference: string;
};

export type Expense = {
  id: string;
  saleId: string;
  category: string;
  description: string;
  amount: number;
  incurredAt: string;
};

export type Refund = {
  id: string;
  saleId: string;
  returnId: string;
  amount: number;
  method: "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
  refundedAt: string;
  reference: string;
  notes: string;
};

export type ProductReturn = {
  id: string;
  saleId: string;
  unitId: string;
  receivedAt: string;
  status: "PENDING_REVIEW" | "APPROVED_FOR_RESALE" | "NOT_RESALEABLE";
};

export type LocalData = {
  version: 1;
  products: Product[];
  incomingProducts: IncomingStockItem[];
  customers: Customer[];
  suppliers: Supplier[];
  locations: Location[];
  sales: Sale[];
  purchases: Purchase[];
  units: InventoryUnit[];
  movements: StockMovement[];
  payments: Payment[];
  expenses: Expense[];
  refunds: Refund[];
  returns: ProductReturn[];
};

export const emptyLocalData: LocalData = {
  version: 1,
  products: [],
  incomingProducts: [],
  customers: [],
  suppliers: [],
  locations: [],
  sales: [],
  purchases: [],
  units: [],
  movements: [],
  payments: [],
  expenses: [],
  refunds: [],
  returns: [],
};

export function toCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100);
}

export function fromCents(value: number) {
  return value / 100;
}

export function roundMoney(value: number) {
  return fromCents(toCents(value));
}

export function sumMoney(values: number[]) {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0));
}

export function calculateGrossProfit(revenue: number | null, cost: number | null) {
  if (revenue === null || cost === null) return null;
  return fromCents(toCents(revenue) - toCents(cost));
}

export function calculateProfitRatio(profit: number | null, base: number | null) {
  if (profit === null || base === null || !Number.isFinite(profit) || !Number.isFinite(base) || base <= 0) {
    return null;
  }
  return profit / base;
}

export function calculateProfitPercentage(profit: number | null, base: number | null) {
  const ratio = calculateProfitRatio(profit, base);
  return ratio === null ? null : ratio * 100;
}

export function makeId() {
  return crypto.randomUUID();
}

export function findOrCreateCustomer(
  customers: Customer[],
  customerId: string,
  name: string,
) {
  const normalizedName = name.trim().toLocaleLowerCase("pt-PT");
  const existing = customers.find((customer) =>
    customer.active !== false &&
    (customerId
      ? customer.id === customerId
      : customer.name.trim().toLocaleLowerCase("pt-PT") === normalizedName),
  );
  if (customerId && !existing) throw new Error("O cliente selecionado já não está ativo.");
  if (existing) return { customer: existing, customers, created: false };
  const customer: Customer = {
    id: makeId(),
    name: name.trim(),
    email: "",
    phone: "",
    address: "",
    notes: "",
    active: true,
  };
  return { customer, customers: [...customers, customer], created: true };
}

export function findOrCreateSupplier(
  suppliers: Supplier[],
  supplierId: string,
  name: string,
) {
  const normalizedName = name.trim().toLocaleLowerCase("pt-PT");
  if (!supplierId && !normalizedName) {
    return { supplier: null, suppliers, created: false };
  }
  const existing = suppliers.find((supplier) =>
    supplier.active !== false &&
    (supplierId
      ? supplier.id === supplierId
      : supplier.name.trim().toLocaleLowerCase("pt-PT") === normalizedName),
  );
  if (supplierId && !existing) throw new Error("O fornecedor selecionado já não está ativo.");
  if (existing) return { supplier: existing, suppliers, created: false };
  const supplier: Supplier = {
    id: makeId(),
    name: name.trim(),
    email: "",
    phone: "",
    address: "",
    notes: "",
    active: true,
  };
  return { supplier, suppliers: [...suppliers, supplier], created: true };
}

export function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function paymentsTotal(saleId: string, payments: Payment[]) {
  return sumMoney(
    payments
      .filter((payment) => payment.saleId === saleId)
      .map((payment) => payment.amount),
  );
}

export function refundsTotal(saleId: string, refunds: Refund[]) {
  return sumMoney(
    refunds
      .filter((refund) => refund.saleId === saleId)
      .map((refund) => refund.amount),
  );
}

export function saleOutstanding(sale: Sale, payments: Payment[]) {
  return fromCents(
    Math.max(0, toCents(saleTotal(sale)) - toCents(paymentsTotal(sale.id, payments))),
  );
}

export function paymentStatus(sale: Sale, payments: Payment[]) {
  const received = toCents(paymentsTotal(sale.id, payments));
  const due = toCents(saleTotal(sale));
  if (due === 0) return "Sem valor";
  if (received <= 0) return "Por receber";
  if (received < due) return "Parcial";
  return "Pago";
}

export function saleTotal(sale: Sale) {
  return fromCents(
    sale.lines.reduce(
      (total, line) => total + toCents(line.unitPrice) * line.quantity,
      0,
    ),
  );
}

export function saleCost(sale: Sale, data: LocalData) {
  const resalableReturnUnitIds = new Set(
    data.returns
      .filter(
        (record) =>
          record.saleId === sale.id &&
          record.status === "APPROVED_FOR_RESALE",
      )
      .map((record) => record.unitId),
  );
  return fromCents(
    sale.lines.reduce((total, line) => {
      if (line.unitIds.length) {
        const unitCost = line.unitIds
          .filter((unitId) => !resalableReturnUnitIds.has(unitId))
          .reduce(
            (lineTotal, unitId) =>
              lineTotal +
              toCents(
                data.units.find((unit) => unit.id === unitId)?.acquisitionCost ??
                  line.unitCost ??
                  0,
              ),
            0,
          );
        return total + unitCost;
      }
      return total + toCents(line.unitCost ?? 0) * line.quantity;
    }, 0),
  );
}

function hasCompleteSalePrice(sale: Sale) {
  return sale.lines.length > 0 && sale.lines.every((line) =>
    Number.isFinite(line.unitPrice) &&
    line.unitPrice >= 0 &&
    Number.isFinite(line.quantity) &&
    line.quantity > 0,
  );
}

function hasCompleteSaleCost(sale: Sale, data: LocalData) {
  if (!sale.lines.length) return false;
  const resalableReturnUnitIds = new Set(
    data.returns
      .filter((record) =>
        record.saleId === sale.id && record.status === "APPROVED_FOR_RESALE",
      )
      .map((record) => record.unitId),
  );

  return sale.lines.every((line) => {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) return false;
    if (!line.unitIds.length) {
      return Number.isFinite(line.unitCost) && (line.unitCost ?? -1) >= 0;
    }
    return line.unitIds.every((unitId) => {
      if (resalableReturnUnitIds.has(unitId)) return true;
      const unit = data.units.find((item) => item.id === unitId);
      const cost = unit?.acquisitionCost ?? line.unitCost;
      return Number.isFinite(cost) && (cost ?? -1) >= 0;
    });
  });
}

export type SaleFinancialMetrics = {
  revenue: number | null;
  cost: number | null;
  grossProfit: number | null;
  grossMarginPercent: number | null;
  netMarginPercent: number | null;
  returnOnCostPercent: number | null;
  vatEstimate: number | null;
  shipping: number;
  expenses: number;
  refunds: number;
  netProfitEstimate: number | null;
};

export type ProfitabilityMetrics = SaleFinancialMetrics & {
  salesCount: number;
  outstanding: number;
  netMarginPercent: number | null;
};

function nonVatExpenses(expenses: Expense[]) {
  return expenses.filter((expense) =>
    expense.category.trim().toLocaleLowerCase("pt-PT") !== "iva",
  );
}

function isShippingExpense(expense: Expense) {
  return ["envio", "envios", "portes", "portes de envio", "shipping"]
    .includes(expense.category.trim().toLocaleLowerCase("pt-PT"));
}

export function calculateSaleFinancialMetrics(
  sale: Sale,
  data: LocalData,
): SaleFinancialMetrics {
  const priceKnown = hasCompleteSalePrice(sale);
  const costKnown = hasCompleteSaleCost(sale, data);
  const revenue = priceKnown ? saleTotal(sale) : null;
  const cost = costKnown ? saleCost(sale, data) : null;
  const grossProfit = calculateGrossProfit(revenue, cost);
  const vatEstimate = saleVat(sale, data);
  const shipping = Number.isFinite(sale.shippingCost) && (sale.shippingCost ?? 0) >= 0
    ? roundMoney(sale.shippingCost ?? 0)
    : 0;
  const expenses = sumMoney(nonVatExpenses(
    data.expenses.filter((expense) => expense.saleId === sale.id),
  ).filter((expense) => !(shipping > 0 && isShippingExpense(expense)))
    .map((expense) => expense.amount));
  const refunds = refundsTotal(sale.id, data.refunds);
  const netProfitEstimate = grossProfit !== null && vatEstimate !== null
    ? sumMoney([grossProfit, -vatEstimate, -shipping, -expenses, -refunds])
    : null;

  return {
    revenue,
    cost,
    grossProfit,
    grossMarginPercent: calculateProfitPercentage(grossProfit, revenue),
    netMarginPercent: calculateProfitPercentage(netProfitEstimate, revenue),
    returnOnCostPercent: calculateProfitPercentage(
      netProfitEstimate,
      cost === null ? null : sumMoney([cost, shipping, expenses]),
    ),
    vatEstimate,
    shipping,
    expenses,
    refunds,
    netProfitEstimate,
  };
}

export function saleVat(sale: Sale, data: LocalData): number | null {
  if (sale.saleType === "PRIVATE" || sale.saleType === "VAT0%") return 0;
  if (!hasCompleteSalePrice(sale)) return null;
  const saleValue = saleTotal(sale);
  if (sale.saleType === "VAT23%") return roundMoney((saleValue * 23) / 123);
  if (sale.saleType === "MARGIN") {
    if (!hasCompleteSaleCost(sale, data)) return null;
    const taxableMargin = Math.max(0, saleValue - saleCost(sale, data));
    return roundMoney((taxableMargin * 23) / 123);
  }
  return 0;
}

export function calculateProfitability(
  data: LocalData,
  sales: Sale[],
  startDate = "",
  endDate = "",
): ProfitabilityMetrics {
  const inPeriod = (date: string) => {
    const calendarDate = date.slice(0, 10);
    return (!startDate || calendarDate >= startDate) &&
      (!endDate || calendarDate <= endDate);
  };
  const saleMetrics = sales.map((sale) => calculateSaleFinancialMetrics(sale, data));
  const complete = <K extends "revenue" | "cost" | "grossProfit" | "vatEstimate">(
    key: K,
  ) => saleMetrics.every((item) => item[key] !== null);
  const revenue = complete("revenue")
    ? sumMoney(saleMetrics.map((item) => item.revenue ?? 0))
    : null;
  const cost = complete("cost")
    ? sumMoney(saleMetrics.map((item) => item.cost ?? 0))
    : null;
  const grossProfit = calculateGrossProfit(revenue, cost);
  const vatEstimate = complete("vatEstimate")
    ? sumMoney(saleMetrics.map((item) => item.vatEstimate ?? 0))
    : null;
  const shipping = sumMoney(saleMetrics.map((item) => item.shipping));
  const salesById = new Map(data.sales.map((sale) => [sale.id, sale]));
  const includedSaleIds = new Set(sales.map((sale) => sale.id));
  const expenses = sumMoney(nonVatExpenses(
    data.expenses.filter((expense) => {
      if (!inPeriod(expense.incurredAt)) return false;
      if (expense.saleId && !includedSaleIds.has(expense.saleId)) return false;
      const sale = salesById.get(expense.saleId);
      return !(sale && (sale.shippingCost ?? 0) > 0 && isShippingExpense(expense));
    }),
  ).map((expense) => expense.amount));
  const refunds = sumMoney(
    data.refunds
      .filter((refund) => includedSaleIds.has(refund.saleId) && inPeriod(refund.refundedAt))
      .map((refund) => refund.amount),
  );
  const netProfitEstimate = grossProfit !== null && vatEstimate !== null
    ? sumMoney([grossProfit, -vatEstimate, -shipping, -expenses, -refunds])
    : null;
  const totalCost = cost === null ? null : sumMoney([cost, shipping, expenses]);
  const outstanding = sumMoney(
    sales.map((sale) => saleOutstanding(sale, data.payments)),
  );

  return {
    salesCount: sales.length,
    revenue,
    cost,
    grossProfit,
    grossMarginPercent: calculateProfitPercentage(grossProfit, revenue),
    returnOnCostPercent: calculateProfitPercentage(netProfitEstimate, totalCost),
    vatEstimate,
    shipping,
    expenses,
    refunds,
    netProfitEstimate,
    netMarginPercent: calculateProfitPercentage(netProfitEstimate, revenue),
    outstanding,
  };
}

export function completePendingSale(data: LocalData, saleId: string) {
  const sale = data.sales.find((item) => item.id === saleId);
  if (!sale || sale.status !== "PENDING") {
    throw new Error("Esta venda já não está pendente.");
  }
  if (!sale.lines.length) {
    throw new Error("A venda não tem produtos para concluir.");
  }
  return {
    ...data,
    sales: data.sales.map((item) =>
      item.id === saleId ? { ...item, status: "COMPLETED" as const } : item,
    ),
  };
}

export function deleteSaleAndRelatedData(data: LocalData, saleId: string) {
  if (!data.sales.some((sale) => sale.id === saleId)) {
    throw new Error("Esta venda já não existe.");
  }
  return {
    ...data,
    sales: data.sales.filter((sale) => sale.id !== saleId),
    payments: data.payments.filter((payment) => payment.saleId !== saleId),
    expenses: data.expenses.filter((expense) => expense.saleId !== saleId),
    refunds: data.refunds.filter((refund) => refund.saleId !== saleId),
    returns: data.returns.filter((record) => record.saleId !== saleId),
  };
}

export function duplicateSaleWithPayments(data: LocalData, saleId: string) {
  const sale = data.sales.find((item) => item.id === saleId);
  if (!sale) throw new Error("Esta venda já não existe.");

  const duplicateId = makeId();
  const duplicate: Sale = {
    ...sale,
    id: duplicateId,
    createdAt: new Date().toISOString(),
    lines: sale.lines.map((line) => ({
      ...line,
      unitIds: [...line.unitIds],
    })),
  };
  const payments = data.payments
    .filter((payment) => payment.saleId === saleId)
    .map((payment) => ({
      ...payment,
      id: makeId(),
      saleId: duplicateId,
    }));

  return {
    ...data,
    sales: [duplicate, ...data.sales],
    payments: [...payments, ...data.payments],
  };
}

export function duplicateProductWithStock(data: LocalData, productId: string) {
  const source = data.products.find((product) => product.id === productId && product.active);
  if (!source) throw new Error("Este produto já não está ativo.");

  const normalizedSize = (source.size ?? "").trim().toLocaleLowerCase("pt-PT");
  const hasSku = (sku: string) => data.products.some((product) =>
    product.sku.trim().toLocaleLowerCase("pt-PT") === sku.toLocaleLowerCase("pt-PT") &&
    (product.size ?? "").trim().toLocaleLowerCase("pt-PT") === normalizedSize,
  );
  let sku = "";
  for (let suffixNumber = 1; suffixNumber <= data.products.length + 1; suffixNumber += 1) {
    const suffix = suffixNumber === 1 ? "-COPIA" : `-COPIA-${suffixNumber}`;
    const base = (source.sku || "PRODUTO").slice(0, 80 - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!hasSku(candidate)) {
      sku = candidate;
      break;
    }
  }
  if (!sku) throw new Error("Não foi possível gerar um SKU único para a cópia.");

  const now = new Date().toISOString();
  const duplicateId = makeId();
  const batchId = makeId();
  const duplicate: Product = { ...source, id: duplicateId, sku };
  const sourceUnits = data.units.filter(
    (unit) => unit.productId === source.id && unit.status === "READY_TO_SHIP",
  );
  const copiedUnits = sourceUnits.map((unit) => ({
    ...unit,
    id: makeId(),
    productId: duplicateId,
    internalIdentifier: makeId(),
    serialNumber: "",
    acquisitionBatchId: batchId,
  }));
  const movements = copiedUnits.map((unit) => ({
    id: makeId(),
    unitId: unit.id,
    type: "ADJUSTMENT_IN" as const,
    quantityDelta: 1 as const,
    fromLocationId: "",
    toLocationId: unit.locationId,
    occurredAt: now,
    notes: `Stock duplicado do produto ${source.sku}`,
  }));

  return {
    ...data,
    products: [...data.products, duplicate],
    units: [...data.units, ...copiedUnits],
    movements: [...data.movements, ...movements],
  };
}

export function calculateOperationalMetrics(
  data: LocalData,
  startDate: string,
  endDate: string,
) {
  const inPeriod = (date: string) => {
    const calendarDate = date.slice(0, 10);
    return (!startDate || calendarDate >= startDate) &&
      (!endDate || calendarDate <= endDate);
  };
  const completedSales = data.sales.filter(
    (sale) => sale.status === "COMPLETED" && inPeriod(sale.soldAt),
  );
  const profitability = calculateProfitability(data, completedSales, startDate, endDate);
  const outstanding = sumMoney(
    data.sales
      .filter((sale) =>
        (sale.status === "PENDING" || sale.status === "COMPLETED") &&
        inPeriod(sale.soldAt),
      )
      .map((sale) => saleOutstanding(sale, data.payments)),
  );
  const purchaseTotal = sumMoney(
    data.purchases
      .filter(
        (purchase) =>
          purchase.status !== "CANCELLED" && inPeriod(purchase.orderedAt),
      )
      .flatMap((purchase) =>
        purchase.lines.map((line) => line.quantity * line.unitCost),
      ),
  );
  const stockCost = sumMoney(
    data.units
      .filter((unit) => unit.status === "READY_TO_SHIP")
      .map((unit) => unit.acquisitionCost),
  );

  return {
    completedSales,
    ...profitability,
    operationalResult: profitability.netProfitEstimate,
    outstanding,
    purchaseTotal,
    stockCost,
    averageSale: profitability.revenue !== null && completedSales.length
      ? fromCents(toCents(profitability.revenue) / completedSales.length)
      : null,
  };
}

export function formatEur(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(roundMoney(value));
}

export function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT").format(new Date(`${value}T12:00:00`));
}

export function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
