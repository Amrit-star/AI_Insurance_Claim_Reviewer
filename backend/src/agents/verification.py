import asyncio
import json
import os
import time
from typing import List, Dict, Any, Tuple
from dotenv import load_dotenv
from src.schemas import AgentTrace
from src.agents.base import BaseAgent

load_dotenv()   # reads backend/.env when run from backend/ directory

try:
    import google.generativeai as genai
    import google.ai.generativelanguage as glm
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False

VALID_DOC_TYPES = {"PRESCRIPTION", "HOSPITAL_BILL", "LAB_REPORT", "PHARMACY_BILL"}

# Combined prompt: classify AND extract in one single Gemini call per document.
# ExtractionAgent reads doc["_gemini_extracted"] and skips its own Gemini call.
COMBINED_PROMPT = """You are a medical document analyser for an Indian health insurance company.
Look at this document image carefully and return ONLY valid JSON — no markdown, no explanation.

Return this exact structure:
{
  "document_type": "PRESCRIPTION|HOSPITAL_BILL|LAB_REPORT|PHARMACY_BILL|UNKNOWN",
  "patient_name": "string or null",
  "doctor_name": "string or null",
  "doctor_registration": "string or null",
  "diagnosis": "string or null",
  "treatment": "string or null",
  "date_of_service": "YYYY-MM-DD or null",
  "total": 0,
  "line_items": [{"description": "string", "amount": 0}],
  "quality_status": "GOOD|PARTIAL|POOR"
}

Quality guidance:
- Handwritten Rx: extract what is legible; set quality_status PARTIAL if unclear
- Rubber stamp over text: extract visible parts; mark affected fields null
- Phone photo / skewed / low contrast: best-effort extraction
- Multilingual (Hindi/regional + English): extract English fields
- Partial / cut-off document: extract visible fields, leave cut-off as null
- quality_status POOR if significant portions are unreadable"""


class VerificationAgent(BaseAgent):
    def __init__(self, policy: Dict[str, Any]):
        super().__init__("VerificationAgent")
        self.policy = policy
        self.doc_requirements = policy.get("document_requirements", {})
        self.api_key = os.getenv("GEMINI_API_KEY")
        if HAS_GEMINI and self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel("gemini-2.5-flash")
        else:
            self.model = None

    def _classify_and_extract(self, file_bytes: bytes, mime_type: str) -> Dict[str, Any]:
        """
        Single Gemini call that classifies AND extracts the document.
        Retries up to 3 times with exponential backoff on rate-limit errors.
        ExtractionAgent reuses doc['_gemini_extracted'] — zero duplicate API calls.
        """
        if not self.model:
            return {"document_type": "UNKNOWN", "quality_status": "POOR"}

        blob_part = glm.Part(inline_data=glm.Blob(mime_type=mime_type, data=file_bytes))
        max_retries, delay = 3, 8   # start at 8s, double each retry (8 → 16 → 32)

        for attempt in range(max_retries):
            try:
                response = self.model.generate_content([blob_part, COMBINED_PROMPT])
                raw = response.text.strip()
                if raw.startswith("```"):
                    lines = raw.split("\n")
                    raw = "\n".join(l for l in lines[1:] if l.strip() != "```")
                result = json.loads(raw)
                if result.get("document_type", "").upper() not in VALID_DOC_TYPES:
                    result["document_type"] = "UNKNOWN"
                return result
            except Exception as e:
                err = str(e)
                is_rate_limit = "429" in err or "quota" in err.lower()
                if is_rate_limit and attempt < max_retries - 1:
                    wait = delay * (2 ** attempt)   # 8s, 16s, 32s
                    time.sleep(wait)
                    continue
                code = "rate_limit" if is_rate_limit else err[:120]
                return {"document_type": "UNKNOWN", "quality_status": "POOR", "_error": code}

        return {"document_type": "UNKNOWN", "quality_status": "POOR", "_error": "max_retries_exceeded"}

    def execute(self, category: str, documents: List[Dict[str, Any]]) -> Tuple[bool, str, AgentTrace]:
        start_time = time.time()
        category_upper = category.upper()

        requirements = self.doc_requirements.get(category_upper, {})
        if not requirements:
            requirements = {"required": ["PRESCRIPTION", "HOSPITAL_BILL"]}
        required_types = set(requirements.get("required", []))

        # For real uploaded docs: one Gemini call per document → classify + extract together
        for doc in documents:
            if not doc.get("actual_type") and doc.get("file_bytes"):
                result = self._classify_and_extract(
                    doc["file_bytes"], doc.get("mime_type", "image/jpeg")
                )
                doc["actual_type"]        = result.get("document_type", "UNKNOWN").upper()
                doc["_gemini_extracted"]  = result   # ExtractionAgent will reuse this

        # Quality check for explicit test-case unreadable flags
        for doc in documents:
            if doc.get("quality", "GOOD").upper() == "UNREADABLE":
                elapsed = (time.time() - start_time) * 1000
                msg = (
                    f"The uploaded document '{doc.get('file_name', 'Unknown')}' is unreadable. "
                    "Please re-upload a clear copy."
                )
                return False, msg, AgentTrace(
                    agent_name=self.name,
                    status="FAILED",
                    execution_time_ms=elapsed,
                    message=msg,
                    errors=[f"UNREADABLE_FILE: {doc.get('file_name', 'Unknown')}"]
                )

        uploaded_types = set(doc.get("actual_type", "").upper() for doc in documents)
        missing_types  = required_types - uploaded_types

        if missing_types:
            elapsed = (time.time() - start_time) * 1000
            msg = (
                f"Your claim for {category_upper} requires: {', '.join(sorted(required_types))}. "
                f"You uploaded: {', '.join(sorted(uploaded_types)) if uploaded_types else 'None'}. "
                f"Missing required document types: {', '.join(sorted(missing_types))}."
            )
            return False, msg, AgentTrace(
                agent_name=self.name,
                status="FAILED",
                execution_time_ms=elapsed,
                message=msg,
                errors=[f"MISSING_REQUIRED_DOCUMENT_TYPE: {sorted(missing_types)}"]
            )

        elapsed = (time.time() - start_time) * 1000
        summary = ", ".join(
            f"{doc.get('file_name', 'file')}→{doc.get('actual_type', 'UNKNOWN')}"
            for doc in documents
        )
        return True, "All required document types present.", AgentTrace(
            agent_name=self.name,
            status="SUCCESS",
            execution_time_ms=elapsed,
            message=f"Document verification passed. Classified: {summary}"
        )
