"""Deterministic incremental model. Monthly cohorts close at mid-month;
first-period revenue is prorated, annual retention converted to monthly.
"""

import hashlib
import json
from collections import defaultdict
from .models import MarketInput, Scenario


def qualify(market: MarketInput):
    groups = {}
    warnings = []
    segments = defaultdict(float)
    contexts = {(k.geography, k.period) for k in market.keywords}
    if len(contexts) > 1:
        raise ValueError(
            "No agregues distintos periodos o geografías en el mismo mercado. Crea expedientes separados."
        )
    for k in market.keywords:
        key = k.group_id.strip().casefold()
        if key in groups:
            old = groups[key]
            if (
                old.volume,
                old.source,
                old.segment,
                old.status,
                old.fit_weight,
                old.brand,
            ) != (k.volume, k.source, k.segment, k.status, k.fit_weight, k.brand):
                raise ValueError(
                    "Variantes del grupo "
                    + k.group_id
                    + " tienen valores incompatibles. Resuelve el grupo antes de calcular."
                )
        else:
            groups[key] = k
    total = 0
    excluded = 0
    missing = 0
    ambiguous = 0
    brand = 0
    for k in groups.values():
        if k.volume is None:
            missing += 1
            continue
        total += k.volume
        if k.brand:
            brand += k.volume
            continue
        if k.status == "excluded":
            excluded += k.volume
            continue
        weight = 1 if k.status == "included" else k.fit_weight
        if k.status == "ambiguous":
            ambiguous += k.volume
        segments[k.segment] += k.volume * weight
    if missing:
        warnings.append(
            f"{missing} grupos sin volumen; la demanda conocida es parcial."
        )
    if ambiguous:
        warnings.append(
            "La cualificación de consultas ambiguas utiliza pesos supuestos."
        )
    if not market.overlap_reviewed:
        warnings.append(
            "Solapamiento entre grupos pendiente de revisión; las cifras no se pueden aprobar para entrega."
        )
    return dict(
        total=total,
        qualified=sum(segments.values()),
        excluded=excluded,
        brand=brand,
        ambiguous=ambiguous,
        missing_groups=missing,
        groups=len(groups),
        segments=dict(segments),
        warnings=warnings,
        context=[list(c) for c in contexts],
    )


def forecast(q, s, extra_delay=0):
    timeline = [
        dict(month=i + 1, new_clients=0.0, revenue=0.0, contribution=0.0)
        for i in range(s.horizon_months)
    ]
    segment_results = []
    all_margin = all(r.margin is not None for r in s.rates)
    baseline_known = all(r.current_ctr is not None for r in s.rates)
    for rate in s.rates:
        demand = q["segments"].get(rate.segment, 0)
        ctr_base = rate.current_ctr or 0
        acquisition = (
            demand
            * rate.click_to_session
            * rate.contact_rate
            * rate.quote_rate
            * rate.close_rate
        )
        base_clients = acquisition * ctr_base
        target_clients = acquisition * rate.target_ctr
        if rate.monthly_capacity is not None:
            target_clients = min(target_clients, rate.monthly_capacity)
            base_clients = min(base_clients, rate.monthly_capacity)
        steady = target_clients - base_clients
        survival = rate.annual_retention ** (1 / 12)
        cohorts = []
        annual_clients = 0.0
        firstyear = 0.0
        value_firstyear_cohort = 0.0
        for i in range(s.horizon_months):
            acquisition_month = i - s.sales_delay_months
            elapsed = acquisition_month - s.start_delay_months - extra_delay
            ramp = (
                0
                if elapsed < 0
                else min(1, (elapsed + 1) / s.ramp_months)
                if s.ramp_months
                else 1
            )
            factor = s.seasonality[acquisition_month % 12]
            current = base_clients * factor
            target = (base_clients + (target_clients - base_clients) * ramp) * factor
            if rate.monthly_capacity is not None:
                current = min(current, rate.monthly_capacity)
                target = min(target, rate.monthly_capacity)
            acquired = target - current
            cohorts.append(acquired)
            revenue = 0
            for j, count in enumerate(cohorts):
                # Mid-month acquisition: half a month initially, full surviving months thereafter.
                age = i - j
                revenue += (
                    count
                    * rate.annual_ticket
                    / 12
                    * (0.5 if age == 0 else survival ** (age - 0.5))
                )
            timeline[i]["new_clients"] += acquired
            timeline[i]["revenue"] += revenue
            timeline[i]["contribution"] += (
                revenue * (rate.margin or 0) - max(0, acquired) * s.onboarding_cost
            )
            if i < 12:
                annual_clients += acquired
                firstyear += revenue
                remaining = s.horizon_months - i
                value_firstyear_cohort += (
                    acquired
                    * rate.annual_ticket
                    / 12
                    * (
                        0.5
                        + sum(survival ** (age - 0.5) for age in range(1, remaining))
                    )
                )
        segment_results.append(
            dict(
                segment=rate.segment,
                demand=demand,
                additional_clicks_month=demand * (rate.target_ctr - ctr_base),
                steady_clients_year=steady * 12,
                steady_annualized_revenue=steady * 12 * rate.annual_ticket,
                new_clients_first_year=annual_clients,
                first_year_revenue=firstyear,
                first_year_cohort_value_in_horizon=value_firstyear_cohort,
                baseline_assumed_zero=rate.current_ctr is None,
            )
        )
    for t in timeline:
        cost = s.monthly_cost + (s.setup_cost if t["month"] == 1 else 0)
        t["cost"] = cost
        t["net_contribution"] = t["contribution"] - cost if all_margin else None
        t["discounted_contribution"] = (
            t["net_contribution"] / ((1 + s.annual_discount) ** (t["month"] / 12))
            if all_margin
            else None
        )
    total_cost = sum(t["cost"] for t in timeline)
    net = sum(t["net_contribution"] for t in timeline) if all_margin else None
    cumulative = 0
    payback = None
    if all_margin:
        for t in timeline:
            cumulative += t["net_contribution"]
            if cumulative >= 0 and total_cost > 0 and payback is None:
                payback = t["month"]
    return dict(
        segments=segment_results,
        timeline=timeline,
        mode="incremental"
        if baseline_known
        else "incremental_with_assumed_zero_baseline",
        additional_clicks_month=sum(
            x["additional_clicks_month"] for x in segment_results
        ),
        steady_clients_year=sum(x["steady_clients_year"] for x in segment_results),
        steady_annualized_revenue=sum(
            x["steady_annualized_revenue"] for x in segment_results
        ),
        new_clients_first_year=sum(
            x["new_clients_first_year"] for x in segment_results
        ),
        first_year_revenue=sum(x["first_year_revenue"] for x in segment_results),
        horizon_revenue=sum(t["revenue"] for t in timeline),
        first_year_cohort_value_in_horizon=sum(
            x["first_year_cohort_value_in_horizon"] for x in segment_results
        ),
        net_contribution=net,
        discounted_contribution=sum(t["discounted_contribution"] for t in timeline)
        if all_margin
        else None,
        roi=net / total_cost if net is not None and total_cost else None,
        payback_month=payback,
    )


