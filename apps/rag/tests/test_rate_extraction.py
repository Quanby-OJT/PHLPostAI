"""KB-2: reading service, zone, and weight from a rates question (fake model)."""

from typing import Any

import httpx
import pytest

from app.generation import get_classifier_client
from app.main import create_app
from app.rate_extraction import RateService, extract_rate_query, parse_weight_g
from tests.test_ingest import make_token


class FakeClient:
    def __init__(self, reply: str | Exception) -> None:
        self.reply = reply
        self.messages: list[dict[str, str]] = []

    async def complete(self, messages: list[dict[str, str]]) -> tuple[str, dict[str, int] | None]:
        self.messages = messages
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply, None


SERVICES = [RateService("express-mail", "Express Mail"), RateService("registered-mail")]
ZONES = ["Metro Manila", "Visayas"]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("2 kg box", 2000),
        ("1.5 kilos", 1500),
        ("500g letter", 500),
        ("about 250 grams", 250),
        ("2,5 kg", 2500),
        ("how much to Cebu", None),
    ],
)
def test_parse_weight_g(text: str, expected: int | None) -> None:
    assert parse_weight_g(text) == expected


async def test_reads_service_zone_and_weight_within_the_published_choices() -> None:
    client = FakeClient('{"service": "express-mail", "zone": "visayas", "weight_g": 2000}')

    query = await extract_rate_query(client, "Express Mail to Cebu, 2 kg?", SERVICES, ZONES)

    assert (query.service_code, query.zone, query.weight_g) == ("express-mail", "Visayas", 2000)
    assert query.fallback_used is False
    prompt = client.messages[0]["content"]
    assert '"express-mail": Express Mail' in prompt
    assert '- "Visayas"' in prompt


async def test_drops_a_service_or_zone_that_is_not_published() -> None:
    client = FakeClient('{"service": "courier-x", "zone": "Mars", "weight_g": 2000}')

    query = await extract_rate_query(client, "Courier X to Mars, 2 kg", SERVICES, ZONES)

    assert (query.service_code, query.zone, query.weight_g) == (None, None, 2000)


async def test_uses_the_weight_written_in_the_text_when_the_model_misses_it() -> None:
    client = FakeClient('{"service": "express-mail", "zone": "Visayas", "weight_g": null}')

    query = await extract_rate_query(client, "Express Mail to Cebu, 1.5 kg", SERVICES, ZONES)

    assert query.weight_g == 1500


async def test_rejects_an_impossible_weight() -> None:
    client = FakeClient('{"service": "express-mail", "zone": "Visayas", "weight_g": -5}')

    query = await extract_rate_query(client, "Express Mail to Visayas", SERVICES, ZONES)

    assert query.weight_g is None


async def test_falls_back_on_the_text_when_the_model_fails() -> None:
    query = await extract_rate_query(
        FakeClient(RuntimeError("provider down")), "Parcel to Visayas, 3 kg", SERVICES, ZONES
    )

    assert (query.service_code, query.zone, query.weight_g) == (None, "Visayas", 3000)
    assert query.fallback_used is True


async def test_route_requires_the_service_token_and_returns_the_fields(settings: Any) -> None:
    app = create_app(settings)
    app.dependency_overrides[get_classifier_client] = lambda: FakeClient(
        '{"service": "express-mail", "zone": "Visayas", "weight_g": 2000}'
    )
    body = {
        "text": "Express Mail to Cebu, 2 kg?",
        "services": [{"code": "express-mail", "name": "Express Mail"}],
        "zones": ZONES,
    }
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://rag") as client:
        denied = await client.post("/internal/rates/extract", json=body)
        response = await client.post(
            "/internal/rates/extract",
            json=body,
            headers={"authorization": f"Bearer {make_token(actor_type='customer')}"},
        )

    assert denied.status_code == 401
    assert response.status_code == 200
    assert response.json() == {
        "serviceCode": "express-mail",
        "zone": "Visayas",
        "weightG": 2000,
        "fallbackUsed": False,
    }
