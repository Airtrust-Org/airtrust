#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime

BASE_URL = "http://localhost:8787"
ENDPOINTS = [
    "/api/v2/habilitacoes",
    "/api/v2/qualificacoes",
    "/api/v2/funcionarios",
    "/api/v2/empresas",
    "/api/v2/certificados",
    "/api/v2/simuladores",
]

def test_endpoint(endpoint):
    """Test a single endpoint"""
    url = f"{BASE_URL}{endpoint}?page=1&limit=1"
    try:
        response = requests.get(url, timeout=5)
        http_code = response.status_code
        
        if http_code == 200:
            try:
                data = response.json()
                has_success = 'success' in data
                has_data = 'data' in data
                has_timestamp = 'timestamp' in data
                
                if has_success and has_data and has_timestamp:
                    print(f"✅ {endpoint:30} | Status: {http_code} | Format: OK")
                    return True
                else:
                    print(f"⚠️  {endpoint:30} | Status: {http_code} | Format: INCOMPLETE")
                    print(f"   Missing: {['success' if not has_success else '', 'data' if not has_data else '', 'timestamp' if not has_timestamp else '']}")
                    return False
            except json.JSONDecodeError:
                print(f"❌ {endpoint:30} | Status: {http_code} | Error: Invalid JSON")
                return False
        else:
            print(f"❌ {endpoint:30} | Status: {http_code} | Error: HTTP {http_code}")
            return False
    except Exception as e:
        print(f"❌ {endpoint:30} | Error: {str(e)}")
        return False

def main():
    print("\n╔════════════════════════════════════════════════════════════════╗")
    print("║           🧪 REFACTORED ENDPOINTS VALIDATION TEST            ║")
    print("║        Testing all 6 critical modules for API response        ║")
    print("╚════════════════════════════════════════════════════════════════╝\n")
    
    passed = 0
    failed = 0
    
    for endpoint in ENDPOINTS:
        if test_endpoint(endpoint):
            passed += 1
        else:
            failed += 1
    
    print("\n" + "="*64)
    print(f"RESULTS: ✅ {passed} PASSED | ❌ {failed} FAILED")
    print("="*64)
    
    if failed == 0:
        print("🎉 ALL TESTS PASSED! Endpoints are ready for deployment.\n")
        return 0
    else:
        print(f"⚠️  {failed} test(s) failed. Review server logs.\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
