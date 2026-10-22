"use client";

import { useMemo, useState } from "react";
import type { Supplier } from "../lib/local-data";

type SupplierAutocompleteProps = {
  suppliers: Supplier[];
  value: string;
  selectedSupplierId: string;
  onChange: (value: string) => void;
  onSelect: (supplier: Supplier) => void;
};

export function SupplierAutocomplete({
  suppliers,
  value,
  selectedSupplierId,
  onChange,
  onSelect,
}: SupplierAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const options = useMemo(() => {
    const query = value.trim().toLocaleLowerCase("pt-PT");
    return suppliers
      .filter((supplier) => supplier.active !== false)
      .filter((supplier) =>
        !query || `${supplier.name} ${supplier.phone} ${supplier.email} ${supplier.discord ?? ""}`
          .toLocaleLowerCase("pt-PT")
          .includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
  }, [suppliers, value]);

  function selectSupplier(supplier: Supplier) {
    onSelect(supplier);
    setOpen(false);
    setActiveIndex(0);
  }

  return (
    <div className="form-field customer-autocomplete">
      <label htmlFor="sale-supplier">Fornecedor</label>
      <input
        id="sale-supplier"
        name="supplierName"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && options.length > 0}
        aria-controls="sale-supplier-options"
        aria-activedescendant={open && options[activeIndex] ? `sale-supplier-option-${options[activeIndex].id}` : undefined}
        autoComplete="off"
        maxLength={120}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          } else if (event.key === "ArrowDown" && options.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => (index + 1) % options.length);
          } else if (event.key === "ArrowUp" && options.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => (index - 1 + options.length) % options.length);
          } else if (event.key === "Enter" && open && options[activeIndex]) {
            event.preventDefault();
            selectSupplier(options[activeIndex]);
          }
        }}
      />
      {open && options.length > 0 && (
        <div className="customer-autocomplete__options" id="sale-supplier-options" role="listbox" aria-label="Fornecedores">
          {options.map((supplier, index) => (
            <button
              className={`customer-autocomplete__option${supplier.id === selectedSupplierId ? " customer-autocomplete__option--selected" : ""}`}
              id={`sale-supplier-option-${supplier.id}`}
              key={supplier.id}
              type="button"
              role="option"
              aria-selected={supplier.id === selectedSupplierId}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectSupplier(supplier)}
            >
              <strong>{supplier.name}</strong>
              {(supplier.phone || supplier.email) && (
                <span>{[supplier.phone, supplier.email].filter(Boolean).join(" · ")}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && value.trim() && options.length === 0 && (
        <div className="customer-autocomplete__empty">Nenhum fornecedor encontrado. O perfil será criado automaticamente ao guardar a venda.</div>
      )}
    </div>
  );
}
