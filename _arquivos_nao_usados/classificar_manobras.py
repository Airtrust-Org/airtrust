#!/usr/bin/env python3
import requests
import json

API_URL = "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

# Mapeamento: código da manobra -> categoria
CLASSIFICACAO = {
    # 1. CONTROLE BÁSICO (FLY-BAS)
    "FLY-BAS-X1": "FLY-BAS",
    "FLY-BAS-X2": "FLY-BAS",
    "FLY-BAS-X3": "FLY-BAS",
    "FLY-BAS-X4": "FLY-BAS",
    "FLY-BAS-17": "FLY-BAS",
    
    # 2. OPERAÇÕES NORMAIS (OPS-NRM)
    "OPS-NRM-X1": "OPS-NRM",
    "OPS-NRM-X2": "OPS-NRM",
    "OPS-NRM-X3": "OPS-NRM",
    
    # 3. NAVEGAÇÃO (OPS-NAV)
    "OPS-NAV-X1": "OPS-NAV",
    "OPS-NAV-X2": "OPS-NAV",
    "OPS-NAV-X3": "OPS-NAV",
    "OPS-NAV-X4": "OPS-NAV",
    
    # 4. APROXIMAÇÕES (OPS-APP)
    "OPS-APP-X1": "OPS-APP",
    "OPS-APP-X2": "OPS-APP",
    "OPS-APP-X3": "OPS-APP",
    "OPS-APP-X4": "OPS-APP",
    
    # 5. OPERAÇÕES ESPECIAIS (OPS-ESP)
    "OPS-OFF-X1": "OPS-ESP",
    "OPS-OFF-X2": "OPS-ESP",
    "OPS-LOFT-X1": "OPS-ESP",
    
    # 6. EMG WARNING POWERPLANT
    "WAR-OUT-15": "EMG-WAR-PWR",
    "WAR-EEC-18": "EMG-WAR-PWR",
    "WAR-IDL-16": "EMG-WAR-PWR",
    "WAR-OIL-18": "EMG-WAR-PWR",
    
    # 7. EMG CAUTION POWERPLANT
    "CAU-HOT-65": "EMG-CAU-PWR",
    "CAU-CST-59": "EMG-CAU-PWR",
    "CAU-OVS-64": "EMG-CAU-PWR",
    "CAU-NGO-63": "EMG-CAU-PWR",
    "CAU-CND-61": "EMG-CAU-PWR",
    "CAU-TNF-62": "EMG-CAU-PWR",
    "CAU-LIC-60": "EMG-CAU-PWR",
    
    # 8. EMG CAUTION COMBUSTÍVEL
    "CAU-FLO-73": "EMG-CAU-FUEL",
    "CAU-2FP-74": "EMG-CAU-FUEL",
    "CAU-EFP-75": "EMG-CAU-FUEL",
    
    # 9. EMG WARNING ROTOR
    "WAR-LOW-29": "EMG-WAR-ROTR",
    "WAR-HIG-29": "EMG-WAR-ROTR",
    
    # 10. EMG WARNING TRANSMISSÃO
    "WAR-MGB-30": "EMG-WAR-TRAN",
    "WAR-TMP-30": "EMG-WAR-TRAN",
    "WAR-TDR-X1": "EMG-WAR-TRAN",
    "WAR-TCS-X1": "EMG-WAR-TRAN",
    "WAR-MRC-X1": "EMG-WAR-TRAN",
    "WAR-TRC-X1": "EMG-WAR-TRAN",
    
    # 11. EMG CAUTION TRANSMISSÃO
    "CAU-MGP-105": "EMG-CAU-TRAN",
    
    # 12. EMG CAUTION HIDRÁULICO
    "CAU-HYP-77": "EMG-CAU-HYD",
    "CAU-SRV-80": "EMG-CAU-HYD",
    
    # 13. EMG WARNING ELÉTRICO
    "WAR-GEN-11": "EMG-WAR-ELEC",
    "WAR-BAT-14": "EMG-WAR-ELEC",
    "WAR-AUX-14": "EMG-WAR-ELEC",
    
    # 14. EMG CAUTION ELÉTRICO
    "CAU-DCG-53": "EMG-CAU-ELEC",
    "CAU-BOF-55": "EMG-CAU-ELEC",
    "CAU-DCB-56": "EMG-CAU-ELEC",
    "CAU-ACB-57": "EMG-CAU-ELEC",
    "CAU-28D-58": "EMG-CAU-ELEC",
    
    # 15. EMG CAUTION AFCS
    "CAU-APO-38": "EMG-CAU-AFCS",
    "CAU-APF-37": "EMG-CAU-AFCS",
    "CAU-MIS-40": "EMG-CAU-AFCS",
    "CAU-SAS-41": "EMG-CAU-AFCS",
    "CAU-AFD-41": "EMG-CAU-AFCS",
    
    # 16. EMG CAUTION AVIÔNICOS
    "CAU-ADS-46": "EMG-CAU-AVIO",
    "CAU-AHR-47": "EMG-CAU-AVIO",
    "CAU-DUD-46": "EMG-CAU-AVIO",
    "CAU-PFD-45": "EMG-CAU-AVIO",
    "CAU-MFD-45": "EMG-CAU-AVIO",
    "CAU-EIC-45": "EMG-CAU-AVIO",
    "CAU-ADC-48": "EMG-CAU-AVIO",
    "CAU-GPS-52": "EMG-CAU-AVIO",
    "CAU-FMS-51": "EMG-CAU-AVIO",
    
    # 17. EMG WARNING AVIÔNICOS
    "WAR-STA-X1": "EMG-WAR-AVIO",
    
    # 18. EMG WARNING FOGO
    "WAR-FIR-21": "EMG-WAR-FIRE",
    "WAR-CAB-23": "EMG-WAR-FIRE",
    "WAR-BAG-23": "EMG-WAR-FIRE",
    
    # 19. EMG WARNING DIVERSOS
    "WAR-GER-27": "EMG-WAR-MISC",
    
    # 20. EMG CAUTION DIVERSOS
    "CAU-O2P-82": "EMG-CAU-MISC",
}

