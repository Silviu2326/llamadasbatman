import { useState } from "react";
import { api, num, money } from "../api";
import { Field, Message } from "../components/UI";
const initialRate = {
  segment: "principal",
  current_ctr: null,
  target_ctr: 0.12,
  click_to_session: 1,
  contact_rate: 0.02,
  quote_rate: 0.5,
  close_rate: 0.2,
  annual_ticket: 35000,
  margin: null,
  annual_retention: 0.85,
  monthly_capacity: null,
  source: "Supuestos pendientes de validar con el negocio",
};
const initial = {
  name: "Base",
  currency: "EUR",
  rates: [initialRate],
  start_delay_months: 0,
  ramp_months: 0,
  sales_delay_months: 0,
  horizon_months: 60,
  monthly_cost: 0,
  setup_cost: 0,
  onboarding_cost: 0,
  annual_discount: 0,
  seasonality: Array(12).fill(1),
};
export default function Calculator({
  id,
  scenarios,
  onSaved,
}: {
  id: string;
  scenarios: any[];
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<any>(scenarios[0]?.data ?? initial),
    [result, setResult] = useState<any>(scenarios[0]?.result ?? null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [json, setJson] = useState("");
  function update(key: string, value: any) {
    setForm({ ...form, [key]: value });
    setResult(null);
  }
  function rate(index: number, key: string, value: any) {
    setForm({
      ...form,
      rates: form.rates.map((r: any, i: number) =>
        i === index ? { ...r, [key]: value } : r,
      ),
    });
    setResult(null);
  }
  async function run(save: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await api(
        `/leads/${id}/${save ? "scenarios" : "calculate"}`,
        form,
      );
      setResult(save ? r.result : r);
      if (save) await onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="calculator">
      <div className="section-title">
        <div>
          <h2>La oportunidad, con tus cifras</h2>
          <p>
            Edita los supuestos. El cálculo se ejecuta con código y conserva
            cada versión.
          </p>
        </div>
        <select
          aria-label="Cargar escenario"
          value=""
          onChange={(e) => {
            const s = scenarios.find((x) => x.id === e.target.value);
            if (s) {
              setForm(s.data);
              setResult(s.result);
            }
          }}
        >
          <option value="">Versiones guardadas</option>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.data.name} · {new Date(s.created_at).toLocaleString("es-ES")}
            </option>
          ))}
        </select>
      </div>
      <div className="form-grid">
        <Field label="Nombre del escenario">
          <input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </Field>
        <Field label="Moneda">
          <select
            value={form.currency}
            onChange={(e) => update("currency", e.target.value)}
          >
            {["EUR", "USD", "GBP"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      {form.rates.map((r: any, i: number) => (
        <fieldset key={i}>
          <legend>Segmento {i + 1}</legend>
          <div className="form-grid three">
            <Field label="Identificador de segmento">
              <input
                value={r.segment}
                onChange={(e) => rate(i, "segment", e.target.value)}
              />
            </Field>
            {[
              ["current_ctr", "CTR actual (%) · vacío si desconocido", true],
              ["target_ctr", "CTR objetivo (%)", true],
              ["contact_rate", "Contacto por sesión (%)", true],
              ["quote_rate", "Presupuesto por contacto (%)", true],
              ["close_rate", "Cierre por presupuesto (%)", true],
              ["annual_ticket", "Ingreso anual por cliente", false],
              ["annual_retention", "Retención anual (%)", true],
              ["margin", "Margen (%) · opcional", true],
              ["monthly_capacity", "Capacidad clientes/mes · opcional", false],
              ["click_to_session", "Sesiones por clic", false],
            ].map(([key, label, percent]) => (
              <Field key={String(key)} label={String(label)}>
                <input
                  type="number"
                  step="any"
                  min="0"
                  max={percent ? 100 : undefined}
                  value={
                    r[String(key)] == null
                      ? ""
                      : Number(
                          (r[String(key)] * (percent ? 100 : 1)).toFixed(6),
                        )
                  }
                  onChange={(e) =>
                    rate(
                      i,
                      String(key),
                      e.target.value === ""
                        ? null
                        : Number(e.target.value) / (percent ? 100 : 1),
                    )
                  }
                />
              </Field>
            ))}
          </div>
          <Field label="Fuente de las tasas / hipótesis">
            <textarea
              value={r.source}
              onChange={(e) => rate(i, "source", e.target.value)}
            />
          </Field>
          {i > 0 && (
            <button
              onClick={() =>
                update(
                  "rates",
                  form.rates.filter((_: any, j: number) => i !== j),
                )
              }
            >
              Eliminar segmento
            </button>
          )}
        </fieldset>
      ))}
      <button
        onClick={() =>
          update("rates", [
            ...form.rates,
            { ...initialRate, segment: "segmento-" + (form.rates.length + 1) },
          ])
        }
      >
        Añadir segmento
      </button>
      <div className="form-grid three calendar-fields">
        {[
          ["start_delay_months", "Inicio SEO (meses)"],
          ["ramp_months", "Progreso hasta objetivo (meses)"],
          ["sales_delay_months", "Plazo comercial (meses)"],
          ["horizon_months", "Horizonte (meses)"],
          ["setup_cost", "Inversión inicial"],
          ["monthly_cost", "Coste mensual"],
          ["onboarding_cost", "Coste de incorporar cliente"],
          ["annual_discount", "Descuento anual (decimal)"],
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              type="number"
              step="any"
              min="0"
              value={form[key]}
              onChange={(e) => update(key, Number(e.target.value))}
            />
          </Field>
        ))}
      </div>
      <div className="toolbar">
        <button disabled={busy} onClick={() => run(false)}>
          Calcular
        </button>
        <button className="primary" disabled={busy} onClick={() => run(true)}>
          Guardar escenario
        </button>
        <button
          onClick={() => {
            setAdvanced(!advanced);
            setJson(JSON.stringify(form, null, 2));
          }}
        >
          Editar JSON y estacionalidad
        </button>
      </div>
      {advanced && (
        <>
          <textarea
            aria-label="Escenario JSON"
            className="code"
            rows={12}
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
          <button
            onClick={async () => {
              try {
                setForm(await api("/validate/scenario", JSON.parse(json)));
                setResult(null);
                setAdvanced(false);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Aplicar JSON
          </button>
        </>
      )}
      <Message text={error} />
      {result && (
        <>
          <div className="metrics economic-metrics">
            <div>
              <span>Clientes/año · ritmo estable</span>
              <strong>{num(result.steady_clients_year, 2)}</strong>
            </div>
            <div>
              <span>Valor anualizado</span>
              <strong>
                {money(result.steady_annualized_revenue, result.currency)}
              </strong>
            </div>
            <div>
              <span>Ingresos dentro del primer año</span>
              <strong>
                {money(result.first_year_revenue, result.currency)}
              </strong>
            </div>
          </div>
          <p className="caption">
            {result.calculation_id} ·{" "}
            {result.ready_for_review
              ? "Agrupación revisada; validar supuestos comerciales."
              : "Datos pendientes de revisión."}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Nuevos clientes</th>
                  <th>Ingresos de cohortes</th>
                  <th>Contribución neta</th>
                </tr>
              </thead>
              <tbody>
                {result.timeline.map((t: any) => (
                  <tr key={t.month}>
                    <td>{t.month}</td>
                    <td>{num(t.new_clients, 2)}</td>
                    <td>{money(t.revenue, result.currency)}</td>
                    <td>{money(t.net_contribution, result.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Contribución en el horizonte:{" "}
            <strong>{money(result.net_contribution, result.currency)}</strong>.
            Diferencia de ingresos al esperar tres meses:{" "}
            <strong>
              {money(result.delay_3_months_revenue_difference, result.currency)}
            </strong>
            .
          </p>
          <ul>
            {result.assumptions.map((a: string, i: number) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
