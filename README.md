# Plum Claims Engine — AI Engineer Assignment

**Multi-agent health insurance claims processing system built for Plum's AI Engineer assignment.**

---

## Quick Start

```bash
# 1. Backend
cd backend
python -m venv venv && venv\Scripts\activate     # Windows
pip install -r requirements.txt
# Add GEMINI_API_KEY to backend/.env
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

# 2. Frontend
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

**Environment variable required:**
```
GEMINI_API_KEY=<your Google AI Studio key>
```

---

## System Architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    ClaimsOrchestrator                    │
                    │                                                           │
  Upload /          │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
  Test JSON  ──────►│  │Verification  │─►│  Extraction  │─►│ Adjudication  │  │
                    │  │   Agent      │  │    Agent     │  │    Agent      │  │
                    │  └──────────────┘  └──────────────┘  └───────────────┘  │
                    │        │                  │                   │           │
                    │   Gemini 2.5 Flash   Reuses result      Policy Rules     │
                    │   (classify+extract)  from Step 1      from JSON         │
                    │        │                                                  │
                    │   Early exit if                                           │
                    │   wrong docs / unreadable                                 │
                    └─────────────────────────────────────────────────────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │        ClaimAdjudicationResult │
                              │  decision, approved_amount,    │
                              │  confidence_score, notes,      │
                              │  agent_traces, breakdown       │
                              └───────────────────────────────┘
```

### Agent Responsibilities

| Agent | Responsibility | Technology |
|---|---|---|
| **VerificationAgent** | Classify each uploaded document via Gemini Vision; check all required doc types are present; detect unreadable files | Gemini 2.5 Flash (vision) |
| **ExtractionAgent** | Extract structured fields (patient, diagnosis, amounts, line items) from documents; cross-validate patient names | Reuses Gemini output from VerificationAgent |
| **FraudAgent** (inline) | Check same-day claim frequency against policy thresholds | Policy rules only |
| **AdjudicationAgent** | Apply 8 policy rules in sequence; produce APPROVED/PARTIAL/REJECTED/MANUAL_REVIEW with full calculation breakdown | Policy rules from `policy_terms.json` |

---

## Key Design Decisions

### 1. Combined Classify + Extract in One Gemini Call
**Decision:** VerificationAgent calls Gemini once with a combined prompt that classifies the document type AND extracts all fields simultaneously. ExtractionAgent reuses the stored result (`doc["_gemini_extracted"]`).

**Why:** The free-tier Gemini API has a rate limit of ~5 requests/minute. Doing separate classify and extract calls (2 per document × N documents) hits this limit immediately. Combining into one call halves API usage.

**Trade-off rejected:** Doing classification-only first then extraction — simple but doubles API calls. Also considered using `gemini-1.5-flash` (unavailable on this API key) and `gemini-2.0-flash` (quota=0 on free tier). `gemini-2.5-flash` was the working model.

### 2. No File Storage — Pure In-Memory Processing
**Decision:** Uploaded files are read as raw bytes in the multipart request, passed in-memory through the pipeline, and discarded at request end. No S3, no disk writes.

**Why:** Eliminates infrastructure dependency, reduces latency, and avoids storing sensitive medical documents. Gemini Vision accepts inline binary data via `glm.Blob`.

**Trade-off:** Documents cannot be re-reviewed or audited after the request completes. For production, you'd add an audit store with encrypted documents and a retention policy.

### 3. Dynamic Policy — No Hardcoded Business Logic
**Decision:** Every rule (co-pay %, network discount %, waiting periods, exclusion lists, document requirements) is read from `policy_terms.json` at startup. Zero hardcoded values in agent code.

**Why:** Policy terms change annually. Hardcoding means a code deploy for every policy update. JSON-driven means a file update and server restart suffices.

### 4. Orchestrator-Level Confidence Degradation
**Decision:** The orchestrator reduces confidence based on document quality returned by Gemini: POOR docs → ×0.80 confidence, PARTIAL → ×0.90, simulated failure → ×0.50.

**Why:** The assignment requires "If confidence dropped because a document was partially unreadable, that must be visible." Rather than baking this into each agent, the orchestrator applies it as a cross-cutting concern.

### 5. Agent Trace as First-Class Output
**Decision:** AdjudicationAgent builds a `checks: List[str]` log of every rule evaluated and surfaces it as trace warnings. Every single rule produces a log line (PASS or FAIL with detail).

