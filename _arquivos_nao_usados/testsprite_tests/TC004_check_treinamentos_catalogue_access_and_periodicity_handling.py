import requests
import time

BASE_URL = "http://localhost:8787"
TIMEOUT = 30
HEADERS = {
    "Accept": "application/json",
    # Include Authorization header if JWT token is needed, e.g.:
    # "Authorization": "Bearer <token>"
}

def check_treinamentos_catalogue_access_and_periodicity_handling():
    try:
        # 1. Test catalog listing accessibility and structure
        url_list = f"{BASE_URL}/api/treinamentos"
        resp_list = requests.get(url_list, headers=HEADERS, timeout=TIMEOUT)
        assert resp_list.status_code == 200, f"Expected 200 OK but got {resp_list.status_code}"
        data = resp_list.json()
        assert isinstance(data, list), "Response should be a list of treinamentos"

        # Ensure each treinamento has expected keys, including category and periodicity
        required_keys = {"id", "name", "category", "periodicity_days"}
        for treino in data:
            assert required_keys.issubset(treino.keys()), f"Missing keys in treinamento: {treino}"
            # category should be non-empty string
            assert isinstance(treino["category"], str) and treino["category"], "Invalid category"
            # periodicity_days should be integer and >= 0 (0 for no periodicity)
            assert isinstance(treino["periodicity_days"], int) and treino["periodicity_days"] >= 0, "Invalid periodicity_days"

        if not data:
            # To test periodicity rules, create a new treinamento
            create_url = f"{BASE_URL}/api/treinamentos"
            new_treinamento = {
                "name": "Test Training Periodicity",
                "category": "Operator Safety",
                "periodicity_days": 180
            }
            resp_create = requests.post(create_url, json=new_treinamento, headers=HEADERS, timeout=TIMEOUT)
            assert resp_create.status_code == 201, f"Expected 201 Created but got {resp_create.status_code}"
            created = resp_create.json()
            created_id = created.get("id")
            assert created_id, "No ID returned on treinamento creation"

            # Verify retrieval of created treinamento details
            get_url = f"{BASE_URL}/api/treinamentos/{created_id}"
            resp_get = requests.get(get_url, headers=HEADERS, timeout=TIMEOUT)
            assert resp_get.status_code == 200, f"Expected 200 OK for created treinamento but got {resp_get.status_code}"
            treino_detail = resp_get.json()
            assert treino_detail.get("name") == new_treinamento["name"], "Created treinamento name mismatch"
            assert treino_detail.get("category") == new_treinamento["category"], "Created treinamento category mismatch"
            assert treino_detail.get("periodicity_days") == new_treinamento["periodicity_days"], "Created treinamento periodicity mismatch"

            # Simulate periodicity enforcement test:
            # For a real system, this might involve verifying that an operator training record
            # requires renewal after periodicity_days. Here we test that the periodicity value is enforced and numeric.
            assert treino_detail["periodicity_days"] > 0, "Periodicity should be positive for operator training"

            # Clean up created resource
            resp_delete = requests.delete(get_url, headers=HEADERS, timeout=TIMEOUT)
            assert resp_delete.status_code in (200, 204), f"Expected 200 or 204 on delete but got {resp_delete.status_code}"

        else:
            # If we have existing treinamentos, verify periodicity rules on first one
            treino = data[0]
            treino_id = treino.get("id")
            # Get details by id
            get_url = f"{BASE_URL}/api/treinamentos/{treino_id}"
            resp_get = requests.get(get_url, headers=HEADERS, timeout=TIMEOUT)
            assert resp_get.status_code == 200, "Failed to get treinamento details"
            treino_detail = resp_get.json()

            # Check periodicity_days is integer >=0
            periodicity = treino_detail.get("periodicity_days")
            assert isinstance(periodicity, int) and periodicity >= 0, "Invalid periodicity_days value"

            # Confirm category and name presence
            assert isinstance(treino_detail.get("category"), str) and treino_detail.get("category"), "Invalid category in detail"
            assert isinstance(treino_detail.get("name"), str) and treino_detail.get("name"), "Invalid name in detail"

        # Additional checks for server stability & error handling by repeated requests
        for _ in range(5):
            r = requests.get(url_list, headers=HEADERS, timeout=TIMEOUT)
            assert r.status_code == 200, "Repeated GET requests should not fail"
            time.sleep(0.2)

    except AssertionError:
        raise
    except requests.exceptions.RequestException as e:
        raise AssertionError(f"Request failed: {e}")

check_treinamentos_catalogue_access_and_periodicity_handling()