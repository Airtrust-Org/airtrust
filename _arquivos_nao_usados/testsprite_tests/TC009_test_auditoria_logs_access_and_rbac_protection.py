import requests

BASE_URL = "http://localhost:8787"
AUDIT_ENDPOINT = "/api/auditoria"
AUDIT_LOGS_ENDPOINT = "/api/auditoria/logs"
TIMEOUT = 30

# Example tokens, replace with valid JWTs for admin and unauthorized user
ADMIN_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin.token"
USER_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user.token"
INVALID_JWT = "invalid.token.value"


def test_auditoria_logs_access_and_rbac_protection():
    headers_admin = {
        "Authorization": f"Bearer {ADMIN_JWT}",
        "Accept": "application/json",
    }
    headers_user = {
        "Authorization": f"Bearer {USER_JWT}",
        "Accept": "application/json",
    }
    headers_invalid = {
        "Authorization": f"Bearer {INVALID_JWT}",
        "Accept": "application/json",
    }

    # 1. Verify access to /api/auditoria/logs with admin token (Authorized)
    try:
        resp_admin = requests.get(f"{BASE_URL}{AUDIT_LOGS_ENDPOINT}", headers=headers_admin, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Admin request failed with exception: {e}"
    assert resp_admin.status_code == 200, f"Expected 200 for admin access, got {resp_admin.status_code}"
    try:
        logs = resp_admin.json()
    except ValueError:
        assert False, "Admin response is not valid JSON"
    assert isinstance(logs, list), "Audit logs response should be a list"
    # Check at least one log has expected keys if any logs exist
    if logs:
        required_keys = {"id", "timestamp", "user", "action", "details"}
        assert required_keys.issubset(logs[0].keys()), "Audit log entries missing expected keys"

    # 2. Verify access to /api/auditoria/logs with normal user token (Unauthorized)
    try:
        resp_user = requests.get(f"{BASE_URL}{AUDIT_LOGS_ENDPOINT}", headers=headers_user, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"User request failed with exception: {e}"
    # Access should be denied, e.g., 403 Forbidden or 401 Unauthorized
    assert resp_user.status_code in (401, 403), f"Expected 401 or 403 for unauthorized user, got {resp_user.status_code}"

    # 3. Verify access to /api/auditoria/logs with invalid token (Unauthorized)
    try:
        resp_invalid = requests.get(f"{BASE_URL}{AUDIT_LOGS_ENDPOINT}", headers=headers_invalid, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Invalid token request failed with exception: {e}"
    assert resp_invalid.status_code in (401, 403), f"Expected 401 or 403 for invalid token, got {resp_invalid.status_code}"

    # 4. Verify access to /api/auditoria/logs without token (Unauthorized)
    try:
        resp_noauth = requests.get(f"{BASE_URL}{AUDIT_LOGS_ENDPOINT}", timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"No-auth request failed with exception: {e}"
    assert resp_noauth.status_code in (401, 403), f"Expected 401 or 403 for missing token, got {resp_noauth.status_code}"

    # 5. Verify basic POST operation is logged
    # To test audit log recording, we attempt an auditable operation (e.g., create a new audit record if supported)
    # But as the PRD suggests logs are automatic, we simulate create a dummy audit entry via POST if allowed or
    # perform a read that should generate a log, then confirm new log entry exists.

    # If POST on /api/auditoria is supported as per PRD (not explicit), try POST with admin
    new_audit_entry = {
        "action": "TEST_ACTION",
        "details": "Creating test audit log entry"
    }

    # Attempt POST to /api/auditoria with admin
    try:
        resp_post = requests.post(f"{BASE_URL}{AUDIT_ENDPOINT}", json=new_audit_entry, headers=headers_admin, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Admin POST request failed with exception: {e}"

    # The API may or may not support POST, accepting 201 Created or 405 Method Not Allowed
    if resp_post.status_code == 201:
        # Verify the log entry is present in logs fetch
        try:
            resp_logs_after = requests.get(f"{BASE_URL}{AUDIT_LOGS_ENDPOINT}", headers=headers_admin, timeout=TIMEOUT)
        except requests.RequestException as e:
            assert False, f"Fetching audit logs after POST failed: {e}"
        assert resp_logs_after.status_code == 200, f"Expected 200 when fetching audit logs after POST, got {resp_logs_after.status_code}"
        logs_after = resp_logs_after.json()
        # Check if new log is recorded with the action TEST_ACTION
        found = any(log.get("action") == "TEST_ACTION" and "Creating test audit log entry" in log.get("details", "") for log in logs_after)
        assert found, "New audit log entry not found after POST operation"
    else:
        # If POST is not allowed, verify proper error handling, e.g., 405
        assert resp_post.status_code in (405, 403), f"Expected 201 or 405 or 403 for POST on audit endpoint, got {resp_post.status_code}"

    # 6. Check stability by multiple requests with admin token to /api/auditoria/logs
    for _ in range(3):
        try:
            r = requests.get(f"{BASE_URL}{AUDIT_LOGS_ENDPOINT}", headers=headers_admin, timeout=TIMEOUT)
        except requests.RequestException as e:
            assert False, f"Repeated admin request failed with exception: {e}"
        assert r.status_code == 200, f"Expected 200 status on repeated logs fetch, got {r.status_code}"
        # Validate still JSON list
        try:
            data = r.json()
        except ValueError:
            assert False, "Repeated response is not valid JSON"
        assert isinstance(data, list), "Repeated audit logs response should be a list"


test_auditoria_logs_access_and_rbac_protection()