**Why:** The assignment states "Black-box decisions are not acceptable." The trace means any ops team member can reconstruct exactly which rules fired and why.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/claims/process` | Run test-case JSON through the pipeline |
| `POST` | `/api/v1/claims/submit` | Submit real claim with uploaded documents (multipart) |
| `GET` | `/api/v1/members` | List policy members |
| `GET` | `/api/v1/hospitals` | List network hospitals |
| `GET` | `/api/v1/policy/summary` | Policy stats + categories + required docs |
| `GET` | `/health` | Health check |

---

## Policy Rules Implemented

All rules are read from `backend/data/policy_terms.json`. No rule is hardcoded.

| Rule | Policy Source | Implementation |
|---|---|---|
| Required document types per category | `document_requirements` | VerificationAgent |
| Excluded diagnoses (obesity, bariatric) | `exclusions.conditions` | AdjudicationAgent Rule 2 |
| Condition-specific waiting periods | `waiting_periods.specific_conditions` | AdjudicationAgent Rule 3 |
| Per-claim limit (₹5,000 consultation) | `coverage.per_claim_limit` | AdjudicationAgent Rule 4 |
| Pre-auth threshold (MRI > ₹10,000) | `opd_categories.diagnostic.pre_auth_threshold` | AdjudicationAgent Rule 5 |
| Dental cosmetic exclusions | `opd_categories.dental.excluded_procedures` | AdjudicationAgent Rule 6 |
| Network hospital discount | `opd_categories.*.network_discount_percent` | AdjudicationAgent Rule 7 |
| Co-pay (applied after network discount) | `opd_categories.*.copay_percent` | AdjudicationAgent Rule 7 |
| Same-day fraud threshold | `fraud_thresholds.same_day_claims_limit` | Orchestrator |

**Calculation order (TC010):** Network discount applied FIRST, co-pay on post-discount base.
Example: ₹4,500 → 20% discount → ₹3,600 → 10% co-pay → ₹360 deducted → **₹3,240 approved**

---

## Failure Handling

| Failure Type | Behaviour |
|---|---|
| Gemini API rate limit (429) | Classification returns UNKNOWN; verification reports missing doc type; confidence reduced |
| Gemini timeout / crash | ExtractionAgent catches exception; doc marked POOR quality; confidence reduced ×0.40 |
| Component failure (TC011) | `simulate_component_failure=true` triggers graceful degradation path; confidence ×0.50; APPROVED with warning |
| Invalid treatment date | AdjudicationAgent returns MANUAL_REVIEW with specific message |
| Member not in roster | Waiting period check skipped (logged); adjudication proceeds |
| Adjudication engine crash | Orchestrator catches; returns MANUAL_REVIEW with error note |

---

## Limitations and Scale Considerations

### Current Limitations
- **Single Gemini API key:** Free tier limits ~5 requests/minute. For 2 documents, this takes ~40s.
- **No audit log:** Processed documents are discarded at request end. No storage of claims history.
- **Synchronous processing:** Each claim is processed synchronously in the request thread.
- **In-memory policy:** Policy loaded at startup. Policy changes require server restart.

### At 10× Load (750,000+ claims/year)
1. **Async Gemini calls:** Replace sync `generate_content` with async SDK; process multiple documents per claim in parallel.
2. **Queue-based architecture:** Claims enter a task queue (Celery + Redis); multiple workers process concurrently.
3. **Paid Gemini tier:** Remove rate limit constraints; use Gemini Flash batch API for bulk processing.
4. **Document store:** Store encrypted documents in S3/GCS for audit trail and re-processing.
5. **Policy hot-reload:** Watch `policy_terms.json` for changes; reload without server restart.
6. **Caching:** Cache member roster and policy rules in Redis; avoid file reads on every request.

---

## Testing with Real Documents

Pre-generated test documents are in the `assets/` folder at the project root.
All documents are real-world quality images generated via DALL-E 3 and tested against the live system.

### Document Naming Convention

```
assets/testXX_docN.png
         ^^  ^
         TC  Document number within that test case
```

### Test Case → Document Mapping

| Test Case | Upload These Files | Form Settings | Expected Decision |
|-----------|-------------------|---------------|-------------------|
| **TC001** | `test01_doc1.png` + `test01_doc2.png` | Category: Consultation, Amount: 1500 | REJECTED — Missing HOSPITAL_BILL |
| **TC002** | `test02_doc1.png` + `test02_doc2.png` | Category: Pharmacy, Amount: 800 | REJECTED — Unreadable document |
| **TC003** | `test03_doc1.png` + `test03_doc2.png` | Category: Consultation, Amount: 1500 | MANUAL_REVIEW — Name mismatch |
| **TC004** | `test04_doc1.png` + `test04_doc2.png` | Category: Consultation, Amount: 1500 | APPROVED — ₹1,350 |
| **TC005** | `test05_doc1.png` + `test05_doc2.png` | Member: Vikram Joshi (EMP005), Category: Consultation, Date: 2024-10-15, Amount: 3000 | REJECTED — Waiting period |
| **TC006** | `test06_doc1.png` | Category: Dental, Amount: 12000 | PARTIAL — ₹8,000 |
| **TC007** | `test07_doc1.png` + `test07_doc2.png` + `test07_doc3.png` | Category: Diagnostic, Amount: 15000, **Pre-auth: unchecked** | REJECTED — PRE_AUTH_MISSING |
| **TC008** | `test08_doc1.png` + `test08_doc2.png` | Category: Consultation, Amount: 7500 | REJECTED — Per-claim limit |
| **TC009** | — | **Test Suite tab → select TC009** | MANUAL_REVIEW — Fraud signal |
| **TC010** | `test04_doc1.png` + `test04_doc2.png` | Category: Consultation, Amount: 4500, Hospital: **Apollo Hospitals** | APPROVED — ₹3,240 |
| **TC011** | — | **Test Suite tab → select TC011** | APPROVED (49% confidence) |
| **TC012** | `test12_doc1.png` + `test12_doc2.png` | Category: Consultation, Amount: 8000 | REJECTED — Excluded condition |

> **TC009 and TC011** must be tested via the **Test Suite tab** — they require `claims_history` and `simulate_component_failure` fields that cannot be set through the upload form.

> **TC010** reuses TC004 documents — same prescription and hospital bill, but change the hospital name to `Apollo Hospitals` and amount to `4500`.

### How to Run a Test

1. Open **http://localhost:5173**
2. Click **Submit Claim** tab
3. Fill in form values from the table above
4. Upload the specified document files from `assets/`
5. Click **Submit Claim for Adjudication**
6. Compare result with the expected decision above

### Gemini API Rate Limits

The system uses Gemini 2.5 Flash Vision for document classification and extraction.
The free tier allows **~5 requests per minute**. If you see `UNKNOWN` classification:
- Wait 60 seconds and retry
- Or update `backend/.env` with a paid-tier API key

---

## Deployment

### Frontend → Vercel (free)

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your GitHub repo
3. Set **Root Directory** to `AI_Insurance_Claim_Reviewer/frontend`
4. Add **Environment Variable:**
   - `VITE_API_URL` = `https://your-backend.onrender.com` (your Render URL from below)
