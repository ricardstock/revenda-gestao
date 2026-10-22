import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-card">
        <h1>Revenda Gestão</h1>
        <p>Área privada. Inicie sessão para continuar.</p>
        <LoginForm />
      </div>
    </main>
  );
}
