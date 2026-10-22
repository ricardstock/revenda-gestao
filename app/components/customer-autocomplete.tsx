"use client";

import { useMemo, useState } from "react";
import type { Customer } from "../lib/local-data";

type CustomerAutocompleteProps = {
  customers: Customer[];
  value: string;
  selectedCustomerId: string;
  onChange: (value: string) => void;
  onSelect: (customer: Customer) => void;
};

export function CustomerAutocomplete({
  customers,
  value,
  selectedCustomerId,
  onChange,
  onSelect,
}: CustomerAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const options = useMemo(() => {
    const query = value.trim().toLocaleLowerCase("pt-PT");
    return customers
      .filter((customer) => customer.active !== false)
      .filter((customer) =>
        !query || `${customer.name} ${customer.phone} ${customer.email}`
          .toLocaleLowerCase("pt-PT")
          .includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
  }, [customers, value]);

  function selectCustomer(customer: Customer) {
    onSelect(customer);
    setOpen(false);
    setActiveIndex(0);
  }

  return (
    <div className="form-field customer-autocomplete">
      <label htmlFor="sale-customer">Comprador</label>
      <input
        id="sale-customer"
        name="buyerName"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && options.length > 0}
        aria-controls="sale-customer-options"
        aria-activedescendant={open && options[activeIndex] ? `sale-customer-option-${options[activeIndex].id}` : undefined}
        autoComplete="off"
        required
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
            selectCustomer(options[activeIndex]);
          }
        }}
      />
      {open && options.length > 0 && (
        <div className="customer-autocomplete__options" id="sale-customer-options" role="listbox" aria-label="Clientes">
          {options.map((customer, index) => (
            <button
              className={`customer-autocomplete__option${customer.id === selectedCustomerId ? " customer-autocomplete__option--selected" : ""}`}
              id={`sale-customer-option-${customer.id}`}
              key={customer.id}
              type="button"
              role="option"
              aria-selected={customer.id === selectedCustomerId}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectCustomer(customer)}
            >
              <strong>{customer.name}</strong>
              {(customer.phone || customer.email) && (
                <span>{[customer.phone, customer.email].filter(Boolean).join(" · ")}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && value.trim() && options.length === 0 && (
        <div className="customer-autocomplete__empty">Nenhum cliente encontrado. O perfil será criado automaticamente ao guardar a venda.</div>
      )}
    </div>
  );
}
