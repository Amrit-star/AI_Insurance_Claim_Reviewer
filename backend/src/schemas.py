from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import date

class ExtractedLineItem(BaseModel):
    description: str = Field(..., description="Billed item or procedure name")
    amount: float = Field(..., description="Cost of the individual item")
    is_covered: bool = Field(True, description="Checked against policy guidelines")
    exclusion_reason: Optional[str] = Field(None, description="Set if procedure is excluded")

class ExtractedDocument(BaseModel):
    file_id: str
    file_name: str
    document_type: str
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None
    doctor_registration: Optional[str] = None
    diagnosis: Optional[str] = None
    treatment: Optional[str] = None
    date_of_service: Optional[date] = None
    line_items: List[ExtractedLineItem] = []
    total_amount: float = 0.0
    quality_status: str = "GOOD"

class AgentTrace(BaseModel):
    agent_name: str
    status: str  # SUCCESS, DEGRADED, FAILED
    execution_time_ms: float
    message: str
    warnings: List[str] = []
    errors: List[str] = []

class AdjudicationBreakdown(BaseModel):
    original_claimed_amount: float
    network_discount_applied: float = 0.0
    amount_after_discount: float
    copay_deducted: float = 0.0
    final_approved_amount: float
    applied_rules: List[str] = []

class ClaimAdjudicationResult(BaseModel):
    case_id: str
    decision: Optional[str] = None  # APPROVED, PARTIAL, REJECTED, MANUAL_REVIEW
    approved_amount: Optional[float] = None
    rejection_reasons: List[str] = []
    notes: str = ""
    confidence_score: float = Field(0.0, ge=0.0, le=1.0)
    breakdown: Optional[AdjudicationBreakdown] = None
    agent_traces: List[AgentTrace] = []
