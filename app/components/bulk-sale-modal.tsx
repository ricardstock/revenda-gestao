"use client";

import { useState, type FormEvent } from "react";
import {
  findOrCreateCustomer,
  findOrCreateSupplier,
  localDateString,
  makeId,
  roundMoney,
  type Sale,
} from "../lib/local-data";
import { useLocalData } from "./local-data-provider";
import { CustomerAutocomplete } from "./customer-autocomplete";
import { SupplierAutocomplete } from "./supplier-autocomplete";

type SaleType = Sale["saleType"];
type SizeRow = { key: string; size: string; quantity: string; price: string; cost: string };

const saleTypes: { value: SaleType; label: string }[] = [
  { value: "PRIVATE", label: "Private" },
  { value: "MARGIN", label: "Margin" },
  { value: "VAT23%", label: "VAT 23%" },
  { value: "VAT0%", label: "VAT 0%" },
];

function newRow(): SizeRow {
  return { key: makeId(), size: "", quantity: "1", price: "", cost: "" };
}

export function BulkSaleModal({ status, onClose, onSaved }: {
  status: "PENDING" | "COMPLETED";
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { data, update } = useLocalData();
  const [rows, setRows] = useState<SizeRow[]>(() => [newRow(), newRow()]);
  const [buyerName, setBuyerName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [saleType, setSaleType] = useState<SaleType>("PRIVATE");
  const [declaredValue, setDeclaredValue] = useState<"YES" | "NO">("NO");
  const [today] = useState(() => localDateString(new Date()));
  const [error, setError] = useState("");

  function changeRow(key: string, field: "size" | "quantity" | "price" | "cost", value: string) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const soldAt = String(values.get("soldAt") ?? "");
    const sku = String(values.get("sku") ?? "").trim();
    const productName = String(values.get("productName") ?? "").trim();
    const defaultCost = String(values.get("cost") ?? "").trim();
    const shippingCost = Number(values.get("shippingCost"));
    const paymentMode = String(values.get("paymentMode") ?? "PENDING");
    const trackingUrl = String(values.get("trackingUrl") ?? "").trim();
    const notes = String(values.get("notes") ?? "").trim();
    const invoiceNumber = String(values.get("invoiceNumber") ?? "").trim();
    const declared = saleType === "PRIVATE" ? "PRIVATE" : declaredValue;

    try {
      if (!soldAt || !buyerName.trim() || !sku || !productName) {
        throw new Error("Preenche a data, o comprador, o SKU e o produto.");
      }
      if (!Number.isFinite(shippingCost) || shippingCost < 0) throw new Error("Indica um custo de envio válido.");
      if (trackingUrl) {
        const url = new URL(trackingUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("O link de rastreio tem de usar http:// ou https://.");
      }
      const filled = rows.filter((row) => row.size.trim() || row.price.trim());
      if (!filled.length) throw new Error("Adiciona pelo menos um tamanho.");
      const items = filled.map((row) => {
        const size = row.size.trim();
        const quantity = Number(row.quantity);
        const price = Number(row.price);
        const cost = Number(row.cost.trim() === "" ? defaultCost || 0 : row.cost);
        const label = size ? `Tamanho ${size}` : "Uma das linhas";
        if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error(`${label}: a quantidade tem de ser um inteiro maior que zero.`);
        if (row.price.trim() === "" || !Number.isFinite(price) || price <= 0) throw new Error(`${label}: o valor de venda tem de ser superior a zero.`);
        if (!Number.isFinite(cost) || cost < 0) throw new Error(`${label}: indica um custo válido.`);
        return { size, quantity, price: roundMoney(price), cost: roundMoney(cost) };
      });
      const totalSales = items.reduce((sum, item) => sum + item.quantity, 0);
      if (totalSales > 200) throw new Error("O máximo é 200 vendas de cada vez.");

      update((current) => {
        const customerResult = findOrCreateCustomer(current.customers, customerId, buyerName.trim());
        const supplierResult = findOrCreateSupplier(current.suppliers, supplierId, supplierName.trim());
        const createdAt = new Date().toISOString();
        const sales: Sale[] = items.flatMap((item) => {
          const product = current.products.find((candidate) =>
            candidate.active &&
            candidate.sku.trim().toLocaleLowerCase("pt-PT") === sku.toLocaleLowerCase("pt-PT") &&
            (candidate.size ?? "").trim().toLocaleLowerCase("pt-PT") === item.size.toLocaleLowerCase("pt-PT"),
          );
          return Array.from({ length: item.quantity }, () => ({
            id: makeId(),
            createdAt,
            soldAt,
            customerId: customerResult.customer.id,
            buyerName: buyerName.trim(),
            saleType,
            invoiceNumber: declared === "YES" ? invoiceNumber : "",
            declared,
            shippingCost: roundMoney(shippingCost),
            supplierId: supplierResult.supplier?.id,
            trackingUrl,
            notes,
            status,
            lines: [{
              productId: product?.id ?? "",
              quantity: 1,
              unitPrice: item.price,
              unitIds: [],
              sku,
              size: item.size,
              productName,
              unitCost: item.cost,
            }],
          }));
        });
        const payments = paymentMode === "PAID"
          ? sales.map((sale) => ({
            id: makeId(),
            saleId: sale.id,
            amount: sale.lines[0].unitPrice,
            method: "OTHER" as const,
            paidAt: soldAt,
            reference: "",
          }))
          : [];
        return {
          ...current,
          customers: customerResult.customers,
          suppliers: supplierResult.suppliers,
          sales: [...sales, ...current.sales],
          payments: [...payments, ...current.payments],
        };
      });
      onSaved(`${totalSales} ${totalSales === 1 ? "venda registada" : "vendas registadas"} para “${buyerName.trim()}”.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível guardar as vendas.");
    }
  }

  return (
    <div className="sale-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="sale-modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-sale-title">
        <header className="sale-modal__header">
          <h2 id="bulk-sale-title">Venda em bulk ({status === "COMPLETED" ? "concluída" : "pendente"})</h2>
          <button className="sale-modal__close" type="button" aria-label="Fechar" onClick={onClose}>×</button>
        </header>
        <form onSubmit={save}>
          <div className="sale-modal__body">
            {error && <p className="feedback feedback--error" role="alert">{error}</p>}
            <div className="form-grid">
              <label className="form-field"><span>Data</span><input name="soldAt" type="date" defaultValue={today} required /></label>
              <CustomerAutocomplete
                customers={data.customers}
                value={buyerName}
                selectedCustomerId={customerId}
                onChange={(value) => { setBuyerName(value); setCustomerId(""); }}
                onSelect={(customer) => { setBuyerName(customer.name); setCustomerId(customer.id); }}
              />
              <label className="form-field"><span>SKU</span><input name="sku" required maxLength={80} /></label>
              <label className="form-field pending-sale-product-field"><span>Produto</span><input name="productName" required maxLength={160} /></label>
              <label className="form-field"><span>Custo por defeito</span><input name="cost" type="number" min="0" step="0.01" defaultValue="0" /></label>
              <label className="form-field"><span>Custo Envio (por venda)</span><input name="shippingCost" type="number" min="0" step="0.01" defaultValue="0" required /></label>
              <label className="form-field"><span>Tipo</span><select name="saleType" value={saleType} onChange={(event) => {
                const value = saleTypes.find((type) => type.value === event.target.value)?.value;
                if (value) setSaleType(value);
              }}>{saleTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
              <label className="form-field"><span>Pagamento</span><select name="paymentMode" defaultValue="PENDING">
                <option value="PENDING">Pendente</option><option value="PAID">Pago</option>
              </select></label>
              <SupplierAutocomplete
                suppliers={data.suppliers}
                value={supplierName}
                selectedSupplierId={supplierId}
                onChange={(value) => { setSupplierName(value); setSupplierId(""); }}
                onSelect={(supplier) => { setSupplierName(supplier.name); setSupplierId(supplier.id); }}
              />
              <label className="form-field"><span>Link Rastreamento</span><input name="trackingUrl" type="url" placeholder="https://..." /></label>
              <label className="form-field"><span>Declarado?</span>{saleType === "PRIVATE"
                ? <input value="PRIVATE" readOnly aria-label="Declarado: PRIVATE" />
                : <select name="declared" value={declaredValue} onChange={(event) => {
                  if (event.target.value === "YES" || event.target.value === "NO") setDeclaredValue(event.target.value);
                }}><option value="NO">Não</option><option value="YES">Sim</option></select>}</label>
              {saleType !== "PRIVATE" && declaredValue === "YES" && <label className="form-field"><span>Nº da fatura</span><input name="invoiceNumber" maxLength={80} /></label>}
              <label className="form-field sale-modal__notes"><span>Obs</span><textarea name="notes" rows={2} maxLength={1000} /></label>
            </div>
            <div className="bulk-sizes bulk-sizes--sales">
              <div className="bulk-sizes__row bulk-sizes__head"><span>Tamanho</span><span>Quantidade</span><span>Venda (€)</span><span>Custo (€)</span><span /></div>
              {rows.map((row) => (
                <div className="bulk-sizes__row" key={row.key}>
                  <input aria-label="Tamanho" value={row.size} onChange={(event) => changeRow(row.key, "size", event.target.value)} />
                  <input aria-label="Quantidade" type="number" min="1" step="1" value={row.quantity} onChange={(event) => changeRow(row.key, "quantity", event.target.value)} />
                  <input aria-label="Valor de venda" type="number" min="0.01" step="0.01" value={row.price} onChange={(event) => changeRow(row.key, "price", event.target.value)} />
                  <input aria-label="Custo" type="number" min="0" step="0.01" placeholder="por defeito" value={row.cost} onChange={(event) => changeRow(row.key, "cost", event.target.value)} />
                  <button className="button button--small" type="button" aria-label="Remover linha" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>×</button>
                </div>
              ))}
              <button className="button button--small" type="button" onClick={() => setRows((current) => [...current, newRow()])}>+ Adicionar tamanho</button>
            </div>
            <p className="form-note">Cria uma venda por unidade (máximo 200), cada uma com o seu tamanho e preço. O custo em branco usa o custo por defeito. Linhas vazias são ignoradas. Não altera o stock.</p>
          </div>
          <footer className="sale-modal__footer">
            <button className="button" type="button" onClick={onClose}>Cancelar</button>
            <button className="button button--primary" type="submit">Guardar vendas</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
