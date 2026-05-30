import time
import os
import json
from typing import List, Dict, Any, Tuple, Optional
from dotenv import load_dotenv
from src.schemas import AgentTrace, ExtractedDocument, ExtractedLineItem
from src.agents.base import BaseAgent

load_dotenv()   # reads backend/.env when run from backend/ directory

try:
    import google.generativeai as genai
    import google.ai.generativelanguage as glm
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False

EXTRACTION_PROMPT = """You are an expert medical document analyst for an Indian health insurance company.
Extract structured information from this medical document image and return ONLY valid JSON with no markdown, no explanation.

DOCUMENT QUALITY GUIDANCE — apply these rules before extracting:
- Handwritten prescriptions: read cursive/printed handwriting carefully; common shorthand: OD=once daily, BD=twice daily, TDS=three times, QID=four times, SOS=as needed, HS=bedtime, Rx=prescription
- Rubber stamps over text: extract text visible around/through the stamp; mark affected fields PARTIAL if obscured
- Phone photos (skew, shadows, low contrast): correct for perspective mentally; extract best-effort values
- Multilingual docs (Hindi/Tamil/Telugu + English): extract the English fields; if diagnosis is in regional script only, transliterate or leave as-is
- Partially cut-off / folded documents: extract visible fields; leave cut-off fields as null
- Crossed-out amounts: use the FINAL (corrected) amount, not the struck-through one
- Small clinic bills without GSTIN: still extract all visible fields normally
- Vague line items ("Medicines"): include as-is with whatever amount is shown

Set quality_status:
- "GOOD": all key fields clearly legible
- "PARTIAL": some fields unclear due to handwriting, stamps, or damage — extract what is visible
- "POOR": significant portions unreadable (severe blur, heavy stamp overlap, extreme skew)

Indian doctor registration number formats: KA/XXXXX/YYYY, MH/XXXXX/YYYY, DL/XXXXX/YYYY, TN/XXXXX/YYYY, etc.

Return this exact JSON structure (use null for fields you cannot extract):
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
}"""

class ExtractionAgent(BaseAgent):
    def __init__(self):
        super().__init__("ExtractionAgent")
        self.api_key = os.getenv("GEMINI_API_KEY")
        if HAS_GEMINI and self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel("gemini-2.5-flash")
        else:
            self.model = None

    def _parse_gemini_json(self, text: str) -> Dict[str, Any]:
        """Strip markdown fences and parse JSON response."""
        raw = text.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            # Drop first line (```json or ```) and last line (```)
            inner = lines[1:] if lines[-1].strip() == "```" else lines[1:]
            raw = "\n".join(l for l in inner if l.strip() != "```")
        return json.loads(raw)

    def _extract_via_gemini_inline(self, file_bytes: bytes, mime_type: str) -> Dict[str, Any]:
        """Extract structured fields from uploaded document bytes using Gemini Vision."""
        if not self.model:
            raise Exception("Gemini API key not configured or package missing.")
        blob_part = glm.Part(inline_data=glm.Blob(mime_type=mime_type, data=file_bytes))
        response = self.model.generate_content([blob_part, EXTRACTION_PROMPT])
        return self._parse_gemini_json(response.text)

    def _extract_via_gemini_path(self, file_path: str) -> Dict[str, Any]:
        """Extract from a file path (legacy test-case flow)."""
        if not self.model:
            raise Exception("Gemini API key not configured or package missing.")
        sample_file = genai.upload_file(path=file_path)
        response = self.model.generate_content([sample_file, EXTRACTION_PROMPT])
        return self._parse_gemini_json(response.text)

    def execute(
        self,
        documents: List[Dict[str, Any]],
        expected_patient_name: str,
    ) -> Tuple[List[ExtractedDocument], Optional[str], AgentTrace]:
        start_time = time.time()
        extracted_docs: List[ExtractedDocument] = []

        for doc in documents:
            content: Dict[str, Any] = {}

            # Priority 1: pre-extracted content dict (test-case JSON mode)
            if doc.get("content"):
                content = doc["content"]

            # Priority 2: VerificationAgent already called Gemini (combined classify+extract)
            #             Reuse that result — zero additional API calls needed
            elif doc.get("_gemini_extracted"):
                content = doc["_gemini_extracted"]

            # Priority 3: in-memory bytes from real upload (fallback if Verification skipped)
            elif doc.get("file_bytes") and self.model:
                try:
                    content = self._extract_via_gemini_inline(
                        doc["file_bytes"], doc.get("mime_type", "image/jpeg")
                    )
                except Exception as e:
                    content = {}
                    doc["_extraction_error"] = str(e)

            # Priority 4: legacy file_path approach
            elif doc.get("file_path") and self.model:
                try:
                    content = self._extract_via_gemini_path(doc["file_path"])
                except Exception:
                    content = {}

            patient_name_on_doc = doc.get("patient_name_on_doc") or content.get("patient_name")

            items = [
                ExtractedLineItem(
                    description=item.get("description", ""),
                    amount=float(item.get("amount", 0.0)),
                )
                for item in content.get("line_items", [])
            ]

            # Prefer actual_type set by VerificationAgent (already classified)
            doc_type = doc.get("actual_type") or content.get("document_type", "UNKNOWN")

            extracted_docs.append(ExtractedDocument(
                file_id=doc.get("file_id", "UNKNOWN"),
                file_name=doc.get("file_name", "doc.pdf"),
                document_type=doc_type,
                patient_name=patient_name_on_doc,
                doctor_name=content.get("doctor_name"),
                doctor_registration=content.get("doctor_registration"),
                diagnosis=content.get("diagnosis"),
                treatment=content.get("treatment"),
                line_items=items,
                total_amount=float(content.get("total") or doc.get("claimed_amount") or 0.0),
                quality_status=content.get("quality_status", "GOOD"),
            ))

        # Cross-patient validation
        detected_names = [d.patient_name for d in extracted_docs if d.patient_name]
        unique_names = list(set(detected_names))

        if len(unique_names) > 1:
            elapsed = (time.time() - start_time) * 1000
            msg = f"Patient name mismatch: documents belong to different people: {', '.join(unique_names)}."
            return extracted_docs, msg, AgentTrace(
                agent_name=self.name,
                status="FAILED",
                execution_time_ms=elapsed,
                message=msg,
                errors=["PATIENT_NAME_MISMATCH"],
            )

        if unique_names and expected_patient_name and not self._match_strings(unique_names[0], expected_patient_name):
            elapsed = (time.time() - start_time) * 1000
            msg = (
                f"Patient name on documents ({unique_names[0]}) does not match "
                f"member profile ({expected_patient_name})."
            )
            return extracted_docs, msg, AgentTrace(
                agent_name=self.name,
                status="FAILED",
                execution_time_ms=elapsed,
                message=msg,
                errors=["PATIENT_NAME_MISMATCH_WITH_MEMBER"],
            )

        elapsed = (time.time() - start_time) * 1000
        return extracted_docs, None, AgentTrace(
            agent_name=self.name,
            status="SUCCESS",
            execution_time_ms=elapsed,
            message=f"Extracted {len(extracted_docs)} document(s) with validated name alignment.",
        )

    def _match_strings(self, n1: str, n2: str) -> bool:
        return n1.strip().lower() == n2.strip().lower()
