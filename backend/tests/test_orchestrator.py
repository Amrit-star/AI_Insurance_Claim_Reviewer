"""
Integration tests for ClaimsOrchestrator — full pipeline end-to-end with test-case data.
Run: cd backend && pytest tests/test_orchestrator.py -v
"""
import json, os, pytest
from src.orchestrator import ClaimsOrchestrator

# Load real policy for integration tests
POLICY_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "policy_terms.json")
with open(POLICY_PATH, encoding="utf-8") as f:
    POLICY = json.load(f)

# Load test cases
CASES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "test_cases.json")
with open(CASES_PATH, encoding="utf-8") as f:
    ALL_CASES = {tc["case_id"]: tc for tc in json.load(f)["test_cases"]}


@pytest.fixture(scope="module")
def orch():
    return ClaimsOrchestrator(POLICY)


def run_case(orch, case_id):
    tc = ALL_CASES[case_id]
    payload = tc["input"].copy()
    payload["case_id"] = case_id
    return orch.process_claim(payload)


# ── TC001: Wrong document type ────────────────────────────────────────────────

def test_tc001_wrong_doc_early_stop(orch):
    r = run_case(orch, "TC001")
    assert r.decision in ("REJECTED", "MANUAL_REVIEW")
    assert "HOSPITAL_BILL" in r.notes
    assert len(r.agent_traces) == 1  # only VerificationAgent ran


# ── TC002: Unreadable document ────────────────────────────────────────────────

def test_tc002_unreadable_early_stop(orch):
    r = run_case(orch, "TC002")
    assert r.decision in ("REJECTED", "MANUAL_REVIEW")
    assert "unreadable" in r.notes.lower()
    assert "blurry_bill.jpg" in r.notes


# ── TC003: Different patients ─────────────────────────────────────────────────

def test_tc003_patient_mismatch(orch):
    r = run_case(orch, "TC003")
    assert r.decision == "MANUAL_REVIEW"
    assert "Arjun Mehta" in r.notes or "Rajesh Kumar" in r.notes


# ── TC004: Clean consultation approval ───────────────────────────────────────

def test_tc004_clean_approval(orch):
    r = run_case(orch, "TC004")
    assert r.decision == "APPROVED"
    assert abs(r.approved_amount - 1350.0) < 0.01
    assert r.confidence_score > 0.85


# ── TC005: Waiting period (diabetes) ─────────────────────────────────────────

def test_tc005_waiting_period(orch):
    r = run_case(orch, "TC005")
    assert r.decision == "REJECTED"
    assert any("WAITING_PERIOD" in rr for rr in r.rejection_reasons)
    assert "2024-11-30" in r.notes   # specific eligibility date


# ── TC006: Dental partial approval ───────────────────────────────────────────

def test_tc006_dental_partial(orch):
    r = run_case(orch, "TC006")
    assert r.decision == "PARTIAL"
    assert abs(r.approved_amount - 8000.0) < 0.01
    assert "Teeth Whitening" in r.notes


# ── TC007: MRI pre-auth missing ──────────────────────────────────────────────

def test_tc007_preauth_missing(orch):
    r = run_case(orch, "TC007")
    assert r.decision == "REJECTED"
    assert any("PRE_AUTH_MISSING" in rr for rr in r.rejection_reasons)
    assert "resubmit" in r.notes.lower()


# ── TC008: Per-claim limit exceeded ──────────────────────────────────────────

def test_tc008_per_claim_limit(orch):
    r = run_case(orch, "TC008")
    assert r.decision == "REJECTED"
    assert any("PER_CLAIM_EXCEEDED" in rr for rr in r.rejection_reasons)
    assert "7,500" in r.notes
    assert "5,000" in r.notes


# ── TC009: Fraud — multiple same-day claims ───────────────────────────────────

def test_tc009_fraud_same_day(orch):
    r = run_case(orch, "TC009")
    assert r.decision == "MANUAL_REVIEW"
    assert "same-day" in r.notes.lower() or "3" in r.notes


# ── TC010: Network hospital discount ─────────────────────────────────────────

def test_tc010_network_discount(orch):
    r = run_case(orch, "TC010")
    assert r.decision == "APPROVED"
    assert abs(r.approved_amount - 3240.0) < 0.01
    bd = r.breakdown
    assert bd.network_discount_applied > 0
    assert "20%" in r.notes


# ── TC011: Component failure — graceful degradation ──────────────────────────

def test_tc011_graceful_degradation(orch):
    r = run_case(orch, "TC011")
    assert r.decision == "APPROVED"
    assert r.confidence_score < 0.60   # significantly reduced
    # ExtractionAgent failure must be visible in traces
    failed_traces = [t for t in r.agent_traces if t.status == "FAILED"]
    assert any("ExtractionAgent" in t.agent_name for t in failed_traces)


# ── TC012: Excluded treatment ─────────────────────────────────────────────────

def test_tc012_excluded_treatment(orch):
    r = run_case(orch, "TC012")
    assert r.decision == "REJECTED"
    assert any("EXCLUDED_CONDITION" in rr for rr in r.rejection_reasons)
    assert r.confidence_score > 0.90


# ── All traces must always be present ────────────────────────────────────────

@pytest.mark.parametrize("case_id", list(ALL_CASES.keys()))
def test_all_cases_return_traces(orch, case_id):
    r = run_case(orch, case_id)
    assert r.agent_traces is not None
    assert len(r.agent_traces) >= 1
    assert r.case_id == case_id
