"""
Tests for AdjudicationAgent — all 8 policy rules.
Run: cd backend && pytest tests/test_adjudication.py -v
"""
import pytest
from datetime import date, timedelta
from src.agents.adjudication import AdjudicationAgent
from src.schemas import ExtractedDocument, ExtractedLineItem

# ── Policy fixture ────────────────────────────────────────────────────────────

POLICY = {
    "coverage": {
        "sum_insured_per_employee": 500000,
        "annual_opd_limit": 50000,
        "per_claim_limit": 5000,
    },
    "opd_categories": {
        "consultation": {
            "sub_limit": 2000, "copay_percent": 10,
            "network_discount_percent": 20, "covered": True,
        },
        "dental": {
            "sub_limit": 10000, "copay_percent": 0, "covered": True,
            "covered_procedures": ["Root Canal Treatment", "Dental Filling", "Dental X-Ray"],
            "excluded_procedures": ["Teeth Whitening", "Bleaching", "Veneers"],
        },
        "diagnostic": {
            "sub_limit": 10000, "copay_percent": 0,
            "network_discount_percent": 10, "covered": True,
            "pre_auth_threshold": 10000,
            "high_value_tests_requiring_pre_auth": ["MRI", "CT Scan"],
        },
    },
    "waiting_periods": {
        "specific_conditions": {
            "diabetes": 90,
            "hypertension": 90,
        }
    },
    "network_hospitals": ["Apollo Hospitals", "Fortis Healthcare"],
    "members": [
        {"member_id": "EMP001", "name": "Rajesh Kumar",  "join_date": "2024-04-01"},
        {"member_id": "EMP005", "name": "Vikram Joshi",  "join_date": "2024-09-01"},
    ],
    "fraud_thresholds": {"same_day_claims_limit": 2},
}


@pytest.fixture
def agent():
    return AdjudicationAgent(POLICY)


def make_doc(**kwargs):
    defaults = dict(
        file_id="D1", file_name="doc.pdf", document_type="PRESCRIPTION",
        total_amount=0.0, quality_status="GOOD", line_items=[],
    )
    defaults.update(kwargs)
    return ExtractedDocument(**defaults)


def base_claim(**kwargs):
    defaults = dict(
        case_id="TEST", member_id="EMP001",
        claim_category="consultation",
        treatment_date="2024-11-01",
        claimed_amount=1500.0,
        hospital_name="",
        pre_authorization_approved=False,
    )
    defaults.update(kwargs)
    return defaults


# ── Rule 1: Category coverage ────────────────────────────────────────────────

def test_uncovered_category_rejected(agent):
    claim = base_claim(claim_category="cosmetic_surgery")
    result, trace = agent.execute(claim, [make_doc()])
    assert result.decision == "REJECTED"
    assert "UNCOVERED_CATEGORY" in result.rejection_reasons


def test_covered_category_passes(agent):
    claim = base_claim(claim_category="consultation", claimed_amount=1000.0)
    result, _ = agent.execute(claim, [make_doc(diagnosis="Viral Fever")])
    assert result.decision == "APPROVED"


# ── Rule 2: Excluded diagnosis ────────────────────────────────────────────────

def test_obesity_diagnosis_rejected(agent):
    doc = make_doc(diagnosis="Morbid Obesity — BMI 37")
    result, _ = agent.execute(base_claim(), [doc])
    assert result.decision == "REJECTED"
    assert "EXCLUDED_CONDITION" in result.rejection_reasons


def test_bariatric_diagnosis_rejected(agent):
    doc = make_doc(diagnosis="Bariatric Consultation")
    result, _ = agent.execute(base_claim(), [doc])
    assert result.decision == "REJECTED"


def test_viral_fever_not_excluded(agent):
    doc = make_doc(diagnosis="Viral Fever")
    result, _ = agent.execute(base_claim(claimed_amount=1000.0), [doc])
    assert result.decision == "APPROVED"


# ── Rule 3: Waiting period ────────────────────────────────────────────────────

def test_diabetes_within_waiting_period_rejected(agent):
    # EMP005 joined 2024-09-01, treatment 2024-10-15 = 44 days < 90
    doc = make_doc(diagnosis="Type 2 Diabetes Mellitus")
    claim = base_claim(member_id="EMP005", treatment_date="2024-10-15")
    result, _ = agent.execute(claim, [doc])
    assert result.decision == "REJECTED"
    assert "WAITING_PERIOD" in result.rejection_reasons
    assert "2024-11-30" in result.notes   # eligibility date


