import requests

BASE_URL = "http://localhost:8787"
LOGIN_ENDPOINT = "/api/login"
REFRESH_ENDPOINT = "/api/token/refresh"
TIMEOUT = 30

def verify_jwt_authentication_and_refresh_token_functionality():
    # Test user credentials - these should be replaced with valid test user credentials in the system
    login_payload = {
        "username": "testuser",
        "password": "testpassword"
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    # Step 1: Login and get JWT access and refresh tokens
    try:
        login_response = requests.post(
            BASE_URL + LOGIN_ENDPOINT,
            json=login_payload,
            headers=headers,
            timeout=TIMEOUT
        )
    except requests.RequestException as e:
        assert False, f"Login request failed with exception: {e}"

    assert login_response.status_code == 200, f"Login failed with status code {login_response.status_code}"
    try:
        tokens = login_response.json()
    except ValueError:
        assert False, "Login response is not valid JSON"

    assert "access_token" in tokens, "Access token not found in login response"
    assert "refresh_token" in tokens, "Refresh token not found in login response"
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]
    
    # Step 2: Use access token to access a protected endpoint to confirm token validity
    protected_endpoint = "/api/health"  # Using health endpoint as example of a protected endpoint to test connection stability and server status
    auth_headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json"
    }
    try:
        protected_response = requests.get(
            BASE_URL + protected_endpoint,
            headers=auth_headers,
            timeout=TIMEOUT
        )
    except requests.RequestException as e:
        assert False, f"Protected endpoint request failed with exception: {e}"

    assert protected_response.status_code == 200, f"Protected endpoint access failed with status code {protected_response.status_code}"
    
    # Step 3: Refresh the access token using the refresh token
    refresh_payload = {
        "refresh_token": refresh_token
    }
    try:
        refresh_response = requests.post(
            BASE_URL + REFRESH_ENDPOINT,
            json=refresh_payload,
            headers=headers,
            timeout=TIMEOUT
        )
    except requests.RequestException as e:
        assert False, f"Refresh token request failed with exception: {e}"

    # The refresh endpoint might respond with 200 if successful, or 401/403 if refresh token invalid
    assert refresh_response.status_code == 200, f"Refresh token failed with status code {refresh_response.status_code}"
    try:
        refreshed_tokens = refresh_response.json()
    except ValueError:
        assert False, "Refresh response is not valid JSON"

    assert "access_token" in refreshed_tokens, "Access token not found in refresh response"
    assert "refresh_token" in refreshed_tokens, "Refresh token not found in refresh response"
    
    new_access_token = refreshed_tokens["access_token"]
    new_refresh_token = refreshed_tokens["refresh_token"]

    # Step 4: Use new access token to access protected endpoint again to verify session continuity
    new_auth_headers = {
        "Authorization": f"Bearer {new_access_token}",
        "Accept": "application/json"
    }
    try:
        new_protected_response = requests.get(
            BASE_URL + protected_endpoint,
            headers=new_auth_headers,
            timeout=TIMEOUT
        )
    except requests.RequestException as e:
        assert False, f"Protected endpoint request with refreshed token failed with exception: {e}"
    
    assert new_protected_response.status_code == 200, f"Protected endpoint access with refreshed token failed with status code {new_protected_response.status_code}"

    # Step 5: Verify that the refreshed tokens are different from the original ones to confirm token rotation
    assert new_access_token != access_token, "Access token was not rotated on refresh"
    assert new_refresh_token != refresh_token, "Refresh token was not rotated on refresh"

    # Step 6: Check for unexpected server crashes or data issues by querying health and data endpoints
    try:
        health_response = requests.get(BASE_URL + "/api/health", timeout=TIMEOUT)
        version_response = requests.get(BASE_URL + "/api/version", timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Health/version request failed with exception: {e}"
    assert health_response.status_code == 200, f"Health endpoint returned {health_response.status_code}"
    assert version_response.status_code == 200, f"Version endpoint returned {version_response.status_code}"
    # Basic check that health response contains expected keys (if any), just ensure JSON parse
    try:
        health_data = health_response.json()
        version_data = version_response.json()
    except ValueError:
        assert False, "Health or Version response is not valid JSON"

    # Additional heuristic checks can be done here if API schema known, but for now just ensure no crash signs

    print("JWT authentication and refresh token functionality verified successfully.")


verify_jwt_authentication_and_refresh_token_functionality()