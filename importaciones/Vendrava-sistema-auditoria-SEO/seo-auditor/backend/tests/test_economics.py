import pytest
from app.models import Scenario, Rates
from app.economics import calculate, qualify, competitor_summary


def test_industrial_no_churn(market):
    r = calculate(market, Scenario(rates=[Rates(annual_retention=1)]))
    assert r["steady_clients_year"] == pytest.approx(6.48)
    assert r["steady_annualized_revenue"] == pytest.approx(226800)
    assert r["first_year_revenue"] == pytest.approx(113400)
    assert r["mode"] == "incremental_with_assumed_zero_baseline"
    assert r["net_contribution"] is None


def test_increment_baseline(market):
    r = calculate(market, Scenario(rates=[Rates(current_ctr=0.01, annual_retention=1)]))
    assert r["additional_clicks_month"] == pytest.approx(247.5)
    assert r["steady_annualized_revenue"] == pytest.approx(207900)


def test_zero_and_negative(market):
    assert (
        calculate(market, Scenario(rates=[Rates(current_ctr=0.12)]))[
            "first_year_revenue"
        ]
        == 0
    )
    assert (
        calculate(market, Scenario(rates=[Rates(current_ctr=0.3)]))[
            "steady_clients_year"
        ]
        < 0
    )


def test_delay_ramp_retention(market):
    base = calculate(market, Scenario(rates=[Rates(annual_retention=1)]))
    slow = calculate(
        market,
        Scenario(
            start_delay_months=2,
            ramp_months=4,
            sales_delay_months=3,
            rates=[Rates(annual_retention=0.7)],
        ),
    )
    assert all(t["new_clients"] == 0 for t in slow["timeline"][:5])
    assert slow["first_year_revenue"] < base["first_year_revenue"]
    assert slow["delay_3_months_revenue_difference"] > 0


def test_duplicates(market):
    copy = market.model_copy(deep=True)
    copy.keywords.append(
        copy.keywords[0].model_copy(update={"keyword": "boxes synonym"})
    )
    assert qualify(copy)["qualified"] == 2250
    copy.keywords[1].volume = 2400
    with pytest.raises(ValueError):
        qualify(copy)


def test_context_and_segment(market):
    copy = market.model_copy(deep=True)
    copy.keywords.append(
        copy.keywords[0].model_copy(update={"group_id": "second", "geography": "US"})
    )
    with pytest.raises(ValueError):
        qualify(copy)
    market.keywords[0].segment = "other"
    with pytest.raises(ValueError):
        calculate(market, Scenario())


def test_brand_exclusions_missing(market):
    market.keywords[0].brand = True
    assert qualify(market)["qualified"] == 0
    market.keywords[0].brand = False
    market.keywords[0].status = "excluded"
    assert qualify(market)["qualified"] == 0
    market.keywords[0].volume = None
    assert qualify(market)["missing_groups"] == 1


def test_bounds_snapshot(market):
    with pytest.raises(ValueError):
        Rates(close_rate=1.1)
    with pytest.raises(ValueError):
        Rates(annual_ticket=float("nan"))
    with pytest.raises(ValueError):
        Scenario(seasonality=[2] * 12)
    a = calculate(market, Scenario())
    assert a["calculation_id"] == calculate(market, Scenario())["calculation_id"]
    market.keywords[0].volume = 2000
    assert calculate(market, Scenario())["calculation_id"] != a["calculation_id"]


def test_capacity(market):
    r = calculate(market, Scenario(rates=[Rates(monthly_capacity=0.1)]))
    assert r["steady_clients_year"] == pytest.approx(1.2)
    assert max(t["new_clients"] for t in r["timeline"]) <= 0.1


def test_rank_outside_curve(market):
    s = dict(
        keyword="industrial boxes",
        geography="ES",
        device="desktop",
        captured_at="2026-09-15T12:00:00Z",
        source="fixture",
        items=[
            dict(position=15, url="https://rival.com", title="Rival", kind="direct")
        ],
    )
    assert (
        competitor_summary(market, [s], "https://example.com")["rows"][0][
            "estimated_clicks"
        ]
        is None
    )


def test_margin_and_no_double_count(market):
    r = calculate(
        market,
        Scenario(
            horizon_months=12,
            setup_cost=1000,
            monthly_cost=100,
            rates=[Rates(annual_retention=1, margin=0.4)],
        ),
    )
    assert r["horizon_revenue"] == pytest.approx(r["first_year_revenue"])
    assert r["net_contribution"] == pytest.approx(113400 * 0.4 - 2200)
    assert r["roi"] == pytest.approx((113400 * 0.4 - 2200) / 2200)
