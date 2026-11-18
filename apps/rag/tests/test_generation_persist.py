"""CNV-1: answering WITHOUT persisting, and returning the screened question.

The public chat path (backend `ConversationService`) owns its own
conversations/messages rows — a customer has no `users` row for this service
to key a turn to — so it asks for `persist=False`. The authenticated staff
path must be completely unaffected, which is what these tests pin down.
"""

import json
from typing import Any

import pytest

from app.security import ServicePrincipal
from tests.test_generation import (
    FakeChatClient,
    make_chunk,
    make_service,
)

pytestmark = pytest.mark.anyio

CUSTOMER = ServicePrincipal(
    sub="customer-session:11111111-1111-4111-8111-111111111111",
    permissions=("chat.query.submit", "corpus.read"),
    actor_type="customer",
    request_id="req-1",
    trace_id="trace-1",
)


def _final_payload(frames: list[str]) -> dict[str, Any]:
    """The `final` SSE frame's JSON payload."""
    final = next(frame for frame in frames if frame.startswith("event: final"))
    data = next(line[len("data: ") :] for line in final.splitlines() if line.startswith("data: "))
    return json.loads(data)


async def test_persist_false_skips_the_conversation_and_message_write(settings):
    chunks = [make_chunk("Express Mail to Metro Manila is 165 pesos.")]
    client = FakeChatClient(answer="It is 165 pesos [1].")
    service, _, _, repository = make_service(settings, chunks=chunks, chat_client=client)

    result = await service.answer(
        query="how much is express mail?", k=None, principal=CUSTOMER, persist=False
    )

    assert repository.turns == []
    assert result["answer"] == client.answer
    assert result["conversationId"] is None
    assert result["messageId"] is None


async def test_persist_false_still_audits_the_turn(settings):
    chunks = [make_chunk("Express Mail to Metro Manila is 165 pesos.")]
    service, _, _, repository = make_service(settings, chunks=chunks)

    await service.answer(query="how much?", k=None, principal=CUSTOMER, persist=False)

    # The RAG-action entry is the record that a model was called on a
    # customer's behalf; it must survive the caller owning persistence.
    assert len(repository.audits) == 1
    assert repository.audits[0]["actor_type"] == "customer"


async def test_the_staff_path_still_persists_by_default(settings):
    chunks = [make_chunk("Employees get 20 vacation days per year.")]
    client = FakeChatClient(answer="You get 20 days [1].")
    service, _, _, repository = make_service(settings, chunks=chunks, chat_client=client)

    result = await service.answer(query="vacation?", k=None, principal=CUSTOMER)

    assert len(repository.turns) == 1
    assert result["conversationId"] == repository.conversation_id
    assert result["messageId"] == repository.message_id


async def test_the_answer_reports_the_screened_question(settings):
    """AC3: the caller stores the masked form without re-implementing the screen."""
    chunks = [make_chunk("Express Mail to Metro Manila is 165 pesos.")]
    service, _, _, _ = make_service(settings, chunks=chunks)

    result = await service.answer(
        query="my number is 0917 123 4567, how much is express mail?",
        k=None,
        principal=CUSTOMER,
        persist=False,
    )

    assert "0917 123 4567" not in result["screenedQuery"]
    assert "[PHONE]" in result["screenedQuery"]


async def test_the_screened_question_matches_what_would_be_stored(settings):
    chunks = [make_chunk("Express Mail to Metro Manila is 165 pesos.")]
    service, _, _, repository = make_service(settings, chunks=chunks)

    result = await service.answer(
        query="reach me at test@example.com please", k=None, principal=CUSTOMER
    )

    # With persistence on, the reported screened query is exactly the text the
    # service itself wrote — so a caller that persists instead stores the same.
    assert result["screenedQuery"] == repository.turns[0]["query"]
    assert "test@example.com" not in result["screenedQuery"]


async def test_an_empty_corpus_still_reports_the_screened_question(settings):
    service, _, _, _ = make_service(settings, chunks=[])

    result = await service.answer(
        query="who won the election?", k=None, principal=CUSTOMER, persist=False
    )

    assert result["isIDontKnow"] is True
    assert result["screenedQuery"] == "who won the election?"
    assert result["citations"] == []


async def test_streamed_turn_can_skip_persistence_and_reports_the_screen(settings):
    chunks = [make_chunk("Express Mail to Metro Manila is 165 pesos.")]
    client = FakeChatClient(answer="It is 165 pesos [1].")
    service, _, _, repository = make_service(settings, chunks=chunks, chat_client=client)

    frames: list[str] = []
    async for frame in service.answer_stream(
        query="how much is express mail?", k=None, principal=CUSTOMER, persist=False
    ):
        frames.append(frame)

    final = _final_payload(frames)
    assert repository.turns == []
    assert final["screenedQuery"] == "how much is express mail?"
    assert final["conversationId"] is None
    assert final["messageId"] is None


async def test_streamed_staff_turn_still_persists(settings):
    chunks = [make_chunk("Employees get 20 vacation days per year.")]
    client = FakeChatClient(answer="You get 20 days [1].")
    service, _, _, repository = make_service(settings, chunks=chunks, chat_client=client)

    async for _ in service.answer_stream(query="vacation?", k=None, principal=CUSTOMER):
        pass

    assert len(repository.turns) == 1


async def test_persisted_turns_record_the_masked_query_only(settings):
    """The pre-existing SC-1 guarantee, re-asserted at the CNV-1 boundary."""
    chunks = [make_chunk("Express Mail to Metro Manila is 165 pesos.")]
    service, _, _, repository = make_service(settings, chunks=chunks)

    await service.answer(
        query="my TIN is 123-456-789 and my email is a@b.co", k=None, principal=CUSTOMER
    )

    stored: dict[str, Any] = repository.turns[0]
    assert "123-456-789" not in stored["query"]
    assert "a@b.co" not in stored["query"]
