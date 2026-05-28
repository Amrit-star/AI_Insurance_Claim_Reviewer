import json
import os
import sys
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List

# Setup system paths for clean module imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.orchestrator import ClaimsOrchestrator
from src.schemas import ClaimAdjudicationResult

app = FastAPI(
    title="Plum Claims Engine API",
    description="Automated multi-agent health claim processing engine.",
    version="2.0"
)

# CORS mapping configuration for local Vite UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load rules dynamically
POLICY_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "policy_terms.json")
try:
    with open(POLICY_PATH, "r", encoding="utf-8") as f:
        policy_config = json.load(f)
except Exception as e:
    policy_config = {}
    print(f"Failed to load policy config: {e}")

orchestrator = ClaimsOrchestrator(policy_config)

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
    summary="Adjudicate incoming medical claim"
)
async def process_claim(payload: ClaimSubmission):
    try:
        data = payload.model_dump()
        result = orchestrator.process_claim(data)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal claims orchestration error: {str(e)}"
        )

@app.get("/health", status_code=status.HTTP_200_OK)
async def health():
    return {"status": "ACTIVE", "policy_loaded": policy_config.get("policy_id")}
