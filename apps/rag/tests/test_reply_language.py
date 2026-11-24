"""CNV-4: reply language, query translation for retrieval, glossary, cache scope."""

from typing import Any

import pytest
from pydantic import ValidationError

from app.generation import ChatRequest, build_grounded_prompt
from app.reply_language import DEFAULT_GLOSSARY, ENGLISH, LanguageContext
from tests.test_generation import (
    PRINCIPAL,
    FakeChatClient,
    make_chunk,
    make_service,
)


class ScriptedChatClient(FakeChatClient):
    """Answers each call from a script, so translation and generation differ."""

    def __init__(self, *answers: str, fail_first: bool = False) -> None:
        super().__init__(answers[-1])
        self.script = list(answers)
        self.fail_first = fail_first

    async def complete(self, messages: list[dict[str, str]]) -> tuple[str, dict[str, int] | None]:
        self.calls.append(messages)
        if self.fail_first and len(self.calls) == 1:
            raise RuntimeError("provider down")
        answer = self.script.pop(0) if len(self.script) > 1 else self.script[0]
        return answer, {"promptTokens": 10, "completionTokens": 5, "totalTokens": 15}


def system_of(messages: list[dict[str, str]]) -> str:
    return next(m["content"] for m in messages if m["role"] == "system")


def test_build_falls_back_to_english_and_the_default_glossary():
    context = LanguageContext.build("ja", None, None)
    assert context.reply == "en"
    assert context.glossary == DEFAULT_GLOSSARY


def test_build_keeps_the_seeded_glossary():
    context = LanguageContext.build("ceb", "ceb", ["PHLPost", " Postal ID ", ""])
    assert context.glossary == ("PHLPost", "Postal ID")


@pytest.mark.parametrize(
    ("reply", "query", "expected"),
    [
        ("en", None, False),
        ("en", "en", False),
        ("fil", "en", False),
        ("fil", None, True),
        ("ceb", "ceb", True),
        ("en", "unsupported", True),
    ],
)
def test_translation_follows_the_question_language(reply, query, expected):
    assert LanguageContext.build(reply, query).needs_translation is expected


def test_cache_scope_separates_reply_languages():
    filters = {"documentIds": ["d1"]}
    assert ENGLISH.cache_scope(filters) == filters
    assert ENGLISH.cache_scope(None) is None
    assert LanguageContext.build("ilo").cache_scope(filters) == {
        "documentIds": ["d1"],
        "replyLanguage": "ilo",
    }


def test_prompt_names_the_reply_language_and_keeps_glossary_terms():
    context = LanguageContext.build("ceb", None, ["Registered Mail"])
    [system, _human] = build_grounded_prompt(context).format_messages(
        context="[1]\nx", question="q"
    )
    assert "Cebuano" in system.content
    assert "Registered Mail" in system.content
    assert 'reply exactly: "I don\'t know."' in system.content


def test_chat_request_builds_the_language_context():
    request = ChatRequest.model_validate(
        {"query": "q", "language": "ilo", "queryLanguage": "unsupported", "glossary": ["EMS"]}
    )
    context = request.language_context()
    assert (context.reply, context.query, context.glossary) == ("ilo", "unsupported", ("EMS",))


def test_chat_request_rejects_an_unknown_reply_language():
    with pytest.raises(ValidationError):
        ChatRequest.model_validate({"query": "q", "language": "unsupported"})


async def test_english_question_is_retrieved_as_is(settings):
    service, retrieval, client, _ = make_service(settings, chunks=[make_chunk("Alpha.")])

    await service.answer(query="what is alpha?", k=None, principal=PRINCIPAL)

    assert retrieval.calls[0]["query"] == "what is alpha?"
    assert len(client.calls) == 1
    assert "Write the answer in" not in system_of(client.calls[0])


async def test_cebuano_question_is_translated_for_retrieval_and_answered_in_cebuano(settings):
    client = ScriptedChatClient(
        "How much is Registered Mail?", "Ang Registered Mail kay 50 pesos [1]."
    )
    service, retrieval, _, _ = make_service(
        settings, chunks=[make_chunk("Registered Mail costs 50 pesos.")], chat_client=client
    )
    question = "Pila ang Registered Mail?"

    result = await service.answer(
        query=question,
        k=None,
        principal=PRINCIPAL,
        language=LanguageContext.build("ceb", "ceb"),
    )

    translation, generation = client.calls
    assert translation[-1]["content"] == question
    assert "Registered Mail" in system_of(translation)
    assert retrieval.calls[0]["query"] == "How much is Registered Mail?"
    assert "Cebuano" in system_of(generation)
    assert question in generation[-1]["content"]
    assert result["answer"] == "Ang Registered Mail kay 50 pesos [1]."
    assert result["citations"]


async def test_failed_translation_falls_back_to_the_original_question(settings):
    client = ScriptedChatClient("Oo [1].", fail_first=True)
    service, retrieval, _, _ = make_service(
        settings, chunks=[make_chunk("Alpha.")], chat_client=client
    )

    await service.answer(
        query="Ano ang alpha?",
        k=None,
        principal=PRINCIPAL,
        language=LanguageContext.build("fil", "fil"),
    )

    assert retrieval.calls[0]["query"] == "Ano ang alpha?"


class ScriptedStreamingClient(ScriptedChatClient):
    async def stream(self, messages: list[dict[str, str]]) -> Any:
        self.calls.append(messages)
        yield "Ang alpha ay letra [1]."
        yield ("__usage__", {"promptTokens": 10, "completionTokens": 5, "totalTokens": 15})


async def test_stream_uses_the_reply_language(settings):
    client = ScriptedStreamingClient("What is alpha?")
    service, retrieval, _, _ = make_service(
        settings, chunks=[make_chunk("Alpha.")], chat_client=client
    )

    async for _frame in service.answer_stream(
        query="Ano ang alpha?",
        k=None,
        principal=PRINCIPAL,
        language=LanguageContext.build("fil", "fil"),
    ):
        pass

    assert retrieval.calls[0]["query"] == "What is alpha?"
    assert "Filipino" in system_of(client.calls[1])
