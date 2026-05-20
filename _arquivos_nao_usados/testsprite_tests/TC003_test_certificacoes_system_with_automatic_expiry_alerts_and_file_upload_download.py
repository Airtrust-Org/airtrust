import requests
import io
import json

BASE_URL = "http://localhost:8787"
API_QUALIFICACOES = f"{BASE_URL}/api/qualificacoes"
API_CERTIFICADOS = f"{BASE_URL}/api/certificados"
TIMEOUT = 30

def test_certificacoes_system_with_automatic_expiry_alerts_and_file_upload_download():
    created_qualificacao_id = None
    created_certificado_id = None
    try:
        # 1) Create a new qualification (qualificacao)
        qualificacao_payload = {
            "nome": "Certificação Teste Automática",
            "descricao": "Teste inclusão de certificação para alerta de vencimento",
            "validade_meses": 1,  # short validity to test expiry alert
            "codigo": "TESTE123",
            "categoria": "TREINAMENTO"
        }
        response = requests.post(
            API_QUALIFICACOES,
            json=qualificacao_payload,
            timeout=TIMEOUT
        )
        assert response.status_code == 201, f"Unexpected status creating qualificacao: {response.status_code}, {response.text}"
        qual_data = response.json()
        created_qualificacao_id = qual_data.get("id")
        assert created_qualificacao_id is not None, "Created qualificacao does not have ID"

        # 2) Check the qualification appears on GET list and alert fields exist
        response = requests.get(API_QUALIFICACOES, timeout=TIMEOUT)
        assert response.status_code == 200, f"Failed to get qualificacoes: {response.status_code}"
        qualificacoes_list = response.json()
        assert any(q.get("id") == created_qualificacao_id for q in qualificacoes_list), "Created qualificacao not in list"

        # 3) Create a related certificate for that qualification with file upload
        # Prepare a dummy certificate file content (PDF mimetype)
        cert_file_content = b"%PDF-1.4 test PDF content for upload"
        files = {
            'file': ('certificado_teste.pdf', io.BytesIO(cert_file_content), 'application/pdf')
        }
        certificado_payload = {
            "qualificacao_id": created_qualificacao_id,
            "nome_certificado": "Certificado Teste Upload"
        }
        # POST /api/certificados with multipart form upload; metadata JSON passed as a form field
        data = {
            'metadata': json.dumps(certificado_payload)
        }
        response = requests.post(
            API_CERTIFICADOS,
            files=files,
            data=data,
            timeout=TIMEOUT
        )
        assert response.status_code == 201, f"Failed to create certificado with upload: {response.status_code} {response.text}"
        certificado_data = response.json()
        created_certificado_id = certificado_data.get("id")
        assert created_certificado_id is not None, "Created certificado does not have ID"

        # 4) Download the uploaded certificate file and verify content-type and content is correct
        download_url = f"{API_CERTIFICADOS}/{created_certificado_id}/download"
        response = requests.get(download_url, timeout=TIMEOUT)
        assert response.status_code == 200, f"Failed to download certificado file: {response.status_code}"
        content_type = response.headers.get("Content-Type")
        assert content_type == "application/pdf" or "pdf" in content_type.lower(), f"Unexpected Content-Type for certificado download: {content_type}"
        downloaded_content = response.content
        assert downloaded_content.startswith(b"%PDF"), "Downloaded certificado file does not appear to be a PDF"

        # 5) Validate automatic expiry alert logic - fetch qualification detail and check expiry alert fields
        detail_url = f"{API_QUALIFICACOES}/{created_qualificacao_id}"
        response = requests.get(detail_url, timeout=TIMEOUT)
        assert response.status_code == 200, "Failed to get qualificacao detail"
        qual_detail = response.json()
        # Expect keys for expiry alert, e.g. 'alerta_expiracao' (boolean) and 'data_expiracao'
        assert "alerta_expiracao" in qual_detail, "Expiry alert field missing in qualificacao detail"
        assert "data_expiracao" in qual_detail, "Expiry date field missing in qualificacao detail"

        # 6) Confirm synchronization of certification metadata and file reference exists in storage (simulate by re-fetching certificados)
        response = requests.get(API_CERTIFICADOS, timeout=TIMEOUT)
        assert response.status_code == 200, "Failed to get list of certificados"
        certificados_list = response.json()
        cert_entry = next((c for c in certificados_list if c.get("id") == created_certificado_id), None)
        assert cert_entry is not None, "Created certificado missing from list"
        # Validate keys indicative of synchronization/storage presence, e.g. "filename", "url" or "storage_key"
        assert any(k in cert_entry for k in ("filename", "url", "storage_key")), "Certificado storage metadata missing"

    finally:
        # Cleanup: Delete created certificado if exists
        if created_certificado_id is not None:
            try:
                del_response = requests.delete(f"{API_CERTIFICADOS}/{created_certificado_id}", timeout=TIMEOUT)
                assert del_response.status_code in (200,204), f"Failed to delete certificado: {del_response.status_code}"
            except Exception:
                pass
        # Cleanup: Delete created qualificacao if exists
        if created_qualificacao_id is not None:
            try:
                del_response = requests.delete(f"{API_QUALIFICACOES}/{created_qualificacao_id}", timeout=TIMEOUT)
                assert del_response.status_code in (200,204), f"Failed to delete qualificacao: {del_response.status_code}"
            except Exception:
                pass

test_certificacoes_system_with_automatic_expiry_alerts_and_file_upload_download()
