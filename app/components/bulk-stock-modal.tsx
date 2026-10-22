"use client";

import { useState, type FormEvent } from "react";
import { makeId, roundMoney, type Product } from "../lib/local-data";
import { useLocalData } from "./local-data-provider";

type PurchaseType = NonNullable<Product["purchaseType"]>;
type SizeRow = { key: string; size: string; quantity: string; cost: string };

function newRow(): SizeRow {
  return { key: makeId(), size: "", quantity: "1", cost: "" };
}

export function BulkStockModal({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const { data, update } = useLocalData();
  const [rows, setRows] = useState<SizeRow[]>(() => [newRow(), newRow(), newRow()]);
  const [error, setError] = useState("");

  function changeRow(key: string, field: "size" | "quantity" | "cost", value: string) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const sku = String(values.get("sku") ?? "").trim();
    const name = String(values.get("name") ?? "").trim();
    const imageUrl = String(values.get("imageUrl") ?? "").trim();
    const purchaseType = String(values.get("purchaseType") ?? "") as PurchaseType;
    const supplierId = String(values.get("supplierId") ?? "");

    try {
      if (!sku || !name) throw new Error("Preenche o SKU e o nome do produto.");
      const filled = rows.filter((row) => row.size.trim() || row.cost.trim());
      if (!filled.length) throw new Error("Adiciona pelo menos um tamanho.");
      const items = filled.map((row) => {
        const size = row.size.trim();
        const quantity = Number(row.quantity);
        const cost = Number(row.cost);
        if (!size) throw new Error("Falta indicar o tamanho numa das linhas.");
        if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error(`Tamanho ${size}: a quantidade tem de ser um inteiro maior que zero.`);
        if (row.cost.trim() === "" || !Number.isFinite(cost) || cost < 0) throw new Error(`Tamanho ${size}: indica um custo válido.`);
        return { size, quantity, cost: roundMoney(cost) };
      });
      const keys = items.map((item) => item.size.toLocaleLowerCase("pt-PT"));
      if (new Set(keys).size !== keys.length) throw new Error("Há tamanhos repetidos.");

      const now = new Date().toISOString();
      const batchId = makeId();
      update((current) => {
        for (const item of items) {
          if (current.products.some((product) =>
            product.sku.trim().toLocaleLowerCase("pt-PT") === sku.toLocaleLowerCase("pt-PT") &&
            (product.size ?? "").trim().toLocaleLowerCase("pt-PT") === item.size.toLocaleLowerCase("pt-PT"),
          )) {
            throw new Error(`Já existe um produto com este SKU e o tamanho ${item.size}.`);
          }
        }
        const location = current.locations[0] ?? { id: makeId(), name: "Stock principal" };
        const products: Product[] = [];
        const units: (typeof current.units)[number][] = [];
        const movements: (typeof current.movements)[number][] = [];
        for (const item of items) {
          const productId = makeId();
          products.push({ id: productId, sku, size: item.size, name, imageUrl, purchaseType, supplierId, brand: "", active: true });
          for (let index = 0; index < item.quantity; index += 1) {
            const unitId = makeId();
            units.push({
              id: unitId,
              productId,
              internalIdentifier: "",
              serialNumber: "",
              acquisitionCost: item.cost,
              locationId: location.id,
              status: "READY_TO_SHIP",
              acquiredAt: now,
              supplierId: supplierId || undefined,
              acquisitionBatchId: batchId,
            });
            movements.push({
              id: makeId(),
              unitId,
              type: "ADJUSTMENT_IN",
              quantityDelta: 1,
              fromLocationId: "",
              toLocationId: location.id,
              occurredAt: now,
              notes: "Stock inicial registado",
            });
          }
        }
        return {
          ...current,
          locations: current.locations.length ? current.locations : [location],
          products: [...current.products, ...products],
          units: [...current.units, ...units],
          movements: [...current.movements, ...movements],
        };
      });
      const total = items.reduce((sum, item) => sum + item.quantity, 0);
      onSaved(`${items.length} tamanhos adicionados (${total} unidades) ao produto ${sku}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível guardar o stock.");
    }
  }

  return (
    <div className="sale-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="sale-modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-stock-title">
        <header className="sale-modal__header">
          <h2 id="bulk-stock-title">Adicionar vários tamanhos</h2>
          <button className="sale-modal__close" type="button" aria-label="Fechar" onClick={onClose}>×</button>
        </header>
        <form onSubmit={save}>
          <div className="sale-modal__body">
            {error && <p className="feedback feedback--error" role="alert">{error}</p>}
            <div className="form-grid">
              <label className="form-field"><span>SKU</span><input name="sku" required autoFocus /></label>
              <label className="form-field"><span>Tipo de compra</span><select name="purchaseType" defaultValue="PRIVATE" required>
                <option value="VAT0%">VAT0%</option><option value="PRIVATE">Private</option><option value="MARGIN">Margin</option>
              </select></label>
              <label className="form-field stock-modal__wide"><span>Nome do produto</span><input name="name" required /></label>
              <label className="form-field stock-modal__wide"><span>URL da imagem</span><input name="imageUrl" type="url" placeholder="https://..." /></label>
              <label className="form-field stock-modal__wide"><span>Fornecedor</span>
                <select name="supplierId" defaultValue="">
                  <option value="">— Sem fornecedor —</option>
                  {data.suppliers.filter((supplier) => supplier.active !== false).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
            </div>
            <div className="bulk-sizes">
              <div className="bulk-sizes__row bulk-sizes__head"><span>Tamanho</span><span>Quantidade</span><span>Custo por unidade (€)</span><span /></div>
              {rows.map((row) => (
                <div className="bulk-sizes__row" key={row.key}>
                  <input aria-label="Tamanho" value={row.size} onChange={(event) => changeRow(row.key, "size", event.target.value)} />
                  <input aria-label="Quantidade" type="number" min="1" step="1" value={row.quantity} onChange={(event) => changeRow(row.key, "quantity", event.target.value)} />
                  <input aria-label="Custo por unidade" type="number" min="0" step="0.01" value={row.cost} onChange={(event) => changeRow(row.key, "cost", event.target.value)} />
                  <button className="button button--small" type="button" aria-label="Remover linha" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>×</button>
                </div>
              ))}
              <button className="button button--small" type="button" onClick={() => setRows((current) => [...current, newRow()])}>+ Adicionar tamanho</button>
            </div>
            <p className="form-note">Cada tamanho fica como um produto separado, com o seu próprio custo. Linhas vazias são ignoradas.</p>
          </div>
          <footer className="sale-modal__footer">
            <button className="button" type="button" onClick={onClose}>Cancelar</button>
            <button className="button button--primary" type="submit">Guardar stock</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
