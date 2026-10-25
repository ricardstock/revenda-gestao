"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  formatEur,
  localDateString,
  makeId,
  roundMoney,
  type IncomingStockItem,
  type Product,
} from "../lib/local-data";
import { useLocalData } from "./local-data-provider";
import { PrivacyValue } from "./workspace-shell";

type PurchaseType = NonNullable<Product["purchaseType"]>;

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-PT").format(new Date(year, month - 1, day));
}

function isWebUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function IncomingStockPage() {
  const { data, ready, error, update } = useLocalData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<IncomingStockItem | null>(null);
  const [orderedAt, setOrderedAt] = useState("");
  const [showReceived, setShowReceived] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierEmail, setNewSupplierEmail] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [supplierNotice, setSupplierNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const rows = useMemo(
    () => data.incomingProducts.filter((item) => showReceived || !item.receivedAt),
    [data.incomingProducts, showReceived],
  );
  const pending = data.incomingProducts.filter((item) => !item.receivedAt);
  const pendingQuantity = pending.reduce((sum, item) => sum + item.quantity, 0);
  const pendingValue = pending.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0,
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => setOrderedAt(localDateString(new Date())), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function createSupplier() {
    const name = newSupplierName.trim();
    if (!name) {
      setFormError("Indica o nome do fornecedor.");
      return;
    }
    try {
      const existing = data.suppliers.find(
        (supplier) => supplier.active !== false &&
          supplier.name.trim().toLocaleLowerCase("pt-PT") === name.toLocaleLowerCase("pt-PT"),
      );
      if (existing) {
        setSelectedSupplierId(existing.id);
        setSupplierNotice(`“${existing.name}” já existia e foi selecionado.`);
      } else {
        const supplierId = makeId();
        update((current) => ({
          ...current,
          suppliers: [
            ...current.suppliers,
            {
              id: supplierId,
              name,
              email: newSupplierEmail.trim(),
              phone: newSupplierPhone.trim(),
              address: "",
              notes: "",
            },
          ],
        }));
        setSelectedSupplierId(supplierId);
        setSupplierNotice(`Fornecedor “${name}” adicionado e selecionado.`);
      }
      setNewSupplierName("");
      setNewSupplierEmail("");
      setNewSupplierPhone("");
      setAddingSupplier(false);
      setFormError("");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível guardar o fornecedor.");
      setSupplierNotice("");
    }
  }

  function saveIncomingProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const sku = String(values.get("sku") ?? "").trim();
    const size = String(values.get("size") ?? "").trim();
    const name = String(values.get("name") ?? "").trim();
    const quantity = Number(values.get("quantity"));
    const unitCostValue = Number(values.get("unitCost"));
    const purchaseType = String(values.get("purchaseType") ?? "") as PurchaseType;
    const supplierId = String(values.get("supplierId") ?? "");
    const orderedAt = String(values.get("orderedAt") ?? "");
    const trackingUrl = String(values.get("trackingUrl") ?? "").trim();
    const imageUrl = String(values.get("imageUrl") ?? "").trim();

    try {
      if (!sku || !name) throw new Error("Preenche o SKU e o nome do produto.");
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        throw new Error("A quantidade tem de ser um número inteiro maior que zero.");
      }
      if (!Number.isFinite(unitCostValue) || unitCostValue < 0) {
        throw new Error("Indica um custo unitário válido, igual ou superior a zero.");
      }
      if (!["VAT0%", "PRIVATE", "MARGIN"].includes(purchaseType)) {
        throw new Error("Seleciona um tipo de compra válido.");
      }
      if (!orderedAt) throw new Error("Indica a data da encomenda.");
      if (!isWebUrl(trackingUrl)) {
        throw new Error("O link de rastreio tem de começar por http:// ou https://.");
      }
      if (!isWebUrl(imageUrl)) {
        throw new Error("O URL da imagem tem de começar por http:// ou https://.");
      }

      const item: IncomingStockItem = {
        id: editingItem?.id ?? makeId(),
        sku,
        size,
        name,
        quantity,
        unitCost: roundMoney(unitCostValue),
        purchaseType,
        supplierId,
        orderedAt,
        trackingUrl,
        imageUrl,
      };
      update((current) => {
        if (supplierId && !current.suppliers.some((supplier) => supplier.id === supplierId)) {
          throw new Error("O fornecedor selecionado já não existe.");
        }
        if (editingItem) {
          const stored = current.incomingProducts.find((entry) => entry.id === editingItem.id);
          if (!stored || stored.receivedAt) {
            throw new Error("Este produto já foi recebido ou já não está na lista.");
          }
          return {
            ...current,
            incomingProducts: current.incomingProducts.map((entry) => entry.id === item.id ? item : entry),
          };
        }
        return { ...current, incomingProducts: [item, ...current.incomingProducts] };
      });
      setModalOpen(false);
      setFormError("");
      setSavedMessage(editingItem
        ? `“${name}” foi atualizado.`
        : `“${name}” foi registado em Produtos a caminho.`);
      setEditingItem(null);
      setSelectedSupplierId("");
      setAddingSupplier(false);
      setSupplierNotice("");
      form.reset();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível guardar o produto.");
    }
  }

  function openEdit(item: IncomingStockItem) {
    setEditingItem(item);
    setOrderedAt(item.orderedAt);
    setSelectedSupplierId(item.supplierId ?? "");
    setFormError("");
    setAddingSupplier(false);
    setSupplierNotice("");
    setModalOpen(true);
  }

  function deleteIncoming(item: IncomingStockItem) {
    if (!window.confirm(`Eliminar “${item.name}” dos produtos a caminho? Esta ação não pode ser anulada.`)) return;
    try {
      update((current) => {
        const stored = current.incomingProducts.find((entry) => entry.id === item.id);
        if (!stored || stored.receivedAt) {
          throw new Error("Este produto já foi recebido ou já não está na lista.");
        }
        return {
          ...current,
          incomingProducts: current.incomingProducts.filter((entry) => entry.id !== item.id),
        };
      });
      setSavedMessage(`“${item.name}” foi eliminado.`);
      setFormError("");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível eliminar o produto.");
      setSavedMessage("");
    }
  }

  function markAsReceived(item: IncomingStockItem) {
    try {
      const receivedAt = new Date().toISOString();
      update((current) => {
        const incoming = current.incomingProducts.find((entry) => entry.id === item.id);
        if (!incoming || incoming.receivedAt) {
          throw new Error("Este produto já foi recebido ou já não está na lista.");
        }
        if (
          !Number.isSafeInteger(incoming.quantity) ||
          incoming.quantity < 1 ||
          !Number.isFinite(incoming.unitCost) ||
          incoming.unitCost < 0
        ) {
          throw new Error("Os dados desta encomenda não permitem registar a receção.");
        }
        if (incoming.supplierId && !current.suppliers.some((supplier) => supplier.id === incoming.supplierId)) {
          throw new Error("O fornecedor desta encomenda já não existe.");
        }

        const sameReference = (product: Product) =>
          product.sku.trim().toLocaleLowerCase("pt-PT") === incoming.sku.trim().toLocaleLowerCase("pt-PT") &&
          (product.size ?? "").trim().toLocaleLowerCase("pt-PT") === incoming.size.trim().toLocaleLowerCase("pt-PT");
        const existingProduct = current.products.find((product) => product.active && sameReference(product));
        const archivedProduct = existingProduct
          ? undefined
          : current.products.find((product) => sameReference(product));
        const productId = existingProduct?.id ?? archivedProduct?.id ?? makeId();
        const product: Product = existingProduct
          ? existingProduct
          : {
            id: productId,
            sku: incoming.sku,
            size: incoming.size,
            name: incoming.name,
            imageUrl: incoming.imageUrl,
            purchaseType: incoming.purchaseType,
            supplierId: incoming.supplierId,
            brand: "",
            active: true,
          };
        const location = current.locations[0] ?? { id: makeId(), name: "Stock principal" };
        const units = Array.from({ length: incoming.quantity }, () => ({
          id: makeId(),
          productId,
          internalIdentifier: "",
          serialNumber: "",
          acquisitionCost: incoming.unitCost,
          locationId: location.id,
          status: "READY_TO_SHIP" as const,
          acquiredAt: receivedAt,
          supplierId: incoming.supplierId || undefined,
          incomingProductId: incoming.id,
        }));
        const movements = units.map((unit) => ({
          id: makeId(),
          unitId: unit.id,
          type: "PURCHASE_RECEIPT" as const,
          quantityDelta: 1 as const,
          fromLocationId: "",
          toLocationId: location.id,
          occurredAt: receivedAt,
          notes: `Receção de produto a caminho · ${incoming.sku}`,
        }));

        return {
          ...current,
          locations: current.locations.length ? current.locations : [location],
          products: existingProduct
            ? current.products
            : archivedProduct
              ? current.products.map((entry) => entry.id === archivedProduct.id ? product : entry)
              : [...current.products, product],
          incomingProducts: current.incomingProducts.map((entry) =>
            entry.id === incoming.id ? { ...entry, receivedAt } : entry,
          ),
          units: [...current.units, ...units],
          movements: [...current.movements, ...movements],
        };
      });
      setSavedMessage(`“${item.name}” foi recebido e adicionado ao Stock.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível registar a receção.");
      setSavedMessage("");
    }
  }

  return (
    <div className="page-stack stock-page incoming-page">
      <header className="stock-page__header">
        <div>
          <div className="eyebrow">COMPRAS E ENTREGAS</div>
          <h1>Produtos a caminho</h1>
          <p>Regista o que compraste e adiciona ao Stock quando chegar.</p>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={() => {
            setEditingItem(null);
            setOrderedAt(localDateString(new Date()));
            setFormError("");
            setSelectedSupplierId("");
            setAddingSupplier(false);
            setSupplierNotice("");
            setModalOpen(true);
          }}
        >
          + Registar produto
        </button>
      </header>

      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
      {formError && !modalOpen && <p className="feedback feedback--error" role="alert">{formError}</p>}
      {savedMessage && <p className="feedback feedback--success" role="status">{savedMessage}</p>}

      <section className="stock-summary" aria-label="Resumo dos produtos a caminho">
        <div><span>Encomendas por receber</span><strong>{ready ? pending.length : "…"}</strong></div>
        <div><span>Unidades a caminho</span><strong>{ready ? pendingQuantity : "…"}</strong></div>
        <div><span>Valor ao custo</span><strong><PrivacyValue>{ready ? formatEur(pendingValue) : "…"}</PrivacyValue></strong></div>
      </section>

      <section className="content-panel">
        <div className="content-panel__top stock-list__top">
          <div>
            <h2>{showReceived ? "Encomendas e receções" : "À espera de entrega"}</h2>
            <p>{rows.length} {rows.length === 1 ? "produto" : "produtos"}</p>
          </div>
          <label className="incoming-history-toggle">
            <input
              type="checkbox"
              checked={showReceived}
              onChange={(event) => setShowReceived(event.target.checked)}
            />
            Mostrar recebidos
          </label>
        </div>
        <div className="table-wrap stock-list__table-wrap">
          <table className="data-table incoming-table">
            <thead>
              <tr>
                <th>Data</th><th>Produto</th><th>Qtd.</th><th>Custo unit.</th>
                <th>Tipo</th><th>Fornecedor</th><th>Rastreio</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {!ready ? (
                <tr><td colSpan={8} className="table-empty">A carregar produtos locais…</td></tr>
              ) : rows.length ? rows.map((item) => (
                <tr key={item.id}>
                  <td data-label="Data">{formatDate(item.orderedAt)}</td>
                  <td className="incoming-product-cell" data-label="Produto">
                    <div className="stock-product-line">
                      {item.imageUrl && <Image src={item.imageUrl} alt="" width={42} height={42} unoptimized />}
                      <div className="stock-product-line__copy">
                        <strong>{item.name}</strong>
                        <span>SKU: {item.sku}{item.size ? ` · ${item.size}` : ""}</span>
                      </div>
                    </div>
                  </td>
                  <td data-label="Quantidade"><span className="stock-quantity">{item.quantity}</span></td>
                  <td data-label="Custo unitário"><PrivacyValue>{formatEur(item.unitCost)}</PrivacyValue></td>
                  <td data-label="Tipo">
                    <span className={`stock-type-badge stock-type-badge--${item.purchaseType === "PRIVATE" ? "private" : item.purchaseType === "MARGIN" ? "margin" : "vat"}`}>
                      {item.purchaseType}
                    </span>
                  </td>
                  <td data-label="Fornecedor">
                    {data.suppliers.find((supplier) => supplier.id === item.supplierId)?.name || "—"}
                  </td>
                  <td data-label="Rastreio">
                    {item.trackingUrl
                      ? <a className="incoming-tracking-link" href={item.trackingUrl} target="_blank" rel="noreferrer">Abrir link</a>
                      : "—"}
                  </td>
                  <td className="incoming-actions-cell" data-label="Ações">
                    {item.receivedAt
                      ? <span className="incoming-received-badge">Recebido · {formatDate(item.receivedAt.slice(0, 10))}</span>
                      : <>
                        <button className="button button--small button--primary" type="button" onClick={() => markAsReceived(item)}>
                          Marcar como recebido
                        </button>
                        <button className="button button--small" type="button" onClick={() => openEdit(item)}>Editar</button>
                        <button className="button button--small button--danger" type="button" onClick={() => deleteIncoming(item)}>Eliminar</button>
                      </>}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="table-empty">
                  {showReceived ? "Ainda não há produtos registados." : "Não tens produtos a caminho. Usa “Registar produto” para começar."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && <div className="sale-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setModalOpen(false);
      }}>
        <section className="sale-modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="incoming-modal-title">
          <header className="sale-modal__header">
            <h2 id="incoming-modal-title">{editingItem ? "Editar produto a caminho" : "Stock a Caminho"}</h2>
            <button className="sale-modal__close" type="button" aria-label="Fechar" onClick={() => setModalOpen(false)}>×</button>
          </header>
          <form key={editingItem?.id ?? "new"} onSubmit={saveIncomingProduct}>
            <div className="sale-modal__body">
              {formError && <p className="feedback feedback--error" role="alert">{formError}</p>}
              <div className="form-grid">
                <label className="form-field"><span>SKU</span><input name="sku" required autoFocus defaultValue={editingItem?.sku} /></label>
                <label className="form-field"><span>Tamanho</span><input name="size" defaultValue={editingItem?.size} /></label>
                <label className="form-field stock-modal__wide"><span>Produto</span><input name="name" required defaultValue={editingItem?.name} /></label>
                <label className="form-field"><span>Quantidade</span><input name="quantity" type="number" min="1" step="1" defaultValue={editingItem?.quantity ?? 1} required /></label>
                <label className="form-field"><span>Custo unit. (€)</span><input name="unitCost" type="number" min="0" step="0.01" defaultValue={editingItem?.unitCost} required /></label>
                <label className="form-field"><span>Tipo</span><select name="purchaseType" defaultValue={editingItem?.purchaseType ?? "PRIVATE"} required>
                  <option value="PRIVATE">Private</option>
                  <option value="MARGIN">Margin</option>
                  <option value="VAT0%">VAT0%</option>
                </select></label>
                <div className="stock-supplier-field">
                  <label className="form-field">
                    <span>Fornecedor</span>
                    <select
                      name="supplierId"
                      value={selectedSupplierId}
                      onChange={(event) => {
                        setSelectedSupplierId(event.target.value);
                        setSupplierNotice("");
                      }}
                    >
                      <option value="">— Sem fornecedor —</option>
                      {data.suppliers.filter((supplier) => supplier.active !== false).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </select>
                  </label>
                  <button
                    className="button button--small"
                    type="button"
                    onClick={() => {
                      setAddingSupplier((current) => !current);
                      setFormError("");
                      setSupplierNotice("");
                    }}
                  >
                    {addingSupplier ? "Fechar" : "+ Novo fornecedor"}
                  </button>
                </div>
                {supplierNotice && <p className="stock-supplier-notice" role="status">{supplierNotice}</p>}
                {addingSupplier && <fieldset className="stock-supplier-create stock-modal__wide">
                  <legend>Novo fornecedor</legend>
                  <div className="form-grid">
                    <label className="form-field stock-modal__wide"><span>Nome</span><input value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} autoComplete="organization" required /></label>
                    <label className="form-field"><span>Email (opcional)</span><input type="email" value={newSupplierEmail} onChange={(event) => setNewSupplierEmail(event.target.value)} autoComplete="email" /></label>
                    <label className="form-field"><span>Telefone (opcional)</span><input type="tel" value={newSupplierPhone} onChange={(event) => setNewSupplierPhone(event.target.value)} autoComplete="tel" /></label>
                  </div>
                  <button className="button button--small button--primary" type="button" onClick={createSupplier}>Guardar fornecedor</button>
                </fieldset>}
                <label className="form-field"><span>Data Encomenda</span><input name="orderedAt" type="date" value={orderedAt} onChange={(event) => setOrderedAt(event.target.value)} required /></label>
                <label className="form-field"><span>Link Tracking</span><input name="trackingUrl" type="url" placeholder="https://..." defaultValue={editingItem?.trackingUrl} /></label>
                <label className="form-field stock-modal__wide"><span>Imagem URL</span><input name="imageUrl" type="url" placeholder="https://..." defaultValue={editingItem?.imageUrl} /></label>
              </div>
            </div>
            <footer className="sale-modal__footer">
              <button className="button" type="button" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="button button--primary" type="submit">Guardar</button>
            </footer>
          </form>
        </section>
      </div>}
    </div>
  );
}
