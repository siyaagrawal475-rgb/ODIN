import os
import chromadb
from chromadb.config import Settings
from typing import List, Dict, Any, Tuple
from pipeline.embedder import LocalEmbedder

class VectorIndexer:
    """
    Disk-persistent ChromaDB vector index manager.
    Stores chunk embeddings and rich metadata to allow efficient similarity search across restarts.
    """
    def __init__(self, persist_directory: str = "./chroma_db", collection_name: str = "odin_defense_records"):
        self.persist_directory = persist_directory
        self.collection_name = collection_name
        os.makedirs(persist_directory, exist_ok=True)
        
        self.client = chromadb.PersistentClient(path=persist_directory)
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )
        self.embedder = LocalEmbedder()

    def add_chunks(self, chunks: List[Dict[str, Any]], batch_size: int = 100):
        if not chunks:
            return

        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            ids = [c["id"] for c in batch]
            texts = [c["text"] for c in batch]
            
            # Sanitize metadata values to primitive types for ChromaDB compatibility
            metadatas = []
            for c in batch:
                meta = {}
                for k, v in c["metadata"].items():
                    if isinstance(v, (str, int, float, bool)):
                        meta[k] = v
                    else:
                        meta[k] = str(v)
                metadatas.append(meta)

            embeddings = self.embedder.embed_texts(texts)

            self.collection.upsert(
                ids=ids,
                documents=texts,
                embeddings=embeddings,
                metadatas=metadatas
            )

    def query(self, query_text: str, top_k: int = 5) -> Dict[str, Any]:
        query_embedding = self.embedder.embed_query(query_text)
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents", "metadatas", "distances"]
        )
        return results

    def get_count(self) -> int:
        return self.collection.count()
