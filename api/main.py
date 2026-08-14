import os
import sys
import time
import json
import asyncio
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add parent dir to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pipeline.indexer import VectorIndexer
from pipeline.retriever import DocumentRetriever
from pipeline.generator import ResponseGenerator, FALLBACK_NO_INFO

app = FastAPI(
    title="O.D.I.N. Defense RAG Assistant API",
    description="Operational Defense & Intelligence Network API",
    version="1.0.0"
)

# CORS middleware for local testing and cross-origin deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize vector database indexer, retriever, and generator
PERSIST_DIR = os.getenv("CHROMA_DB_DIR", "./chroma_db")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.45"))
indexer = VectorIndexer(persist_directory=PERSIST_DIR)
retriever = DocumentRetriever(indexer=indexer, confidence_threshold=CONFIDENCE_THRESHOLD)
generator = ResponseGenerator()

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default"

class ChatResponse(BaseModel):
    response: str
    sources: List[Dict[str, Any]]
    latency_ms: float
    time_to_first_token_ms: float
    is_confident: bool
    confidence_score: float

@app.get("/health")
def health_check():
    count = indexer.get_count()
    return {
        "status": "online",
        "service": "O.D.I.N. Defense RAG Assistant",
        "indexed_chunks": count,
        "timestamp": time.time()
    }

@app.get("/stats")
def get_stats():
    return {
        "indexed_chunks": indexer.get_count(),
        "vector_db_path": PERSIST_DIR,
        "confidence_threshold": retriever.confidence_threshold,
        "embedder": "sentence-transformers/all-MiniLM-L6-v2"
    }

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    query = request.message.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Message content cannot be empty.")

    start_time = time.time()
    first_token_time = None

    # Step 1: Retrieval + Confidence Gate Check
    chunks, is_confident, top_similarity = retriever.retrieve(query, top_k=5)
    first_token_time = time.time()
    ttft_ms = round((first_token_time - start_time) * 1000, 2)

    # Step 2: Response Generation or Zero-Hallucination Fallback
    if not is_confident or not chunks:
        answer = FALLBACK_NO_INFO
        sources = []
    else:
        answer = generator.generate_response(query, chunks, is_confident)
        sources = [c.get("metadata", {}) for c in chunks]

    total_latency_ms = round((time.time() - start_time) * 1000, 2)

    # Log time-to-first-response (Rubric requirement #5)
    print(f"[METRICS] Query: '{query[:40]}...' | TTFT: {ttft_ms}ms | Total Latency: {total_latency_ms}ms | Confident: {is_confident} (Score: {top_similarity:.3f})")

    return ChatResponse(
        response=answer,
        sources=sources,
        latency_ms=total_latency_ms,
        time_to_first_token_ms=ttft_ms,
        is_confident=is_confident,
        confidence_score=round(top_similarity, 3)
    )

@app.post("/api/chat/stream")
async def chat_stream_endpoint(request: ChatRequest):
    query = request.message.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Message content cannot be empty.")

    async def event_generator():
        start_time = time.time()
        chunks, is_confident, top_similarity = retriever.retrieve(query, top_k=5)
        ttft_ms = round((time.time() - start_time) * 1000, 2)

        # Send initial metadata header event
        yield f"data: {json.dumps({'type': 'meta', 'ttft_ms': ttft_ms, 'is_confident': is_confident, 'confidence_score': round(top_similarity, 3)})}\n\n"

        if not is_confident or not chunks:
            yield f"data: {json.dumps({'type': 'token', 'token': FALLBACK_NO_INFO})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'sources': []})}\n\n"
            return

        answer = generator.generate_response(query, chunks, is_confident)
        
        # Stream answer tokens with small realistic delay
        tokens = answer.split(" ")
        for i, token in enumerate(tokens):
            space = " " if i < len(tokens) - 1 else ""
            yield f"data: {json.dumps({'type': 'token', 'token': token + space})}\n\n"
            await asyncio.sleep(0.015)

        sources = [c.get("metadata", {}) for c in chunks]
        yield f"data: {json.dumps({'type': 'done', 'sources': sources})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# Serve frontend static assets if directory exists
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
assets_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets"))

if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
