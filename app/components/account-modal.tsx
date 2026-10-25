"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "../lib/supabase/client";

export function AccountModal({ onClose }: { onClose: () => void }) {
  const [currentEmail, setCurrentEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setCurrentEmail(data.user?.email ?? ""));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const currentPassword = String(values.get("currentPassword") ?? "");
    const newEmail = String(values.get("newEmail") ?? "").trim();
    const newPassword = String(values.get("newPassword") ?? "");
    const confirmPassword = String(values.get("confirmPassword") ?? "");
    setError("");
    setNotice("");

    if (!currentPassword) return setError("Indica a palavra-passe atual.");
    if (!newEmail && !newPassword) return setError("Indica um novo email ou uma nova palavra-passe.");
    if (newEmail && newEmail.toLowerCase() === currentEmail.toLowerCase() && !newPassword) {
      return setError("O novo email é igual ao atual.");
    }
    if (newPassword && newPassword.length < 8) return setError("A nova palavra-passe tem de ter pelo menos 8 caracteres.");
    if (newPassword !== confirmPassword) return setError("A confirmação não coincide com a nova palavra-passe.");

    setBusy(true);
    try {
      const supabase = createClient();
      const check = await supabase.auth.signInWithPassword({ email: currentEmail, password: currentPassword });
      if (check.error) throw new Error("A palavra-passe atual está incorreta.");

      const messages: string[] = [];
      if (newPassword) {
        const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
        if (passwordError) throw new Error(passwordError.message);
        messages.push("Palavra-passe alterada.");
      }
      if (newEmail && newEmail.toLowerCase() !== currentEmail.toLowerCase()) {
        const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });
        if (emailError) throw new Error(emailError.message);
        messages.push("Enviámos um link de confirmação. O email só muda depois de o confirmares (podes ter de confirmar também no email antigo).");
      }
      setNotice(messages.join(" "));
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível guardar as alterações.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sale-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="sale-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <header className="sale-modal__header">
          <h2 id="account-title">Conta</h2>
          <button className="sale-modal__close" type="button" aria-label="Fechar" onClick={onClose}>×</button>
        </header>
        <form onSubmit={save}>
          <div className="sale-modal__body">
            {error && <p className="feedback feedback--error" role="alert">{error}</p>}
            {notice && <p className="feedback feedback--success" role="status">{notice}</p>}
            <div className="form-grid">
              <label className="form-field stock-modal__wide"><span>Email atual</span><input value={currentEmail} readOnly aria-label="Email atual" /></label>
              <label className="form-field stock-modal__wide"><span>Novo email</span><input name="newEmail" type="email" autoComplete="email" /></label>
              <label className="form-field"><span>Nova palavra-passe</span><input name="newPassword" type="password" autoComplete="new-password" minLength={8} /></label>
              <label className="form-field"><span>Confirmar nova palavra-passe</span><input name="confirmPassword" type="password" autoComplete="new-password" /></label>
              <label className="form-field stock-modal__wide"><span>Palavra-passe atual (obrigatória)</span><input name="currentPassword" type="password" autoComplete="current-password" required /></label>
            </div>
            <p className="form-note">Deixa em branco o que não queres mudar.</p>
          </div>
          <footer className="sale-modal__footer">
            <button className="button" type="button" onClick={onClose}>Fechar</button>
            <button className="button button--primary" type="submit" disabled={busy}>{busy ? "A guardar…" : "Guardar"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
