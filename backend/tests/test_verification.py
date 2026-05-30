"""
Tests for VerificationAgent — document type checks and early exit behaviour.
Run: cd backend && pytest tests/test_verification.py -v
"""
import pytest
from src.agents.verification import VerificationAgent

POLICY = {
    "document_requirements": {
        "CONSULTATION": {"required": ["PRESCRIPTION", "HOSPITAL_BILL"]},
        "PHARMACY":     {"required": ["PRESCRIPTION", "PHARMACY_BILL"]},
        "DENTAL":       {"required": ["HOSPITAL_BILL"]},
        "DIAGNOSTIC":   {"required": ["PRESCRIPTION", "LAB_REPORT", "HOSPITAL_BILL"]},
    }
}


@pytest.fixture
def agent():
    return VerificationAgent(POLICY)


# ── TC001: Wrong document type uploaded ─────────────────────────────────────

def test_missing_hospital_bill_returns_false(agent):
    docs = [
        {"file_id": "F1", "file_name": "rx.jpg", "actual_type": "PRESCRIPTION"},
        {"file_id": "F2", "file_name": "rx2.jpg", "actual_type": "PRESCRIPTION"},
    ]
    passed, msg, trace = agent.execute("CONSULTATION", docs)

    assert passed is False
    assert "HOSPITAL_BILL" in msg
    assert "PRESCRIPTION" in msg
    assert trace.status == "FAILED"
    assert any("MISSING_REQUIRED_DOCUMENT_TYPE" in e for e in trace.errors)


def test_correct_documents_pass(agent):
    docs = [
        {"file_id": "F1", "file_name": "rx.jpg",   "actual_type": "PRESCRIPTION"},
        {"file_id": "F2", "file_name": "bill.jpg",  "actual_type": "HOSPITAL_BILL"},
    ]
    passed, msg, trace = agent.execute("CONSULTATION", docs)

    assert passed is True
    assert trace.status == "SUCCESS"


# ── TC002: Unreadable document ───────────────────────────────────────────────

def test_unreadable_document_returns_false(agent):
    docs = [
        {"file_id": "F1", "file_name": "rx.jpg",          "actual_type": "PRESCRIPTION",  "quality": "GOOD"},
        {"file_id": "F2", "file_name": "blurry_bill.jpg",  "actual_type": "PHARMACY_BILL", "quality": "UNREADABLE"},
    ]
    passed, msg, trace = agent.execute("PHARMACY", docs)

    assert passed is False
    assert "blurry_bill.jpg" in msg
    assert "unreadable" in msg.lower()
    assert "UNREADABLE_FILE" in trace.errors[0]


# ── Category with no matching requirements ────────────────────────────────────

def test_unknown_category_uses_default_requirements(agent):
    docs = [
        {"file_id": "F1", "actual_type": "PRESCRIPTION"},
    ]
    passed, msg, trace = agent.execute("UNKNOWN_CATEGORY", docs)
    # Default is PRESCRIPTION + HOSPITAL_BILL
    assert passed is False
    assert "HOSPITAL_BILL" in msg


# ── Dental requires only HOSPITAL_BILL ───────────────────────────────────────

def test_dental_only_needs_hospital_bill(agent):
    docs = [{"file_id": "F1", "file_name": "bill.jpg", "actual_type": "HOSPITAL_BILL"}]
    passed, _, trace = agent.execute("DENTAL", docs)
    assert passed is True


# ── Diagnostic requires 3 document types ─────────────────────────────────────

def test_diagnostic_missing_lab_report(agent):
    docs = [
        {"file_id": "F1", "actual_type": "PRESCRIPTION"},
        {"file_id": "F2", "actual_type": "HOSPITAL_BILL"},
    ]
    passed, msg, trace = agent.execute("DIAGNOSTIC", docs)
    assert passed is False
    assert "LAB_REPORT" in msg


# ── Message specificity check ─────────────────────────────────────────────────

def test_error_message_names_both_uploaded_and_missing(agent):
    docs = [{"file_id": "F1", "actual_type": "PRESCRIPTION"}]
    _, msg, _ = agent.execute("CONSULTATION", docs)

    assert "You uploaded:" in msg
    assert "Missing required document types:" in msg
    assert "PRESCRIPTION" in msg       # what they uploaded
    assert "HOSPITAL_BILL" in msg      # what is missing
