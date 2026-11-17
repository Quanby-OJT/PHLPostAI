"""KB-1 tests: the approved-knowledge retrieval filter (Flow E) and the
knowledge support routes (extract, cache invalidate, de-index). The database
and Redis are faked; real providers are never called."""

from typing import Any

import httpx
import pytest

from app.chunks import (
    APPROVED_KNOWLEDGE_PREDICATE,
    ChunksRepository,
    _keyword_sql,
    _vector_sql,
)
from app.ingest import get_documents_repository
from app.knowledge import bump_generation
from app.main import create_app
from tests.test_ingest import make_token


# ------------------------------------------------------------ retrieval filter
def test_vector_and_keyword_arms_only_return_approved_active_knowledge():
    for sql in (_vector_sql(""), _keyword_sql(""), _vector_sql("d.doc_type = ANY($3::text[])")):
        assert APPROVED_KNOWLEDGE_PREDICATE in sql


def test_filter_requires_an_approved_version_of_an_active_article():
    assert "kav.document_id = chunks.document_id" in APPROVED_KNOWLEDGE_PREDICATE
    assert "kav.status = 'approved'" in APPROVED_KNOWLEDGE_PREDICATE
    assert "ka.status = 'active'" in APPROVED_KNOWLEDGE_PREDICATE


class CapturingConnection:
    def __init__(self) -> None:
        self.sql: list[str] = []

    async def fetch(self, sql: str, *args: Any) -> list[Any]:
        self.sql.append(sql)
        return []

    async def close(self) -> None:
        return None


async def test_graph_arm_hash_lookup_applies_the_filter_too(settings, monkeypatch):
    repository = ChunksRepository(settings)
    connection = CapturingConnection()

    async def connect() -> CapturingConnection:
        return connection

    monkeypatch.setattr(repository, "_connect", connect)
    await repository.fetch_by_hashes(["hash-1"])

    assert connection.sql and APPROVED_KNOWLEDGE_PREDICATE in connection.sql[0]


# ------------------------------------------------------------------- routes
class FakeDocuments:
    def __init__(self, removed: int | None) -> None:
        self.removed = removed
        self.deindexed: list[str] = []
        self.audits: list[dict[str, Any]] = []

    async def deindex_document(self, document_id: str) -> int | None:
        self.deindexed.append(document_id)
        return self.removed

    async def write_audit(self, **entry: Any) -> None:
        self.audits.append(entry)


@pytest.fixture
def documents() -> FakeDocuments:
    return FakeDocuments(removed=3)


@pytest.fixture
def app(settings, documents):
    application = create_app(settings)
    application.dependency_overrides[get_documents_repository] = lambda: documents
    application.dependency_overrides[bump_generation] = lambda: 7
    return application


async def request(app, method: str, path: str, **kwargs: Any) -> httpx.Response:
    headers = {"authorization": f"Bearer {make_token()}"}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://rag") as client:
        return await client.request(method, path, headers=headers, **kwargs)


async def test_extract_returns_the_text_without_ingesting(app, documents):
    html = b"<html><body><h1>Postal ID</h1><p>Bring one valid ID.</p></body></html>"
    response = await request(
        app,
        "POST",
        "/internal/knowledge/extract",
        files={"file": ("postal-id.html", html, "text/html")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["docType"] == "html"
    assert "Bring one valid ID." in body["text"]
    assert documents.deindexed == []  # nothing touched the corpus


async def test_extract_rejects_formats_outside_docx_pdf_html(app):
    response = await request(
        app,
        "POST",
        "/internal/knowledge/extract",
        files={"file": ("rates.csv", b"a,b\n1,2\n", "text/csv")},
    )
    assert response.status_code == 415


async def test_cache_invalidate_bumps_the_corpus_generation(app):
    response = await request(
        app, "POST", "/internal/cache/invalidate", json={"reason": "knowledge.article.deactivate"}
    )
    assert response.status_code == 200
    assert response.json() == {"cleared": True, "generation": 7}


async def test_cache_invalidate_requires_the_service_token(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://rag") as client:
        response = await client.post("/internal/cache/invalidate", json={})
    assert response.status_code == 401


async def test_deindex_removes_chunks_and_audits(app, documents):
    response = await request(app, "POST", "/internal/documents/doc-1/deindex")

    assert response.status_code == 200
    assert response.json() == {"id": "doc-1", "deindexed": True, "chunksRemoved": 3}
    assert documents.deindexed == ["doc-1"]
    assert documents.audits[0]["action"] == "corpus.document.deindex"


async def test_deindex_unknown_document_is_404(settings):
    application = create_app(settings)
    application.dependency_overrides[get_documents_repository] = lambda: FakeDocuments(removed=None)
    application.dependency_overrides[bump_generation] = lambda: 7
    response = await request(application, "POST", "/internal/documents/missing/deindex")
    assert response.status_code == 404
