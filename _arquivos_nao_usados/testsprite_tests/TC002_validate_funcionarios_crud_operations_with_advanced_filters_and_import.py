import requests
import io
import csv

BASE_URL = "http://localhost:8787"
FUNCIONARIOS_ENDPOINT = "/api/funcionarios"
FUNCIONARIOS_IMPORT_ENDPOINT = "/api/funcionarios/import"
TIMEOUT = 30

HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
}


def test_validate_funcionarios_crud_operations_with_advanced_filters_and_import():
    funcionario_id = None

    funcionario_payload = {
        "matricula": "00001",
        "nome": "Teste Funcionario",
        "email": "teste.funcionario@example.com",
        "cpf": "12345678900",
        "telefone": "+5511999999999",
        "setor": "Operações",
        "funcao": "Piloto",
        "codigo_anac": "ANAC123456",
        "aso_data_exame": "2025-10-01",
        "aso_resultado": "Apto",
        "cma_registro": "CMA987654",
        "cma_validade": "2028-05-15"
    }

    try:
        resp_create = requests.post(
            f"{BASE_URL}{FUNCIONARIOS_ENDPOINT}",
            json=funcionario_payload,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert resp_create.status_code == 201, f"Create funcionario failed: {resp_create.text}"
        created_data = resp_create.json()
        funcionario_id = created_data.get("id")
        assert funcionario_id is not None, "Created funcionario has no ID"

        resp_get = requests.get(
            f"{BASE_URL}{FUNCIONARIOS_ENDPOINT}/{funcionario_id}",
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert resp_get.status_code == 200, f"Get funcionario by ID failed: {resp_get.text}"
        data_get = resp_get.json()
        assert data_get.get("nome") == funcionario_payload["nome"], "Nome mismatch on get"
        assert data_get.get("codigo_anac") == funcionario_payload["codigo_anac"], "Codigo ANAC mismatch"
        assert data_get.get("aso_resultado") == funcionario_payload["aso_resultado"], "ASO resultado mismatch"
        assert data_get.get("cma_registro") == funcionario_payload["cma_registro"], "CMA registro mismatch"

        updated_payload = {
            "nome": "Funcionario Atualizado",
            "telefone": "+5511988888888",
            "codigo_anac": "ANAC654321",
            "aso_data_exame": "2025-11-01",
            "aso_resultado": "Apto",
            "cma_registro": "CMA123456",
            "cma_validade": "2029-12-31"
        }
        resp_update = requests.put(
            f"{BASE_URL}{FUNCIONARIOS_ENDPOINT}/{funcionario_id}",
            json=updated_payload,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert resp_update.status_code == 200, f"Update funcionario failed: {resp_update.text}"

        resp_get_upd = requests.get(
            f"{BASE_URL}{FUNCIONARIOS_ENDPOINT}/{funcionario_id}",
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert resp_get_upd.status_code == 200, f"Get updated funcionario failed: {resp_get_upd.text}"
        data_updated = resp_get_upd.json()
        assert data_updated.get("nome") == updated_payload["nome"], "Nome mismatch after update"
        assert data_updated.get("telefone") == updated_payload["telefone"], "Telefone mismatch after update"
        assert data_updated.get("codigo_anac") == updated_payload["codigo_anac"], "Codigo ANAC mismatch after update"
        assert data_updated.get("aso_data_exame") == updated_payload["aso_data_exame"], "ASO data exame mismatch after update"
        assert data_updated.get("cma_validade") == updated_payload["cma_validade"], "CMA validade mismatch after update"

        filter_params = {
            "nome": "Funcionario Atualizado",
            "codigo_anac": "ANAC654"
        }
        resp_filter = requests.get(
            f"{BASE_URL}{FUNCIONARIOS_ENDPOINT}",
            headers=HEADERS,
            params=filter_params,
            timeout=TIMEOUT,
        )
        assert resp_filter.status_code == 200, f"Filter funcionarios failed: {resp_filter.text}"
        filtered_list = resp_filter.json()
        assert isinstance(filtered_list, list), "Filtered funcionarios response is not a list"
        assert any(f.get("id") == funcionario_id for f in filtered_list), "Updated funcionario not in filtered results"

        csv_content = io.StringIO()
        csv_writer = csv.writer(csv_content)
        csv_writer.writerow([
            "nome", "email", "cpf", "telefone", "setor", "funcao",
            "anac_registro", "anac_validade",
            "aso_data_exame", "aso_resultado",
            "cma_registro", "cma_validade"
        ])
        csv_writer.writerow([
            "CSV Func1", "csv1@example.com", "11122233300", "+5511911111111", "TI", "Analista",
            "ANACC123", "2027-05-30",
            "2025-09-01", "Apto",
            "CMAXYZ1", "2030-12-01"
        ])
        csv_writer.writerow([
            "CSV Func2", "csv2@example.com", "44455566600", "+5511922222222", "Financeiro", "Gerente",
            "ANACD456", "2028-04-15",
            "2025-10-15", "Apto",
            "CMADEF2", "2031-07-22"
        ])
        csv_content.seek(0)

        files = {
            "file": ("funcionarios_import.csv", csv_content.getvalue(), "text/csv"),
        }
        resp_import = requests.post(
            f"{BASE_URL}{FUNCIONARIOS_IMPORT_ENDPOINT}",
            headers={"Accept": "application/json"},
            files=files,
            timeout=TIMEOUT,
        )
        assert resp_import.status_code in {200, 201}, f"CSV import failed: {resp_import.text}"
        import_result = resp_import.json()
        assert any(k in import_result for k in ("imported", "success")), "CSV import response missing success indication"

    finally:
        if funcionario_id:
            try:
                resp_delete = requests.delete(
                    f"{BASE_URL}{FUNCIONARIOS_ENDPOINT}/{funcionario_id}",
                    headers=HEADERS,
                    timeout=TIMEOUT,
                )
                assert resp_delete.status_code in {200, 204}, f"Delete funcionario failed: {resp_delete.text}"
            except Exception as e:
                print(f"Cleanup error deleting funcionario ID {funcionario_id}: {e}")


test_validate_funcionarios_crud_operations_with_advanced_filters_and_import()
