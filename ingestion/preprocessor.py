import re
from typing import Dict, Any, Tuple

class DataPreprocessor:
    """
    Cleans, normalizes, and validates raw document text records.
    Tracks statistics on records processed, cleaned, and dropped.
    """
    def __init__(self, min_char_length: int = 20):
        self.min_char_length = min_char_length
        self.stats = {
            "total_processed": 0,
            "passed": 0,
            "dropped": 0,
            "fixed_records": 0
        }

    def clean_text(self, text: str) -> str:
        if not text:
            return ""
        
        original_text = text
        # Remove null characters and non-printable control chars except newlines/tabs
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        
        # Replace multiple spaces/newlines with clean single breaks
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = text.strip()

        if text != original_text:
            self.stats["fixed_records"] += 1
            
        return text

    def process(self, raw_doc: Dict[str, Any]) -> Tuple[Dict[str, Any] | None, str | None]:
        self.stats["total_processed"] += 1
        raw_text = raw_doc.get("text", "")
        cleaned_text = self.clean_text(raw_text)

        if len(cleaned_text) < self.min_char_length:
            self.stats["dropped"] += 1
            return None, f"Text too short ({len(cleaned_text)} chars)"

        # Check if text is just repeated noise/header artifacts
        if len(set(cleaned_text.split())) < 3 and len(cleaned_text) > 50:
            self.stats["dropped"] += 1
            return None, "Low entropy / repeated noise text"

        cleaned_doc = {
            "text": cleaned_text,
            "metadata": raw_doc.get("metadata", {})
        }
        self.stats["passed"] += 1
        return cleaned_doc, None

    def get_stats(self) -> Dict[str, Any]:
        total = self.stats["total_processed"]
        dropped = self.stats["dropped"]
        drop_pct = (dropped / total * 100) if total > 0 else 0.0
        return {
            **self.stats,
            "drop_percentage": round(drop_pct, 2)
        }
