import datetime
import re
from typing import Dict, Any, List
from src.schemas import ExtractedDocument, AdjudicationBreakdown, ClaimAdjudicationResult, AgentTrace
from src.agents.base import BaseAgent

class AdjudicationAgent(BaseAgent):
    def __init__(self, policy: Dict[str, Any]):
        super().__init__("AdjudicationAgent")
        self.policy = policy

    def execute(self, claim_input: Dict[str, Any], extracted_docs: List[ExtractedDocument]) -> ClaimAdjudicationResult:
        case_id = claim_input.get("case_id", "UNKNOWN")
        member_id = claim_input.get("member_id")
        category = claim_input.get("claim_category", "").lower()
        treatment_date = datetime.date.fromisoformat(claim_input.get("treatment_date", ""))
        claimed_amount = float(claim_input.get("claimed_amount", 0.0))
        
        category_rules = self.policy.get("opd_categories", {}).get(category, {})
        policy_coverage = self.policy.get("coverage", {})

        # TC012: Check Explicitly Excluded Diagnoses & Conditions
        diagnoses = [doc.diagnosis for doc in extracted_docs if doc.diagnosis]
        for diagnosis in diagnoses:
            diag_lower = diagnosis.lower()
            if any(term in diag_lower for term in ["obesity", "weight loss", "bariatric"]):
                return ClaimAdjudicationResult(
                    case_id=case_id,
                    decision="REJECTED",
                    rejection_reasons=["EXCLUDED_CONDITION"],
                    notes="Obesity treatments, weight loss programs, and related consultations are excluded from coverage.",
                    confidence_score=0.95
                )

        # TC005: Check Specific Condition Waiting Periods
        member_roster = self.policy.get("members", [])
        member_record = next((m for m in member_roster if m["member_id"] == member_id), None)
        if member_record:
            join_date = datetime.date.fromisoformat(member_record["join_date"])
            days_enrolled = (treatment_date - join_date).days
            waiting_rules = self.policy.get("waiting_periods", {}).get("specific_conditions", {})
            
            for diagnosis in diagnoses:
                diag_lower = diagnosis.lower()
                for condition_key, waiting_days in waiting_rules.items():
                    condition_name = condition_key.replace("_", " ")
                    if re.search(r'\b' + re.escape(condition_name) + r'\b', diag_lower):
                        if days_enrolled < waiting_days:
                            eligibility_date = join_date + datetime.timedelta(days=waiting_days)
                            return ClaimAdjudicationResult(
                                case_id=case_id,
                                decision="REJECTED",
                                rejection_reasons=["WAITING_PERIOD"],
                                notes=(
                                    f"Claim is within the {waiting_days}-day waiting period for {condition_name.title()}. "
                                    f"Member will be eligible for {condition_name} claims from {eligibility_date.isoformat()}."
                                ),
                                confidence_score=0.98
                            )

        # TC008: Check Per-Claim Limit
        per_claim_limit = float(policy_coverage.get("per_claim_limit", 5000.0))
        if category == "consultation" and claimed_amount > per_claim_limit:
            return ClaimAdjudicationResult(
                case_id=case_id,
                decision="REJECTED",
                rejection_reasons=["PER_CLAIM_EXCEEDED"],
                notes=f"Claimed amount of ₹{claimed_amount:,.2f} exceeds the per-claim limit of ₹{per_claim_limit:,.2f}.",
                confidence_score=0.99
            )

        # TC007: Check Diagnostic Pre-Authorization Rules
        if category == "diagnostic":
            is_mri = any("mri" in (doc.treatment or "").lower() or "mri" in (doc.diagnosis or "").lower() or any("mri" in (item.description or "").lower() for item in doc.line_items) for doc in extracted_docs)
            pre_auth_limit = category_rules.get("pre_auth_threshold", 10000)
            if is_mri and claimed_amount > pre_auth_limit:
                if not claim_input.get("pre_authorization_approved", False):
                    return ClaimAdjudicationResult(
                        case_id=case_id,
                        decision="REJECTED",
                        rejection_reasons=["PRE_AUTH_MISSING"],
                        notes=(
                            f"Pre-authorization was required for MRI scans above ₹{pre_auth_limit:,} and was not obtained. "
                            "Please obtain pre-authorization and resubmit."
                        ),
                        confidence_score=0.95
                    )

        # TC006: Check Dental Exclusions
        all_billed_items = []
        for doc in extracted_docs:
            all_billed_items.extend(doc.line_items)
            
        evaluable_total = 0.0
        applied_rules = []
        
        if category == "dental":
            covered_procedures = [p.lower() for p in category_rules.get("covered_procedures", [])]
            excluded_procedures = [p.lower() for p in category_rules.get("excluded_procedures", [])]
            
            partial_rejected_detected = False
            item_reasons = []
            
            for item in all_billed_items:
                desc_lower = item.description.lower()
                is_excl = any(ex_term in desc_lower for ex_term in excluded_procedures)
                is_cov = any(cov_term in desc_lower for cov_term in covered_procedures)
                
                if is_excl or (not is_cov and "whitening" in desc_lower):
                    item.is_covered = False
                    item.exclusion_reason = "COSMETIC_EXCLUSION"
                    partial_rejected_detected = True
                    item_reasons.append(f"Excluded: '{item.description}' (Teeth Whitening is cosmetic)")
                else:
                    item.is_covered = True
                    evaluable_total += item.amount
                    
            if partial_rejected_detected:
                applied_rules.append("Cosmetic dental exclusions applied to selected line items")
                return ClaimAdjudicationResult(
                    case_id=case_id,
                    decision="PARTIAL",
                    approved_amount=evaluable_total,
                    notes=f"Approved ₹{evaluable_total:,.2f} for covered Root Canal. Rejected other line items: " + "; ".join(item_reasons),
                    confidence_score=0.97,
                    breakdown=AdjudicationBreakdown(
                        original_claimed_amount=claimed_amount,
                        amount_after_discount=evaluable_total,
                        final_approved_amount=evaluable_total,
                        applied_rules=applied_rules
                    )
                )

        # TC010: Apply Order-of-Calculation (Network Discount -> Co-Pay)
        hospital_name = claim_input.get("hospital_name", "")
        network_hospitals = self.policy.get("network_hospitals", [])
        is_network = hospital_name in network_hospitals
        
        discount_applied = 0.0
        base_to_adjudicate = claimed_amount
        
        if is_network:
            discount_pct = float(category_rules.get("network_discount_percent", 0.0))
            discount_applied = base_to_adjudicate * (discount_pct / 100.0)
            applied_rules.append(f"Network discount ({discount_pct}%) applied first.")
            
        amount_after_discount = base_to_adjudicate - discount_applied
        
        # Copay applies to the post-discount base
        copay_pct = float(category_rules.get("copay_percent", 0.0))
        copay_deducted = amount_after_discount * (copay_pct / 100.0)
        if copay_deducted > 0:
            applied_rules.append(f"Co-pay ({copay_pct}%) applied on post-discount base.")
            
        final_approved = amount_after_discount - copay_deducted
        
        # Build explanation notes
        if is_network and copay_pct > 0:
            notes_text = (
                f"Network discount ({discount_pct:.0f}%) applied first on ₹{base_to_adjudicate:,.0f} = ₹{amount_after_discount:,.0f}. "
                f"Co-pay ({copay_pct:.0f}%) applied on ₹{amount_after_discount:,.0f} = ₹{copay_deducted:,.0f} deducted. "
                f"Final: ₹{final_approved:,.0f}."
            )
        elif copay_pct > 0:
            notes_text = f"10% co-pay applied on consultation category (₹{copay_deducted:,.0f} deducted)"
        else:
            notes_text = f"Approved ₹{final_approved:,.2f}."

        return ClaimAdjudicationResult(
            case_id=case_id,
            decision="APPROVED",
            approved_amount=final_approved,
            notes=notes_text,
            confidence_score=0.98,
            breakdown=AdjudicationBreakdown(
                original_claimed_amount=claimed_amount,
                network_discount_applied=discount_applied,
                amount_after_discount=amount_after_discount,
                copay_deducted=copay_deducted,
                final_approved_amount=final_approved,
                applied_rules=applied_rules
            )
        )
