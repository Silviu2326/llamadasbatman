from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlsplit, urlunsplit
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def now():
    return datetime.now(timezone.utc).isoformat()


def normalize_url(value: str) -> str:
    value = value.strip()
    if "://" not in value:
        value = "https://" + value
    p = urlsplit(value)
    if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password:
        raise ValueError("Introduce una URL HTTP/HTTPS sin credenciales.")
    if p.port not in (None, 80, 443):
        raise ValueError("Solo se admiten puertos web 80 y 443.")
    host = p.hostname.encode("idna").decode().lower().rstrip(".")
    if ":" in host:
        host = "[" + host + "]"
    port = (
        f":{p.port}"
        if p.port
        and not (
            (p.scheme == "https" and p.port == 443)
            or (p.scheme == "http" and p.port == 80)
        )
        else ""
    )
    return urlunsplit((p.scheme, host + port, p.path or "/", p.query, ""))


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class LeadInput(Strict):
    name: str = Field(min_length=1, max_length=180)
    url: str = Field(max_length=2048)
    sector: str = Field(default="", max_length=180)
    country: str = Field(default="ES", min_length=2, max_length=2)
    language: str = Field(default="es", min_length=2, max_length=5)
    business_model: Literal["b2b", "b2c", "mixed"] = "b2b"
    services: list[str] = Field(default_factory=list, max_length=30)
    exclusions: list[str] = Field(default_factory=list, max_length=40)
    minimum_order: str = Field(default="", max_length=300)
    notes: str = Field(default="", max_length=4000)
    expected_indexable: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("url")
    @classmethod
    def url_valid(cls, v):
        return normalize_url(v)

    @field_validator("expected_indexable")
    @classmethod
    def intended(cls, values):
        return [normalize_url(v) for v in values]


class AuditInput(Strict):
    profile: Literal["lite", "standard", "extended"] = "lite"
    render: bool = False
    performance: bool = False
    external_links: bool = False


class Keyword(Strict):
    keyword: str = Field(min_length=1, max_length=200)
    group_id: str = Field(min_length=1, max_length=180)
    segment: str = Field(default="principal", max_length=100)
    volume: float | None = Field(default=None, ge=0, le=100000000)
    status: Literal["included", "excluded", "ambiguous"] = "ambiguous"
    fit_weight: float = Field(default=0, ge=0, le=1)
    reason: str = Field(default="", max_length=1000)
    source: str = Field(min_length=1, max_length=300)
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    geography: str = Field(default="ES", max_length=100)
    brand: bool = False

    @model_validator(mode="after")
    def classification(self):
        if self.status in ("included", "excluded") and not self.reason.strip():
            raise ValueError("Justifica la inclusión o exclusión.")
        return self


class MarketInput(Strict):
    keywords: list[Keyword] = Field(max_length=2000)
    overlap_reviewed: bool = False


class SerpItem(Strict):
    position: int = Field(ge=1, le=100)
    url: str = Field(max_length=2048)
    title: str = Field(default="", max_length=400)
    kind: Literal["direct", "marketplace", "directory", "media", "unknown"] = "unknown"

    @field_validator("url")
    @classmethod
    def url_valid(cls, v):
        return normalize_url(v)


class Serp(Strict):
    keyword: str = Field(min_length=1, max_length=200)
    geography: str = Field(min_length=1, max_length=100)
    language: str = "es"
    device: Literal["desktop", "mobile"] = "desktop"
    captured_at: datetime
    source: str = Field(min_length=1, max_length=300)
    items: list[SerpItem] = Field(max_length=100)


class Rates(Strict):
    segment: str = "principal"
    current_ctr: float | None = Field(default=None, ge=0, le=1)
    target_ctr: float = Field(default=0.12, ge=0, le=1)
    click_to_session: float = Field(default=1, ge=0, le=2)
    contact_rate: float = Field(default=0.02, ge=0, le=1)
    quote_rate: float = Field(default=0.5, ge=0, le=1)
    close_rate: float = Field(default=0.2, ge=0, le=1)
    annual_ticket: float = Field(default=35000, ge=0, le=100000000)
    margin: float | None = Field(default=None, ge=0, le=1)
    annual_retention: float = Field(default=0.85, ge=0, le=1)
    monthly_capacity: float | None = Field(default=None, ge=0, le=100000)
    source: str = Field(
        default="Supuestos pendientes de validar con el negocio",
        min_length=1,
        max_length=1000,
    )