5. Click **Deploy** → you get `https://your-app.vercel.app`

---

### Backend → Render (free)

1. Go to [render.com](https://render.com) → **New Web Service** → Connect GitHub repo
2. Set:
   - **Root Directory:** `AI_Insurance_Claim_Reviewer/backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
3. Add **Environment Variables:**
   - `GEMINI_API_KEY` = your Google AI Studio key
   - `FRONTEND_URL` = `https://your-app.vercel.app` (your Vercel URL from above)
4. Click **Deploy** → you get `https://your-backend.onrender.com`

---

### After both are deployed

Update `frontend/.env.production`:
```
VITE_API_URL=https://your-backend.onrender.com
```

And uncomment the Vercel URL in `backend/api/main.py` CORS section:
```python
"https://your-app.vercel.app",
```

Redeploy both. The application is now fully live.
```
App url= https://ai-insurance-claim-reviewer.vercel.app/
```

> **Free tier note:** Render free tier spins down after 15 minutes of inactivity. First request after idle takes ~30 seconds to cold-start. Upgrade to paid ($7/month) for always-on.

---

## Running the Eval Suite

```bash
# Ensure backend is running on port 8000
cd backend
python run_eval.py
```

Output: Markdown table showing all 12 test cases, expected vs actual decision, pass/fail status.

---

## Project Structure

```
├── backend/
│   ├── api/main.py              # FastAPI routes (process, submit, members, hospitals, policy)
│   ├── src/
│   │   ├── orchestrator.py      # Agent coordination, confidence management, fraud check
│   │   ├── schemas.py           # Pydantic models: ClaimAdjudicationResult, AgentTrace, etc.
│   │   └── agents/
│   │       ├── verification.py  # Doc type classification + early exit
│   │       ├── extraction.py    # Structured field extraction
│   │       └── adjudication.py  # Policy rule engine (8 rules, full audit trail)
│   ├── data/
│   │   ├── policy_terms.json    # Policy configuration (source of truth)
│   │   └── test_cases.json      # 12 validation scenarios
│   └── run_eval.py              # CLI evaluation runner
├── frontend/
│   └── src/
│       ├── App.jsx              # Tab navigation, policy stats, test suite runner
│       └── components/
│           ├── ClaimSubmitForm.jsx   # Real document upload form (all data from API)
│           ├── ClaimMetrics.jsx      # Decision + amount + confidence display
│           └── PipelineTrace.jsx     # Interactive agent execution timeline
├── assets/                          # Real test documents used for live testing
│   ├── test01_doc1.png / test01_doc2.png   # TC001 — two prescriptions (no bill)
│   ├── test02_doc1.png / test02_doc2.png   # TC002 — prescription + blurry bill
│   ├── test03_doc1.png / test03_doc2.png   # TC003 — Rajesh Kumar Rx + Arjun Mehta bill
│   ├── test04_doc1.png / test04_doc2.png   # TC004 — prescription + City Medical Centre bill
│   ├── test05_doc1.png / test05_doc2.png   # TC005 — Diabetes Rx + bill (Vikram Joshi)
│   ├── test06_doc1.png                     # TC006 — dental bill (RCT + Whitening)
│   ├── test07_doc1.png / doc2 / doc3       # TC007 — MRI Rx + radiology report + bill
│   ├── test08_doc1.png / test08_doc2.png   # TC008 — Gastroenteritis Rx + ₹7,500 bill
│   └── test12_doc1.png / test12_doc2.png   # TC012 — Bariatric/Obesity Rx + bill
├── README.md                        # This file — architecture, setup, deployment
├── EVAL_REPORT.md                   # All 12 test case results with full traces
└── COMPONENT_CONTRACTS.md           # Agent input/output/error specifications
```
