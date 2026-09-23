import { useEffect, useState } from "react";
import { api, money } from "../api";
import { Message } from "../components/UI";
export function Catalog() {
  const [rules, setRules] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api("/catalog")
      .then(setRules)
      .catch((e) => setError(String(e)));
  }, []);
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Catálogo de comprobaciones</h1>
          <p>97 reglas, con condiciones, evidencias y límites explícitos.</p>
        </div>
      </header>
      <input
        className="wide"
        aria-label="Buscar regla"
        placeholder="Buscar regla o categoría"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Message text={error} />
      {rules
        .filter((r) =>
          (r.id + " " + r.name + " " + r.category)
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .map((r) => (
          <details key={r.id} className="finding">
            <summary>
              <strong>
                {r.id} · {r.name}
              </strong>
              <span className="caption">{r.category}</span>
            </summary>
            <p>
              <strong>Condición:</strong> {r.trigger}
            </p>
            <p>
              <strong>Evitar falsos positivos:</strong> {r.false_positive_guard}
            </p>
            <p>
              <strong>Prueba requerida:</strong> {r.evidence_required}
            </p>
            <p>
              <strong>Acción:</strong> {r.base_action}
            </p>
            <a href={r.source_url} target="_blank" rel="noreferrer">
              Fuente
            </a>
          </details>
        ))}
    </>
  );
}
export function Connections() {
  const [data, setData] = useState<any>(null),
    [costs, setCosts] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api("/connections"), api("/costs")])
      .then(([a, b]) => {
        setData(a);
        setCosts(b);
      })
      .catch((e) => setError(String(e)));
  }, []);
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Conexiones</h1>
          <p>
            Los datos externos enriquecen el expediente. Sus credenciales se
            configuran en el servidor.
          </p>
        </div>
      </header>
      <Message text={error} />
      {data && (
        <>
          <div className="list">
            {[
              ["OpenAI", "Interpretación y prioridades", data.ai],
              [
                "DataForSEO",
                "Descubrimiento, volúmenes y posiciones",
                data.market,
              ],
              [
                "PageSpeed Insights",
                "Rendimiento móvil de laboratorio",
                data.performance,
              ],
            ].map(([name, desc, on]) => (
              <div className="list-row" key={String(name)}>
                <span>
                  <strong>{name}</strong>
                  <small>{desc}</small>
                </span>
                <span className={"badge " + (on ? "pass" : "unknown")}>
                  {on ? "Configurada" : "Sin configurar"}
                </span>
              </div>
            ))}
          </div>
          <p>
            Llamadas externas:{" "}
            <strong>
              {data.paid_enabled ? "Habilitadas" : "Desactivadas"}
            </strong>{" "}
            · Límite diario: {data.daily_call_limit} intentos.
          </p>
          <p>
            Configura las variables en el archivo <code>.env</code> y reinicia
            el servidor. No introduzcas claves en las fichas de los leads.
          </p>
        </>
      )}
      <h2>Consumo registrado</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Operación</th>
              <th>Coste informado</th>
            </tr>
          </thead>
          <tbody>
            {costs.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.created_at).toLocaleString("es-ES")}</td>
                <td>{c.provider}</td>
                <td>{c.operation}</td>
                <td>
                  {c.amount == null ? "Desconocido" : money(c.amount, c.unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption">
        Las llamadas fallidas también consumen el límite. El coste desconocido
        no se contabiliza como cero.
      </p>
    </>
  );
}
