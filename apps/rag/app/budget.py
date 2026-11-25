"""Hard per-request context token budget (Flow B step 5, GN-2).

Rank-then-select is contractual (§5.3): candidates arrive ALREADY ranked
(RT-2 fused order), and chunks are added whole, in rank order, until the next
chunk would push the running total past the budget — never truncated
mid-chunk, never exceeding the budget. Selection stops at the first overflow
so the budget is always spent on the best-ranked evidence.

The budget itself is read per request (environment override first, settings
default second) so a deployment-level change applies on the next request —
no restart required (ticket AC).

Token counts use tiktoken's o200k_base encoding (the GPT-4o family). An
unknown/failed encoding falls back to a conservative chars/4 estimate rather
than failing the request.
"""

import logging
import os
import re
from typing import Any

from app.config import Settings

logger = logging.getLogger(__name__)

CONTEXT_TOKEN_BUDGET_ENV = "CONTEXT_TOKEN_BUDGET"

_encoder: Any | None = None


def _encoding() -> Any | None:
    global _encoder
    if _encoder is None:
        try:
            import tiktoken

            _encoder = tiktoken.get_encoding("o200k_base")
        except Exception as exc:  # missing data files, etc.
            logger.warning("tiktoken unavailable (%s); falling back to chars/4", exc)
            _encoder = False
    return _encoder or None


def count_tokens(text: str) -> int:
    encoder = _encoding()
    if encoder is None:
        return max(1, len(text) // 4)
    return len(encoder.encode(text))


def _ends_with_complete_sentence(text: str) -> bool:
    without_citations = re.sub(r"(?:\s*\[\d+\])+$", "", text.strip()).rstrip()
    return bool(re.search(r"[.!?。！？][\"'”’)]*$", without_citations))


def limit_routine_answer(text: str, max_tokens: int, language: str = "en") -> tuple[str, bool]:
    """Cap customer-visible output on a token boundary and retain whole sentences.

    If content is omitted, append a localized invitation to request more detail
    whenever that notice and at least one full sentence fit the configured cap.
    """
    normalized = text.strip()
    if count_tokens(normalized) <= max_tokens and _ends_with_complete_sentence(normalized):
        return normalized, False

    encoder = _encoding()
    notices = {
        "en": " More details are available if you need them.",
        "fil": " Maaari akong magbigay ng dagdag na detalye kung kailangan mo.",
        "ceb": " Makahatag ko og dugang nga detalye kung kinahanglan nimo.",
        "ilo": " Mabalinak nga mangted iti ad-adu a detalye no kasapulam.",
    }
    notice = notices.get(language, notices["en"])
    shortened_notice = {
        "en": "The answer was shortened. I can give more details if needed.",
        "fil": "Naputol ang sagot. Maaari akong magbigay ng dagdag na detalye kung kailangan.",
        "ceb": "Napamubo ang tubag. Makahatag ko og dugang detalye kon kinahanglan.",
        "ilo": "Pinabassit ti sungbat. Mabalinak nga mangted iti ad-adu a detalye no kasapulam.",
    }.get(language, "The answer was shortened. I can give more details if needed.")
    fallback = {
        "en": "Please ask a person for help.",
        "fil": "Humingi ng tulong sa tao.",
        "ceb": "Pangayo og tabang sa tawo.",
        "ilo": "Agkiddaw iti tulong ti tao.",
    }.get(language, "Please ask a person for help.")

    if encoder is None:
        clipped = normalized[: max_tokens * 4]
        sentence_matches = list(re.finditer(r"[^.!?。！？]*[.!?。！？]+(?:[\"'”’)]*)", clipped))
        base = clipped[: sentence_matches[-1].end()].strip() if sentence_matches else fallback
        candidate = f"{base}{notice}"
        if count_tokens(candidate) <= max_tokens:
            return candidate, True
        if count_tokens(base) <= max_tokens:
            return base, True
        return (shortened_notice if count_tokens(shortened_notice) <= max_tokens else fallback), True

    tokens = encoder.encode(normalized)
    notice_tokens = encoder.encode(notice)
    available = max_tokens - len(notice_tokens)
    if available > 0:
        clipped = encoder.decode(tokens[:available])
        sentence_matches = list(re.finditer(r"[^.!?。！？]*[.!?。！？]+(?:[\"'”’)]*)", clipped))
        if sentence_matches:
            base = clipped[: sentence_matches[-1].end()].strip()
            candidate = f"{base}{notice}"
            if len(encoder.encode(candidate)) <= max_tokens:
                return candidate, True

    clipped = encoder.decode(tokens[:max_tokens])
    sentence_matches = list(re.finditer(r"[^.!?。！？]*[.!?。！？]+(?:[\"'”’)]*)", clipped))
    if sentence_matches:
        return clipped[: sentence_matches[-1].end()].strip(), True
    return (shortened_notice if len(encoder.encode(shortened_notice)) <= max_tokens else fallback), True


def current_context_budget(settings: Settings) -> int:
    """Per-request budget resolution: env override -> settings default.

    Reading the environment on every request is what makes a budget change
    apply to the NEXT request without a restart."""
    raw = os.environ.get(CONTEXT_TOKEN_BUDGET_ENV)
    if raw is not None:
        try:
            value = int(raw)
            if value >= 1:
                return value
        except ValueError:
            pass
        logger.warning("Ignoring invalid %s=%r", CONTEXT_TOKEN_BUDGET_ENV, raw)
    return settings.context_token_budget


def select_within_budget(
    chunks: list[dict[str, Any]], *, budget: int
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Rank-order selection up to the hard budget.

    Returns (used chunks, selection record). Selection stops at the FIRST
    chunk that would exceed the budget (rank order is the priority order —
    a later smaller chunk never jumps the queue). A first-ranked chunk larger
    than the entire budget selects nothing (the caller answers grounded
    "I don't know" rather than blowing the cap)."""
    used: list[dict[str, Any]] = []
    total = 0
    for chunk in chunks:
        tokens = count_tokens(chunk["content"])
        if total + tokens > budget:
            break
        used.append({**chunk, "context_tokens": tokens})
        total += tokens
    record = {
        "budget": budget,
        "contextTokens": total,
        "retrievedCount": len(chunks),
        "usedCount": len(used),
    }
    return used, record