def calculate(market: MarketInput, scenario: Scenario):
    q = qualify(market)
    missing = set(q["segments"]) - {r.segment for r in scenario.rates}
    if missing:
        raise ValueError(
            "Faltan tasas para los segmentos: " + ", ".join(sorted(missing))
        )
    result = forecast(q, scenario)
    delayed = forecast(q, scenario, extra_delay=3)
    assumptions = q["warnings"] + [r.segment + ": " + r.source for r in scenario.rates]
    if any(r.current_ctr is None for r in scenario.rates):
        assumptions.append(
            "CTR actual desconocido: base cero hipotética; no presentar como pérdida exacta."
        )
    assumptions.append(
        "Escenarios, no promesas. Clientes medios esperados; no personas observadas ni contratos firmados."
    )
    snapshot = {"market": market.model_dump(), "scenario": scenario.model_dump()}
    digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()[
        :20
    ]
    return dict(
        calculation_id="calc_" + digest,
        model_version="2.0.0",
        currency=scenario.currency,
        qualification=q,
        **result,
        delay_3_months_revenue_difference=result["horizon_revenue"]
        - delayed["horizon_revenue"],
        assumptions=assumptions,
        ready_for_review=market.overlap_reviewed and q["missing_groups"] == 0,
        formula="Demanda cualificada × (CTR objetivo − CTR actual) × clic→sesión × contacto × presupuesto × cierre. Ingresos por cohortes mensuales y retención.",
        inputs=snapshot,
    )


def competitor_summary(market, serps, lead_url):
    from .crawler import host

    domain = host(lead_url).removeprefix("www.")
    lookup = {k.keyword.casefold(): k for k in market.keywords}
    # Descriptive historical curve only, not applied to revenue or treated as current measurement.
    ctr = {
        1: 0.285,
        2: 0.157,
        3: 0.11,
        4: 0.08,
        5: 0.072,
        6: 0.051,
        7: 0.04,
        8: 0.032,
        9: 0.028,
        10: 0.025,
    }
    latest = {}
    for s in serps:
        key = (s["keyword"].casefold(), s["geography"], s["device"])
        if key not in latest or s["captured_at"] > latest[key]["captured_at"]:
            latest[key] = s
    rows = []
    totals = defaultdict(float)
    counted = set()
    for s in latest.values():
        k = lookup.get(s["keyword"].casefold())
        for item in s["items"]:
            d = host(item["url"]).removeprefix("www.")
            estimate = None
            if (
                k
                and k.volume is not None
                and not k.brand
                and k.status != "excluded"
                and s["geography"] == k.geography
                and item["position"] in ctr
            ):
                w = 1 if k.status == "included" else k.fit_weight
                estimate = k.volume * w * ctr[item["position"]]
                # One group/domain/device/geography; additional variants never double count.
                key = (k.group_id, d, s["device"], s["geography"])
                if key not in counted:
                    totals[(d, s["device"], s["geography"])] += estimate
                    counted.add(key)
            rows.append(
                dict(
                    **item,
                    domain=d,
                    own=d == domain,
                    keyword=s["keyword"],
                    geography=s["geography"],
                    device=s["device"],
                    captured_at=s["captured_at"],
                    source=s["source"],
                    estimated_clicks=estimate,
                )
            )
    return {
        "rows": rows,
        "totals": [
            dict(domain=k[0], device=k[1], geography=k[2], estimated_clicks=v)
            for k, v in totals.items()
        ],
        "method": "Simulación con curva histórica SISTRIX 2020, posiciones 1–10. Fuera de tabla: desconocido. Dispositivos separados. No demuestra tráfico ni ingresos reales del competidor.",
        "source_url": "https://www.sistrix.com/blog/why-almost-everything-you-knew-about-google-ctr-is-no-longer-valid/",
    }
