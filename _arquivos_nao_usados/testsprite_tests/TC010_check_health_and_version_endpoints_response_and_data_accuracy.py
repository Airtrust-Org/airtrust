import requests

BASE_URL = "http://localhost:8787"
TIMEOUT = 30

def test_check_health_and_version_endpoints_response_and_data_accuracy():
    health_url = f"{BASE_URL}/api/health"
    version_url = f"{BASE_URL}/api/version"
    headers = {"Accept": "application/json"}

    try:
        # Test /api/health endpoint
        health_response = requests.get(health_url, headers=headers, timeout=TIMEOUT)
        assert health_response.status_code == 200, f"/api/health returned status {health_response.status_code}"
        health_json = health_response.json()
        # Expected keys might be based on typical health checks such as 'status', 'uptime', 'db', etc.
        assert isinstance(health_json, dict), "/api/health response is not a JSON object"
        assert "status" in health_json, "/api/health response missing 'status' field"
        assert health_json["status"].lower() in {"ok", "healthy", "up"}, f"Unexpected health status: {health_json['status']}"
        # Optional: check for other common health attributes if present
        if "uptime" in health_json:
            assert isinstance(health_json["uptime"], (int, float)) and health_json["uptime"] >= 0, "Invalid uptime value"
        if "db" in health_json:
            # db could be a status string or sub-object, accept basic validation
            assert health_json["db"] in {"connected", "ok", "healthy", "up", True, False} or isinstance(health_json["db"], dict)

        # Test /api/version endpoint
        version_response = requests.get(version_url, headers=headers, timeout=TIMEOUT)
        assert version_response.status_code == 200, f"/api/version returned status {version_response.status_code}"
        version_json = version_response.json()
        assert isinstance(version_json, dict), "/api/version response is not a JSON object"
        # Check for expected version keys and values consistency
        # From PRD, project_version is "1.0.0"
        # Usually version endpoints might return version string or detailed info
        # Trying common fields: "version", "app_version", "build", "commit", "date"
        assert any(key in version_json for key in ["version", "app_version", "build", "commit", "date"]), \
            "No version-related keys found in /api/version response"
        version_str = version_json.get("version") or version_json.get("app_version")
        # If version string is present, verify it equals "1.0.0" or is non-empty string
        if version_str is not None:
            assert isinstance(version_str, str), "Version value is not a string"
            assert version_str.strip() != "", "Version string is empty"
            # Optional: check equals expected version from PRD
            # Allowing partial match or contains "1.0.0"
            assert "1.0.0" in version_str, f"Version string '{version_str}' does not contain expected '1.0.0'"
    except requests.exceptions.RequestException as e:
        assert False, f"Request to API failed: {e}"
    except ValueError as e:
        assert False, f"Invalid JSON response: {e}"

test_check_health_and_version_endpoints_response_and_data_accuracy()