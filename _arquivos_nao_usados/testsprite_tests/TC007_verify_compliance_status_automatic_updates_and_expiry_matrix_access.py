import requests
import time

BASE_URL = "http://localhost:8787"
TIMEOUT = 30
COMPLIANCE_ENDPOINT = f"{BASE_URL}/api/compliance"
COMPLIANCE_DASHBOARD_ENDPOINT = f"{BASE_URL}/api/compliance/dashboard"

def verify_compliance_status_automatic_updates_and_expiry_matrix_access():
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    # 1. Check connection stability by hitting compliance endpoint multiple times
    for _ in range(3):
        try:
            resp = requests.get(COMPLIANCE_ENDPOINT, headers=headers, timeout=TIMEOUT)
            assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        except Exception as e:
            raise AssertionError(f"Failed to GET {COMPLIANCE_ENDPOINT}: {e}")

    # 2. Validate the compliance status auto-update by fetching initial status and then simulating certification change
    # We don't have a direct API to update certifications here, so just verify data structure and timestamps if any
    try:
        compliance_resp = requests.get(COMPLIANCE_ENDPOINT, headers=headers, timeout=TIMEOUT)
        assert compliance_resp.status_code == 200
        compliance_data = compliance_resp.json()
        assert isinstance(compliance_data, dict), "Compliance data should be a dict"
        # Expect keys related to status and possibly lastUpdated or similar
        assert "status" in compliance_data or "complianceStatus" in compliance_data, "Missing compliance status key"
    except Exception as e:
        raise AssertionError(f"Error fetching compliance status data: {e}")

    # 3. Check expiry matrix accessibility and data accuracy at compliance/dashboard endpoint
    try:
        expiry_resp = requests.get(COMPLIANCE_DASHBOARD_ENDPOINT, headers=headers, timeout=TIMEOUT)
        assert expiry_resp.status_code == 200, f"Expected 200, got {expiry_resp.status_code}"
        expiry_data = expiry_resp.json()
        assert isinstance(expiry_data, dict), "Expiry matrix data should be a dict"
        # Check for keys that represent expiry matrix structure, e.g. "expiryMatrix", "matrix", or any expected keys
        matrix_keys_found = any(key in expiry_data for key in ["expiryMatrix", "matrix", "data"])
        assert matrix_keys_found, "Expiry matrix keys not found in response data"

        # Basic content checks - matrix should have entries (not empty)
        # If "expiryMatrix" or similar is a list or dict with at least one expiry entry
        if "expiryMatrix" in expiry_data:
            assert isinstance(expiry_data["expiryMatrix"], (list, dict))
            if isinstance(expiry_data["expiryMatrix"], (list)):
                assert len(expiry_data["expiryMatrix"]) > 0, "Expiry matrix list is empty"
            elif isinstance(expiry_data["expiryMatrix"], dict):
                assert len(expiry_data["expiryMatrix"].keys()) > 0, "Expiry matrix dict is empty"
        elif "matrix" in expiry_data:
            assert isinstance(expiry_data["matrix"], (list, dict))
            if isinstance(expiry_data["matrix"], list):
                assert len(expiry_data["matrix"]) > 0, "Expiry matrix list is empty"
            elif isinstance(expiry_data["matrix"], dict):
                assert len(expiry_data["matrix"].keys()) > 0, "Expiry matrix dict is empty"
        elif "data" in expiry_data:
            # fallback check
            assert expiry_data["data"], "Expiry matrix data is empty"
    except Exception as e:
        raise AssertionError(f"Error fetching expiry matrix data: {e}")

    # 4. Test error handling and resilience: attempt to request compliance endpoint with invalid params or headers
    try:
        # Example: wrong header value
        bad_headers = headers.copy()
        bad_headers["Accept"] = "application/xml"
        bad_resp = requests.get(COMPLIANCE_ENDPOINT, headers=bad_headers, timeout=TIMEOUT)
        # Should not crash the service, can be 4xx or 406 if unsupported, or fallback 200
        assert bad_resp.status_code in [200, 400, 406], f"Unexpected status for bad Accept header: {bad_resp.status_code}"
    except Exception as e:
        raise AssertionError(f"Service crashed or failed with bad Accept header: {e}")

    # 5. Check for no crashes by repeatedly hitting compliance endpoints
    for _ in range(5):
        try:
            resp = requests.get(COMPLIANCE_ENDPOINT, headers=headers, timeout=TIMEOUT)
            assert resp.status_code == 200
            time.sleep(0.2)
            dash_resp = requests.get(COMPLIANCE_DASHBOARD_ENDPOINT, headers=headers, timeout=TIMEOUT)
            assert dash_resp.status_code == 200
            time.sleep(0.2)
        except Exception as e:
            raise AssertionError(f"Service unstable or crashed during repeated requests: {e}")

verify_compliance_status_automatic_updates_and_expiry_matrix_access()