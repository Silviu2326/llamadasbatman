import { useEffect, useState } from "react";
import { api, num, readFile } from "../api";
import { Empty, Field, Message } from "../components/UI";
export default function Competitors({ id }: { id: string }) {
  const [data, setData] = useState<any>(null),
    [queries, setQueries] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setData(await api(`/leads/${id}/competitors`));
  }
  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, [id]);
  return (
    <>
      <h2>Quién aparece ante esa demanda</h2>
      <p>
        Posiciones observadas por consulta, fecha, dispositivo y zona. Una
        posición no acredita los ingresos de otra empresa.
      </p>
      <div className="toolbar">
        <button
          onClick={async () => {
            try {
              const json = JSON.parse(await readFile(".json"));
              for (const s of Array.isArray(json) ? json : [json])
                await api(`/leads/${id}/serps`, s);
              await load();
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Importar observaciones JSON
        </button>
      </div>
      {data?.rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Consulta / fecha</th>
                <th>Dominio / URL</th>
                <th>Posición</th>
                <th>Tipo</th>
                <th>Clics simulados</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any, i: number) => (
                <tr key={i}>
                  <td>
                    {r.keyword}
                    <small>
                      {r.captured_at.slice(0, 10)} · {r.geography} · {r.device}
                    </small>
                  </td>
                  <td>
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.domain}
                    </a>
                    {r.own && <small>Tu dominio</small>}
                  </td>
                  <td>{r.position}</td>
                  <td>{r.kind}</td>
                  <td>{num(r.estimated_clicks, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>
          No hay posiciones observadas. Importa resultados o conecta el
          proveedor.
        </Empty>
      )}
      <p className="caption">{data?.method}</p>
      <Field label="Consultas para obtener posiciones · una por línea">
        <textarea
          value={queries}
          onChange={(e) => setQueries(e.target.value)}
        />
      </Field>
      <button
        disabled={busy || !queries.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/leads/${id}/providers/serps`, {
              keywords: queries
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean),
              geography: "ES",
              location_code: 2724,
              language_code: "es",
            });
            await load();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Consultando…" : "Consultar SERP de España"}
      </button>
      <Message text={error} />
    </>
  );
}
