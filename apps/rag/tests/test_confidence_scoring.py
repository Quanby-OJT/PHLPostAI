"""CNV-3: retrieval score, confidence and the cache scope for limited answers."""

import pytest

from app.generation import (
    _cache_scope,
    _sharable_entry,
    calculate_answer_confidence,
    top_retrieval_score,
)
from app.reply_language import ENGLISH, LanguageContext


def test_top_retrieval_score_prefers_the_reranked_score():
    chunks = [
        {"similarity": 0.91, "rerankScore": 0.42},
        {"similarity": 0.55, "rerankScore": 0.67},
    ]
    assert top_retrieval_score(chunks) == 0.67


def test_a_cross_encoder_logit_is_mapped_into_zero_to_one():
    score = top_retrieval_score([{"similarity": 0.3, "rerankScore": 2.0}])
    assert score == pytest.approx(0.8808, abs=1e-4)
    assert 0.0 < top_retrieval_score([{"rerankScore": -3.0}]) < 0.1


def test_without_a_reranker_the_best_similarity_is_used_and_bounded():
    assert top_retrieval_score([{"similarity": 0.4}, {"similarity": 1.2}]) == 1.0
    assert top_retrieval_score([]) == 0.0


def test_confidence_uses_the_reranked_score():
    confidence = calculate_answer_confidence(
        [{"similarity": 0.95, "rerankScore": 0.6}],
        citations=[{"chunkId": "c1"}],
        degraded=False,
        is_i_dont_know=False,
        grounding={"grounded": True},
    )
    assert confidence == 0.6


def test_cache_scope_keeps_each_limit_separate():
    assert _cache_scope(ENGLISH, None, None) is None
    assert _cache_scope(ENGLISH, {"documentIds": ["d1"]}, 120) == {
        "documentIds": ["d1"],
        "maxOutputTokens": 120,
    }
    assert _cache_scope(LanguageContext.build("ceb"), None, 200) == {
        "replyLanguage": "ceb",
        "maxOutputTokens": 200,
    }


def test_shared_entries_carry_the_recorded_metrics():
    entry = _sharable_entry(
        {
            "answer": "a [1]",
            "confidence": 0.8,
            "retrievalScore": 0.8,
            "groundednessResult": {"grounded": True},
            "outputTokens": 12,
            "messageId": "m1",
        }
    )
    assert entry == {
        "answer": "a [1]",
        "confidence": 0.8,
        "retrievalScore": 0.8,
        "groundednessResult": {"grounded": True},
        "outputTokens": 12,
    }
