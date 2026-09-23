from html import escape
from .models import now


def report_html(lead, audit, scenarios, market, competitors):
    def e(v):
        return escape(str(v))

    def number(v):
        return f"{v:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")

    parts = [
        f'<h1>{e(lead["name"])}</h1><p class="muted">Auditoría SEO y oportunidad comercial · {e(now()[:10])}</p><p>{e(lead["url"])}</p>'
    ]
    if lead.get("demo"):
        parts.append(
            '<p class="notice">DATOS DE DEMOSTRACIÓN. No es una auditoría de una empresa real.</p>'
        )
    parts.append("<h2>El filtro primero</h2>")
    if scenarios:
        latest = scenarios[0]
        r = latest["result"]
        q = r["qualification"]
        parts.append(
            '<p class="muted">Escenario guardado: '
            + e(latest["created_at"])
            + ". Usa su conjunto de datos conservado; los cambios posteriores requieren recalcular.</p>"
        )
        parts.append(
            f"<p>El conjunto aportado contiene {number(q['total'])} búsquedas mensuales estimadas. Aplicando las exclusiones, la separación de marca y los pesos de encaje declarados, el escenario conserva <strong>{number(q['qualified'])} búsquedas cualificadas al mes</strong>. Son búsquedas, no compradores únicos.</p>"
        )
        parts.append(
            "<h2>El embudo comercial</h2><table><tr><th>Magnitud</th><th>Escenario "
            + e(latest["data"]["name"])
            + "</th></tr>"
        )
        for label, key in [
            ("Clics adicionales/mes", "additional_clicks_month"),
            ("Clientes/año a ritmo estabilizado", "steady_clients_year"),
            ("Valor anualizado de nuevos clientes", "steady_annualized_revenue"),
            ("Clientes captados durante el primer año", "new_clients_first_year"),
            ("Ingresos dentro del primer año", "first_year_revenue"),
            ("Ingresos de todas las cohortes en el horizonte", "horizon_revenue"),
            (
                "Diferencia de ingresos al retrasar tres meses",
                "delay_3_months_revenue_difference",
            ),
        ]:
            parts.append(
                f"<tr><td>{e(label)}</td><td>{number(r[key])} {e(r['currency']) if 'revenue' in key else ''}</td></tr>"
            )
        parts.append(
            "</table><p>Horizonte: "
            + e(latest["data"]["horizon_months"])
            + " meses. Referencia de cálculo: "
            + e(r["calculation_id"])
            + ".</p><h3>Supuestos y límites</h3><ul>"
        )
        parts.extend("<li>" + e(a) + "</li>" for a in r["assumptions"])
        parts.append(
            "</ul><p>La recurrencia modela permanencia esperada. No representa contratos comprometidos ni acredita adjudicaciones a la competencia. El coste de esperar compara dos calendarios con el mismo horizonte.</p>"
        )
    else:
        parts.append(
            "<p>Sin escenario calculado. Importa demanda, revisa los grupos y define las tasas del negocio para estimar oportunidad económica.</p>"
        )
    parts.append("<h2>Quién aparece ante esa demanda</h2>")
    if competitors["rows"]:
        parts.append(
            "<table><tr><th>Consulta</th><th>Posición</th><th>Dominio</th><th>Fecha / contexto</th></tr>"
        )
        for c in competitors["rows"][:40]:
            parts.append(
                f"<tr><td>{e(c['keyword'])}</td><td>{c['position']}</td><td>{e(c['domain'])}</td><td>{e(c['captured_at'][:10])} · {e(c['geography'])} · {e(c['device'])}</td></tr>"
            )
        parts.append("</table><p>" + e(competitors["method"]) + "</p>")
    else:
        parts.append(
            "<p>No se han aportado observaciones de competidores. No se atribuye tráfico o dinero a ningún dominio.</p>"
        )
    if audit and audit.get("packet"):
        packet = audit["packet"]
        findings = packet["findings"]
        counts = {
            s: sum(f["state"] == s for f in findings)
            for s in (
                "fail",
                "warning",
                "pass",
                "unknown",
                "observed",
                "not_applicable",
            )
        }
        parts.append(
            "<h2>La evidencia técnica</h2><p>URLs muestreadas: "
            + e(packet["crawl"]["scope"]["crawled_urls"])
            + ". Resultados: "
            + e(counts)
            + ". Los estados corresponden a comprobaciones, no a problemas únicos.</p>"
        )
        analysis = audit.get("analysis")
        if analysis:
            parts.append(
                "<h3>Interpretación con IA</h3><p>" + e(analysis["summary"]) + "</p>"
            )
            for action in analysis["actions"]:
                parts.append(
                    "<h4>"
                    + e(action["title"])
                    + "</h4><p>"
                    + e(action["explanation"])
                    + "</p><p>Criterio: "
                    + e(action["acceptance"])
                    + '</p><p class="muted">'
                    + e(", ".join(action["evidence_ids"]))
                    + "</p>"
                )
        else:
            parts.append(
                "<p>Informe generado por código. Interpretación con IA pendiente.</p>"
            )
        for f in findings:
            if f["state"] not in ("fail", "warning"):
                continue
            parts.append(
                "<article><h3>"
                + e(f["rule_id"] + " · " + f["title"])
                + "</h3><p>"
                + e(f["url"])
                + "</p><p>"
                + e(f["detail"])
                + "</p><p><strong>Acción:</strong> "
                + e(f["action"])
                + '</p><p class="muted">'
                + e(f["guard"])
                + " · Evidencia "
                + e(f["id"])
                + "</p></article>"
            )
        parts.append(
            "<h3>Alcance</h3><p>"
            + e(
                "; ".join(packet["crawl"]["warnings"])
                or "Muestra limitada por el perfil seleccionado; no acredita cobertura completa del sitio."
            )
            + "</p>"
        )
    return (
        '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Auditoría '
        + e(lead["name"])
        + "</title><style>body{font:16px/1.65 system-ui;color:#17352c;max-width:940px;margin:48px auto;padding:0 24px}h1{font-size:38px}h2{margin-top:36px;border-bottom:1px solid #ddd}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:10px;border-bottom:1px solid #ddd}th{background:#eef5f2}.muted{color:#63756f;font-size:14px}.notice{background:#fff2d4;padding:14px}article{break-inside:avoid}p,td{overflow-wrap:anywhere}@media print{body{margin:0;font-size:11px}h1{font-size:25px}}</style><body>"
        + "".join(parts)
        + "</body></html>"
    )
