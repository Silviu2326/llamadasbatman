import { useCallback, useEffect, useState } from "react";
import { ClipboardList, FileText, Link, LogOut } from "lucide-react";
import { api } from "./api";
import { Field, Message } from "./components/UI";
import Leads from "./features/Leads";
import Detail from "./features/Detail";
import { Catalog, Connections } from "./features/System";
export default function App() {
  const [auth, setAuth] = useState<any>(null),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState("Leads"),
    [leads, setLeads] = useState<any[]>([]),
    [selected, setSelected] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLeads(await api("/leads"));
  }, []);
  useEffect(() => {
    api("/auth/status")
      .then(setAuth)
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (auth?.authenticated) refresh().catch((e) => setError(String(e)));
  }, [auth, refresh]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (auth.setup_required) await api("/auth/setup", { password });
      await api("/auth/login", { password });
      setAuth(await api("/auth/status"));
      setPassword("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!auth)
    return (
      <main className="login">
        <h1>Vendrava · Auditorías</h1>
        <p>Conectando con el servidor…</p>
        <Message text={error} />
      </main>
    );
  if (!auth.authenticated)
    return (
      <main className="login">
        <div className="wordmark">Vendrava ·</div>
        <h1>
          {auth.setup_required
            ? "Tu espacio de auditorías"
            : "Bienvenido de nuevo"}
        </h1>
        <p>
          {auth.setup_required
            ? "Crea la contraseña de administrador para empezar."
            : "Accede a tus leads, evidencias y oportunidades."}
        </p>
        <form onSubmit={login}>
          <Field
            label={
              auth.setup_required
                ? "Nueva contraseña · mínimo 12 caracteres"
                : "Contraseña"
            }
          >
            <input
              type="password"
              minLength={12}
              required
              autoComplete={
                auth.setup_required ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button className="primary" disabled={busy}>
            {busy
              ? "Entrando…"
              : auth.setup_required
                ? "Crear espacio"
                : "Entrar"}
          </button>
          <Message text={error} />
        </form>
      </main>
    );
  return (
    <div className="app-shell">
      <aside>
        <div className="brand">
          <div className="wordmark">Vendrava ·</div>
          <span>Auditorías</span>
        </div>
        <nav>
          {[
            [ClipboardList, "Leads"],
            [FileText, "Catálogo"],
            [Link, "Conexiones"],
          ].map(([Icon, label]: any) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              onClick={() => {
                setPage(label);
                setError("");
              }}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>
        <button
          className="logout"
          onClick={async () => {
            await api("/auth/logout", {});
            setAuth(await api("/auth/status"));
          }}
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </aside>
      <main>
        <Message text={error} />
        {page === "Leads" ? (
          <>
            <Leads
              leads={leads}
              selected={selected}
              onSelect={setSelected}
              refresh={refresh}
              onError={setError}
            />
            {selected && (
              <Detail key={selected} id={selected} onChange={refresh} />
            )}
          </>
        ) : page === "Catálogo" ? (
          <Catalog />
        ) : (
          <Connections />
        )}
        <footer>Vendrava · Evidencias, supuestos y decisiones.</footer>
      </main>
    </div>
  );
}
