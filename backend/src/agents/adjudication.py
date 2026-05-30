import datetime
import re
import time
from typing import Dict, Any, List, Tuple
from src.schemas import (
    ExtractedDocument, AdjudicationBreakdown,
    ClaimAdjudicationResult, AgentTrace,
)
from src.agents.base import BaseAgent


class AdjudicationAgent(BaseAgent):
    def __init__(self, policy: Dict[str, Any]):
        super().__init__("AdjudicationAgent")
        self.policy = policy

    # ── helpers ──────────────────────────────────────────────────────────────

    def _build_trace(self, checks: List[str], status: str, decision: str, elapsed: float) -> AgentTrace:
        return AgentTrace(
            agent_name=self.name,
            status=status,
            execution_time_ms=elapsed,
            message=f"Decision: {decision}. Rules evaluated: {len(checks)}.",
            warnings=checks,          # each check line is surfaced as a trace warning
        )

    # ── main entry point ─────────────────────────────────────────────────────

    def execute(
        self,
        claim_input: Dict[str, Any],
        extracted_docs: List[ExtractedDocument],
    ) -> Tuple[ClaimAdjudicationResult, AgentTrace]:
        t0 = time.time()
        checks: List[str] = []   # audit trail of every rule evaluated

        case_id         = claim_input.get("case_id", "UNKNOWN")
        member_id       = claim_input.get("member_id")
        category        = claim_input.get("claim_category", "").lower()
        claimed_amount  = float(claim_input.get("claimed_amount", 0.0))
        hospital_name   = claim_input.get("hospital_name", "")

        try:
            treatment_date = datetime.date.fromisoformat(claim_input.get("treatment_date", ""))
        except (ValueError, TypeError):
            elapsed = (time.time() - t0) * 1000
            result = ClaimAdjudicationResult(
                case_id=case_id,
                decision="MANUAL_REVIEW",
                notes="Invalid or missing treatment_date. Manual review required.",
                confidence_score=0.50,
            )
            return result, self._build_trace(["PARSE_ERROR: treatment_date invalid"], "FAILED", "MANUAL_REVIEW", elapsed)

        category_rules  = self.policy.get("opd_categories", {}).get(category, {})
        policy_coverage = self.policy.get("coverage", {})

        # ── Rule 1: Category coverage check ──────────────────────────────────
        if not category_rules:
            checks.append(f"RULE category_exists: FAIL — '{category}' not found in policy opd_categories")
            elapsed = (time.time() - t0) * 1000
            result = ClaimAdjudicationResult(
                case_id=case_id,
                decision="REJECTED",
                rejection_reasons=["UNCOVERED_CATEGORY"],
                notes=f"The claim category '{category}' is not covered under this policy.",
                confidence_score=0.97,
            )
            return result, self._build_trace(checks, "SUCCESS", "REJECTED", elapsed)

        if not category_rules.get("covered", True):
            checks.append(f"RULE category_covered: FAIL — '{category}' is marked covered=false")
            elapsed = (time.time() - t0) * 1000
            result = ClaimAdjudicationResult(
                case_id=case_id,
                decision="REJECTED",
                rejection_reasons=["UNCOVERED_CATEGORY"],
                notes=f"The claim category '{category}' is not covered under this policy.",
                confidence_score=0.97,
            )
            return result, self._build_trace(checks, "SUCCESS", "REJECTED", elapsed)
        checks.append(f"RULE category_covered: PASS — '{category}' is a covered category")

        # ── Rule 1b: Annual OPD limit check ──────────────────────────────────
        annual_opd_limit = float(policy_coverage.get("annual_opd_limit", 50000.0))
        ytd_spent        = float(claim_input.get("ytd_claims_amount", 0.0))
        if ytd_spent > 0 and (ytd_spent + claimed_amount) > annual_opd_limit:
            remaining = max(0.0, annual_opd_limit - ytd_spent)
            checks.append(
                f"RULE annual_opd_limit: FAIL — YTD ₹{ytd_spent:,.0f} + claimed ₹{claimed_amount:,.0f} "
                f"> annual limit ₹{annual_opd_limit:,.0f}. Remaining: ₹{remaining:,.0f}"
            )
            elapsed = (time.time() - t0) * 1000
            result = ClaimAdjudicationResult(
                case_id=case_id,
                decision="PARTIAL" if remaining > 0 else "REJECTED",
                approved_amount=remaining if remaining > 0 else None,
                rejection_reasons=["ANNUAL_OPD_LIMIT_EXCEEDED"],
                notes=(
                    f"Annual OPD limit of ₹{annual_opd_limit:,.0f} reached. "
                    f"YTD spend: ₹{ytd_spent:,.0f}. "
                    + (f"Remaining balance ₹{remaining:,.0f} approved." if remaining > 0
                       else "No OPD balance remaining for this policy year.")
                ),
                confidence_score=0.99,
            )
            return result, self._build_trace(checks, "SUCCESS", result.decision, elapsed)
        checks.append(
            f"RULE annual_opd_limit: PASS — YTD ₹{ytd_spent:,.0f} + ₹{claimed_amount:,.0f} "
            f"≤ annual limit ₹{annual_opd_limit:,.0f}"
        )

        # ── Rule 2: Excluded diagnoses ────────────────────────────────────────
        diagnoses = [doc.diagnosis for doc in extracted_docs if doc.diagnosis]
        for diagnosis in diagnoses:
            diag_lower = diagnosis.lower()
            if any(term in diag_lower for term in ["obesity", "weight loss", "bariatric"]):
                checks.append(f"RULE excluded_diagnosis: FAIL — '{diagnosis}' is an excluded condition")
                elapsed = (time.time() - t0) * 1000
                result = ClaimAdjudicationResult(
                    case_id=case_id,
                    decision="REJECTED",
                    rejection_reasons=["EXCLUDED_CONDITION"],
                    notes="Obesity treatments, weight-loss programmes, and bariatric consultations are excluded under this policy.",
                    confidence_score=0.97,
                )
                return result, self._build_trace(checks, "SUCCESS", "REJECTED", elapsed)
        checks.append(f"RULE excluded_diagnosis: PASS — diagnoses checked: {diagnoses or ['(none extracted)']}")

        # ── Rule 3: Waiting period ────────────────────────────────────────────
        member_roster  = self.policy.get("members", [])
        member_record  = next((m for m in member_roster if m["member_id"] == member_id), None)
        if member_record:
            try:
                join_date    = datetime.date.fromisoformat(member_record["join_date"])
                days_enrolled = (treatment_date - join_date).days
                waiting_rules = self.policy.get("waiting_periods", {}).get("specific_conditions", {})
                for diagnosis in diagnoses:
                    diag_lower = diagnosis.lower()
                    for condition_key, waiting_days in waiting_rules.items():
                        condition_name = condition_key.replace("_", " ")
                        if re.search(r'\b' + re.escape(condition_name) + r'\b', diag_lower):
                            checks.append(
                                f"RULE waiting_period: checking '{condition_name}' — "
                                f"enrolled {days_enrolled} days, required {waiting_days}"
                            )
                            if days_enrolled < waiting_days:
                                eligibility_date = join_date + datetime.timedelta(days=waiting_days)
                                checks.append(f"RULE waiting_period: FAIL — within waiting period until {eligibility_date}")
                                elapsed = (time.time() - t0) * 1000
                                result = ClaimAdjudicationResult(
                                    case_id=case_id,
                                    decision="REJECTED",
                                    rejection_reasons=["WAITING_PERIOD"],
                                    notes=(
                                        f"Claim is within the {waiting_days}-day waiting period for "
                                        f"{condition_name.title()}. Member will be eligible from "
                                        f"{eligibility_date.isoformat()}."
                                    ),
                                    confidence_score=0.98,
                                )
                                return result, self._build_trace(checks, "SUCCESS", "REJECTED", elapsed)
                            else:
                                checks.append(f"RULE waiting_period: PASS — waiting period satisfied for '{condition_name}'")
                checks.append(f"RULE waiting_period: PASS — member enrolled {days_enrolled} days, all conditions clear")
            except (KeyError, ValueError) as e:
                checks.append(f"RULE waiting_period: SKIP — could not parse member join_date ({e})")
        else:
            checks.append(f"RULE waiting_period: SKIP — member {member_id} not found in roster")

        # ── Rule 4: Per-claim limit ───────────────────────────────────────────
        per_claim_limit = float(policy_coverage.get("per_claim_limit", 5000.0))
        if category == "consultation" and claimed_amount > per_claim_limit:
            checks.append(f"RULE per_claim_limit: FAIL — ₹{claimed_amount:,.0f} > limit ₹{per_claim_limit:,.0f}")
            elapsed = (time.time() - t0) * 1000
            result = ClaimAdjudicationResult(
                case_id=case_id,
                decision="REJECTED",
                rejection_reasons=["PER_CLAIM_EXCEEDED"],
                notes=f"Claimed amount ₹{claimed_amount:,.2f} exceeds the per-claim limit of ₹{per_claim_limit:,.2f}.",
                confidence_score=0.99,
            )
            return result, self._build_trace(checks, "SUCCESS", "REJECTED", elapsed)
        checks.append(f"RULE per_claim_limit: PASS — ₹{claimed_amount:,.0f} ≤ ₹{per_claim_limit:,.0f}")

        # ── Rule 5: Diagnostic pre-authorisation ─────────────────────────────
        if category == "diagnostic":
            is_mri = any(
                "mri" in (doc.treatment or "").lower()
                or "mri" in (doc.diagnosis or "").lower()
                or any("mri" in (item.description or "").lower() for item in (doc.line_items or []))
                for doc in extracted_docs
            )
            pre_auth_limit = float(category_rules.get("pre_auth_threshold", 10000))
            checks.append(f"RULE pre_auth: MRI detected={is_mri}, amount=₹{claimed_amount:,.0f}, threshold=₹{pre_auth_limit:,.0f}")
            if is_mri and claimed_amount > pre_auth_limit:
                pre_auth_obtained = claim_input.get("pre_authorization_approved", False)
                checks.append(f"RULE pre_auth: pre_authorization_approved={pre_auth_obtained}")
                if not pre_auth_obtained:
                    checks.append("RULE pre_auth: FAIL — MRI above threshold without pre-authorization")
                    elapsed = (time.time() - t0) * 1000
                    result = ClaimAdjudicationResult(
                        case_id=case_id,
                        decision="REJECTED",
                        rejection_reasons=["PRE_AUTH_MISSING"],
                        notes=(
                            f"Pre-authorization was required for this MRI scan (amount ₹{claimed_amount:,.0f} "
                            f"> threshold ₹{pre_auth_limit:,.0f}) but was not obtained. "
                            "Please obtain pre-authorization from Plum and resubmit."
                        ),
                        confidence_score=0.97,
                    )
                    return result, self._build_trace(checks, "SUCCESS", "REJECTED", elapsed)
                else:
                    checks.append("RULE pre_auth: PASS — pre-authorization confirmed")
            else:
                checks.append("RULE pre_auth: PASS — not applicable")

        # ── Rule 6: Dental line-item exclusions ───────────────────────────────
        all_items = [item for doc in extracted_docs for item in (doc.line_items or [])]
        evaluable_total = 0.0
        applied_rules:  List[str] = []

        if category == "dental":
            covered_procedures  = [p.lower() for p in category_rules.get("covered_procedures", [])]
            excluded_procedures = [p.lower() for p in category_rules.get("excluded_procedures", [])]
            partial_detected    = False
            exclusion_details:  List[str] = []
            checks.append(f"RULE dental_exclusions: evaluating {len(all_items)} line item(s)")

            for item in all_items:
                desc_lower = item.description.lower() if item.description else ""
                is_excl    = any(ex in desc_lower for ex in excluded_procedures)
                if is_excl:
                    item.is_covered     = False
                    item.exclusion_reason = "COSMETIC_EXCLUSION"
                    partial_detected    = True
                    exclusion_details.append(f"'{item.description}' excluded (cosmetic)")
                    checks.append(f"RULE dental_exclusions: EXCLUDED — {item.description}")
                else:
                    item.is_covered = True
                    evaluable_total += item.amount
                    checks.append(f"RULE dental_exclusions: COVERED — {item.description} ₹{item.amount:,.0f}")

            if partial_detected:
                applied_rules.append("Cosmetic dental exclusions applied")
                elapsed = (time.time() - t0) * 1000
                result = ClaimAdjudicationResult(
                    case_id=case_id,
                    decision="PARTIAL",
                    approved_amount=evaluable_total,
                    notes=(
                        f"Approved ₹{evaluable_total:,.2f} for covered dental procedures. "
                        "Excluded: " + "; ".join(exclusion_details)
                    ),
                    confidence_score=0.97,
                    breakdown=AdjudicationBreakdown(
                        original_claimed_amount=claimed_amount,
                        amount_after_discount=evaluable_total,
                        final_approved_amount=evaluable_total,
                        applied_rules=applied_rules,
                    ),
                )
                return result, self._build_trace(checks, "SUCCESS", "PARTIAL", elapsed)

        # ── Rule 7: Network discount then co-pay ──────────────────────────────
        network_hospitals = self.policy.get("network_hospitals", [])
        is_network        = hospital_name in network_hospitals
        checks.append(f"RULE network_hospital: hospital='{hospital_name or '(not provided)'}', in_network={is_network}")

        base              = claimed_amount
        discount_pct      = float(category_rules.get("network_discount_percent", 0.0)) if is_network else 0.0
        discount_applied  = base * (discount_pct / 100.0)
        if discount_applied > 0:
            applied_rules.append(f"Network discount ({discount_pct:.0f}%) applied first on ₹{base:,.0f}")
            checks.append(f"RULE network_discount: APPLIED — {discount_pct:.0f}% → ₹{discount_applied:,.0f} off")
        else:
            checks.append("RULE network_discount: SKIP — non-network or discount=0")

        amount_after_discount = base - discount_applied
        copay_pct    = float(category_rules.get("copay_percent", 0.0))
        copay_deducted = amount_after_discount * (copay_pct / 100.0)
        if copay_deducted > 0:
            applied_rules.append(f"Co-pay ({copay_pct:.0f}%) applied on post-discount base ₹{amount_after_discount:,.0f}")
            checks.append(f"RULE copay: APPLIED — {copay_pct:.0f}% → ₹{copay_deducted:,.0f} deducted")
        else:
            checks.append("RULE copay: SKIP — co-pay=0 for this category")

        final_approved = amount_after_discount - copay_deducted

        # Build human-readable notes
        if is_network and copay_pct > 0:
            notes_text = (
                f"Network discount ({discount_pct:.0f}%) applied on ₹{base:,.0f} = ₹{amount_after_discount:,.0f}. "
                f"Co-pay ({copay_pct:.0f}%) applied on ₹{amount_after_discount:,.0f} = ₹{copay_deducted:,.0f} deducted. "
                f"Final approved: ₹{final_approved:,.0f}."
            )
        elif copay_pct > 0:
            notes_text = (
                f"{copay_pct:.0f}% co-pay applied (₹{copay_deducted:,.0f} deducted). "
                f"Final approved: ₹{final_approved:,.0f}."
            )
        elif is_network:
            notes_text = (
                f"Network discount ({discount_pct:.0f}%) applied. "
                f"Final approved: ₹{final_approved:,.0f}."
            )
        else:
            notes_text = f"Approved ₹{final_approved:,.2f}."

        checks.append(f"RULE final_calculation: COMPLETE — approved ₹{final_approved:,.2f}")
        elapsed = (time.time() - t0) * 1000

        result = ClaimAdjudicationResult(
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
                applied_rules=applied_rules,
            ),
        )
        return result, self._build_trace(checks, "SUCCESS", "APPROVED", elapsed)
