"""Knowledge base support routes (KB-1, Flow E).

The NestJS knowledge module owns the article workflow; it reaches the
ingestion service only through these service-JWT routes (DOMAIN-MODEL §6:
knowledge indexes and de-indexes through the template ingestion service and
never writes chunks itself):

- POST /internal/knowledge/extract       normalize a DOCX/PDF/HTML upload with
  the template loaders and return its text, WITHOUT ingesting it (the text only
  seeds a draft; approval is what indexes content)
- POST /internal/cache/invalidate        bump the corpus generation (CP-2): one
  INCR retires every cached answer
- POST /internal/documents/{id}/deindex  delete a retired document's chunks
"""

import asyncio
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from app.documents import DocumentsRepository
from app.ingest import MAX_UPLOAD_BYTES, get_documents_repository
from app.loaders import resolve_loader
from app.security import ServicePrincipal, verify_service_jwt

logger = logging.getLogger(__name__)

# A draft's starting text may come from these formats only (KB-1 scope).
KNOWLEDGE_DOC_TYPES = ("pdf", "html", "docx")

AUDIT_ACTION_DEINDEX = "corpus.document.deindex"

router = APIRouter(prefix="/internal", dependencies=[Depends(verify_service_jwt)])


async def bump_generation(request: Request) -> int | None:
    """Dependency seam (tests override it). None when the cache is disabled:
    with no cache there is nothing to clear, which counts as cleared."""
    settings = request.app.state.settings
    if not settings.cache_enabled:
        return None
    from app.response_cache import bump_corpus_generation

    return await bump_corpus_generation(settings)


@router.post("/knowledge/extract")
async def extract_text(file: UploadFile) -> dict[str, Any]:
    loader = resolve_loader(file.content_type)
    if loader is None or loader.doc_type not in KNOWLEDGE_DOC_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                f'Unsupported file type "{file.content_type}". '
                "Upload a DOCX, PDF, or HTML file."
            ),
        )
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 25 MB limit")
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    filename = file.filename or f"upload.{loader.doc_type}"
    try:
        metadata = await asyncio.to_thread(
            loader.normalize, raw, filename, f"knowledge-draft://{filename}"
        )
    except Exception as exc:
        label = f"{loader.doc_type.upper()} could not be read"
        detail = f"{label}: {exc}" if str(exc) else label
        raise HTTPException(status_code=422, detail=detail) from exc

    text = metadata.get("text") if isinstance(metadata, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(status_code=422, detail="No text could be extracted from this file")
    return {"filename": filename, "docType": loader.doc_type, "text": text.strip()}


class InvalidateRequest(BaseModel):
    reason: str = Field(default="unspecified", max_length=200)


@router.post("/cache/invalidate")
async def invalidate_cache(
    payload: InvalidateRequest,
    principal: Annotated[ServicePrincipal, Depends(verify_service_jwt)],
    generation: Annotated[int | None, Depends(bump_generation)],
) -> dict[str, Any]:
    logger.info(
        "knowledge.cache_invalidated %s",
        {"reason": payload.reason, "actor": principal.sub, "generation": generation},
    )
    return {"cleared": True, "generation": generation}


@router.post("/documents/{document_id}/deindex")
async def deindex_document(
    document_id: str,
    principal: Annotated[ServicePrincipal, Depends(verify_service_jwt)],
    repository: Annotated[DocumentsRepository, Depends(get_documents_repository)],
    generation: Annotated[int | None, Depends(bump_generation)],
) -> dict[str, Any]:
    removed = await repository.deindex_document(document_id)
    if removed is None:
        raise HTTPException(status_code=404, detail="Document not found")
    await repository.write_audit(
        actor_id=principal.sub,
        actor_type=principal.actor_type,
        action=AUDIT_ACTION_DEINDEX,
        resource_type="document",
        resource_id=document_id,
        before=None,
        after={"status": "registered", "chunksRemoved": removed, "generation": generation},
    )
    return {"id": document_id, "deindexed": True, "chunksRemoved": removed}
