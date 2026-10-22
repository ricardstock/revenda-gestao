"use client";

import Image from "next/image";
import { useMemo, useState, type FormEvent } from "react";
import {
  completePendingSale,
  duplicateProductWithStock,
  findOrCreateCustomer,
  formatEur,
  localDateString,
  makeId,
  roundMoney,
  type Product,
  type Sale,
  type SaleLine,
} from "../lib/local-data";
import { useLocalData } from "./local-data-provider";
import { PrivacyValue } from "./workspace-shell";
import { CustomerAutocomplete } from "./customer-autocomplete";

type PurchaseType = NonNullable<Product["purchaseType"]>;

function validStockSaleType(value: string): value is Sale["saleType"] {
  return value === "PRIVATE" || value === "MARGIN" || value === "VAT23%" || value === "VAT0%";
}

export function StockPage() {
  const { data, ready, error, update } = useLocalData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierEmail, setNewSupplierEmail] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [supplierNotice, setSupplierNotice] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [formError, setFormError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [sellingProductId, setSellingProductId] = useState<string | null>(null);
  const [saleDate, setSaleDate] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [saleCustomerId, setSaleCustomerId] = useState("");
  const [saleStatus, setSaleStatus] = useState<"PENDING" | "COMPLETED">("PENDING");
  const [salePaymentMode, setSalePaymentMode] = useState<"PENDING" | "PARTIAL" | "PAID">("PENDING");
  const [stockSaleType, setStockSaleType] = useState<Sale["saleType"]>("PRIVATE");
  const [declaredValue, setDeclaredValue] = useState<"YES" | "NO">("NO");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const rows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-PT");
    return data.products.filter((product) =>
      (showArchived || product.active) &&
      `${product.sku} ${product.size ?? ""} ${product.name} ${data.suppliers.find((supplier) => supplier.id === product.supplierId)?.name ?? ""}`
        .toLocaleLowerCase("pt-PT")
        .includes(search),
    );
  }, [data.products, data.suppliers, query, showArchived]);

  function openModal() {
    setFormError("");
    setSavedMessage("");
    setEditingProductId(null);
    setSelectedSupplierId("");
    setAddingSupplier(false);
    setSupplierNotice("");
    setModalOpen(true);
  }

  function editProduct(productId: string) {
    setFormError("");
    setSavedMessage("");
    setEditingProductId(productId);
    setSelectedSupplierId(data.products.find((product) => product.id === productId)?.supplierId ?? "");
    setAddingSupplier(false);
    setSupplierNotice("");
    setModalOpen(true);
  }

  function duplicateProduct(product: Product) {
    const quantity = data.units.filter(
      (unit) => unit.productId === product.id && unit.status === "READY_TO_SHIP",
    ).length;
    if (!window.confirm(
      `Duplicar “${product.name}” com ${quantity} ${quantity === 1 ? "unidade disponível" : "unidades disponíveis"}? A cópia aumenta o stock e recebe um SKU terminado em -COPIA.`,
    )) return;
    try {
      update((current) => duplicateProductWithStock(current, product.id));
      setFormError("");
      setSavedMessage(`Produto “${product.name}” duplicado com ${quantity} ${quantity === 1 ? "unidade" : "unidades"} em stock.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível duplicar o produto.");
      setSavedMessage("");
    }
  }

  const sellingProduct = data.products.find((product) => product.id === sellingProductId);

  function openSaleModal(product: Product) {
    setFormError("");
    setSavedMessage("");
    setSaleDate(localDateString(new Date()));
    setBuyerName("");
    setSaleCustomerId("");
    setSaleStatus("PENDING");
    setSalePaymentMode("PENDING");
    setStockSaleType(product.purchaseType ?? "PRIVATE");
    setDeclaredValue("NO");
    setInvoiceNumber("");
    setSellingProductId(product.id);
  }

  function saveStockSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const enteredBuyerName = String(values.get("buyerName") ?? "").trim();
    const saleValue = Number(values.get("salePrice"));
    const costValue = Number(values.get("cost"));
    const submittedSaleType = String(values.get("saleType") ?? "");
    const declared = stockSaleType === "PRIVATE" ? "PRIVATE" : declaredValue;
    const partialAmount = Number(values.get("paidAmount"));
    const notes = String(values.get("notes") ?? "").trim();
    const enteredInvoiceNumber = String(values.get("invoiceNumber") ?? "").trim();
    const validSaleTypes = ["PRIVATE", "MARGIN", "VAT23%", "VAT0%"] as const;
    const selectedSaleType = validSaleTypes.find((type) => type === submittedSaleType);

    try {
      if (!sellingProduct || !sellingProduct.active) {
        throw new Error("Este produto já não está ativo.");
      }
      if (!enteredBuyerName) throw new Error("Indica o nome do comprador.");
      if (!Number.isFinite(saleValue) || saleValue <= 0) {
        throw new Error("O valor de venda tem de ser superior a zero.");
      }
      if (!Number.isFinite(costValue) || costValue < 0) {
        throw new Error("Indica um custo válido, igual ou superior a zero.");
      }
      if (!selectedSaleType) throw new Error("Seleciona um tipo de venda válido.");
      if (stockSaleType !== "PRIVATE" && declared !== "YES" && declared !== "NO") {
        throw new Error("Seleciona uma opção válida para Declarado.");
      }
      if (salePaymentMode === "PARTIAL" &&
        (!Number.isFinite(partialAmount) || partialAmount <= 0 || partialAmount >= saleValue)) {
        throw new Error("A parte paga tem de ser superior a zero e inferior ao valor da venda.");
      }

      const saleId = makeId();
      const createdAt = new Date().toISOString();
      const paidAmount = salePaymentMode === "PAID"
        ? roundMoney(saleValue)
        : salePaymentMode === "PARTIAL"
          ? roundMoney(partialAmount)
          : 0;
      const line: SaleLine = {
        productId: sellingProduct.id,
        quantity: 1,
        unitPrice: roundMoney(saleValue),
        unitIds: [],
        sku: sellingProduct.sku,
        size: sellingProduct.size,
        productName: sellingProduct.name,
        unitCost: roundMoney(costValue),
      };
      const sale: Sale = {
        id: saleId,
        createdAt,
        soldAt: saleDate,
        customerId: "",
        buyerName: enteredBuyerName,
        saleType: selectedSaleType,
        invoiceNumber: declared === "YES" ? enteredInvoiceNumber : "",
        declared,
        shippingCost: 0,
        supplierId: sellingProduct.supplierId,
        trackingUrl: "",
        notes,
        status: "PENDING",
        lines: [line],
      };

      update((current) => {
        const product = current.products.find((item) =>
          item.id === sellingProduct.id && item.active,
        );
        if (!product) throw new Error("O produto selecionado já não está ativo.");
        const customerResult = findOrCreateCustomer(current.customers, saleCustomerId, enteredBuyerName);
        const savedSale = { ...sale, buyerName: enteredBuyerName, customerId: customerResult.customer.id };
        const payments = paidAmount
          ? [{
            id: makeId(),
            saleId,
            amount: paidAmount,
            method: "OTHER" as const,
            paidAt: saleDate,
            reference: "",
          }]
          : [];
        const next = {
          ...current,
          customers: customerResult.customers,
          sales: [savedSale, ...current.sales],
          payments: [...payments, ...current.payments],
        };
        return saleStatus === "COMPLETED"
          ? completePendingSale(next, saleId)
          : next;
      });
      setSellingProductId(null);
      setFormError("");
      setSavedMessage(saleStatus === "COMPLETED"
        ? `Venda de “${sellingProduct.name}” concluída. O stock não foi alterado.`
        : `Venda de “${sellingProduct.name}” registada como pendente.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível registar a venda.");
    }
  }

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
        setNewSupplierName("");
        setNewSupplierEmail("");
        setNewSupplierPhone("");
        setAddingSupplier(false);
        setFormError("");
        return;
      }
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

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const sku = String(values.get("sku") ?? "").trim();
    const size = String(values.get("size") ?? "").trim();
    const name = String(values.get("name") ?? "").trim();
    const imageUrl = String(values.get("imageUrl") ?? "").trim();
    const quantity = Number(values.get("quantity"));
    const costValue = Number(values.get("cost"));
    const purchaseType = String(values.get("purchaseType") ?? "") as PurchaseType;
    const supplierId = String(values.get("supplierId") ?? "");

    try {
      if (!sku || !name) throw new Error("Preenche o SKU e o nome do produto.");
      if (!Number.isSafeInteger(quantity) || quantity < (editingProductId ? 0 : 1)) {
        throw new Error(editingProductId
          ? "A quantidade tem de ser um número inteiro igual ou superior a zero."
          : "A quantidade tem de ser um número inteiro maior que zero.");
      }
      if (!Number.isFinite(costValue) || costValue < 0) {
        throw new Error("Indica um custo válido, igual ou superior a zero.");
      }
      if (!["VAT0%", "PRIVATE", "MARGIN"].includes(purchaseType)) {
        throw new Error("Seleciona um tipo de compra válido.");
      }

      const now = new Date().toISOString();
      const cost = roundMoney(costValue);
      const acquisitionBatchId = makeId();
      update((current) => {
        if (current.products.some((item) =>
          item.id !== editingProductId &&
          item.sku.trim().toLocaleLowerCase("pt-PT") === sku.toLocaleLowerCase("pt-PT") &&
          (item.size ?? "").trim().toLocaleLowerCase("pt-PT") === size.toLocaleLowerCase("pt-PT"),
        )) {
          throw new Error("Já existe um produto com este SKU e tamanho.");
        }
        if (supplierId && !current.suppliers.some((supplier) => supplier.id === supplierId)) {
          throw new Error("O fornecedor selecionado já não existe.");
        }
        const existingProduct = editingProductId
          ? current.products.find((item) => item.id === editingProductId)
          : undefined;
        if (editingProductId && (!existingProduct || !existingProduct.active)) {
          throw new Error("Este produto já não está ativo. Atualiza a lista e tenta novamente.");
        }
        const productId = existingProduct?.id ?? makeId();
        const product: Product = {
          id: productId,
          sku,
          size,
          name,
          imageUrl,
          purchaseType,
          supplierId,
          brand: existingProduct?.brand ?? "",
          active: existingProduct?.active ?? true,
        };
        const availableUnits = current.units.filter(
          (unit) => unit.productId === productId && unit.status === "READY_TO_SHIP",
        );
        const quantityDelta = quantity - availableUnits.length;
        const location = current.locations[0] ?? { id: makeId(), name: "Stock principal" };
        const addedUnits = Array.from({ length: Math.max(0, quantityDelta) }, () => ({
          id: makeId(),
          productId,
          internalIdentifier: "",
          serialNumber: "",
          acquisitionCost: cost,
          locationId: location.id,
          status: "READY_TO_SHIP" as const,
          acquiredAt: now,
          supplierId: supplierId || undefined,
          acquisitionBatchId,
        }));
        const removedUnits = quantityDelta < 0
          ? availableUnits.slice(quantityDelta)
          : [];
        const stockUnits = addedUnits;
        const locations = current.locations.length ? current.locations : [location];
        const movements = [
          ...addedUnits.map((unit) => ({
            id: makeId(),
            unitId: unit.id,
            type: "ADJUSTMENT_IN" as const,
            quantityDelta: 1 as const,
            fromLocationId: "",
            toLocationId: unit.locationId,
            occurredAt: now,
            notes: editingProductId ? "Ajuste de entrada ao editar stock" : "Stock inicial registado",
          })),
          ...removedUnits.map((unit) => ({
            id: makeId(),
            unitId: unit.id,
            type: "ADJUSTMENT_OUT" as const,
            quantityDelta: -1 as const,
            fromLocationId: unit.locationId,
            toLocationId: "",
            occurredAt: now,
            notes: "Ajuste de saída ao editar quantidade",
          })),
        ];
        return {
          ...current,
          locations,
          products: existingProduct
            ? current.products.map((item) => item.id === productId ? product : item)
            : [...current.products, product],
          units: [
            ...current.units.map((unit) => removedUnits.some((removed) => removed.id === unit.id)
              ? { ...unit, status: "NOT_FOR_SALE" as const }
              : unit),
            ...stockUnits,
          ],
          movements: [...current.movements, ...movements],
        };
      });
      setModalOpen(false);
      setSavedMessage(editingProductId
        ? "Produto atualizado. As unidades existentes mantiveram o respetivo custo histórico."
        : "Produto e stock guardados neste browser.");
      setEditingProductId(null);
      form.reset();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível guardar o stock.");
    }
  }

  function archiveProduct(product: Product) {
    if (!window.confirm(`Remover “${product.name}” do stock ativo? O produto e o histórico serão preservados; as unidades disponíveis serão retiradas do stock.`)) {
      return;
    }
    try {
      const now = new Date().toISOString();
      update((current) => {
        const target = current.products.find((item) => item.id === product.id);
        if (!target?.active) throw new Error("Este produto já foi removido do stock ativo.");
        const unitsToRemove = current.units.filter(
          (unit) => unit.productId === product.id && unit.status === "READY_TO_SHIP",
        );
        return {
          ...current,
          products: current.products.map((item) =>
            item.id === product.id ? { ...item, active: false } : item,
          ),
          units: current.units.map((unit) =>
            unitsToRemove.some((removed) => removed.id === unit.id)
              ? { ...unit, status: "NOT_FOR_SALE" as const }
              : unit,
          ),
          movements: [
            ...current.movements,
            ...unitsToRemove.map((unit) => ({
              id: makeId(),
              unitId: unit.id,
              type: "ADJUSTMENT_OUT" as const,
              quantityDelta: -1 as const,
              fromLocationId: unit.locationId,
              toLocationId: "",
              occurredAt: now,
              notes: "Produto removido do stock ativo",
            })),
          ],
        };
      });
      setSavedMessage(`“${product.name}” foi removido do stock ativo. O histórico foi preservado.`);
      setFormError("");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível remover o produto.");
      setSavedMessage("");
    }
  }

  function restoreProduct(product: Product) {
    try {
      update((current) => ({
        ...current,
        products: current.products.map((item) =>
          item.id === product.id ? { ...item, active: true } : item,
        ),
      }));
      setSavedMessage(`“${product.name}” voltou a aparecer nos produtos ativos. O stock removido não foi reposto.`);
      setFormError("");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível restaurar o produto.");
      setSavedMessage("");
    }
  }

  const totalUnits = data.units.filter((unit) => unit.status === "READY_TO_SHIP").length;
  const totalCost = data.units
    .filter((unit) => unit.status === "READY_TO_SHIP")
    .reduce((total, unit) => total + unit.acquisitionCost, 0);
  const editingProduct = data.products.find((product) => product.id === editingProductId);
  const sellingUnits = sellingProduct
    ? data.units.filter((unit) => unit.productId === sellingProduct.id && unit.status === "READY_TO_SHIP")
    : [];
  const sellingAverageCost = sellingUnits.length
    ? sellingUnits.reduce((sum, unit) => sum + unit.acquisitionCost, 0) / sellingUnits.length
    : 0;
  const existingUnits = editingProduct
    ? data.units.filter((unit) => unit.productId === editingProduct.id && unit.status === "READY_TO_SHIP")
    : [];
  const averageCost = existingUnits.length
    ? existingUnits.reduce((sum, unit) => sum + unit.acquisitionCost, 0) / existingUnits.length
    : 0;

  return (
    <div className="page-stack stock-page">
      <header className="stock-page__header">
        <div>
          <div className="eyebrow">GESTÃO DE INVENTÁRIO</div>
          <h1>Stock</h1>
          <p>Produtos e unidades disponíveis para venda.</p>
        </div>
        <button className="button button--primary" type="button" onClick={openModal}>
          + Adicionar produto
        </button>
      </header>

      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
      {savedMessage && <p className="feedback feedback--success" role="status">{savedMessage}</p>}

      <section className="stock-summary" aria-label="Resumo do stock">
        <div><span>Unidades disponíveis</span><strong>{ready ? totalUnits : "…"}</strong></div>
        <div><span>Valor ao custo</span><strong><PrivacyValue>{ready ? formatEur(totalCost) : "…"}</PrivacyValue></strong></div>
        <div><span>Produtos ativos</span><strong>{ready ? data.products.filter((product) => product.active).length : "…"}</strong></div>
      </section>

      <section className="content-panel">
        <div className="content-panel__top stock-list__top">
          <div className="stock-list__heading">
            <div><h2>Produtos em stock</h2><p>{rows.length} produtos</p></div>
            <label className="stock-archived-toggle">
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              Mostrar produtos removidos
            </label>
          </div>
          <div className="stock-list__tools">
            <input
              className="table-search"
              type="search"
              placeholder="Pesquisar SKU, tamanho ou produto..."
              aria-label="Pesquisar stock"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="table-wrap stock-list__table-wrap">
          <table className="data-table stock-table">
            <thead><tr>
              <th>Produto</th><th>Tamanho</th><th>Qtd.</th>
              <th>Custo</th><th>Tipo</th><th>Fornecedor</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {!ready ? (
                <tr><td colSpan={7} className="table-empty">A carregar stock local…</td></tr>
              ) : rows.length ? rows.map((product) => {
                const units = data.units.filter((unit) =>
                  unit.productId === product.id && unit.status === "READY_TO_SHIP",
                );
                const quantity = units.length;
                const total = units.reduce((sum, unit) => sum + unit.acquisitionCost, 0);
                return <tr key={product.id}>
                  <td className="stock-product-cell" data-label="Produto">
                    <div className="stock-product-line">
                      {product.imageUrl && <Image src={product.imageUrl} alt="" width={42} height={42} unoptimized />}
                      <div className="stock-product-line__copy">
                        <strong>{product.name}</strong>
                        <span>SKU: {product.sku || "—"}</span>
                      </div>
                    </div>
                  </td>
                  <td data-label="Tamanho">{product.size || "—"}</td>
                  <td data-label="Quantidade"><span className="stock-quantity">{quantity}</span></td>
                  <td data-label="Custo">
                    <div className="stock-cost-cell">
                      <strong><PrivacyValue>{quantity ? formatEur(total / quantity) : "—"}</PrivacyValue></strong>
                      <span>Total: <PrivacyValue>{formatEur(total)}</PrivacyValue></span>
                    </div>
                  </td>
                  <td data-label="Tipo">
                    {product.purchaseType
                      ? <span className={`stock-type-badge stock-type-badge--${product.purchaseType === "PRIVATE" ? "private" : product.purchaseType === "MARGIN" ? "margin" : "vat"}`}>{product.purchaseType}</span>
                      : "—"}
                    {!product.active && <small> · Removido</small>}
                  </td>
                  <td data-label="Fornecedor">{data.suppliers.find((supplier) => supplier.id === product.supplierId)?.name || "—"}</td>
                  <td className="stock-actions-cell" data-label="Ações">
                    <div className="stock-action-buttons">
                      {product.active
                        ? <>
                          <button className="button button--small button--primary" type="button" disabled={!ready || Boolean(error)} onClick={() => openSaleModal(product)}>Vender</button>
                          <button className="button button--small" type="button" disabled={!ready || Boolean(error)} onClick={() => duplicateProduct(product)}>Duplicar</button>
                          <button className="button button--small" type="button" onClick={() => editProduct(product.id)}>Editar</button>
                          <button className="button button--small button--danger" type="button" onClick={() => archiveProduct(product)}>Remover</button>
                          </>
                        : <button className="button button--small" type="button" onClick={() => restoreProduct(product)}>Restaurar</button>}
                    </div>
                  </td>
                </tr>;
              }) : (
                <tr><td colSpan={7} className="table-empty">
                  {query ? "Nenhum produto corresponde à pesquisa." : showArchived ? "Não há produtos nesta lista." : "Ainda não há produtos em stock. Usa “Adicionar produto” para começar."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && <div className="sale-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setModalOpen(false);
      }}>
        <section className="sale-modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="stock-modal-title">
          <header className="sale-modal__header">
            <h2 id="stock-modal-title">{editingProduct ? "Editar Produto" : "Adicionar Stock"}</h2>
            <button className="sale-modal__close" type="button" aria-label="Fechar" onClick={() => setModalOpen(false)}>×</button>
          </header>
          <form onSubmit={saveProduct}>
            <div className="sale-modal__body">
              {formError && <p className="feedback feedback--error" role="alert">{formError}</p>}
              <div className="form-grid">
                <label className="form-field"><span>SKU</span><input name="sku" required autoFocus defaultValue={editingProduct?.sku} /></label>
                <label className="form-field"><span>Tamanho</span><input name="size" defaultValue={editingProduct?.size} /></label>
                <label className="form-field stock-modal__wide"><span>Nome do produto</span><input name="name" required defaultValue={editingProduct?.name} /></label>
                <label className="form-field stock-modal__wide"><span>URL da imagem</span><input name="imageUrl" type="url" placeholder="https://..." defaultValue={editingProduct?.imageUrl} /></label>
                <label className="form-field"><span>Quantidade em stock</span><input name="quantity" type="number" min={editingProduct ? "0" : "1"} step="1" defaultValue={editingProduct ? existingUnits.length : "1"} required /></label>
                <label className="form-field"><span>{editingProduct ? "Custo para unidades novas (€)" : "Custo por unidade (€)"}</span><input name="cost" type="number" min="0" step="0.01" defaultValue={editingProduct ? roundMoney(averageCost) : undefined} required /></label>
                <label className="form-field"><span>Tipo de compra</span><select name="purchaseType" defaultValue={editingProduct?.purchaseType ?? "PRIVATE"} required>
                  <option value="VAT0%">VAT0%</option><option value="PRIVATE">Private</option><option value="MARGIN">Margin</option>
                </select></label>
                <div className="stock-supplier-field">
                  <label className="form-field">
                    <span>Fornecedor</span>
                    <select name="supplierId" value={selectedSupplierId} onChange={(event) => {
                      setSelectedSupplierId(event.target.value);
                      setSupplierNotice("");
                    }}>
                      <option value="">— Sem fornecedor —</option>
                      {data.suppliers.filter((supplier) => supplier.active !== false).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </select>
                  </label>
                  <button className="button button--small" type="button" onClick={() => {
                    setAddingSupplier((current) => !current);
                    setFormError("");
                    setSupplierNotice("");
                  }}>
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
              </div>
              <p className="form-note">{editingProduct
                ? "Alterar a quantidade adiciona ou retira unidades com movimentos registados. O custo de unidades já existentes não é alterado."
                : "O custo é guardado por unidade e o stock fica associado à primeira localização disponível."}</p>
            </div>
            <footer className="sale-modal__footer">
              <button className="button" type="button" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="button button--primary" type="submit">{editingProduct ? "Guardar alterações" : "Guardar stock"}</button>
            </footer>
          </form>
        </section>
      </div>}

      {sellingProduct && <div className="sale-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setSellingProductId(null);
      }}>
        <section className="sale-modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="stock-sale-modal-title">
          <header className="sale-modal__header">
            <h2 id="stock-sale-modal-title">Vender produto</h2>
            <button className="sale-modal__close" type="button" aria-label="Fechar" onClick={() => setSellingProductId(null)}>×</button>
          </header>
          <form onSubmit={saveStockSale}>
            <div className="sale-modal__body">
              {formError && <p className="feedback feedback--error" role="alert">{formError}</p>}
              <div className="form-grid">
                <label className="form-field"><span>Data</span><input name="soldAt" type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)} required /></label>
                <CustomerAutocomplete
                  customers={data.customers}
                  value={buyerName}
                  selectedCustomerId={saleCustomerId}
                  onChange={(value) => {
                    setBuyerName(value);
                    setSaleCustomerId("");
                  }}
                  onSelect={(customer) => {
                    setBuyerName(customer.name);
                    setSaleCustomerId(customer.id);
                  }}
                />
                <label className="form-field stock-modal__wide"><span>Produto</span><input value={sellingProduct.name} readOnly /></label>
                <label className="form-field"><span>SKU</span><input value={sellingProduct.sku} readOnly /></label>
                <label className="form-field"><span>Tamanho</span><input value={sellingProduct.size ?? ""} readOnly /></label>
                <label className="form-field"><span>Venda (€)</span><input name="salePrice" type="number" min="0.01" step="0.01" required /></label>
                <label className="form-field"><span>Custo (€)</span><input name="cost" type="number" min="0" step="0.01" defaultValue={roundMoney(sellingAverageCost)} required /></label>
                <label className="form-field"><span>Tipo</span><select name="saleType" value={stockSaleType} onChange={(event) => {
                  if (validStockSaleType(event.target.value)) setStockSaleType(event.target.value);
                }}>
                  <option value="PRIVATE">Private</option><option value="MARGIN">Margin</option><option value="VAT23%">VAT</option><option value="VAT0%">VAT 0%</option>
                </select></label>
                <label className="form-field"><span>Estado</span><select name="saleStatus" value={saleStatus} onChange={(event) => {
                  if (event.target.value === "PENDING" || event.target.value === "COMPLETED") {
                    setSaleStatus(event.target.value);
                  }
                }}>
                  <option value="PENDING">Pendente</option><option value="COMPLETED">Concluída</option>
                </select></label>
                <label className="form-field"><span>Pagamento</span><select name="paymentMode" value={salePaymentMode} onChange={(event) => {
                  if (event.target.value === "PENDING" || event.target.value === "PARTIAL" || event.target.value === "PAID") {
                    setSalePaymentMode(event.target.value);
                  }
                }}>
                  <option value="PENDING">Pendente</option><option value="PARTIAL">Parcial</option><option value="PAID">Pago</option>
                </select></label>
                <label className="form-field"><span>Parte paga / Caução</span><input name="paidAmount" type="number" min="0" step="0.01" defaultValue="0" disabled={salePaymentMode !== "PARTIAL"} /></label>
                <label className="form-field"><span>Declarado?</span>{stockSaleType === "PRIVATE"
                  ? <input value="PRIVATE" readOnly aria-label="Declarado: PRIVATE" />
                  : <select name="declared" value={declaredValue} onChange={(event) => {
                    if (event.target.value === "YES" || event.target.value === "NO") setDeclaredValue(event.target.value);
                  }}><option value="NO">Não</option><option value="YES">Sim</option></select>}</label>
                {stockSaleType !== "PRIVATE" && declaredValue === "YES" && <label className="form-field"><span>Nº da fatura</span><input name="invoiceNumber" maxLength={80} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></label>}
                <label className="form-field stock-modal__wide"><span>Obs</span><textarea name="notes" rows={3} maxLength={1000} /></label>
              </div>
              <p className="form-note">Podes registar a venda mesmo sem unidades disponíveis. A venda não reserva nem altera o stock. Os preços de venda são considerados finais, com IVA incluído. O IVA é uma estimativa matemática do tipo selecionado; a aplicação não valida a elegibilidade legal para taxa zero ou regime da margem.</p>
            </div>
            <footer className="sale-modal__footer">
              <button className="button" type="button" onClick={() => setSellingProductId(null)}>Cancelar</button>
              <button className="button button--primary" type="submit">Guardar venda</button>
            </footer>
          </form>
        </section>
      </div>}
    </div>
  );
}
