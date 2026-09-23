import { useState } from "react";
import { api, num, readFile } from "../api";
import { Field, Message } from "../components/UI";
export default function Market({
  id,
  market,
  refresh,
}: {
  id: string;
  market: any;
  refresh: () => Promise<void>;
}) {
  const [data, setData] = useState<any>(market),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [queries, setQueries] = useState(""),
    [proposals, setProposals] = useState<any[]>([]);
  function row(i: number, key: string, value: any) {
    setData({
      ...data,
      overlap_reviewed: false,
      keywords: data.keywords.map((k: any, j: number) =>
        i === j ? { ...k, [key]: value } : k,
      ),
    });
  }
  async function save() {
    setBusy(true);
    try {
      await api(`/leads/${id}/market`, data, "PUT");
      await refresh();
      setError(
        "Demanda guardada. Los escenarios anteriores conservan su versión; recalcula para usar estos datos.",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>El filtro primero</h2>
      <p>
        Una fila por consulta. Las variantes que comparten volumen deben tener
        el mismo grupo y los mismos datos. La marca queda fuera de la nueva
        captación.
      </p>
      <div className="toolbar">
        <button
          onClick={() =>
            setData({
              ...data,
              overlap_reviewed: false,
              keywords: [
                ...data.keywords,
                {
                  keyword: "",
                  group_id: "grupo-" + (data.keywords.length + 1),
                  segment: "principal",
                  volume: null,
                  status: "ambiguous",
                  fit_weight: 0,
                  reason: "",
                  source: "Importación manual",
                  period: new Date().toISOString().slice(0, 7),
                  geography: "ES",
                  brand: false,
                },
              ],
            })
          }
        >
          Añadir consulta
        </button>
        <button
          onClick={async () => {
            try {
              const content = await readFile(".csv");
              const r = await api(`/leads/${id}/market/import`, { content });
              setData(r);
              await refresh();
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Importar CSV
        </button>
        <button
          onClick={async () => {
            try {
              setData(
                await api(
                  "/validate/market",
                  JSON.parse(await readFile(".json")),
                ),
              );
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Cargar JSON
        </button>
      </div>
      <div className="keyword-list">
        {data.keywords.map((k: any, i: number) => (
          <details key={i} open={i === 0}>
            <summary>
              <strong>{k.keyword || "Nueva consulta"}</strong>
              <span>
                {num(k.volume)} búsquedas/mes ·{" "}
                {k.status === "included"
                  ? "Incluida"
                  : k.status === "excluded"
                    ? "Excluida"
                    : "Ambigua"}
              </span>
            </summary>
            <div className="form-grid three">
              <Field label="Consulta">
                <input
                  value={k.keyword}
                  onChange={(e) => row(i, "keyword", e.target.value)}
                />
              </Field>
              <Field label="Grupo de volumen">
                <input
                  value={k.group_id}
                  onChange={(e) => row(i, "group_id", e.target.value)}
                />
              </Field>
              <Field label="Segmento">
                <input
                  value={k.segment}
                  onChange={(e) => row(i, "segment", e.target.value)}
                />
              </Field>
              <Field label="Búsquedas/mes · vacío si desconocido">
                <input
                  type="number"
                  min="0"
                  value={k.volume ?? ""}
                  onChange={(e) =>
                    row(
                      i,
                      "volume",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                />
              </Field>
              <Field label="Encaje comercial">
                <select
                  value={k.status}
                  onChange={(e) => row(i, "status", e.target.value)}
                >
                  <option value="included">Incluida</option>
                  <option value="excluded">Excluida</option>
                  <option value="ambiguous">Ambigua</option>
                </select>
              </Field>
              <Field label="Peso si ambigua (0–1)">
                <input
                  type="number"
                  min="0"
                  max="1"
                  step=".05"
                  value={k.fit_weight}
                  onChange={(e) => row(i, "fit_weight", Number(e.target.value))}
                />
              </Field>
              <Field label="Fuente">
                <input
                  value={k.source}
                  onChange={(e) => row(i, "source", e.target.value)}
                />
              </Field>
              <Field label="Periodo del conjunto">
                <input
                  type="month"
                  value={k.period}
                  onChange={(e) => row(i, "period", e.target.value)}
                />
              </Field>
              <Field label="Geografía">
                <input
                  value={k.geography}
                  onChange={(e) => row(i, "geography", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Justificación / evidencia del encaje">
              <textarea
                value={k.reason}
                onChange={(e) => row(i, "reason", e.target.value)}
              />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={k.brand}
                onChange={(e) => row(i, "brand", e.target.checked)}
              />
              Consulta de marca
            </label>
            <button
              onClick={() =>
                setData({
                  ...data,
                  overlap_reviewed: false,
                  keywords: data.keywords.filter(
                    (_: any, j: number) => i !== j,
                  ),
                })
              }
            >
              Eliminar consulta
            </button>
          </details>
        ))}
      </div>
      <section className="provider-section">
        <h3>Cualificar con IA</h3>
        <p>
          Guarda primero la demanda y completa la ficha comercial. Las
          propuestas no cambian volúmenes ni pesos.
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api(`/leads/${id}/market/classify`, {});
              setProposals(r.proposals);
              setError(
                r.proposals.length
                  ? "Propuestas listas para revisar."
                  : "No hay grupos ambiguos pendientes.",
              );
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Proponer encaje con IA
        </button>
        {proposals.map((p) => (
          <div className="finding" key={p.group_id}>
            <strong>
              {p.group_id} · {p.status}
            </strong>
            <p>{p.reason}</p>
            <p>Referencia de la ficha: {p.business_evidence}</p>
            <button
              onClick={() => {
                setData({
                  ...data,
                  overlap_reviewed: false,
                  keywords: data.keywords.map((k: any) =>
                    k.group_id === p.group_id
                      ? {
                          ...k,
                          status: p.status,
                          reason: p.reason + " · " + p.business_evidence,
                        }
                      : k,
                  ),
                });
                setProposals(
                  proposals.filter((x) => x.group_id !== p.group_id),
                );
              }}
            >
              Aplicar propuesta al borrador
            </button>
          </div>
        ))}
      </section>
      <label className="check">
        <input
          type="checkbox"
          checked={data.overlap_reviewed}
          onChange={(e) =>
            setData({ ...data, overlap_reviewed: e.target.checked })
          }
        />
        He revisado variantes y solapamientos entre grupos.
      </label>
      <button className="primary" disabled={busy} onClick={save}>
        Guardar demanda
      </button>
      <Message text={error} />
      <section className="provider-section">
        <h3>Obtener volúmenes</h3>
        <p>
          DataForSEO devuelve propuestas pendientes de cualificación. Consulta
          explícita con coste; máximo treinta términos.
        </p>
        <Field label="Una consulta por línea">
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
              const result = await api(`/leads/${id}/providers/volumes`, {
                keywords: queries
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean),
                location_code: 2724,
                language_code: "es",
                geography: "ES",
              });
              setData(result);
              setError(
                "Propuesta recibida. Revisa grupos y encaje antes de guardar.",
              );
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Consultar volúmenes de España
        </button>
      </section>
    </>
  );
}
