# O.D.I.N. — Operational Defense & Intelligence Network

O.D.I.N. is an end-to-end Retrieval-Augmented Generation (RAG) assistant designed for Defense Logistics, DRDO Strategic Reports, Declassified Documents, and Military Technical Specifications.

---

## 🏛️ Architecture Overview

```
                        +-----------------------------------------+
                        |      Defense Raw Records & Dataset      |
                        |      (DRDO PDFs, Specs, Manuals)        |
                        +-----------------------------------------+
                                             |
                                     (Streaming Stream)
                                             v
                        +-----------------------------------------+
                        |  1. Data Ingestion & Preprocessor       |
                        |     - Format-agnostic PDF/Txt/JSON      |
                        |     - Noise stripping & stats tracking  |
                        +-----------------------------------------+
                                             |
                                             v
                        +-----------------------------------------+
                        |  2. Document Chunker                    |
                        |     - Recursive ~400-600 token splits   |
                        |     - Rich Metadata (source, page, id)  |
                        +-----------------------------------------+
                                             |
                                             v
                        +-----------------------------------------+
                        |  3. Local Embedder & Vector Store       |
                        |     - sentence-transformers/all-MiniLM  |
                        |     - Disk-Persistent ChromaDB          |
                        +-----------------------------------------+
                                             |
                                 (User Query via /api/chat)
                                             v
                        +-----------------------------------------+
                        |  4. Document Retriever                  |
                        |     - Cosine similarity search (k=5)    |
                        |     - Diversity Re-ranking / MMR        |
                        |     - Zero-Hallucination Gate Check    |
                        +-----------------------------------------+
                                 /                       \
                      (Score < Threshold)          (Score >= Threshold)
                              /                             \
                             v                               v
            +----------------------------------+  +------------------------------------+
            | 5. Zero-Hallucination Gate       |  | 6. Grounded Generator              |
            |    Return: "I don't have enough  |  |    - Bullet format generation      |
            |    information in dataset."      |  |    - Citation Verification       |
            +----------------------------------+  +------------------------------------+
                                 \                           /
                                  \                         /
                                   v                       v
                        +-----------------------------------------+
                        |  7. FastAPI Web API & Event Stream      |
                        |     - Server-sent events (/chat/stream) |
                        |     - Time-to-first-token latency log   |
                        +-----------------------------------------+
                                             |
                                             v
                        +-----------------------------------------+
                        |  8. O.D.I.N. Web UI & 10 Animation States|
                        |     - Custom theme (Maroon/Gold tokens) |
                        |     - 10 Event-Driven Visual States     |
                        |     - Web Speech API integration        |
                        +-----------------------------------------+
```

---

## 🛠️ Tools & Models Used

- **Core Framework**: Python 3.11+, FastAPI, Uvicorn
- **Document Loading & Extraction**: PyPDF
- **Chunking Strategy**: LangChain `RecursiveCharacterTextSplitter` (600 char target, 100 overlap)
- **Embedding Model**: `sentence-transformers/all-MiniLM-L6-v2` (Local, Zero-Network Latency)
- **Vector Database**: `ChromaDB` (Local Persistent Storage on disk)
- **LLM Generator & Fallback**: Google Gemini API / OpenAI / Grounded Local Extractor
- **Frontend**: Custom HTML5, Vanilla CSS Design System (`#6B2E2E` Maroon, `#B8933A` Gold), Vanilla JS

---

## ⚡ Non-Negotiable Guarantees & Features

1. **Zero Hallucination Gate**:
   - Queries with retrieval similarity below threshold (`0.25`) skip LLM execution entirely and return `"I don't have enough information on that in this dataset."`
2. **Citation Traceability & Verification**:
   - Every answer bullet must end with exact source citations `[source: filename, p.X]`. Cited files are cross-checked against retrieved chunks to drop ungrounded claims.
3. **Latency Measurement**:
   - Server logs `time-to-first-token` (TTFT) and total latency for every query.
4. **10 Event-Driven Animation States**:
   - *Idle*: All-Seeing Eye iris pulse
   - *Boot-up*: Gungnir spearhead reveal
   - *Ready*: Binary Crow perching
   - *Thinking*: Wisdom Well radial ripples inside loading bubble
   - *Delivering*: Raven Messenger flight to citation block
   - *Error/Blocked*: Odin's Wrath red flash & jitter
   - *Connection Loss*: Brooding Allfather eye dim & pupil close
   - *Gated Decline*: Shield Wall hex pattern expansion
   - *Processing*: Rune Decryption matrix drift
   - *Session Switch*: Tactical Overlay radar sweep

---

## 🚀 How to Reproduce & Run Locally

### 1. Environment Setup
```bash
# Clone repository
cd ODIN

# Install dependencies
pip install -r requirements.txt

# Copy configuration
cp .env.example .env
```

### 2. Build the Vector Index
```bash
# Test build on 15 sample PDFs
python scripts/build_index.py --sample 15

# Build full index on DRDO dataset
python scripts/build_index.py
```

### 3. Launch Server & UI
```bash
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
```
Open your browser at: `http://localhost:8000`

---

## 🐳 Docker Deployment

```bash
# Build image
docker build -t odin-rag .

# Run container
docker run -p 8000:8000 odin-rag
```

---

## ⚠️ Known Limitations

- **OCR for Scanned Documents**: Documents containing only raw scanned images without embedded text layers require OCR preprocessing (Tesseract/pdf2image) prior to text extraction.
- **Single Vector Database Partition**: All dataset records currently live in a single unified ChromaDB collection (`odin_defense_records`). Multi-tenant role-based collection partitioning can be configured for enterprise deployments.
