import json

import pytest

from app.evaluation import AnswerQualityRequest, score_answer_quality
from app.security import ServicePrincipal


class Judge:
    model = "fixture"

    async def complete(self, _messages):
        return json.dumps(
            {"grounded": False, "behaviorCorrect": True, "actualLanguage": "en", "reason": "test"}
        ), None


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [199, 200, 201])
async def test_counts_visible_output_with_real_tokenizer(count):
    result = await score_answer_quality(
        AnswerQualityRequest(
            question="Synthetic input", answer=" hello" * count, expected={}, actual={}
        ),
        ServicePrincipal("eval", ("eval.runs.execute",), "user", "fixture", "fixture"),
        Judge(),
    )
    assert result["visibleOutputTokens"] == count
    assert result["tokenizer"] == "o200k_base"
    assert result["grounded"] is False
