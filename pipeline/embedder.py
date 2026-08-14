import os
from typing import List
from sentence_transformers import SentenceTransformer

class LocalEmbedder:
    """
    SentenceTransformer local embedder utilizing all-MiniLM-L6-v2 by default.
    Provides fast, local, zero-network-latency vector embeddings.
    """
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.model_name = model_name
        print(f"Loading local embedding model: {model_name}...")
        self.model = SentenceTransformer(model_name)
        print("Embedding model loaded successfully.")

    def embed_texts(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        if not texts:
            return []
        embeddings = self.model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=False,
            convert_to_numpy=True
        )
        return embeddings.tolist()

    def embed_query(self, query: str) -> List[float]:
        return self.embed_texts([query])[0]


def get_embedder():
    # Helper to return embedder instance based on config
    return LocalEmbedder()
