import os
import sys
import argparse
import time

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ingestion.loader import DocumentStreamLoader
from ingestion.preprocessor import DataPreprocessor
from pipeline.chunker import DocumentChunker
from pipeline.indexer import VectorIndexer

def main():
    parser = argparse.ArgumentParser(description="O.D.I.N. Vector Index Builder")
    parser.add_argument("--data-dir", type=str, default="data-20260814T072723Z-1-001/data/raw/india/DRDO", help="Path to raw dataset directory")
    parser.add_argument("--sample", type=int, default=0, help="Limit to N sample files for fast testing (0 for all)")
    parser.add_argument("--persist-dir", type=str, default="./chroma_db", help="ChromaDB output persistence directory")
    args = parser.parse_args()

    print(f"=== O.D.I.N. Index Builder Starting ===")
    print(f"Dataset path: {args.data_dir}")
    print(f"Sample limit: {args.sample if args.sample > 0 else 'All files'}")
    print(f"Chroma DB directory: {args.persist_dir}")

    if not os.path.exists(args.data_dir):
        print(f"Error: Data directory '{args.data_dir}' does not exist.")
        sys.exit(1)

    loader = DocumentStreamLoader(args.data_dir)
    preprocessor = DataPreprocessor(min_char_length=30)
    chunker = DocumentChunker(chunk_size=600, chunk_overlap=100)
    indexer = VectorIndexer(persist_directory=args.persist_dir)

    start_time = time.time()
    all_chunks = []
    file_count = 0

    for raw_doc in loader.stream_documents():
        cleaned_doc, drop_reason = preprocessor.process(raw_doc)
        if cleaned_doc:
            chunks = chunker.chunk_document(cleaned_doc)
            all_chunks.extend(chunks)
            file_count += 1
            if args.sample > 0 and file_count >= args.sample:
                print(f"Sample limit of {args.sample} documents reached.")
                break

    print("\n--- Pipeline Stats ---")
    prep_stats = preprocessor.get_stats()
    print(f"Documents read: {prep_stats['total_processed']}")
    print(f"Documents passed: {prep_stats['passed']}")
    print(f"Documents dropped: {prep_stats['dropped']} ({prep_stats['drop_percentage']}%)")

    chunk_stats = chunker.get_stats()
    print(f"Total chunks created: {chunk_stats['total_chunks']}")
    print(f"Average chunk character size: {chunk_stats['avg_chunk_char_size']}")
    print(f"Average estimated chunk tokens: {chunk_stats['avg_chunk_token_estimate']}")

    if all_chunks:
        print(f"\nIndexing {len(all_chunks)} chunks into ChromaDB...")
        indexer.add_chunks(all_chunks, batch_size=64)
        print(f"Index build complete. Total items in collection: {indexer.get_count()}")
    else:
        print("No valid chunks were produced.")

    elapsed = time.time() - start_time
    print(f"\nCompleted in {elapsed:.2f} seconds.")

if __name__ == "__main__":
    main()