print("🎨 CLASSIFICANDO MANOBRAS POR CATEGORIA")
print("=" * 50)
print()

# Buscar todas as manobras
print("📋 Carregando manobras...")
resp = requests.get(f"{API_URL}/api/v2/manobras")
manobras = resp.json()["data"]
print(f"✅ {len(manobras)} manobras carregadas")
print()

# Criar dicionário código -> manobra
manobras_dict = {m["codigo"]: m for m in manobras}

# Atualizar categorias
sucesso = 0
erro = 0

for codigo, categoria in CLASSIFICACAO.items():
    if codigo not in manobras_dict:
        print(f"  ⚠️  {codigo} não encontrada")
        erro += 1
        continue
    
    manobra = manobras_dict[codigo]
    
    # Preparar payload
    payload = {
        "codigo": manobra["codigo"],
        "nome": manobra["nome"],
        "categoria": categoria,
        "tipo": manobra.get("tipo", "NORMAL"),
        "ativo": 1
    }
    
    # Atualizar
    resp = requests.put(
        f"{API_URL}/api/v2/manobras/{manobra['id']}",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    
    if resp.json().get("success"):
        print(f"  ✅ {codigo} → {categoria}")
        sucesso += 1
    else:
        print(f"  ❌ {codigo}: {resp.json().get('error', 'Erro desconhecido')}")
        erro += 1

print()
print("=" * 50)
print("✅ CLASSIFICAÇÃO CONCLUÍDA!")
print()
print("📊 RESUMO:")
print(f"  - Total: {len(CLASSIFICACAO)} manobras")
print(f"  - Sucesso: {sucesso}")
print(f"  - Erro: {erro}")
print(f"  - 20 categorias definidas")
print()
