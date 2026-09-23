import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Play,
  Sparkles,
  Download,
  FileCheck2,
  ChartNoAxesCombined,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { api, money, num, readFile } from "../api";
import { Badge, Empty, Field, Message, Modal } from "../components/UI";
import Calculator from "./Calculator";
import Market from "./Market";
import Competitors from "./Competitors";
const tabs = [
  "Resumen",
  "Comprobaciones",
  "Demanda",
  "Competidores",
  "Calculadora",
  "Informe",
];
export default function Detail({
  id,
  onChange,
}: {
  id: string;
  onChange: () => Promise<void>;
}) {
  const [info, setInfo] = useState<any>(null),
    [audit, setAudit] = useState<any>(null),
    [auditId, setAuditId] = useState(""),
    [tab, setTab] = useState("Resumen"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("issues"),
    [query, setQuery] = useState(""),
    [auditModal, setAuditModal] = useState(false),
    [edit, setEdit] = useState<any>(null),
    [options, setOptions] = useState({
      profile: "lite",
      render: false,
      performance: false,
      external_links: false,
    });
  const refresh = useCallback(async () => {
    const data = await api(`/leads/${id}`);
    setInfo(data);
    const a = auditId || data.audits[0]?.id;
    if (a) setAudit(await api(`/audits/${a}`));
    await onChange();
  }, [id, auditId, onChange]);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const data = await api(`/leads/${id}`);
        if (!live) return;
        setInfo(data);
        const a = auditId || data.audits[0]?.id;
        if (a) {
          const r = await api(`/audits/${a}`);
          if (live) setAudit(r);
        }
      } catch (e) {
        if (live) setError(String(e));
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(interval);
    };
  }, [id, auditId]);
  async function action(path: string, body: any = {}) {
    setBusy(true);
    setError("");
    try {
      await api(path, body);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!info) return <p>Cargando expediente…</p>;
  const lead = info.lead;
  const calc = info.scenarios[0]?.result;
  const findings = audit?.packet?.findings ?? [];
  const active = ["queued", "running"].includes(audit?.status);
  const filtered = findings.filter(
    (f: any) =>
      (filter === "all" ||
        (filter === "issues" && ["fail", "warning"].includes(f.state)) ||
        f.state === filter) &&
      `${f.rule_id} ${f.title} ${f.url}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="detail">
      <header className="detail-header">
        <div className="company-title">
          <Building2 size={29} />
          <div>
            <h2>{lead.name}</h2>
            <p>
              {new URL(lead.url).hostname} ·{" "}
              {lead.sector || "Sector por definir"}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Editar ficha de empresa"
            onClick={() => {
              const { id, created_at, demo, ...fields } = lead;
              setEdit(fields);
            }}
          >
            <Pencil size={16} />
          </button>
        </div>
        <div className="actions">
          <button
            className="primary"
            disabled={busy || active}
            onClick={() => setAuditModal(true)}
          >
            <Play size={16} />
            Auditar web
          </button>
          <button
            disabled={busy || audit?.status !== "completed"}
            onClick={() => action(`/audits/${audit.id}/analysis`)}
          >
            <Sparkles size={17} />
            Generar análisis
          </button>
          <a className="button" href={`/api/leads/${id}/report.html`}>
            <Download size={17} />
            Exportar informe
          </a>
        </div>
      </header>
      <nav className="tabs" aria-label="Secciones del lead">
        {tabs.map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="tab-content">
        <Message text={error} />
        {busy && <p role="status">Procesando…</p>}
        {lead.demo && (
          <p className="demo-notice">
            Ejemplo ilustrativo. Sustituye los supuestos por datos del negocio.
          </p>
        )}
        {tab === "Resumen" && (
          <>
            <h3>La oportunidad, con contexto</h3>
            <div className="metrics economic-metrics">
              <div>
                <strong>{num(calc?.qualification.qualified)}</strong>
                <span>Búsquedas cualificadas/mes</span>
              </div>
              <div>
                <strong>{num(calc?.steady_clients_year, 2)}</strong>
                <span>Clientes/año · escenario</span>
              </div>
              <div>
                <strong>
                  {money(calc?.steady_annualized_revenue, calc?.currency)}
                </strong>
                <span>Valor anualizado · escenario</span>
              </div>
            </div>
            {!calc && (
              <p>
                Completa Demanda y Calculadora para obtener un escenario
                económico.
              </p>
            )}
            <div className="steps">
              <button onClick={() => setTab("Comprobaciones")}>
                <FileCheck2 />
                <span>
                  <strong>1. Auditoría automática</strong>
                  <small>Evidencias y comprobaciones</small>
                </span>
                {audit && <Badge state={audit.status} />}
                <ChevronRight />
              </button>
              <button onClick={() => setTab("Informe")}>
                <ChartNoAxesCombined />
                <span>
                  <strong>2. Interpretación con IA</strong>
                  <small>Recomendaciones y prioridades</small>
                </span>
                <small>{audit?.analysis ? "Disponible" : "Pendiente"}</small>
                <ChevronRight />
              </button>
            </div>
            {active && (
              <div className="toolbar">
                <p>
                  El trabajo continúa en segundo plano. Puedes abrir otra
                  empresa.
                </p>
                <button onClick={() => action(`/audits/${audit.id}/cancel`)}>
                  Cancelar auditoría
                </button>
              </div>
            )}
            {audit?.error && <Message text={audit.error} />}
            {audit?.packet && (
              <p className="caption">
                {audit.packet.crawl.scope.crawled_urls} URLs muestreadas ·{" "}
                {audit.packet.crawl.usage.requests} peticiones ·{" "}
                {num(audit.packet.crawl.usage.elapsed_seconds, 1)} s.{" "}
                {audit.packet.crawl.warnings.join(" ")}
              </p>
            )}
            <h3>Historial de auditorías</h3>
            <div className="list">
              {info.audits.map((a: any) => (
                <button
                  className="list-row"
                  key={a.id}
                  onClick={() => setAuditId(a.id)}
                >
                  <span>{new Date(a.created_at).toLocaleString("es-ES")}</span>
                  <Badge state={a.status} />
                </button>
              ))}
            </div>
          </>
        )}
        {tab === "Comprobaciones" && (
          <>
            <div className="section-title">
              <h3>Pruebas antes que conclusiones</h3>
              <a href={`/api/leads/${id}/export.json`}>
                Descargar expediente JSON
              </a>
            </div>
            <div className="toolbar">
              <select
                aria-label="Estado de comprobaciones"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="issues">Fallos y señales a revisar</option>
                <option value="all">Todos los resultados</option>
                <option value="unknown">Desconocidos</option>
                <option value="pass">Correctos</option>
                <option value="observed">Observaciones</option>
                <option value="not_applicable">No aplicables</option>
              </select>
              <input
                aria-label="Buscar comprobación"
                placeholder="Filtrar por regla, título o URL"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {audit?.status === "completed" && (
              <button
                onClick={async () => {
                  try {
                    const data = JSON.parse(await readFile(".json"));
                    const r = await api(`/audits/${audit.id}/external`, data);
                    setAuditId(r.id);
                    await refresh();
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Importar datos externos y crear revisión
              </button>
            )}
            <p className="caption">
              {filtered.length} resultados de {findings.length}. Las heurísticas
              requieren interpretación; una observación no es un fallo SEO.
            </p>
            {filtered.length ? (
              filtered.map((f: any) => (
                <details className="finding" key={f.id}>
                  <summary>
                    <span>
                      <strong>
                        {f.rule_id} · {f.title}
                      </strong>
                      <small>{f.url}</small>
                    </span>
                    <Badge state={f.state} />
                  </summary>
                  <p>{f.detail}</p>
                  <p>
                    <strong>Acción base:</strong> {f.action}
                  </p>
                  <p className="caption">{f.guard}</p>
                  <p className="caption">
                    Evidencia {f.id} · {f.observed_at}
                  </p>
                  <a href={f.source_url} target="_blank" rel="noreferrer">
                    Referencia de la regla
                  </a>
                </details>
              ))
            ) : (
              <Empty>
                No hay resultados para este filtro.{" "}
                {audit?.status !== "completed"
                  ? "Ejecuta primero una auditoría."
                  : ""}
              </Empty>
            )}
          </>
        )}
        {tab === "Demanda" && (
          <Market key={id} id={id} market={info.market} refresh={refresh} />
        )}
        {tab === "Competidores" && <Competitors id={id} />}
        {tab === "Calculadora" && (
          <Calculator
            key={id}
            id={id}
            scenarios={info.scenarios}
            onSaved={refresh}
          />
        )}
        {tab === "Informe" && (
          <>
            <h2>Un argumento comercial que puedas defender</h2>
            <p>
              El documento reúne el filtro, el embudo, los competidores
              observados, los hallazgos técnicos y las hipótesis. Las cifras
              provienen de escenarios guardados.
            </p>
            <div className="toolbar">
              <a
                className="button primary"
                href={`/api/leads/${id}/report.html`}
              >
                <Download size={18} />
                Descargar informe HTML
              </a>
              <a className="button" href={`/api/leads/${id}/export.json`}>
                Expediente y versiones JSON
              </a>
              {audit?.packet && (
                <a
                  className="button"
                  href={`/api/audits/${audit.id}/ai-input`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver entrada de la IA
                </a>
              )}
            </div>
            <p className="caption">
              Abre el informe en tu navegador y elige Imprimir → Guardar como
              PDF.
            </p>
            {audit?.analysis ? (
              <>
                <h3>Interpretación con IA</h3>
                <p>{audit.analysis.summary}</p>
                {audit.analysis.actions.map((a: any, i: number) => (
                  <article className="finding" key={i}>
                    <h3>{a.title}</h3>
                    <p>{a.explanation}</p>
                    <p>Criterio de aceptación: {a.acceptance}</p>
                    <small>{a.evidence_ids.join(", ")}</small>
                  </article>
                ))}
                <p className="caption">
                  Modelo: {audit.analysis.model} · {audit.analysis.created_at}
                </p>
              </>
            ) : (
              <Empty>
                El informe por código está disponible. La interpretación con IA
                requiere una conexión configurada y una auditoría completada.
              </Empty>
            )}
          </>
        )}
      </div>
      {auditModal && (
        <Modal title="Ejecutar auditoría" onClose={() => setAuditModal(false)}>
          <Field label="Perfil de rastreo">
            <select
              value={options.profile}
              onChange={(e) =>
                setOptions({ ...options, profile: e.target.value })
              }
            >
              <option value="lite">
                Exploración · hasta 3 URLs / 20 peticiones
              </option>
              <option value="standard">
                Estándar · hasta 20 URLs / 100 peticiones
              </option>
              <option value="extended">
                Ampliado · hasta 80 URLs / 350 peticiones
              </option>
            </select>
          </Field>
          <label className="check">
            <input
              type="checkbox"
              disabled={options.profile === "lite"}
              checked={options.render && options.profile !== "lite"}
              onChange={(e) =>
                setOptions({ ...options, render: e.target.checked })
              }
            />
            Renderizar muestra con navegador
          </label>
          <label className="check">
            <input
              type="checkbox"
              disabled={options.profile === "lite"}
              checked={options.performance && options.profile !== "lite"}
              onChange={(e) =>
                setOptions({ ...options, performance: e.target.checked })
              }
            />
            Medir rendimiento con PageSpeed (requiere conexión)
          </label>
          <label className="check">
            <input
              type="checkbox"
              disabled={options.profile === "lite"}
              checked={options.external_links && options.profile !== "lite"}
              onChange={(e) =>
                setOptions({ ...options, external_links: e.target.checked })
              }
            />
            Comprobar hasta cinco enlaces externos
          </label>
          <p>
            Se respetan robots.txt, el alcance del dominio y los límites. El
            sitio puede impedir completar algunas comprobaciones.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setAuditModal(false);
              setAuditId("");
              await action(`/leads/${id}/audits`, {
                ...options,
                render: options.render && options.profile !== "lite",
                performance: options.performance && options.profile !== "lite",
              });
            }}
          >
            Iniciar auditoría
          </button>
        </Modal>
      )}
      {edit && (
        <Modal title="Ficha comercial" onClose={() => setEdit(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const payload = { ...edit };
                for (const key of [
                  "services",
                  "exclusions",
                  "expected_indexable",
                ])
                  payload[key] = payload[key]
                    .map((v: string) => v.trim())
                    .filter(Boolean);
                await api(`/leads/${id}`, payload, "PUT");
                setEdit(null);
                await refresh();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {[
              ["name", "Empresa"],
              ["sector", "Sector"],
              ["minimum_order", "Pedido mínimo / condiciones"],
              ["notes", "Notas del negocio"],
            ].map(([k, label]) => (
              <Field key={k} label={label}>
                <input
                  value={edit[k]}
                  onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                />
              </Field>
            ))}
            <Field label="Modelo comercial">
              <select
                value={edit.business_model}
                onChange={(e) =>
                  setEdit({ ...edit, business_model: e.target.value })
                }
              >
                <option value="b2b">B2B</option>
                <option value="b2c">B2C</option>
                <option value="mixed">Mixto</option>
              </select>
            </Field>
            {[
              ["services", "Servicios"],
              ["exclusions", "Compradores excluidos"],
              ["expected_indexable", "URLs con intención indexable confirmada"],
            ].map(([k, label]) => (
              <Field key={k} label={label + " · uno por línea"}>
                <textarea
                  value={edit[k].join("\n")}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      [k]: e.target.value.split("\n"),
                    })
                  }
                />
              </Field>
            ))}
            <button className="primary" disabled={busy}>
              Guardar ficha
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
