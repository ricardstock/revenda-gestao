import type {
  Customer,
  Expense,
  InventoryUnit,
  LocalData,
  Payment,
  Product,
  Sale,
  StockMovement,
  Supplier,
} from "./local-data";

type Row = Record<string, unknown>;

export type LegacyImportSummary = {
  sales: number;
  pendingSales: number;
  stockProducts: number;
  suppliers: number;
  customers: number;
  expenses: number;
  skipped: number;
};

const SALE_TYPES: Record<string, Sale["saleType"]> = {
  private: "PRIVATE",
  vat0: "VAT0%",
  vat23: "VAT23%",
  margin: "MARGIN",
};

const PURCHASE_TYPES: Record<string, NonNullable<Product["purchaseType"]>> = {
  private: "PRIVATE",
  vat0: "VAT0%",
  margin: "MARGIN",
};

function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((item): item is Row => !!item && typeof item === "object")
    : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function money(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function key(value: string) {
  return value.trim().toLocaleLowerCase("pt-PT");
}

export function isLegacyBackup(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.completedSales) && Array.isArray(record.pendingSales);
}

// Junta os dados da plataforma anterior aos atuais. Repetir a importação não duplica.
export function mergeLegacyBackup(current: LocalData, backup: unknown): {
  data: LocalData;
  summary: LegacyImportSummary;
} {
  if (!isLegacyBackup(backup)) {
    throw new Error("O ficheiro não é uma cópia da plataforma anterior.");
  }
  const source = backup as Record<string, unknown>;
  const summary: LegacyImportSummary = {
    sales: 0,
    pendingSales: 0,
    stockProducts: 0,
    suppliers: 0,
    customers: 0,
    expenses: 0,
    skipped: 0,
  };

  const suppliers: Supplier[] = [...current.suppliers];
  const supplierIds = new Map<string, string>();
  for (const row of rows(source.suppliers)) {
    const legacyId = text(row.id);
    const name = text(row.name);
    if (!name) {
      summary.skipped += 1;
      continue;
    }
    const existing = suppliers.find((item) => key(item.name) === key(name));
    if (existing) {
      supplierIds.set(legacyId, existing.id);
      continue;
    }
    const id = `legacy-supplier-${legacyId || name}`;
    suppliers.push({
      id,
      name,
      email: text(row.email),
      phone: "",
      address: "",
      notes: [text(row.contact), text(row.website)].filter(Boolean).join(" · "),
      active: true,
    });
    supplierIds.set(legacyId, id);
    summary.suppliers += 1;
  }
  const mapSupplier = (value: unknown) => {
    const legacy = text(value);
    return legacy ? supplierIds.get(legacy) : undefined;
  };

  const locations = current.locations.length
    ? current.locations
    : [{ id: "legacy-location-main", name: "Stock principal" }];
  const locationId = locations[0].id;

  const products: Product[] = [...current.products];
  const units: InventoryUnit[] = [...current.units];
  const movements: StockMovement[] = [...current.movements];
  for (const row of rows(source.stock)) {
    const legacyId = text(row.id);
    const id = `legacy-stock-${legacyId}`;
    const name = text(row.product);
    if (!legacyId || !name || products.some((item) => item.id === id)) {
      summary.skipped += 1;
      continue;
    }
    const quantity = Math.max(0, Math.floor(Number(row.qty) || 0));
    const supplierId = mapSupplier(row.supplierId);
    products.push({
      id,
      name,
      sku: text(row.sku),
      brand: text(row.brand),
      size: text(row.size),
      imageUrl: text(row.image),
      purchaseType: PURCHASE_TYPES[text(row.type)] ?? "PRIVATE",
      supplierId,
      active: true,
    });
    const acquiredAt = isDate(text(row.addedDate)) ? text(row.addedDate) : new Date().toISOString();
    for (let index = 0; index < quantity; index += 1) {
      const unitId = `legacy-unit-${legacyId}-${index}`;
      units.push({
        id: unitId,
        productId: id,
        internalIdentifier: "",
        serialNumber: "",
        acquisitionCost: money(row.cost),
        locationId,
        status: "READY_TO_SHIP",
        acquiredAt,
        supplierId,
      });
      movements.push({
        id: `legacy-movement-${legacyId}-${index}`,
        unitId,
        type: "ADJUSTMENT_IN",
        quantityDelta: 1,
        fromLocationId: "",
        toLocationId: locationId,
        occurredAt: acquiredAt,
        notes: "Importado da plataforma anterior",
      });
    }
    summary.stockProducts += 1;
  }

  const customers: Customer[] = [...current.customers];
  const sales: Sale[] = [...current.sales];
  const payments: Payment[] = [...current.payments];
  const importedCustomerIds = new Set<string>();

  function customerFor(row: Row) {
    const name = text(row.buyer);
    if (!name) return { id: "", name: "" };
    let customer = customers.find((item) => key(item.name) === key(name));
    if (!customer) {
      customer = {
        id: `legacy-customer-${key(name).replace(/\s+/g, "-")}`,
        name,
        email: text(row.clientEmail),
        phone: text(row.clientWhatsapp),
        address: "",
        notes: "",
        active: true,
      };
      customers.push(customer);
      importedCustomerIds.add(customer.id);
    }
    return { id: customer.id, name };
  }

  function importSales(list: Row[], status: Sale["status"], prefix: string) {
    let count = 0;
    for (const row of list) {
      const legacyId = text(row.id);
      const id = `${prefix}-${legacyId}`;
      const soldAt = isDate(text(row.date)) ? text(row.date) : "";
      const price = money(row.price);
      if (!legacyId || !soldAt || sales.some((item) => item.id === id)) {
        summary.skipped += 1;
        continue;
      }
      const saleType = SALE_TYPES[text(row.type)] ?? "PRIVATE";
      const declared = saleType === "PRIVATE"
        ? "PRIVATE"
        : text(row.declared).toLowerCase() === "yes" ? "YES" : "NO";
      const customer = customerFor(row);
      const sku = text(row.sku);
      const size = text(row.size);
      const product = products.find((item) =>
        item.active && key(item.sku) === key(sku) && key(item.size ?? "") === key(size),
      );
      sales.push({
        id,
        createdAt: `${soldAt}T12:00:00.000Z`,
        soldAt,
        customerId: customer.id,
        buyerName: customer.name,
        saleType,
        invoiceNumber: declared === "YES" ? text(row.faturaNum) : "",
        declared,
        shippingCost: money(row.shipping),
        supplierId: mapSupplier(row.supplierId),
        trackingUrl: text(row.trackingLink),
        notes: text(row.obs),
        status,
        lines: [{
          productId: product?.id ?? "",
          quantity: 1,
          unitPrice: price,
          unitIds: [],
          sku,
          size,
          productName: text(row.product),
          unitCost: money(row.cost),
        }],
      });
      const paid = text(row.payment) === "paid"
        ? price
        : Math.min(price, money(row.paidAmount));
      if (paid > 0) {
        payments.push({
          id: `legacy-payment-${legacyId}`,
          saleId: id,
          amount: paid,
          method: "OTHER",
          paidAt: soldAt,
          reference: "",
        });
      }
      count += 1;
    }
    return count;
  }

  summary.sales = importSales(rows(source.completedSales), "COMPLETED", "legacy-sale");
  summary.pendingSales = importSales(rows(source.pendingSales), "PENDING", "legacy-pending");
  summary.customers = importedCustomerIds.size;

  const expenses: Expense[] = [...current.expenses];
  for (const row of rows(source.despesas)) {
    const legacyId = text(row.id);
    const id = `legacy-expense-${legacyId}`;
    const incurredAt = text(row.data);
    if (!legacyId || !isDate(incurredAt) || expenses.some((item) => item.id === id)) {
      summary.skipped += 1;
      continue;
    }
    expenses.push({
      id,
      saleId: "",
      category: text(row.categoria) || "Outros",
      description: text(row.descricao) || text(row.categoria) || "Despesa",
      amount: money(row.valor),
      incurredAt,
    });
    summary.expenses += 1;
  }

  return {
    data: {
      ...current,
      locations,
      suppliers,
      customers,
      products,
      units,
      movements,
      sales,
      payments,
      expenses,
    },
    summary,
  };
}
