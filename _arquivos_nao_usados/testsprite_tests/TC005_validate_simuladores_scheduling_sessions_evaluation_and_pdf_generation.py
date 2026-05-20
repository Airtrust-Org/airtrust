import requests
import uuid

BASE_URL = "http://localhost:8787"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json",
    # Add Authorization header here if JWT token is required, e.g.:
    # "Authorization": f"Bearer {YOUR_JWT_TOKEN}"
}

def validate_simuladores_scheduling_sessions_evaluation_and_pdf_generation():
    # Step 1: Create a new simulador resource (schedule a simulator session)
    simulador_data = {
        "nome": "Test Simulador " + str(uuid.uuid4()),
        "descricao": "Simulador de teste",
        "local": "Sala 1",
        "ativo": True
    }
    simulador_id = None
    sessao_id = None
    ficha_id = None

    try:
        # Create simulador
        r = requests.post(f"{BASE_URL}/api/simuladores", json=simulador_data, headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code == 201, f"Failed to create simulador, status code: {r.status_code}, response: {r.text}"
        simulador_resp = r.json()
        simulador_id = simulador_resp.get("id")
        assert simulador_id is not None, "Simulador ID missing in creation response"

        # Step 2: Schedule a simulator session for this simulador
        sessao_data = {
            "simuladorId": simulador_id,
            "dataHora": "2025-12-01T10:00:00Z",
            "duracaoMinutos": 60,
            "instrutor": "Instrutor Teste"
        }
        r = requests.post(f"{BASE_URL}/api/simuladores/sessoes", json=sessao_data, headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code == 201, f"Failed to create simulador session, status code: {r.status_code}, response: {r.text}"
        sessao_resp = r.json()
        sessao_id = sessao_resp.get("id")
        assert sessao_id is not None, "Sessao ID missing in creation response"

        # Step 3: Create an evaluation form (ficha) tied to the session
        ficha_data = {
            "sessaoId": sessao_id,
            "avaliador": "Avaliador Teste",
            "comentarios": "Avaliação inicial",
            "notas": {
                "habilidade": 8,
                "controle": 7,
                "comunicacao": 9
            }
        }
        r = requests.post(f"{BASE_URL}/api/simuladores/fichas", json=ficha_data, headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code == 201, f"Failed to create evaluation form, status code: {r.status_code}, response: {r.text}"
        ficha_resp = r.json()
        ficha_id = ficha_resp.get("id") or ficha_resp.get("uuid")
        assert ficha_id is not None, "Ficha ID missing in creation response"

        # Step 4: Fetch the evaluation form PDF data for the ficha
        r = requests.get(f"{BASE_URL}/api/simulador/ficha/{ficha_id}/dados-pdf", headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code == 200, f"Failed to get PDF data, status code: {r.status_code}, response: {r.text}"
        
        # Basic checks on PDF content response
        content_type = r.headers.get("Content-Type", "")
        assert content_type in ["application/pdf", "application/octet-stream"], f"Unexpected content type for PDF: {content_type}"
        content_length = r.headers.get("Content-Length")
        assert content_length is None or int(content_length) > 0, "PDF content length is zero"

        # Optional: further validate PDF content bytes start with %PDF
        pdf_start = r.content[:4]
        assert pdf_start == b"%PDF", f"PDF content does not start with %PDF, content start bytes: {pdf_start}"

        # Step 5: Test connection stability and data fetching by listing all simuladores and sessions
        r = requests.get(f"{BASE_URL}/api/simuladores", headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code == 200, f"Failed to list simuladores, status code: {r.status_code}, response: {r.text}"
        simuladores_list = r.json()
        assert isinstance(simuladores_list, list), "Expected list of simuladores"

        r = requests.get(f"{BASE_URL}/api/simuladores/sessoes", headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code == 200, f"Failed to list simuladores sessions, status code: {r.status_code}, response: {r.text}"
        sessoes_list = r.json()
        assert isinstance(sessoes_list, list), "Expected list of sessions"

        # Step 6: Test error handling for invalid ficha UUID in PDF generation
        invalid_uuid = str(uuid.uuid4())
        r = requests.get(f"{BASE_URL}/api/simulador/ficha/{invalid_uuid}/dados-pdf", headers=HEADERS, timeout=TIMEOUT)
        assert r.status_code in [400, 404], f"Expected error on invalid ficha id, got {r.status_code}"

    finally:
        # Cleanup: delete created resources to avoid polluting test DB
        # Delete evaluation form (ficha)
        if ficha_id:
            try:
                requests.delete(f"{BASE_URL}/api/simuladores/fichas/{ficha_id}", headers=HEADERS, timeout=TIMEOUT)
            except Exception:
                pass
        # Delete session
        if sessao_id:
            try:
                requests.delete(f"{BASE_URL}/api/simuladores/sessoes/{sessao_id}", headers=HEADERS, timeout=TIMEOUT)
            except Exception:
                pass
        # Delete simulador
        if simulador_id:
            try:
                requests.delete(f"{BASE_URL}/api/simuladores/{simulador_id}", headers=HEADERS, timeout=TIMEOUT)
            except Exception:
                pass


validate_simuladores_scheduling_sessions_evaluation_and_pdf_generation()