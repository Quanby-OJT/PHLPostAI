"""CNV-2 AC4: the labelled test set and the accuracy check (offline, fake model)."""

import json
from collections import Counter

from app.classification import DEFAULT_CATEGORIES
from app.classifier_eval import DEFAULT_DATA, MIN_EXAMPLES, evaluate, load_examples


class ScriptedClient:
    """Answers with the expected label for every message except the listed ones."""

    def __init__(self, labels: dict[str, str], wrong: set[str] | None = None) -> None:
        self.labels = labels
        self.wrong = wrong or set()

    async def complete(self, messages: list[dict[str, str]]) -> tuple[str, dict[str, int] | None]:
        text = messages[1]["content"]
        category = "other" if text in self.wrong else self.labels[text]
        return json.dumps({"category": category, "language": "en"}), None


def test_the_test_set_has_enough_examples_across_every_seeded_category() -> None:
    examples = load_examples(DEFAULT_DATA)
    counts = Counter(example["category"] for example in examples)

    assert len(examples) >= MIN_EXAMPLES
    assert set(counts) == {category.code for category in DEFAULT_CATEGORIES}
    assert min(counts.values()) >= 10
    assert len({example["text"] for example in examples}) == len(examples)


async def test_reports_overall_and_per_category_accuracy() -> None:
    examples = [
        {"text": "where is RR123456789PH", "category": "tracking"},
        {"text": "how much is postage", "category": "rates"},
        {"text": "my parcel was lost", "category": "complaint"},
        {"text": "hello", "category": "other"},
    ]
    labels = {example["text"]: example["category"] for example in examples}
    client = ScriptedClient(labels, wrong={"my parcel was lost"})

    report = await evaluate(client, examples)
    result = report.as_dict(floor=0.85)

    assert result["accuracy"] == 0.75
    assert result["passed"] is False
    assert result["perCategory"]["complaint"] == {"total": 1, "correct": 0, "accuracy": 0.0}
    assert result["mistakes"] == [
        {"text": "my parcel was lost", "expected": "complaint", "got": "other"}
    ]


async def test_passes_at_or_above_the_floor() -> None:
    examples = load_examples(DEFAULT_DATA)
    labels = {example["text"]: example["category"] for example in examples}

    report = await evaluate(ScriptedClient(labels), examples)

    assert report.as_dict(floor=0.85)["passed"] is True
    assert report.accuracy == 1.0


async def test_counts_model_failures_as_fallbacks() -> None:
    class BrokenClient:
        async def complete(self, messages: list[dict[str, str]]) -> tuple[str, None]:
            raise RuntimeError("provider down")

    report = await evaluate(BrokenClient(), [{"text": "hello", "category": "other"}])

    assert report.fallbacks == 1