class Scenario(Strict):
    name: str = Field(default="Base", min_length=1, max_length=100)
    currency: Literal["EUR", "USD", "GBP"] = "EUR"
    rates: list[Rates] = Field(
        default_factory=lambda: [Rates()], min_length=1, max_length=30
    )
    start_delay_months: int = Field(default=0, ge=0, le=24)
    ramp_months: int = Field(default=0, ge=0, le=24)
    sales_delay_months: int = Field(default=0, ge=0, le=24)
    horizon_months: int = Field(default=60, ge=12, le=120)
    monthly_cost: float = Field(default=0, ge=0, le=10000000)
    setup_cost: float = Field(default=0, ge=0, le=10000000)
    onboarding_cost: float = Field(default=0, ge=0, le=10000000)
    annual_discount: float = Field(default=0, ge=0, le=1)
    seasonality: list[float] = Field(
        default_factory=lambda: [1.0] * 12, min_length=12, max_length=12
    )

    @field_validator("seasonality")
    @classmethod
    def season(cls, v):
        if any(not 0 <= a <= 10 for a in v) or abs(sum(v) - 12) > 0.001:
            raise ValueError(
                "Los 12 factores estacionales deben ser no negativos y sumar 12."
            )
        return v

    @model_validator(mode="after")
    def unique_segments(self):
        if len({r.segment for r in self.rates}) != len(self.rates):
            raise ValueError("No repitas segmentos en un escenario.")
        return self


class ProviderRequest(Strict):
    keywords: list[str] = Field(min_length=1, max_length=30)
    location_code: int = 2724
    language_code: str = "es"
    geography: str = "ES"
    device: Literal["desktop", "mobile"] = "desktop"


class AIAction(Strict):
    title: str = Field(max_length=160)
    explanation: str = Field(max_length=1500)
    evidence_ids: list[str] = Field(min_length=1, max_length=10)
    priority: Literal["P1", "P2", "P3"]
    acceptance: str = Field(max_length=500)


class AIOutput(Strict):
    summary: str = Field(max_length=3000)
    actions: list[AIAction] = Field(max_length=8)
    limitations: list[str] = Field(max_length=20)
    calculation_ids: list[str] = Field(max_length=20)


class FieldMetrics(Strict):
    source: str = Field(min_length=1, max_length=300)
    at: datetime
    scope: Literal["URL", "origin"]
    device: Literal["mobile", "desktop", "all"]
    period_start: str
    period_end: str
    sufficient_sample: bool
    lcp_field_ms: float | None = Field(default=None, ge=0)
    inp_field_ms: float | None = Field(default=None, ge=0)
    cls_field: float | None = Field(default=None, ge=0)


class SchemaRequirement(Strict):
    type: str
    required_fields: list[str] = Field(min_length=1, max_length=30)
    source_url: str
    verified_at: datetime
    valid_until: datetime


class EntityComparison(Strict):
    url: str
    entity_id: str
    field: Literal["telephone", "price", "streetAddress"]
    structured_value: str
    visible_value: str
    identity_confirmed: bool
    source: str


class LocationContact(Strict):
    url: str
    location_id: str
    kind: Literal["telephone", "email"]
    value: str
    identity_confirmed: bool
    source: str


class ExternalInput(Strict):
    source: str = Field(min_length=1, max_length=300)
    captured_at: datetime
    schema_rules: list[SchemaRequirement] = Field(default_factory=list, max_length=30)
    entity_comparisons: list[EntityComparison] = Field(
        default_factory=list, max_length=100
    )
    location_contacts: list[LocationContact] = Field(
        default_factory=list, max_length=100
    )
    performance: dict[str, FieldMetrics] = Field(default_factory=dict, max_length=80)
    search_console: list[dict] = Field(default_factory=list, max_length=1000)
    indexation: list[dict] = Field(default_factory=list, max_length=100)
    backlinks: list[dict] = Field(default_factory=list, max_length=1000)
    local: list[dict] = Field(default_factory=list, max_length=100)


class FitProposal(Strict):
    group_id: str
    status: Literal["included", "excluded", "ambiguous"]
    reason: str = Field(min_length=1, max_length=1000)
    business_evidence: str = Field(min_length=1, max_length=1000)


class FitOutput(Strict):
    proposals: list[FitProposal] = Field(max_length=200)
