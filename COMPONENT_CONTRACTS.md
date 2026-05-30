# Component Contracts
## Plum Claims Engine — Agent Interface Specifications

Each contract is precise enough that another engineer could reimplement the component without reading its source code.

---

## 1. ClaimsOrchestrator

**File:** `backend/src/orchestrator.py`

### Input
```python
claim_input: Dict[str, Any]
```

| Field | Type | Required | Description |
|---|---|---|---|
| `case_id` | str | Yes | Unique identifier for this claim |
| `member_id` | str | Yes | Must match a member in `policy.members` |
| `policy_id` | str | Yes | Policy identifier (for reference) |
| `claim_category` | str | Yes | Must match a key in `policy.opd_categories` |
| `treatment_date` | str | Yes | ISO 8601 date: `"YYYY-MM-DD"` |
| `claimed_amount` | float | Yes | Amount in INR claimed by member |
| `hospital_name` | str | No | If matches `policy.network_hospitals`, discount applies |
| `pre_authorization_approved` | bool | No | Default `false`. Required for MRI/CT/PET > threshold |
| `documents` | List[Dict] | Yes | See document dict spec below |
| `claims_history` | List[Dict] | No | Same-day claim history for fraud check |
| `simulate_component_failure` | bool | No | Default `false`. Forces extraction failure for TC011 |

**Document dict (test-case mode):**
```python
{
  "file_id": str,
  "file_name": str,
  "actual_type": str,           # "PRESCRIPTION" | "HOSPITAL_BILL" | "LAB_REPORT" | "PHARMACY_BILL"
  "quality": str,               # "GOOD" | "UNREADABLE"  (optional, default "GOOD")
  "patient_name_on_doc": str,   # optional
  "content": Dict               # optional pre-extracted fields (skips Gemini)
}
```

**Document dict (real upload mode):**
```python
{
  "file_id": str,
  "file_name": str,
  "file_bytes": bytes,          # raw file content — never stored
  "mime_type": str,             # "image/jpeg" | "image/png" | "application/pdf"
}
```

### Output
```python
ClaimAdjudicationResult
```

| Field | Type | Always Present | Description |
|---|---|---|---|
| `case_id` | str | Yes | Echoed from input |
| `decision` | str\|None | Yes | `"APPROVED"` \| `"PARTIAL"` \| `"REJECTED"` \| `"MANUAL_REVIEW"` |
| `approved_amount` | float\|None | Only if APPROVED or PARTIAL | Amount in INR |
| `rejection_reasons` | List[str] | Yes (empty list if none) | Machine-readable codes |
| `notes` | str | Yes | Human-readable explanation |
| `confidence_score` | float | Yes | 0.0–1.0 |
| `breakdown` | AdjudicationBreakdown\|None | Only if APPROVED or PARTIAL | Financial calculation detail |
| `agent_traces` | List[AgentTrace] | Yes | One entry per agent executed |

### Errors Raised
- Never raises. All exceptions are caught and returned as `MANUAL_REVIEW` with error note.

### Processing Order
1. VerificationAgent — early exit on failure
2. ExtractionAgent — early exit on name mismatch
3. FraudAgent (inline) — early exit if same-day threshold exceeded
4. AdjudicationAgent — produces final decision

---

## 2. VerificationAgent

**File:** `backend/src/agents/verification.py`

### Input
```python
execute(category: str, documents: List[Dict[str, Any]]) -> Tuple[bool, str, AgentTrace]
```

| Parameter | Type | Description |
|---|---|---|
| `category` | str | Claim category (case-insensitive). Looked up in `policy.document_requirements`. |
| `documents` | List[Dict] | Document dicts (see Orchestrator spec above) |

**Side effect:** For real upload docs (`file_bytes` present, no `actual_type`), mutates the dict to add:
- `doc["actual_type"]` — Gemini-classified document type
- `doc["_gemini_extracted"]` — full Gemini extraction result (reused by ExtractionAgent)

### Output
```python
Tuple[bool, str, AgentTrace]
```

| Position | Type | Description |
|---|---|---|
| `[0]` | bool | `True` = passed, `False` = failed (claim should stop) |
| `[1]` | str | Human-readable message (specific enough for the member to act on) |
| `[2]` | AgentTrace | Execution record |

### Failure Conditions

