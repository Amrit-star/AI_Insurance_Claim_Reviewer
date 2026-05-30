import time
from typing import Dict, Any, List
from src.schemas import ClaimAdjudicationResult, AgentTrace, ExtractedDocument
from src.agents.verification import VerificationAgent
from src.agents.extraction import ExtractionAgent
from src.agents.adjudication import AdjudicationAgent


class ClaimsOrchestrator:
    def __init__(self, policy: Dict[str, Any]):
        self.policy = policy
        self.verification_agent = VerificationAgent(policy)
        self.extraction_agent   = ExtractionAgent()
        self.adjudication_agent = AdjudicationAgent(policy)

    def process_claim(self, claim_input: Dict[str, Any]) -> ClaimAdjudicationResult:
        traces:           List[AgentTrace] = []
        confidence_factor = 1.0
        warnings:         List[str] = []

        case_id  = claim_input.get("case_id", "UNKNOWN")
        category = claim_input.get("claim_category", "CONSULTATION")
        documents = claim_input.get("documents", [])

        # ── 1. Document Verification ─────────────────────────────────────────
        try:
            passed, err_msg, ver_trace = self.verification_agent.execute(category, documents)
            traces.append(ver_trace)
            if not passed:
                decision = "MANUAL_REVIEW" if "UNREADABLE" in err_msg else "REJECTED"
                return ClaimAdjudicationResult(
                    case_id=case_id,
                    decision=decision,
                    notes=err_msg,
                    confidence_score=0.97,
                    agent_traces=traces,
                )
        except Exception as e:
            traces.append(AgentTrace(
                agent_name="VerificationAgent",
                status="FAILED",
                execution_time_ms=0.0,
                message=f"Verification system error: {str(e)}",
                errors=["VERIFICATION_SYSTEM_CRASH"],
            ))
            return ClaimAdjudicationResult(
                case_id=case_id,
                decision="MANUAL_REVIEW",
                notes=f"Claim could not be verified due to a system error: {str(e)}",
                confidence_score=0.20,
                agent_traces=traces,
            )

        # ── 2. Information Extraction ────────────────────────────────────────
        extracted_docs: List[ExtractedDocument] = []
        simulate_failure = claim_input.get("simulate_component_failure", False)

        if simulate_failure:
            traces.append(AgentTrace(
                agent_name="ExtractionAgent",
                status="FAILED",
                execution_time_ms=0.12,
                message="Structured parsing system unavailable (simulated failure).",
                errors=["SIMULATED_SYSTEM_CRASH"],
            ))
            warnings.append("Dynamic OCR extraction offline. Falling back to default claim parameters.")
            confidence_factor *= 0.50
            extracted_docs = [ExtractedDocument(
                file_id="FALLBACK",
                file_name="unparsed.pdf",
                document_type="UNKNOWN",
                total_amount=claim_input.get("claimed_amount", 0.0),
                quality_status="POOR",
            )]
        else:
            try:
                member_roster        = self.policy.get("members", [])
                primary_member       = next((m for m in member_roster if m["member_id"] == claim_input.get("member_id")), {})
                expected_patient_name = primary_member.get("name", "")

                docs, mismatch_err, ext_trace = self.extraction_agent.execute(documents, expected_patient_name)
                traces.append(ext_trace)
                extracted_docs = docs

                # Surface per-document extraction errors as clean, user-facing warnings
                for doc in documents:
                    raw_err = doc.get("_extraction_error", "")
                    if raw_err:
                        fname = doc.get("file_name", "document")
                        if "429" in raw_err or "quota" in raw_err.lower() or "rate" in raw_err.lower():
                            msg = f"API rate limit reached while extracting '{fname}'. Proceeding with submitted amount."
                        elif "timeout" in raw_err.lower():
                            msg = f"Extraction timed out for '{fname}'. Proceeding with submitted amount."
                        else:
                            msg = f"Partial extraction for '{fname}'. Some fields may be missing."
                        warnings.append(msg)

                if mismatch_err:
                    return ClaimAdjudicationResult(
                        case_id=case_id,
                        decision="MANUAL_REVIEW",
                        notes=mismatch_err,
                        confidence_score=0.94,
                        agent_traces=traces,
                    )

                # Reduce confidence based on document quality
                poor_docs    = [d for d in extracted_docs if d.quality_status == "POOR"]
                partial_docs = [d for d in extracted_docs if d.quality_status == "PARTIAL"]
                if poor_docs:
                    confidence_factor *= max(0.55, 1.0 - 0.20 * len(poor_docs))
                    warnings.append(
                        f"{len(poor_docs)} document(s) had poor extraction quality "
                        f"({', '.join(d.file_name for d in poor_docs)}). Manual verification recommended."
                    )
                if partial_docs:
                    confidence_factor *= max(0.75, 1.0 - 0.10 * len(partial_docs))
                    warnings.append(
                        f"{len(partial_docs)} document(s) had partial extraction "
                        f"({', '.join(d.file_name for d in partial_docs)})."
                    )

            except Exception as e:
                traces.append(AgentTrace(
                    agent_name="ExtractionAgent",
                    status="FAILED",
                    execution_time_ms=0.0,
                    message=f"Parser crash: {str(e)}",
                    errors=["UNEXPECTED_CRASH"],
                ))
                warnings.append("OCR parsing pipeline crashed. Manual analysis recommended.")
                confidence_factor *= 0.40

        # ── 3. Fraud / Frequency Checks ──────────────────────────────────────
        same_day_claims = claim_input.get("claims_history", [])
        fraud_limit     = self.policy.get("fraud_thresholds", {}).get("same_day_claims_limit", 2)
        if len(same_day_claims) >= fraud_limit:
            traces.append(AgentTrace(
                agent_name="FraudAgent",
                status="SUCCESS",
                execution_time_ms=0.5,
                message=(
                    f"Unusual claim submission density: {len(same_day_claims)} claims detected "
                    f"on the same day (threshold: {fraud_limit})."
                ),
                warnings=[f"Same-day claim count ({len(same_day_claims)}) ≥ policy threshold ({fraud_limit})"],
            ))
            return ClaimAdjudicationResult(
                case_id=case_id,
                decision="MANUAL_REVIEW",
                notes=(
                    f"Flagged for manual review: {len(same_day_claims)} same-day claims detected. "
                    f"Policy threshold is {fraud_limit}."
                ),
                confidence_score=round(0.92 * confidence_factor, 3),
                agent_traces=traces,
            )

        # ── 4. Policy Adjudication ───────────────────────────────────────────
        try:
            t0     = time.time()
            result, adj_trace = self.adjudication_agent.execute(claim_input, extracted_docs)
            adj_trace.execution_time_ms = (time.time() - t0) * 1000
            traces.append(adj_trace)

            result.agent_traces    = traces
            result.confidence_score = round(float(result.confidence_score) * confidence_factor, 3)

            if warnings:
                result.notes += (
                    " | Note: " + "; ".join(warnings)
                    if result.notes else "Note: " + "; ".join(warnings)
                )
                if not result.decision:
                    result.decision = "MANUAL_REVIEW"

            return result

        except Exception as e:
            traces.append(AgentTrace(
                agent_name="AdjudicationAgent",
                status="FAILED",
                execution_time_ms=0.0,
                message=f"Adjudication engine error: {str(e)}",
                errors=["ADJUDICATION_CRASH"],
            ))
            return ClaimAdjudicationResult(
                case_id=case_id,
                decision="MANUAL_REVIEW",
                notes=f"Adjudication engine error: {str(e)}. Manual review required.",
                confidence_score=round(0.10 * confidence_factor, 3),
                agent_traces=traces,
            )
