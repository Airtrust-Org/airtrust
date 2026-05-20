import requests
import io

BASE_URL = "http://localhost:8787"
API_PATH = "/api/pasta-virtual"
TIMEOUT = 30

# Assuming authentication with JWT is required; placeholder token
JWT_TOKEN = "your_jwt_token_here"

HEADERS = {
    "Authorization": f"Bearer {JWT_TOKEN}"
}


def test_pasta_virtual_document_upload_download_and_r2_synchronization():
    session = requests.Session()
    session.headers.update(HEADERS)
    doc_id = None

    try:
        # 1. Upload a document to /api/pasta-virtual (POST)
        upload_url = BASE_URL + API_PATH
        file_content = b"Test document content for pasta-virtual upload"
        files = {
            "file": ("test_document.txt", io.BytesIO(file_content), "text/plain")
        }
        # Additional fields might be required; sending minimal payload
        data = {
            "description": "Test document upload",
        }

        resp_upload = session.post(upload_url, files=files, data=data, timeout=TIMEOUT)
        assert resp_upload.status_code == 201, f"Upload failed: {resp_upload.status_code}, {resp_upload.text}"
        upload_resp_json = resp_upload.json()
        assert "id" in upload_resp_json, f"Upload response missing id: {upload_resp_json}"
        doc_id = upload_resp_json["id"]

        # 2. Retrieve the dashboard/list to confirm document presence
        dashboard_url = BASE_URL + API_PATH + "/dashboard"
        resp_dashboard = session.get(dashboard_url, timeout=TIMEOUT)
        assert resp_dashboard.status_code == 200, f"Dashboard fetch failed: {resp_dashboard.status_code}"
        dashboard_json = resp_dashboard.json()
        # Check that our uploaded document id is in the dashboard list
        documents = dashboard_json.get("documents") or dashboard_json.get("items") or []
        assert any(doc.get("id") == doc_id for doc in documents), "Uploaded document not found in dashboard list"

        # 3. Download the uploaded document by ID
        download_url = f"{BASE_URL}{API_PATH}/{doc_id}/download"
        resp_download = session.get(download_url, timeout=TIMEOUT)
        assert resp_download.status_code == 200, f"Download failed: {resp_download.status_code}"
        assert resp_download.content == file_content, "Downloaded content does not match uploaded content"

        # 4. Check /api/health and /api/version to confirm backend stability (extra sanity check)
        health_url = BASE_URL + "/api/health"
        resp_health = session.get(health_url, timeout=TIMEOUT)
        assert resp_health.status_code == 200, f"Health check failed: {resp_health.status_code}"

        version_url = BASE_URL + "/api/version"
        resp_version = session.get(version_url, timeout=TIMEOUT)
        assert resp_version.status_code == 200, f"Version check failed: {resp_version.status_code}"

    except requests.RequestException as e:
        assert False, f"RequestException occurred: {e}"
    finally:
        # Cleanup: Delete the uploaded document to keep environment clean
        if doc_id is not None:
            delete_url = f"{BASE_URL}{API_PATH}/{doc_id}"
            try:
                resp_delete = session.delete(delete_url, timeout=TIMEOUT)
                # Accept 200 or 204 as successful delete
                assert resp_delete.status_code in (200, 204), f"Delete failed: {resp_delete.status_code}"
            except requests.RequestException:
                # If cleanup fails, just pass to avoid masking test results
                pass


test_pasta_virtual_document_upload_download_and_r2_synchronization()