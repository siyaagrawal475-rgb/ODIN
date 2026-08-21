# Multi-stage Dockerfile for O.D.I.N. Defense RAG Assistant
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY ingestion/ ./ingestion/
COPY pipeline/ ./pipeline/
COPY api/ ./api/
COPY frontend/ ./frontend/
COPY assets/ ./assets/
COPY scripts/ ./scripts/

# Create directory for Chroma vector database
RUN mkdir -p /app/chroma_db

# Expose FastAPI port
EXPOSE 8000

# Run Uvicorn server serving FastAPI app
CMD uvicorn api.main:app -- host 0.0.0.0 -- port ${PORT :- 8000}
