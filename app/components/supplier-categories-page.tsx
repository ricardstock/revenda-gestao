"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import {
  formatEur,
  makeId,
  type SupplierCatalogSite,
  type SupplierCategoryFolder,
} from "../lib/local-data";
import { useLocalData } from "./local-data-provider";
import { Icon } from "./icons";

function displayCount(count: number) {
  return `${count} ${count === 1 ? "site" : "sites"}`;
}

function normalizeSiteUrl(value: string) {
  const trimmed = value.trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error("Indica um endereço de site válido, por exemplo: https://loja.com.");
  }
}

function optionalPositiveInteger(value: FormDataEntryValue | null, label: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} tem de ser um número inteiro maior que zero.`);
  }
  return parsed;
}

function optionalMoney(value: FormDataEntryValue | null, label: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} tem de ser igual ou superior a zero.`);
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function openWebsite(value: string) {
  try {
    return normalizeSiteUrl(value);
  } catch {
    return null;
  }
}

export function SupplierCategoryFoldersPage() {
  const { data, ready, error, update } = useLocalData();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const categories = useMemo(() => data.supplierCategories
    .filter((category) => category.name.toLocaleLowerCase("pt-PT").includes(query.trim().toLocaleLowerCase("pt-PT")))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-PT")), [data.supplierCategories, query]);

  function openNewCategory() {
    setEditingId(null);
    setFormError("");
    setModalOpen(true);
  }

  function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const name = String(values.get("name") ?? "").trim();
    if (!name) {
      setFormError("Indica o nome da categoria.");
      return;
    }
    const existing = data.supplierCategories.find((category) => category.id === editingId);
    const id = existing?.id ?? makeId();
    const category: SupplierCategoryFolder = { id, name };

    try {
      update((current) => {
        const duplicate = current.supplierCategories.some((item) =>
          item.id !== id && item.name.trim().toLocaleLowerCase("pt-PT") === name.toLocaleLowerCase("pt-PT"),
        );
        if (duplicate) throw new Error("Já existe uma categoria com esse nome.");
        return {
          ...current,
          supplierCategories: existing
            ? current.supplierCategories.map((item) => item.id === id ? category : item)
            : [...current.supplierCategories, category],
        };
      });
      setNotice(`Categoria “${name}” ${existing ? "atualizada" : "criada"}.`);
      setFormError("");
      setModalOpen(false);
      setEditingId(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível guardar a categoria.");
    }
  }

  function removeCategory(category: SupplierCategoryFolder) {
    const siteCount = data.supplierSites.filter((site) => site.categoryId === category.id).length;
    const detail = siteCount
      ? ` A categoria contém ${displayCount(siteCount)} que também serão eliminados.`
      : "";
    if (!window.confirm(`Eliminar a categoria “${category.name}”?${detail}`)) return;
    try {
      update((current) => ({
        ...current,
        supplierCategories: current.supplierCategories.filter((item) => item.id !== category.id),
        supplierSites: current.supplierSites.filter((site) => site.categoryId !== category.id),
      }));
      setNotice(`Categoria “${category.name}” eliminada.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível eliminar a categoria.");
    }
  }

  const editingCategory = data.supplierCategories.find((category) => category.id === editingId);

  return (
    <div className="page-stack supplier-categories-page">
      <header className="supplier-folders-header">
        <div>
          <span className="eyebrow">DIRETÓRIO DE FORNECEDORES</span>
          <h1>Fornecedores por categoria</h1>
          <p>Cria pastas por tipo de produto e guarda nelas os sites dos fornecedores.</p>
        </div>
        <button className="button button--primary" type="button" onClick={openNewCategory}>+ Nova categoria</button>
      </header>

      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
      {notice && <p className="feedback feedback--success" role="status">{notice}</p>}
      {formError && !modalOpen && <p className="feedback feedback--error" role="alert">{formError}</p>}

      <div className="supplier-folders-toolbar">
        <input
          className="table-search"
          type="search"
          placeholder="Pesquisar categorias..."
          aria-label="Pesquisar categorias"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span>{ready ? `${data.supplierCategories.length} ${data.supplierCategories.length === 1 ? "categoria" : "categorias"}` : "A carregar..."}</span>
      </div>

      {!ready
        ? <section className="content-panel supplier-folders-empty" aria-busy="true">A carregar categorias...</section>
        : categories.length
          ? <section className="supplier-folder-grid" aria-label="Pastas de categorias">
            {categories.map((category) => {
              const count = data.supplierSites.filter((site) => site.categoryId === category.id).length;
              return <article className="supplier-folder-card" key={category.id}>
                <Link className="supplier-folder-card__main" href={`/fornecedores-categorias/${category.id}`}>
                  <span className="supplier-folder-card__icon"><Icon name="folder" size={24} /></span>
                  <span className="supplier-folder-card__text">
                    <strong>{category.name}</strong>
                    <small>{displayCount(count)}</small>
                  </span>
                  <span className="supplier-folder-card__arrow" aria-hidden="true">›</span>
                </Link>
                <div className="supplier-folder-card__actions">
                  <button className="button button--small" type="button" onClick={() => {
                    setEditingId(category.id);
                    setFormError("");
                    setModalOpen(true);
                  }}>Editar nome</button>
                  <button className="button button--small button--danger" type="button" onClick={() => removeCategory(category)}>Eliminar</button>
                </div>
              </article>;
            })}
          </section>
          : <section className="content-panel supplier-folders-empty">
            <span className="supplier-folders-empty__icon"><Icon name="folder" size={30} /></span>
            <h2>{query ? "Nenhuma categoria encontrada" : "Ainda não existem pastas"}</h2>
            <p>{query ? "Experimenta outro nome." : "Cria uma pasta para começar, por exemplo Relógios ou Sapatilhas."}</p>
            {!query && <button className="button button--primary" type="button" onClick={openNewCategory}>+ Criar primeira categoria</button>}
          </section>}

      {modalOpen && <div className="sale-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setModalOpen(false);
      }}>
        <section className="sale-modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-category-modal-title">
          <header className="sale-modal__header">
            <h2 id="supplier-category-modal-title">{editingCategory ? "Editar categoria" : "Nova categoria"}</h2>
            <button className="sale-modal__close" type="button" aria-label="Fechar" onClick={() => setModalOpen(false)}>×</button>
          </header>
          <form onSubmit={saveCategory}>
            <div className="sale-modal__body">
              {formError && <p className="feedback feedback--error" role="alert">{formError}</p>}
              <label className="form-field"><span>Nome da pasta</span><input name="name" required autoFocus defaultValue={editingCategory?.name} placeholder="Ex.: Relógios" /></label>
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

export function SupplierCategorySitesPage({ categoryId }: { categoryId: string }) {
  const { data, ready, error, update } = useLocalData();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const category = data.supplierCategories.find((item) => item.id === categoryId);
  const sites = useMemo(() => data.supplierSites
    .filter((site) => site.categoryId === categoryId)
    .filter((site) => `${site.name} ${site.website} ${site.notes}`.toLocaleLowerCase("pt-PT").includes(query.trim().toLocaleLowerCase("pt-PT")))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-PT")), [categoryId, data.supplierSites, query]);

  function openNewSite() {
    setEditingId(null);
    setFormError("");
    setModalOpen(true);
  }

  function saveSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category) return;
    const values = new FormData(event.currentTarget);
    const name = String(values.get("name") ?? "").trim();
    if (!name) {
      setFormError("Indica o nome do site ou fornecedor.");
      return;
    }

    try {
      const existing = data.supplierSites.find((site) => site.id === editingId);
      const site: SupplierCatalogSite = {
        id: existing?.id ?? makeId(),
        categoryId,
        name,
        website: normalizeSiteUrl(String(values.get("website") ?? "")),
        loginUsername: String(values.get("loginUsername") ?? "").trim(),
        passwordManagerReference: String(values.get("passwordManagerReference") ?? "").trim(),
        minimumOrderQuantity: optionalPositiveInteger(values.get("minimumOrderQuantity"), "A MOQ"),
        minimumOrderValue: optionalMoney(values.get("minimumOrderValue"), "A encomenda mínima"),
        notes: String(values.get("notes") ?? "").trim(),
      };
      update((current) => ({
        ...current,
        supplierSites: existing
          ? current.supplierSites.map((item) => item.id === site.id ? site : item)
          : [site, ...current.supplierSites],
      }));
      setNotice(`Site “${name}” ${existing ? "atualizado" : "adicionado"}.`);
      setFormError("");
      setModalOpen(false);
      setEditingId(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível guardar o site.");
    }
  }

  function removeSite(site: SupplierCatalogSite) {
    if (!window.confirm(`Eliminar o site “${site.name}”?`)) return;
    try {
      update((current) => ({
        ...current,
        supplierSites: current.supplierSites.filter((item) => item.id !== site.id),
      }));
      setNotice(`Site “${site.name}” eliminado.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível eliminar o site.");
    }
  }

  const editingSite = data.supplierSites.find((site) => site.id === editingId);

  return (
    <div className="page-stack supplier-categories-page supplier-sites-page">
      <Link className="supplier-back-link" href="/fornecedores-categorias">‹ Todas as categorias</Link>
      <header className="supplier-folders-header supplier-sites-header">
        <div>
          <span className="eyebrow">PASTA DE FORNECEDORES</span>
          <h1>{category?.name ?? "Categoria não encontrada"}</h1>
          <p>{category ? "Sites de fornecedores guardados nesta categoria." : "Esta pasta pode ter sido eliminada."}</p>
        </div>
        {category && <button className="button button--primary" type="button" onClick={openNewSite}>+ Adicionar site</button>}
      </header>

      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
      {notice && <p className="feedback feedback--success" role="status">{notice}</p>}
      {formError && !modalOpen && <p className="feedback feedback--error" role="alert">{formError}</p>}

      {category && <div className="supplier-folders-toolbar">
        <input
          className="table-search"
          type="search"
          placeholder="Pesquisar sites..."
          aria-label="Pesquisar sites"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span>{ready ? displayCount(data.supplierSites.filter((site) => site.categoryId === categoryId).length) : "A carregar..."}</span>
      </div>}

      {!ready
        ? <section className="content-panel supplier-folders-empty" aria-busy="true">A carregar sites...</section>
        : category && sites.length
          ? <section className="supplier-site-grid" aria-label={`Sites de fornecedores: ${category.name}`}>
            {sites.map((site) => {
              const href = openWebsite(site.website);
              return <article className="supplier-site-card" key={site.id}>
                <div className="supplier-site-card__top">
                  <div>
                    <span className="supplier-site-card__eyebrow">FORNECEDOR</span>
                    <h2>{site.name}</h2>
                  </div>
                  <div className="supplier-site-card__actions">
                    <button className="button button--small" type="button" onClick={() => {
                      setEditingId(site.id);
                      setFormError("");
                      setModalOpen(true);
                    }}>Editar</button>
                    <button className="button button--small button--danger" type="button" onClick={() => removeSite(site)}>Eliminar</button>
                  </div>
                </div>

                {href
                  ? <a className="supplier-site-card__website" href={href} target="_blank" rel="noreferrer">
                    <span>{new URL(href).hostname}</span><span aria-hidden="true">↗</span>
                  </a>
                  : <span className="supplier-site-card__website">Site não disponível</span>}

                <div className="supplier-site-card__facts">
                  {site.minimumOrderQuantity !== undefined && <div><span>MOQ</span><strong>{site.minimumOrderQuantity} unidades</strong></div>}
                  {site.minimumOrderValue !== undefined && <div><span>Encomenda mínima</span><strong>{formatEur(site.minimumOrderValue)}</strong></div>}
                  {site.loginUsername && <div><span>Utilizador</span><strong>{site.loginUsername}</strong></div>}
                  {site.passwordManagerReference && <div><span>Referência da palavra-passe</span><strong>{site.passwordManagerReference}</strong></div>}
                </div>
                {site.notes && <p className="supplier-site-card__notes">{site.notes}</p>}
              </article>;
            })}
          </section>
          : category && <section className="content-panel supplier-folders-empty">
            <span className="supplier-folders-empty__icon"><Icon name="folder" size={30} /></span>
            <h2>{query ? "Nenhum site encontrado" : "Esta pasta ainda está vazia"}</h2>
            <p>{query ? "Experimenta outra pesquisa." : "Adiciona aqui os sites dos fornecedores desta categoria."}</p>
            {!query && <button className="button button--primary" type="button" onClick={openNewSite}>+ Adicionar primeiro site</button>}
          </section>}

      {modalOpen && category && <div className="sale-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setModalOpen(false);
      }}>
        <section className="sale-modal stock-modal supplier-site-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-site-modal-title">
          <header className="sale-modal__header">
            <h2 id="supplier-site-modal-title">{editingSite ? "Editar site" : "Adicionar site"}</h2>
            <button className="sale-modal__close" type="button" aria-label="Fechar" onClick={() => setModalOpen(false)}>×</button>
          </header>
          <form onSubmit={saveSite}>
            <div className="sale-modal__body">
              {formError && <p className="feedback feedback--error" role="alert">{formError}</p>}
              <div className="form-grid">
                <label className="form-field stock-modal__wide"><span>Nome do fornecedor ou site</span><input name="name" required autoFocus defaultValue={editingSite?.name} placeholder="Ex.: Loja de relógios" /></label>
                <label className="form-field stock-modal__wide"><span>Endereço do site</span><input name="website" type="text" required defaultValue={editingSite?.website} placeholder="https://loja.com" /></label>
                <label className="form-field"><span>Utilizador de acesso</span><input name="loginUsername" autoComplete="off" defaultValue={editingSite?.loginUsername} /></label>
                <label className="form-field"><span>MOQ (unidades)</span><input name="minimumOrderQuantity" type="number" min="1" step="1" defaultValue={editingSite?.minimumOrderQuantity} /></label>
                <label className="form-field"><span>Encomenda mínima (€)</span><input name="minimumOrderValue" type="number" min="0" step="0.01" defaultValue={editingSite?.minimumOrderValue} /></label>
                <label className="form-field"><span>Referência no gestor de palavras-passe</span><input name="passwordManagerReference" autoComplete="off" defaultValue={editingSite?.passwordManagerReference} placeholder="Ex.: Bitwarden · Loja de relógios" /></label>
                <label className="form-field stock-modal__wide"><span>Informações adicionais</span><textarea name="notes" rows={3} defaultValue={editingSite?.notes} placeholder="Condições, portes, contacto..." /></label>
                <p className="supplier-password-hint stock-modal__wide">Guarda a palavra-passe num gestor de palavras-passe e regista aqui apenas a referência. A aplicação não guarda a palavra-passe.</p>
              </div>
            </div>
            <footer className="sale-modal__footer">
              <button className="button" type="button" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="button button--primary" type="submit">Guardar site</button>
            </footer>
          </form>
        </section>
      </div>}
    </div>
  );
}
