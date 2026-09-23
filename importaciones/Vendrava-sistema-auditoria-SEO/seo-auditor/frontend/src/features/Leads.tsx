import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Plus,
  Search,
  Upload,
  ScanSearch,
} from "lucide-react";
import { api, readFile } from "../api";
import { Badge, Empty, Field, Message, Modal } from "../components/UI";
export default function Leads({
  leads,
  selected,
  onSelect,
  refresh,
  onError,
}: {
  leads: any[];
  selected: string | null;
  onSelect: (id: string) => void;
  refresh: () => Promise<void>;
  onError: (s: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [modal, setModal] = useState(false),
    [discover, setDiscover] = useState(false),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState({ name: "", url: "", sector: "" }),
    [search, setSearch] = useState(""),
    [candidates, setCandidates] = useState<any[]>([]),
    [error, setError] = useState("");
  const visible = leads.filter((l) =>
    (l.name + " " + l.url + " " + l.sector)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const l = await api("/leads", form);
      await refresh();
      onSelect(l.id);
      setModal(false);
      setForm({ name: "", url: "", sector: "" });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function importCSV() {
    try {
      const content = await readFile(".csv");
      const result = await api("/leads/import", { content });
      await refresh();
      onError(
        result.some((r: any) => r.status === "rejected")
          ? result
              .filter((r: any) => r.status === "rejected")
              .map((r: any) => `Fila ${r.row}: ${r.reason}`)
              .join("\n")
          : "Importación completada.",
      );
    } catch (e) {
      onError(String(e));
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Leads</h1>
          <p>De una web a una oportunidad comercial.</p>
        </div>
        <button className="primary" onClick={() => setModal(true)}>
          <Plus size={19} />
          Nuevo lead
        </button>
      </header>
      <div className="metrics top-metrics">
        {[
          [Building2, "Empresas", leads.length],
          [
            CheckCircle2,
            "Auditorías listas",
            leads.filter((l) => l.last_audit?.status === "completed").length,
          ],
          [
            Clock3,
            "En proceso",
            leads.filter((l) =>
              ["queued", "running"].includes(l.last_audit?.status),
            ).length,
          ],
        ].map(([Icon, label, value]: any) => (
          <div key={label}>
            <Icon size={26} />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="toolbar">
        <label className="search">
          <Search size={19} />
          <input
            aria-label="Buscar empresa o dominio"
            placeholder="Buscar empresa o dominio"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button onClick={() => setDiscover(true)}>
          <ScanSearch size={18} />
          Buscar leads
        </button>
        <button onClick={importCSV}>
          <Upload size={18} />
          Importar CSV
        </button>
        {visible.some((l) => !l.demo) && (
          <button
            disabled={busy}
            onClick={async () => {
              const ids = visible
                .filter(
                  (l) =>
                    !l.demo &&
                    !["queued", "running"].includes(l.last_audit?.status),
                )
                .slice(0, 100)
                .map((l) => l.id);
              if (!ids.length) {
                onError("Las empresas visibles ya están en proceso.");
                return;
              }
              setBusy(true);
              try {
                const result = await api("/audits/batch", {
                  ids,
                  profile: "lite",
                });
                await refresh();
                onError(
                  `${result.filter((r: any) => r.status === "queued").length} auditorías en cola. ${result
                    .filter((r: any) => r.error)
                    .map((r: any) => r.error)
                    .join(" ")}`,
                );
              } catch (e) {
                onError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Auditar lista visible
          </button>
        )}
      </div>
      {leads.length === 0 ? (
        <Empty>
          <h2>Empieza por una empresa</h2>
          <p>
            Añade su web o importa una lista. Después podrás comprobar su SEO y
            estimar la oportunidad.
          </p>
          <button
            onClick={async () => {
              const r = await api("/demo", {});
              await refresh();
              onSelect(r.id);
            }}
          >
            Cargar demostración
          </button>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="leads-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Sector</th>
                <th>Última auditoría</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => (
                <tr key={l.id} className={l.id === selected ? "selected" : ""}>
                  <td>
                    <button
                      className="company-button"
                      onClick={() => onSelect(l.id)}
                    >
                      <Building2 />
                      <span>
                        <strong>{l.name}</strong>
                        <small>{new URL(l.url).hostname}</small>
                      </span>
                    </button>
                  </td>
                  <td>{l.sector || "—"}</td>
                  <td>
                    {l.last_audit
                      ? new Date(l.last_audit.created_at).toLocaleDateString(
                          "es-ES",
                        )
                      : "—"}
                  </td>
                  <td>
                    <Badge state={l.last_audit?.status ?? "Sin auditar"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {leads.some((l) => l.demo) && (
        <p className="caption">
          Datos de demostración en las empresas con dominio .example.
        </p>
      )}
      {modal && (
        <Modal title="Nuevo lead" onClose={() => setModal(false)}>
          <form onSubmit={create}>
            <Field label="Empresa">
              <input
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Página web">
              <input
                required
                placeholder="https://empresa.com"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </Field>
            <Field label="Sector">
              <input
                value={form.sector}
                onChange={(e) => setForm({ ...form, sector: e.target.value })}
              />
            </Field>
            <Message text={error} />
            <button className="primary" disabled={busy}>
              {busy ? "Guardando…" : "Crear lead"}
            </button>
          </form>
        </Modal>
      )}
      {discover && (
        <Modal title="Buscar posibles leads" onClose={() => setDiscover(false)}>
          <p>
            Consulta resultados mediante DataForSEO. Requiere conexión
            habilitada y consume llamadas del proveedor.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                setCandidates(
                  await api("/discover", {
                    keywords: [search],
                    geography: "ES",
                    location_code: 2724,
                    language_code: "es",
                  }),
                );
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Consulta y zona">
              <input
                value={search}
                required
                placeholder="fabricantes de envases en Valencia"
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
            <button disabled={busy}>{busy ? "Buscando…" : "Consultar"}</button>
          </form>
          <Message text={error} />
          <div className="list">
            {candidates.map((c) => (
              <div className="list-row" key={c.url}>
                <span>
                  <strong>{c.name}</strong>
                  <small>{c.url}</small>
                </span>
                <button
                  onClick={async () => {
                    try {
                      await api("/leads", { name: c.name, url: c.url });
                      await refresh();
                      setCandidates(candidates.filter((x) => x.url !== c.url));
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  Añadir
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
