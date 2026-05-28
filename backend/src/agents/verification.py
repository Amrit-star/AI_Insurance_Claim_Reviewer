import time
from typing import List, Dict, Any, Tuple
from src.schemas import AgentTrace
from src.agents.base import BaseAgent

class VerificationAgent(BaseAgent):
    def __init__(self, policy: Dict[str, Any]):
        super().__init__("VerificationAgent")
        self.policy = policy
        self.doc_requirements = policy.get("document_requirements", {})

    def execute(self, category: str, documents: List[Dict[str, Any]]) -> Tuple[bool, str, AgentTrace]:
        start_time = time.time()
        category_upper = category.upper()
        
        # Load required documents from config
        requirements = self.doc_requirements.get(category_upper, {})
        if not requirements:
            requirements = {"required": ["PRESCRIPTION", "HOSPITAL_BILL"]}
            
        required_types = set(requirements.get("required", []))
        uploaded_types = set(doc.get("actual_type", "").upper() for doc in documents)
        
        # TC002: Check Quality Levels
        for doc in documents:
            if doc.get("quality", "GOOD").upper() == "UNREADABLE":
                elapsed = (time.time() - start_time) * 1000
                msg = f"The uploaded document '{doc.get('file_name', 'Unknown')}' is unreadable. Please re-upload a clear copy."
                trace = AgentTrace(
                    agent_name=self.name,
                    status="FAILED",
                    execution_time_ms=elapsed,
                    message=msg,
                    errors=[f"UNREADABLE_FILE: {doc.get('file_name', 'Unknown')}"]
                )
                return False, msg, trace

        # TC001: Validate Required Document Types are Present
        missing_types = required_types - uploaded_types
        if missing_types:
            elapsed = (time.time() - start_time) * 1000
            msg = (
                f"Your claim for {category_upper} requires: {', '.join(required_types)}. "
                f"You uploaded: {', '.join(uploaded_types) if uploaded_types else 'None'}. "
                f"Missing required document types: {', '.join(missing_types)}."
            )
            trace = AgentTrace(
                agent_name=self.name,
                status="FAILED",
                execution_time_ms=elapsed,
                message=msg,
                errors=[f"MISSING_REQUIRED_DOCUMENT_TYPE: {list(missing_types)}"]
            )
            return False, msg, trace

        elapsed = (time.time() - start_time) * 1000
        trace = AgentTrace(
            agent_name=self.name,
            status="SUCCESS",
            execution_time_ms=elapsed,
            message="Document count and structural checks passed verification."
        )
        return True, "All required document types are present and readable.", trace
