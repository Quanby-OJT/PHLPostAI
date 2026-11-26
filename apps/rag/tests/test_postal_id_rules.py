"""CNV-6: Postal ID reply rules and ID-number masking."""

import pytest
from pydantic import ValidationError

from app.generation import ChatRequest, build_grounded_prompt
from app.reply_language import ENGLISH, LanguageContext
from app.security_screen import mask_pii


@pytest.mark.parametrize(
    ("text", "masked"),
    [
        (
            "My Postal ID number is 1234-5678-9012P, am I approved?",
            "My Postal ID number is [ID_NUMBER], am I approved?",
        ),
        ("PRN: 100141234567P status?", "PRN: [ID_NUMBER] status?"),
        ("My postal ID no. 0012345678", "My postal ID no. [ID_NUMBER]"),
    ],
)
def test_postal_id_numbers_are_masked(text, masked):
    assert mask_pii(text)[0] == masked


@pytest.mark.parametrize(
    "text",
    [
        "What are the postal id requirements?",
        "Track RR123456789PH",
        "Postal ID renewal 2026",
        "The fee is 504 pesos",
        "Track 1234567890123",
    ],
)
def test_ordinary_questions_are_left_alone(text):
    assert mask_pii(text) == (text, [])


def test_a_phone_number_is_still_a_phone():
    assert mask_pii("call me 09171234567")[0] == "call me [PHONE]"


def test_postal_id_rules_join_the_prompt_in_any_language():
    for reply in ("en", "ceb"):
        context = LanguageContext.build(reply, None, None, "postal-id")
        [system, _human] = build_grounded_prompt(context).format_messages(
            context="[1]\nx", question="q"
        )
        assert "Postal ID question" in system.content
        assert "Never say or imply that this customer is eligible" in system.content


def test_without_rules_the_prompt_is_unchanged():
    [system, _human] = build_grounded_prompt(ENGLISH).format_messages(
        context="[1]\nx", question="q"
    )
    assert "Postal ID question" not in system.content


def test_unknown_rules_are_ignored():
    assert LanguageContext.build("en", None, None, "other").rules is None


def test_cached_answers_are_kept_per_rule_set():
    assert LanguageContext.build("en", None, None, "postal-id").cache_scope(None) == {
        "replyRules": "postal-id"
    }
    assert LanguageContext.build("fil", None, None, "postal-id").cache_scope({"a": 1}) == {
        "a": 1,
        "replyLanguage": "fil",
        "replyRules": "postal-id",
    }


def test_chat_request_carries_the_rules():
    request = ChatRequest.model_validate({"query": "q", "replyRules": "postal-id"})
    assert request.language_context().rules == "postal-id"


def test_chat_request_rejects_unknown_rules():
    with pytest.raises(ValidationError):
        ChatRequest.model_validate({"query": "q", "replyRules": "anything"})


def test_postal_id_searches_are_pointed_at_postal_id_articles():
    context = LanguageContext.build("en", None, None, "postal-id")
    assert context.with_retrieval_hint("Am I eligible?") == (
        "Am I eligible? (Postal ID application requirements)"
    )
    assert ENGLISH.with_retrieval_hint("Am I eligible?") == "Am I eligible?"


async def test_the_hint_reaches_retrieval_but_not_the_prompt(settings):
    from tests.test_generation import PRINCIPAL, make_chunk, make_service

    service, retrieval, client, _ = make_service(settings, chunks=[make_chunk("Bring one ID.")])

    await service.answer(
        query="Am I eligible?",
        k=None,
        principal=PRINCIPAL,
        language=LanguageContext.build("en", "en", None, "postal-id"),
    )

    assert retrieval.calls[0]["query"] == "Am I eligible? (Postal ID application requirements)"
    assert "Question: Am I eligible?" in client.calls[0][-1]["content"]