def test_diabetes_after_waiting_period_passes(agent):
    # EMP005 joined 2024-09-01 + 90 days = eligible from 2024-11-30
    doc = make_doc(diagnosis="Type 2 Diabetes Mellitus")
    claim = base_claim(member_id="EMP005", treatment_date="2024-12-01", claimed_amount=1000.0)
    result, _ = agent.execute(claim, [doc])
    assert result.decision == "APPROVED"


# ── Rule 4: Per-claim limit ───────────────────────────────────────────────────

def test_per_claim_limit_exceeded_rejected(agent):
    claim = base_claim(claim_category="consultation", claimed_amount=7500.0)
    result, _ = agent.execute(claim, [make_doc()])
    assert result.decision == "REJECTED"
    assert "PER_CLAIM_EXCEEDED" in result.rejection_reasons
    assert "7,500" in result.notes
    assert "5,000" in result.notes


def test_within_per_claim_limit_passes(agent):
    claim = base_claim(claim_category="consultation", claimed_amount=4000.0)
    result, _ = agent.execute(claim, [make_doc(diagnosis="Viral Fever")])
    assert result.decision == "APPROVED"


# ── Rule 5: Pre-authorization (diagnostic MRI) ───────────────────────────────

def test_mri_without_preauth_rejected(agent):
    doc = make_doc(document_type="LAB_REPORT",
                   line_items=[ExtractedLineItem(description="MRI Lumbar Spine", amount=15000)])
    claim = base_claim(claim_category="diagnostic", claimed_amount=15000.0,
                       pre_authorization_approved=False)
    result, _ = agent.execute(claim, [doc])
    assert result.decision == "REJECTED"
    assert "PRE_AUTH_MISSING" in result.rejection_reasons


def test_mri_with_preauth_passes(agent):
    doc = make_doc(document_type="LAB_REPORT",
                   line_items=[ExtractedLineItem(description="MRI Lumbar Spine", amount=15000)])
    claim = base_claim(claim_category="diagnostic", claimed_amount=15000.0,
                       pre_authorization_approved=True)
    result, _ = agent.execute(claim, [doc])
    assert result.decision == "APPROVED"


# ── Rule 6: Dental cosmetic exclusion → PARTIAL ──────────────────────────────

def test_dental_partial_approval_excludes_whitening(agent):
    items = [
        ExtractedLineItem(description="Root Canal Treatment", amount=8000),
        ExtractedLineItem(description="Teeth Whitening", amount=4000),
    ]
    doc = make_doc(document_type="HOSPITAL_BILL", line_items=items, total_amount=12000)
    claim = base_claim(claim_category="dental", claimed_amount=12000.0)
    result, _ = agent.execute(claim, [doc])

    assert result.decision == "PARTIAL"
    assert result.approved_amount == 8000.0
    assert "Teeth Whitening" in result.notes
    assert "cosmetic" in result.notes.lower()


# ── Rule 7: Network discount + co-pay order ───────────────────────────────────

def test_network_discount_applied_before_copay(agent):
    # Apollo: 20% discount, then 10% co-pay
    claim = base_claim(claimed_amount=4500.0, hospital_name="Apollo Hospitals")
    result, _ = agent.execute(claim, [make_doc(diagnosis="Viral Fever")])

    assert result.decision == "APPROVED"
    assert result.approved_amount == pytest.approx(3240.0, abs=0.01)
    bd = result.breakdown
    assert bd.network_discount_applied == pytest.approx(900.0)   # 20% of 4500
    assert bd.amount_after_discount    == pytest.approx(3600.0)
    assert bd.copay_deducted           == pytest.approx(360.0)   # 10% of 3600 (not 4500)


def test_non_network_no_discount(agent):
    claim = base_claim(claimed_amount=1500.0, hospital_name="Random Clinic")
    result, _ = agent.execute(claim, [make_doc(diagnosis="Fever")])

    assert result.decision == "APPROVED"
    assert result.breakdown.network_discount_applied == 0.0
    assert result.approved_amount == pytest.approx(1350.0)   # only 10% co-pay


# ── Trace audit trail ─────────────────────────────────────────────────────────

def test_adjudication_trace_contains_rule_lines(agent):
    claim = base_claim(claimed_amount=1000.0)
    result, trace = agent.execute(claim, [make_doc(diagnosis="Viral Fever")])

    assert trace.agent_name == "AdjudicationAgent"
    assert trace.status == "SUCCESS"
    rule_lines = " ".join(trace.warnings)
    assert "RULE category_covered" in rule_lines
    assert "RULE per_claim_limit" in rule_lines
    assert "RULE copay" in rule_lines
