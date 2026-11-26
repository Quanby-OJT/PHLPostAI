"""CNV-4: the reply language and postal glossary for one customer turn, plus the
category reply rules (CNV-6) that shape what the answer may say."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

REPLY_LANGUAGES = ("en", "fil", "ceb", "ilo")

_LANGUAGE_LABELS = {
    "en": "English",
    "fil": "Filipino (Tagalog); if the question is Taglish, follow its dominant language",
    "ceb": "Cebuano (Bisaya)",
    "ilo": "Ilocano",
}

DEFAULT_GLOSSARY = (
    "PHLPost",
    "Postal ID",
    "Express Mail Service",
    "EMS",
    "Registered Mail",
    "Ordinary Mail",
    "Parcel Post",
    "Post Office",
    "Tracking Number",
    "Customs Declaration",
)

# CNV-6: Postal ID answers explain the published process; PHLPost decides each case.
REPLY_RULES = {
    "postal-id": (
        " This is a Postal ID question. Give the application or renewal steps and the "
        "documentary requirements exactly as the context blocks state them, as a short "
        "numbered list, and cite them. If the customer asks whether they are eligible or "
        "will be approved, the published requirements are the complete answer: list them "
        "instead of replying that you don't know. Never say or imply that this customer is "
        "eligible, qualifies, meets the requirements, or will be approved or rejected; "
        "staff at the capturing site decide each case. Never claim to see or check an "
        "application or its status."
    ),
}

# Questions like "Am I eligible?" name no topic, so retrieval is pointed at the
# category's articles. Only the search query changes; the model sees the question.
RETRIEVAL_HINTS = {"postal-id": "Postal ID application requirements"}


@dataclass(frozen=True)
class LanguageContext:
    reply: str = "en"
    query: str | None = None
    glossary: tuple[str, ...] = field(default=DEFAULT_GLOSSARY)
    rules: str | None = None

    @classmethod
    def build(
        cls,
        reply: str | None,
        query: str | None = None,
        glossary: list[str] | None = None,
        rules: str | None = None,
    ) -> LanguageContext:
        code = reply if reply in REPLY_LANGUAGES else "en"
        terms = tuple(term.strip() for term in glossary or () if term.strip())
        return cls(
            reply=code,
            query=query,
            glossary=terms or DEFAULT_GLOSSARY,
            rules=rules if rules in REPLY_RULES else None,
        )

    @property
    def needs_translation(self) -> bool:
        return (self.query or self.reply) != "en"

    def glossary_text(self) -> str:
        return ", ".join(self.glossary)

    def with_retrieval_hint(self, retrieval_query: str) -> str:
        hint = RETRIEVAL_HINTS.get(self.rules) if self.rules else None
        return f"{retrieval_query} ({hint})" if hint else retrieval_query

    def instruction(self) -> str:
        rules = REPLY_RULES[self.rules] if self.rules else ""
        if self.reply == "en":
            return rules
        return (
            f" Write the answer in {_LANGUAGE_LABELS[self.reply]}, even though the "
            "context blocks are in English. Keep these PHLPost terms exactly as "
            f"written, without translating them: {self.glossary_text()}." + rules
        )

    def cache_scope(self, filters: dict[str, Any] | None) -> dict[str, Any] | None:
        scope = dict(filters or {})
        if self.reply != "en":
            scope["replyLanguage"] = self.reply
        if self.rules:
            scope["replyRules"] = self.rules
        return scope if scope != (filters or {}) else filters


ENGLISH = LanguageContext()
