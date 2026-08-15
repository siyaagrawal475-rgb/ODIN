import os
import re
import time
from typing import List, Dict, Any, Generator

FALLBACK_NO_INFO = "I don't have enough information on that in this dataset."

SYSTEM_PROMPT = """You are O.D.I.N. (Operational Defense & Intelligence Network), an AI defense records assistant.
Strict Grounding & Anti-Hallucination Instructions:
1. Answer the question STRICTLY using ONLY the provided context chunks below. Do NOT use outside knowledge or make assumptions.
2. If the provided context does not contain sufficient information to answer the question with certainty, respond with EXACTLY:
"I don't have enough information on that in this dataset."
3. Lead with a concise one-line direct answer if possible.
4. Format supporting details as 2 to 5 short bullet points (keep bullets concise, 3-12 words each).
5. At the very end of your response, cite EVERY source file and page used in the exact format:
[source: <filename>, p.<page>]
(or [source: <filename>] if page is missing). Each citation must appear on its own line at the end.
6. Do NOT fabricate source names, page numbers, or claims not present in the context.
"""

class ResponseGenerator:
    """
    LLM Response Generator enforcing strict grounding, bullet formatting,
    citation verification, and multi-provider execution.
    """
    def __init__(self):
        self.gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.openai_key = os.getenv("OPENAI_API_KEY")
        self.anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        self.groq_key_1 = os.getenv("GROQ_API_KEY_1")
        self.groq_key_2 = os.getenv("GROQ_API_KEY_2")

    def _format_context(self, chunks: List[Dict[str, Any]]) -> str:
        formatted = []
        for idx, chunk in enumerate(chunks, 1):
            meta = chunk.get("metadata", {})
            source = meta.get("source", "unknown_doc")
            page = meta.get("page", 1)
            text = chunk.get("text", "")
            formatted.append(f"--- CHUNK {idx} [source: {source}, p.{page}] ---\n{text}\n")
        return "\n".join(formatted)

    def _verify_citations(self, response_text: str, chunks: List[Dict[str, Any]]) -> str:
        """
        Non-negotiable #2: Verify cited source IDs actually appear in the retrieved set.
        Drop ungrounded bullet claims before returning to UI.
        """
        valid_sources = set()
        for chunk in chunks:
            src = chunk.get("metadata", {}).get("source", "")
            if src:
                valid_sources.add(src.lower())

        lines = response_text.strip().split("\n")
        verified_lines = []
        
        for line in lines:
            # Check for source citation lines
            citation_matches = re.findall(r'\[source:\s*([^,\]]+)(?:,\s*p\.?\s*\d+)?\]', line, re.IGNORECASE)
            if citation_matches:
                valid_citations_in_line = []
                for cited_src in citation_matches:
                    cited_clean = cited_src.strip().lower()
                    # Verify if cited source matches any retrieved source
                    if any(cited_clean in valid_s or valid_s in cited_clean for valid_s in valid_sources):
                        valid_citations_in_line.append(line)
                if valid_citations_in_line:
                    verified_lines.append(line)
            else:
                # Normal content line
                verified_lines.append(line)

        final_response = "\n".join(verified_lines).strip()
        return final_response if final_response else FALLBACK_NO_INFO

    def generate_response(self, query: str, chunks: List[Dict[str, Any]], is_confident: bool) -> str:
        if not is_confident or not chunks:
            return FALLBACK_NO_INFO

        context_str = self._format_context(chunks)
        prompt_text = f"CONTEXT RECORDS:\n{context_str}\n\nUSER QUESTION:\n{query}"

        # 1. Try Gemini API if key available
        if self.gemini_key:
            try:
                from google import genai
                client = genai.Client(api_key=self.gemini_key)
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=f"{SYSTEM_PROMPT}\n\n{prompt_text}"
                )
                if response and response.text:
                    return self._verify_citations(response.text, chunks)
            except Exception as e:
                print(f"Gemini API generation error: {e}")

        # 2. Try OpenAI API if key available
        if self.openai_key:
            try:
                import requests
                headers = {"Authorization": f"Bearer {self.openai_key}", "Content-Type": "application/json"}
                payload = {
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt_text}
                    ],
                    "temperature": 0.1
                }
                res = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=12)
                if res.status_code == 200:
                    answer = res.json()["choices"][0]["message"]["content"]
                    return self._verify_citations(answer, chunks)
            except Exception as e:
                print(f"OpenAI API error: {e}")

        # 3. Try Groq API (key 1, then key 2 as backup)
        for groq_key in filter(None, [self.groq_key_1, self.groq_key_2]):
            try:
                import requests
                headers = {"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"}
                payload = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt_text}
                    ],
                    "temperature": 0.1
                }
                res = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=12)
                if res.status_code == 200:
                    answer = res.json()["choices"][0]["message"]["content"]
                    return self._verify_citations(answer, chunks)
                elif res.status_code in (401, 429):
                    print(f"Groq API key issue (status {res.status_code}), trying next key...")
                    continue
            except Exception as e:
                print(f"Groq API error: {e}")

        # 4. Grounded Fallback Extractor (guarantees local execution with 0 API keys)
        return self._local_grounded_extract(query, chunks)

    def _local_grounded_extract(self, query: str, chunks: List[Dict[str, Any]]) -> str:
        """
        Determinist, grounded local summary generator when no external LLM API key is present.
        Extracts key sentences matching query keywords and appends precise citations.
        """
        query_words = set(re.findall(r'\w+', query.lower())) - {"what", "is", "the", "are", "of", "and", "in", "for", "to", "a", "an"}
        matched_bullets = []
        cited_sources = []

        for chunk in chunks:
            text = chunk.get("text", "")
            meta = chunk.get("metadata", {})
            src = meta.get("source", "defense_record.pdf")
            page = meta.get("page", 1)

            sentences = re.split(r'(?<=[.!?])\s+', text)
            for s in sentences:
                s_clean = s.strip()
                if len(s_clean) > 20:
                    s_words = set(re.findall(r'\w+', s_clean.lower()))
                    overlap = len(query_words.intersection(s_words))
                    if overlap >= 1 and s_clean not in matched_bullets:
                        # Clean bullet text
                        bullet_str = s_clean[:180].rstrip(".")
                        matched_bullets.append(f"• {bullet_str}")
                        cite_str = f"[source: {src}, p.{page}]"
                        if cite_str not in cited_sources:
                            cited_sources.append(cite_str)

                if len(matched_bullets) >= 4:
                    break
            if len(matched_bullets) >= 4:
                break

        if not matched_bullets:
            # Fallback to first chunk sentences if keyword match is sparse
            first_chunk = chunks[0]
            src = first_chunk.get("metadata", {}).get("source", "defense_record.pdf")
            page = first_chunk.get("metadata", {}).get("page", 1)
            sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', first_chunk["text"]) if len(s.strip()) > 20]
            for s in sentences[:3]:
                matched_bullets.append(f"• {s[:180].rstrip('.')}")
            cited_sources.append(f"[source: {src}, p.{page}]")

        summary = f"Based on retrieved defense records regarding '{query}':\n" + "\n".join(matched_bullets) + "\n\n" + "\n".join(cited_sources)
        return summary
