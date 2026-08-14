import uuid
from typing import List, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter

class DocumentChunker:
    """
    Section-aware and format-aware chunking matching target ~300-800 tokens with overlap.
    Preserves exact document metadata and tracks chunk count and average size.
    """
    def __init__(self, chunk_size: int = 600, chunk_overlap: int = 100):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", "; ", ", ", " ", ""]
        )
        self.total_chunks = 0
        self.total_chunk_characters = 0

    def chunk_document(self, doc: Dict[str, Any]) -> List[Dict[str, Any]]:
        text = doc.get("text", "")
        base_metadata = doc.get("metadata", {})
        
        raw_chunks = self.splitter.split_text(text)
        chunk_objects = []

        for idx, chunk_text in enumerate(raw_chunks):
            chunk_id = f"{base_metadata.get('source', 'doc')}_{base_metadata.get('page', 1)}_{idx}_{str(uuid.uuid4())[:8]}"
            
            metadata = {
                **base_metadata,
                "chunk_id": chunk_id,
                "chunk_index": idx,
                "total_chunks_in_doc": len(raw_chunks),
                "char_length": len(chunk_text),
                "token_estimate": len(chunk_text.split())
            }

            chunk_objects.append({
                "id": chunk_id,
                "text": chunk_text,
                "metadata": metadata
            })

            self.total_chunks += 1
            self.total_chunk_characters += len(chunk_text)

        return chunk_objects

    def get_stats(self) -> Dict[str, Any]:
        avg_size = (self.total_chunk_characters / self.total_chunks) if self.total_chunks > 0 else 0
        avg_tokens = avg_size / 4.0  # rough character to token conversion
        return {
            "total_chunks": self.total_chunks,
            "total_characters": self.total_chunk_characters,
            "avg_chunk_char_size": round(avg_size, 1),
            "avg_chunk_token_estimate": round(avg_tokens, 1)
        }
