from typing import List, Dict, Any, Tuple
from pipeline.indexer import VectorIndexer

class DocumentRetriever:
    """
    Retriever performing vector search, confidence score thresholding,
    and diversity re-ranking over retrieved chunks.
    """
    def __init__(self, indexer: VectorIndexer, confidence_threshold: float = 0.45):
        """
        confidence_threshold: Minimum cosine similarity required (1.0 - distance).
        For Chroma cosine distance: similarity = 1 - distance.
        """
        self.indexer = indexer
        self.confidence_threshold = confidence_threshold

    def retrieve(self, query: str, top_k: int = 5) -> Tuple[List[Dict[str, Any]], bool, float]:
        """
        Returns:
            (retrieved_chunks, is_confident, top_similarity_score)
        """
        if not query or not query.strip():
            return [], False, 0.0

        if self.indexer.get_count() == 0:
            return [], False, 0.0

        results = self.indexer.query(query, top_k=top_k * 2)  # fetch 2x for MMR/re-ranking
        
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        if not documents:
            return [], False, 0.0

        retrieved = []
        top_similarity = 0.0

        for doc_text, meta, dist in zip(documents, metadatas, distances):
            # Chroma cosine distance ranges from 0 (exact match) to 2
            similarity = max(0.0, 1.0 - float(dist))
            if similarity > top_similarity:
                top_similarity = similarity

            retrieved.append({
                "text": doc_text,
                "metadata": meta,
                "distance": float(dist),
                "similarity": similarity
            })

        # Confidence Gate Check
        if top_similarity < self.confidence_threshold:
            print(f"[Gate] Top similarity {top_similarity:.3f} below threshold {self.confidence_threshold}. Gating LLM call.")
            return [], False, top_similarity

        # Diversity Re-ranking (simple token-overlap deduplication across top-k)
        selected_chunks = []
        seen_texts = set()

        for chunk in retrieved:
            text = chunk["text"]
            # Check overlap with already selected chunks
            words = set(text.lower().split())
            is_too_similar = False
            for prev_words in seen_texts:
                overlap = len(words.intersection(prev_words)) / max(1, len(words.union(prev_words)))
                if overlap > 0.75:
                    is_too_similar = True
                    break

            if not is_too_similar:
                selected_chunks.append(chunk)
                seen_texts.add(frozenset(words))

            if len(selected_chunks) >= top_k:
                break

        return selected_chunks, True, top_similarity
