import requests
import time

BASE_URL = "http://localhost:8787"
DASHBOARD_ENDPOINT = "/api/dashboard"
HEALTH_ENDPOINT = "/api/health"
TIMEOUT = 30

# Assuming JWT token is required, define function to get a valid token for tests
# For this example, we'll assume no auth or a placeholder token. Adjust if auth info is available.
HEADERS = {
    "Accept": "application/json",
    "Authorization": "Bearer YOUR_JWT_TOKEN_HERE"  # Replace with actual token retrieval if required
}

def test_validate_dashboard_metrics_and_kpi_real_time_updates():
    try:
        # Step 1: Check server health before dashboard API call to identify if local server is stable
        health_resp = requests.get(f"{BASE_URL}{HEALTH_ENDPOINT}", timeout=TIMEOUT)
        assert health_resp.status_code == 200, f"Health endpoint returned {health_resp.status_code}"
        health_data = health_resp.json()
        # Basic check on health response content
        assert isinstance(health_data, dict), "Health endpoint response is not a JSON object"
        assert "status" in health_data or "uptime" in health_data, "Health info keys missing"

        # Step 2: Request dashboard data multiple times to test real-time updates and connection stability
        # First request to get initial metrics
        resp1 = requests.get(f"{BASE_URL}{DASHBOARD_ENDPOINT}", headers=HEADERS, timeout=TIMEOUT)
        assert resp1.status_code == 200, f"Dashboard API returned status {resp1.status_code} on first call"
        data1 = resp1.json()
        assert isinstance(data1, dict), "Dashboard response is not JSON object"

        # Validate presence of operational metrics and KPIs keys expected. 
        # Since schema is not detailed, look for keys often associated with dashboard KPIs, e.g., 'metrics', 'kpis', 'updates'
        expected_keys = ["metrics", "kpis", "lastUpdated"]
        found_keys = set(data1.keys())
        assert any(key in found_keys for key in expected_keys), f"Dashboard data does not contain any of expected keys {expected_keys}"

        # Validate that metric and kpi data are non-empty and objects or lists
        if "metrics" in data1:
            assert isinstance(data1["metrics"], (dict, list)) and data1["metrics"], "Dashboard 'metrics' is empty or invalid"
        if "kpis" in data1:
            assert isinstance(data1["kpis"], (dict, list)) and data1["kpis"], "Dashboard 'kpis' is empty or invalid"

        # Step 3: Wait briefly and call dashboard again to check for any update or change
        time.sleep(3)  # Wait 3 seconds to simulate real-time interval

        resp2 = requests.get(f"{BASE_URL}{DASHBOARD_ENDPOINT}", headers=HEADERS, timeout=TIMEOUT)
        assert resp2.status_code == 200, f"Dashboard API returned status {resp2.status_code} on second call"
        data2 = resp2.json()
        assert isinstance(data2, dict), "Dashboard response is not JSON object on second call"

        # Check keys exist on second response also
        found_keys2 = set(data2.keys())
        assert any(key in found_keys2 for key in expected_keys), f"Dashboard data missing expected keys on second call"

        # Step 4: Compare first and second response for realistic update detection
        # It is normal for some metric values or lastUpdated to change
        if "lastUpdated" in data1 and "lastUpdated" in data2:
            assert data2["lastUpdated"] != data1["lastUpdated"], "Dashboard 'lastUpdated' did not change, real-time update missing"

        # Step 5: Test robustness - forcibly simulate connection issues by rapid repeated calls checking for crashes
        for _ in range(5):
            resp = requests.get(f"{BASE_URL}{DASHBOARD_ENDPOINT}", headers=HEADERS, timeout=TIMEOUT)
            # Should not crash server; expect 200 or 503 if overloaded, accept both but no connection errors
            assert resp.status_code in (200, 503), f"Unexpected HTTP status {resp.status_code} during stress calls"

        # Step 6: Try accessing the dashboard endpoint without auth to check error handling if auth required
        no_auth_resp = requests.get(f"{BASE_URL}{DASHBOARD_ENDPOINT}", timeout=TIMEOUT)
        # If auth is required, expect 401 Unauthorized or 403 Forbidden; else 200 OK
        assert no_auth_resp.status_code in (200, 401, 403), f"Unexpected status code without auth: {no_auth_resp.status_code}"

    except requests.exceptions.RequestException as e:
        assert False, f"Request failed: {e}"
    except AssertionError as e:
        raise
    except Exception as e:
        assert False, f"Unexpected error: {e}"

test_validate_dashboard_metrics_and_kpi_real_time_updates()