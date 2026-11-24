"""CNV-4: the reply language and postal glossary for one customer turn."""

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


@dataclass(frozen=True)
class LanguageContext:
    reply: str = "en"
    query: str | None = None
    glossary: tuple[str, ...] = field(default=DEFAULT_GLOSSARY)

    @classmethod
    def build(
        cls,
        reply: str | None,
        query: str | None = None,
        glossary: list[str] | None = None,
    ) -> LanguageContext:
        code = reply if reply in REPLY_LANGUAGES else "en"
        terms = tuple(term.strip() for term in glossary or () if term.strip())
        return cls(reply=code, query=query, glossary=terms or DEFAULT_GLOSSARY)

    @property
    def needs_translation(self) -> bool:
        return (self.query or self.reply) != "en"

    def glossary_text(self) -> str:
        return ", ".join(self.glossary)

    def instruction(self) -> str:
        if self.reply == "en":
            return ""
        return (
            f" Write the answer in {_LANGUAGE_LABELS[self.reply]}, even though the "
            "context blocks are in English. Keep these PHLPost terms exactly as "
            f"written, without translating them: {self.glossary_text()}."
        )

    def cache_scope(self, filters: dict[str, Any] | None) -> dict[str, Any] | None:
        if self.reply == "en":
            return filters
        return {**(filters or {}), "replyLanguage": self.reply}


ENGLISH = LanguageContext()