| Condition | Returns | Message Format |
|---|---|---|
| Missing required doc type | `(False, msg, trace)` | `"Your claim for {CAT} requires: {required}. You uploaded: {uploaded}. Missing: {missing}."` |
| Unreadable document | `(False, msg, trace)` | `"The uploaded document '{name}' is unreadable. Please re-upload a clear copy."` |
| Gemini API rate limit | Sets `actual_type="UNKNOWN"` | Surfaced via missing type check |

### Never Raises
All Gemini errors caught; returns `"UNKNOWN"` type (which then triggers missing-type message).

---

## 3. ExtractionAgent

**File:** `backend/src/agents/extraction.py`

### Input
```python
execute(documents: List[Dict[str, Any]], expected_patient_name: str) -> Tuple[List[ExtractedDocument], Optional[str], AgentTrace]
```

| Parameter | Type | Description |
|---|---|---|
| `documents` | List[Dict] | Document dicts, optionally with `_gemini_extracted` from VerificationAgent |
| `expected_patient_name` | str | Patient name from policy member roster. Empty string to skip cross-validation. |

### Output
```python
Tuple[List[ExtractedDocument], Optional[str], AgentTrace]
```

| Position | Type | Description |
|---|---|---|
| `[0]` | List[ExtractedDocument] | Extracted fields per document (always returned, even on partial failure) |
| `[1]` | Optional[str] | Error message if name mismatch detected; `None` if passed |
| `[2]` | AgentTrace | Execution record |

### ExtractedDocument fields

| Field | Type | Source |
|---|---|---|
| `file_id` | str | From input doc dict |
| `file_name` | str | From input doc dict |
| `document_type` | str | From `actual_type` (VerificationAgent) or Gemini response |
| `patient_name` | str\|None | Gemini extraction |
| `doctor_name` | str\|None | Gemini extraction |
| `doctor_registration` | str\|None | Gemini extraction |
| `diagnosis` | str\|None | Gemini extraction |
| `treatment` | str\|None | Gemini extraction |
| `line_items` | List[ExtractedLineItem] | Gemini extraction — description + amount per item |
| `total_amount` | float | Gemini extraction, fallback to `claimed_amount` from form |
| `quality_status` | str | `"GOOD"` \| `"PARTIAL"` \| `"POOR"` from Gemini |

### Failure Conditions

| Condition | Returns | Notes |
|---|---|---|
| Multiple patient names across docs | `(docs, mismatch_msg, trace)` | `[1]` is non-None; orchestrator returns MANUAL_REVIEW |
| Patient name ≠ member roster | `(docs, mismatch_msg, trace)` | `[1]` is non-None |
| Gemini extraction failure | `(docs, None, trace)` | `_extraction_error` stored in doc dict; confidence reduced by orchestrator |

### Data Source Priority (per document)
1. `doc["content"]` — pre-extracted test-case data
2. `doc["_gemini_extracted"]` — already extracted by VerificationAgent (primary path for real uploads)
3. `doc["file_bytes"]` + Gemini inline call — fallback if Verification didn't extract
4. `doc["file_path"]` + Gemini upload — legacy path

---

## 4. AdjudicationAgent

**File:** `backend/src/agents/adjudication.py`

### Input
```python
execute(claim_input: Dict[str, Any], extracted_docs: List[ExtractedDocument]) -> Tuple[ClaimAdjudicationResult, AgentTrace]
```

| Parameter | Type | Description |
|---|---|---|
| `claim_input` | Dict | Full claim dict (same as Orchestrator input) |
| `extracted_docs` | List[ExtractedDocument] | Output from ExtractionAgent |

### Output
```python
Tuple[ClaimAdjudicationResult, AgentTrace]
```

The `ClaimAdjudicationResult.agent_traces` is populated by the Orchestrator after this call.

### Rules Evaluated (in order)

