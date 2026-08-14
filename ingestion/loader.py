import os
import json
import csv
from typing import Generator, Dict, Any, List
from pypdf import PdfReader

class DocumentStreamLoader:
    """
    Auto-detecting, format-agnostic loader that streams files from a directory
    or list of file paths in chunks without reading everything into memory at once.
    """
    def __init__(self, data_dir: str):
        self.data_dir = data_dir

    def walk_files(self) -> Generator[str, None, None]:
        if os.path.isfile(self.data_dir):
            yield self.data_dir
            return

        for root, _, files in os.walk(self.data_dir):
            for file in files:
                file_path = os.path.join(root, file)
                yield file_path

    def load_file(self, file_path: str) -> Generator[Dict[str, Any], None, None]:
        ext = os.path.splitext(file_path)[1].lower()
        file_name = os.path.basename(file_path)

        if ext == ".pdf":
            yield from self._load_pdf(file_path, file_name)
        elif ext in [".txt", ".md", ".log"]:
            yield from self._load_text(file_path, file_name)
        elif ext == ".json":
            yield from self._load_json(file_path, file_name)
        elif ext == ".csv":
            yield from self._load_csv(file_path, file_name)
        else:
            # Fallback for unknown extension - attempt text read
            yield from self._load_text(file_path, file_name)

    def _load_pdf(self, file_path: str, file_name: str) -> Generator[Dict[str, Any], None, None]:
        try:
            reader = PdfReader(file_path)
            total_pages = len(reader.pages)
            for page_num, page in enumerate(reader.pages, start=1):
                try:
                    text = page.extract_text() or ""
                    if text.strip():
                        yield {
                            "text": text,
                            "metadata": {
                                "source": file_name,
                                "file_path": file_path,
                                "page": page_num,
                                "total_pages": total_pages,
                                "type": "pdf"
                            }
                        }
                except Exception as e:
                    print(f"Error extracting page {page_num} of {file_name}: {e}")
        except Exception as e:
            print(f"Error reading PDF {file_path}: {e}")

    def _load_text(self, file_path: str, file_name: str) -> Generator[Dict[str, Any], None, None]:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                if content.strip():
                    yield {
                        "text": content,
                        "metadata": {
                            "source": file_name,
                            "file_path": file_path,
                            "page": 1,
                            "type": "text"
                        }
                    }
        except Exception as e:
            print(f"Error reading text file {file_path}: {e}")

    def _load_json(self, file_path: str, file_name: str) -> Generator[Dict[str, Any], None, None]:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                data = json.load(f)
                if isinstance(data, list):
                    for idx, item in enumerate(data):
                        text_content = json.dumps(item) if isinstance(item, dict) else str(item)
                        yield {
                            "text": text_content,
                            "metadata": {
                                "source": file_name,
                                "file_path": file_path,
                                "record_index": idx,
                                "type": "json"
                            }
                        }
                elif isinstance(data, dict):
                    yield {
                        "text": json.dumps(data),
                        "metadata": {
                            "source": file_name,
                            "file_path": file_path,
                            "type": "json"
                        }
                    }
        except Exception as e:
            print(f"Error reading JSON file {file_path}: {e}")

    def _load_csv(self, file_path: str, file_name: str) -> Generator[Dict[str, Any], None, None]:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                reader = csv.DictReader(f)
                for idx, row in enumerate(reader):
                    formatted_row = ", ".join(f"{k}: {v}" for k, v in row.items() if v)
                    if formatted_row.strip():
                        yield {
                            "text": formatted_row,
                            "metadata": {
                                "source": file_name,
                                "file_path": file_path,
                                "row": idx + 1,
                                "type": "csv"
                            }
                        }
        except Exception as e:
            print(f"Error reading CSV file {file_path}: {e}")

    def stream_documents(self) -> Generator[Dict[str, Any], None, None]:
        for file_path in self.walk_files():
            yield from self.load_file(file_path)
