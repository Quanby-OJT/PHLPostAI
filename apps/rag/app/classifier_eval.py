"""Classifier accuracy check (CNV-2 AC4).

Runs the labelled test set through the same classifier the chat uses and
reports accuracy overall and per category. Fails below the agreed floor.

CLI (invoked by CI): `python -m app.classifier_eval [--floor 0.85] [--data PATH]`
  exit 0 — accuracy at or above the floor
  exit 1 — accuracy below the floor
  exit 2 — cannot run (no OPENAI_API_KEY in the env or .env, or the set is too small)
"""

import json
import os
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.classification import DEFAULT_CATEGORIES, ChatClient, classify_text

DEFAULT_DATA = (
    Path(__file__).resolve().parent.parent / "tests" / "data" / "classifier_test_set.json"
)
DEFAULT_FLOOR = 0.85
MIN_EXAMPLES = 100


@dataclass
class Report:
    total: int = 0
    correct: int = 0
    fallbacks: int = 0
    per_category: dict[str, dict[str, int]] = field(default_factory=dict)
    mistakes: list[dict[str, str]] = field(default_factory=list)

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0

    def as_dict(self, floor: float) -> dict[str, Any]:
        return {
            "accuracy": round(self.accuracy, 4),
            "floor": floor,
            "passed": self.accuracy >= floor,
            "total": self.total,
            "correct": self.correct,
            "fallbacks": self.fallbacks,
            "perCategory": {
                code: {**counts, "accuracy": round(counts["correct"] / counts["total"], 4)}
                for code, counts in sorted(self.per_category.items())
            },
            "mistakes": self.mistakes,
        }


def load_examples(path: Path) -> list[dict[str, str]]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    return [{"text": str(row["text"]), "category": str(row["category"])} for row in rows]


async def evaluate(client: ChatClient, examples: list[dict[str, str]]) -> Report:
    report = Report()
    categories = list(DEFAULT_CATEGORIES)
    for example in examples:
        result = await classify_text(client, example["text"], categories)
        expected = example["category"]
        counts = report.per_category.setdefault(expected, Counter({"total": 0, "correct": 0}))
        counts["total"] += 1
        report.total += 1
        report.fallbacks += int(result.fallback_used)
        if result.category == expected:
            counts["correct"] += 1
            report.correct += 1
        else:
            report.mistakes.append(
                {"text": example["text"], "expected": expected, "got": result.category}
            )
    report.per_category = {code: dict(counts) for code, counts in report.per_category.items()}
    return report


async def _main() -> int:
    import argparse

    from pydantic import ValidationError

    from app.config import Settings
    from app.providers import OpenAIChatClient

    parser = argparse.ArgumentParser(description="CNV-2 classifier accuracy check (AC4)")
    parser.add_argument(
        "--floor",
        type=float,
        default=float(os.environ.get("CLASSIFIER_ACCURACY_FLOOR", DEFAULT_FLOOR)),
    )
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    args = parser.parse_args()

    examples = load_examples(args.data)
    if len(examples) < MIN_EXAMPLES:
        print(json.dumps({"error": f"need at least {MIN_EXAMPLES} examples, got {len(examples)}"}))
        return 2

    # The classifier only needs the model settings; the rest are unused here.
    for name, placeholder in (
        ("DATABASE_URL", "postgresql://unused"),
        ("REDIS_URL", "redis://unused"),
        ("RAG_SERVICE_TOKEN_SECRET", "unused"),
    ):
        os.environ.setdefault(name, placeholder)
    try:
        settings = Settings()
    except ValidationError:
        print(json.dumps({"error": "OPENAI_API_KEY is not set"}))
        return 2
    client = OpenAIChatClient(settings)

    report = await evaluate(client, examples)
    print(json.dumps(report.as_dict(args.floor), ensure_ascii=False, indent=2))
    return 0 if report.accuracy >= args.floor else 1


if __name__ == "__main__":
    import asyncio

    raise SystemExit(asyncio.run(_main()))