| # | Rule | Policy Source | Fail Decision |
|---|---|---|---|
| 1 | Category exists and `covered=True` | `opd_categories` | REJECTED / UNCOVERED_CATEGORY |
| 2 | Diagnosis not in excluded conditions list | `exclusions.conditions` | REJECTED / EXCLUDED_CONDITION |
| 3 | Waiting period not active for diagnosis | `waiting_periods.specific_conditions` | REJECTED / WAITING_PERIOD |
| 4 | Claimed amount ≤ per-claim limit | `coverage.per_claim_limit` | REJECTED / PER_CLAIM_EXCEEDED |
| 5 | Pre-auth obtained for high-value diagnostic | `opd_categories.diagnostic.pre_auth_threshold` | REJECTED / PRE_AUTH_MISSING |
| 6 | Dental line-item exclusions applied | `opd_categories.dental.excluded_procedures` | PARTIAL (excluded items removed) |
| 7 | Network discount applied first | `network_discount_percent` | — |
| 7 | Co-pay applied on post-discount base | `copay_percent` | — |

**Calculation order is guaranteed:** discount before co-pay. A rule that fails causes immediate return — subsequent rules are not evaluated.

### Failure Conditions
- Invalid `treatment_date` format → returns MANUAL_REVIEW immediately
- Member not in roster → waiting period check skipped (logged); adjudication continues

---

## 5. AgentTrace Schema

**File:** `backend/src/schemas.py`

```python
class AgentTrace(BaseModel):
    agent_name: str             # "VerificationAgent" | "ExtractionAgent" | "AdjudicationAgent" | "FraudAgent"
    status: str                 # "SUCCESS" | "FAILED" | "DEGRADED"
    execution_time_ms: float    # Wall-clock time in milliseconds
    message: str                # Primary human-readable summary
    warnings: List[str]         # Per-rule audit lines (AdjudicationAgent) or quality notes
    errors: List[str]           # Machine-readable error codes
```

**AdjudicationAgent warnings format:**
Each rule produces one line:
```
"RULE {rule_name}: PASS — {detail}"
"RULE {rule_name}: FAIL — {detail}"
"RULE {rule_name}: APPLIED — {detail}"
"RULE {rule_name}: SKIP — {reason}"
```

---

## 6. ClaimAdjudicationResult Schema

**File:** `backend/src/schemas.py`

```python
class ClaimAdjudicationResult(BaseModel):
    case_id: str
    decision: Optional[str]           # "APPROVED" | "PARTIAL" | "REJECTED" | "MANUAL_REVIEW"
    approved_amount: Optional[float]  # Present when decision is APPROVED or PARTIAL
    rejection_reasons: List[str]      # Machine codes: "WAITING_PERIOD", "PRE_AUTH_MISSING", etc.
    notes: str                        # Human-readable full explanation
    confidence_score: float           # 0.0–1.0
    breakdown: Optional[AdjudicationBreakdown]
    agent_traces: List[AgentTrace]

class AdjudicationBreakdown(BaseModel):
    original_claimed_amount: float
    network_discount_applied: float   # 0.0 if non-network
    amount_after_discount: float
    copay_deducted: float             # 0.0 if copay_percent = 0
    final_approved_amount: float
    applied_rules: List[str]          # Human-readable rule descriptions
```

---

## Error Code Reference

| Code | Raised By | Meaning |
|---|---|---|
| `MISSING_REQUIRED_DOCUMENT_TYPE` | VerificationAgent | Required doc type not present in uploaded set |
| `UNREADABLE_FILE` | VerificationAgent | Document quality flagged as UNREADABLE |
| `PATIENT_NAME_MISMATCH` | ExtractionAgent | Documents contain two different patient names |
| `PATIENT_NAME_MISMATCH_WITH_MEMBER` | ExtractionAgent | Doc patient name ≠ member roster name |
| `EXCLUDED_CONDITION` | AdjudicationAgent | Diagnosis matches policy exclusion list |
| `WAITING_PERIOD` | AdjudicationAgent | Claim within waiting period for the diagnosed condition |
| `PER_CLAIM_EXCEEDED` | AdjudicationAgent | Claimed amount > per-claim limit |
| `PRE_AUTH_MISSING` | AdjudicationAgent | High-value diagnostic without pre-authorization |
| `UNCOVERED_CATEGORY` | AdjudicationAgent | Claim category not in policy or `covered=false` |
| `SIMULATED_SYSTEM_CRASH` | ExtractionAgent | `simulate_component_failure=true` flag was set |
| `VERIFICATION_SYSTEM_CRASH` | Orchestrator | Unexpected exception in VerificationAgent |
| `ADJUDICATION_CRASH` | Orchestrator | Unexpected exception in AdjudicationAgent |
