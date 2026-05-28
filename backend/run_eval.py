import json
import requests
import sys
import os

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

def execute_eval():
    print("Executing claims pipeline evaluation script...")
    
    # Locate validation targets
    suite_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "test_cases.json")
    with open(suite_path, "r", encoding="utf-8") as f:
        cases = json.load(f)["test_cases"]

    print(f"Loaded {len(cases)} validation target scenarios.\n")
    print("| Case ID | Scenario Name | Target Decision | Generated Decision | Status | Notes |")
    print("| :--- | :--- | :--- | :--- | :--- | :--- |")
    
    unmatched = 0
    
    for case in cases:
        case_id = case["case_id"]
        name = case["case_name"]
        target = case["expected"].get("decision")
        
        payload = case["input"].copy()
        payload["case_id"] = case_id
        try:
            res = requests.post("http://127.0.0.1:8000/api/v1/claims/process", json=payload)
            if res.status_code != 200:
                print(f"| {case_id} | {name} | {target} | ERROR ({res.status_code}) | [FAIL] | Server returned {res.text} |")
                unmatched += 1
                continue
                
            res_data = res.json()
            gen_decision = res_data.get("decision")
            
            # Map None mappings (where processing stops early) to system classifications
            is_match = False
            if target is None:
                if gen_decision in ["REJECTED", "MANUAL_REVIEW", "NULL", None]:
                    is_match = True
            elif str(target).upper() == str(gen_decision).upper():
                is_match = True
                
            status_badge = "[PASS]" if is_match else "[FAIL]"
            if not is_match:
                unmatched += 1
                
            explanation = res_data.get("notes", "").replace("\n", " ")
            print(f"| {case_id} | {name} | {target} | {gen_decision} | {status_badge} | {explanation[:100]}... |")
            
        except Exception as e:
            print(f"| {case_id} | {name} | {target} | OFFLINE | [FAIL] | Backend connectivity exception: {str(e)} |")
            unmatched += 1

    print(f"\nExecution complete. Unmatched cases identified: {unmatched}")
    if unmatched > 0:
        sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    execute_eval()
