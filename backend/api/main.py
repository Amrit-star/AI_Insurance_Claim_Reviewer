import asyncio
import json
import os
import sys
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

# Load .env from backend/ directory before any agent is instantiated
_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(_env_path)

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.orchestrator import ClaimsOrchestrator
from src.schemas import ClaimAdjudicationResult

app = FastAPI(
    title="Plum Claims Engine API",
    description="Automated multi-agent health claim processing engine.",
    version="2.0"
)

_allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    # Add your Vercel frontend URL here after deploying:
    "https://ai-insurance-claim-reviewer.vercel.app/",
]
# Allow any Vercel preview deployment URL automatically
_vercel_pattern = os.getenv("FRONTEND_URL", "")
if _vercel_pattern:
    _allowed_origins.append(_vercel_pattern)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

POLICY_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "policy_terms.json"
)
try:
    with open(POLICY_PATH, "r", encoding="utf-8") as f:
        policy_config = json.load(f)
except Exception as e:
    policy_config = {}
    print(f"Failed to load policy config: {e}")

orchestrator = ClaimsOrchestrator(policy_config)


def _infer_mime_type(filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    return {
        "pdf": "application/pdf",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }.get(ext, "application/octet-stream")


# ── Existing test-suite endpoint (JSON body) ──────────────────────────────────

class ClaimSubmission(BaseModel):
    case_id: str
    member_id: str
    policy_id: str
    claim_category: str
    treatment_date: str
    claimed_amount: float
    simulate_component_failure: bool = False
    documents: List[Dict[str, Any]] = []
    claims_history: List[Dict[str, Any]] = []
    hospital_name: str = ""
    pre_authorization_approved: bool = False


@app.post(
    "/api/v1/claims/process",
    response_model=ClaimAdjudicationResult,
    status_code=status.HTTP_200_OK,
    summary="Adjudicate claim from test-case JSON payload",
)
async def process_claim(payload: ClaimSubmission):
    try:
        data = payload.model_dump()
        result = await asyncio.to_thread(orchestrator.process_claim, data)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal claims orchestration error: {str(e)}",
        )


# ── New real-document upload endpoint (multipart/form-data) ───────────────────

@app.post(
    "/api/v1/claims/submit",
    response_model=ClaimAdjudicationResult,
    status_code=status.HTTP_200_OK,
    summary="Submit a live claim with uploaded documents (images / PDFs)",
)
async def submit_claim(
    member_id: str = Form(...),
    policy_id: str = Form(...),
    claim_category: str = Form(...),
    treatment_date: str = Form(...),
    claimed_amount: float = Form(...),
    hospital_name: str = Form(""),
    pre_authorization_approved: bool = Form(False),
    documents: List[UploadFile] = File(...),
):
    try:
        doc_list = []
        for i, upload in enumerate(documents):
            file_bytes = await upload.read()
            mime_type = upload.content_type or _infer_mime_type(upload.filename or "")
            # Correct generic browser content-type for common extensions
            if mime_type in ("application/octet-stream", "") and upload.filename:
                mime_type = _infer_mime_type(upload.filename)
            doc_list.append({
                "file_id": f"upload_{i}",
                "file_name": upload.filename or f"document_{i}",
                "file_bytes": file_bytes,   # raw bytes — passed in-memory, never stored
                "mime_type": mime_type,
            })

        case_id = f"LIVE_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        claim_data = {
            "case_id": case_id,
            "member_id": member_id,
            "policy_id": policy_id,
            "claim_category": claim_category,
            "treatment_date": treatment_date,
            "claimed_amount": claimed_amount,
            "hospital_name": hospital_name,
            "pre_authorization_approved": pre_authorization_approved,
            "documents": doc_list,
            "claims_history": [],
            "simulate_component_failure": False,
        }
        # Run synchronous pipeline in a thread so the async event loop isn't blocked
        result = await asyncio.to_thread(orchestrator.process_claim, claim_data)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Claim submission error: {str(e)}",
        )


# ── Members list (for frontend dropdown) ─────────────────────────────────────

@app.get("/api/v1/members", status_code=status.HTTP_200_OK, summary="List all policy members")
async def list_members():
    members = policy_config.get("members", [])
    return [
        {"member_id": m["member_id"], "name": m["name"], "relationship": m.get("relationship", "")}
        for m in members
    ]


# ── Network hospitals list (for frontend datalist) ────────────────────────────

@app.get("/api/v1/hospitals", status_code=status.HTTP_200_OK, summary="List network hospitals")
async def list_hospitals():
    return policy_config.get("network_hospitals", [])


# ── Policy summary (for UI stats ribbon) ─────────────────────────────────────

@app.get("/api/v1/policy/summary", status_code=status.HTTP_200_OK, summary="Policy key stats for UI")
async def policy_summary():
    coverage     = policy_config.get("coverage", {})
    holder       = policy_config.get("policy_holder", {})
    opd_cats     = policy_config.get("opd_categories", {})
    doc_reqs     = policy_config.get("document_requirements", {})

    # Human-readable display labels — stored here so frontend has zero hardcoded text
    _display_labels = {
        "consultation":         "Consultation (OPD)",
        "diagnostic":           "Diagnostic / Lab Tests",
        "pharmacy":             "Pharmacy",
        "dental":               "Dental",
        "vision":               "Vision / Eye Care",
        "alternative_medicine": "Alternative Medicine",
    }

    # Build category list from policy (only covered ones, using display labels above)
    categories = [
        {
            "value": key,
            "label": _display_labels.get(key, key.replace("_", " ").title()),
            "pre_auth_threshold": rules.get("pre_auth_threshold"),
            "high_value_tests":   rules.get("high_value_tests_requiring_pre_auth", []),
        }
        for key, rules in opd_cats.items()
        if rules.get("covered", True)
    ]

    # Build required docs map keyed by lowercase category value
    required_docs = {
        key.lower(): reqs.get("required", [])
        for key, reqs in doc_reqs.items()
    }

    # Human-readable labels for document type codes used throughout the system
    doc_type_labels = {
        "PRESCRIPTION":      "Prescription",
        "HOSPITAL_BILL":     "Hospital Bill",
        "LAB_REPORT":        "Lab Report",
        "PHARMACY_BILL":     "Pharmacy Bill",
        "DIAGNOSTIC_REPORT": "Diagnostic Report",
        "DISCHARGE_SUMMARY": "Discharge Summary",
        "DENTAL_REPORT":     "Dental Report",
    }

    return {
        "policy_id":              policy_config.get("policy_id", "—"),
        "policy_name":            policy_config.get("policy_name", "—"),
        "insurer":                policy_config.get("insurer", "—"),
        "sum_insured":            coverage.get("sum_insured_per_employee", 0),
        "annual_opd_limit":       coverage.get("annual_opd_limit", 0),
        "per_claim_limit":        coverage.get("per_claim_limit", 0),
        "employee_count":         holder.get("employee_count", 0),
        "network_hospital_count": len(policy_config.get("network_hospitals", [])),
        "renewal_status":         holder.get("renewal_status", "UNKNOWN"),
        "policy_end_date":        holder.get("policy_end_date", ""),
        "categories":             categories,
        "required_docs":          required_docs,
        "doc_type_labels":        doc_type_labels,
    }


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", status_code=status.HTTP_200_OK)
async def health():
    return {"status": "ACTIVE", "policy_loaded": policy_config.get("policy_id")}
