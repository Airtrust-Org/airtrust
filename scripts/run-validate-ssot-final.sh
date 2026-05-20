#!/usr/bin/env bash
set -euo pipefail

DB_BINDING="airtrust-db"
echo "[VALIDACAO] Executando validação final SSOT contra DB remoto (--remote)..."
wrangler d1 execute "$DB_BINDING" --remote --file scripts/validate-ssot-final.sql | sed 's/\t/ | /g'
echo "[VALIDACAO] Finalizado."
