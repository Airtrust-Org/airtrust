#!/bin/bash
# Script automático: Vincular 220 manobras aos 10 modelos de sessão (IDs 25-34)

set -e

echo "🔗 VINCULANDO 220 MANOBRAS AOS 10 MODELOS DE SESSÃO"
echo "===================================================="
echo ""

cd "$(dirname "$0")/../worker-airtrust"

# Função para inserir manobras de uma sessão
vincular_sessao() {
    local sessao_id=$1
    local sessao_nome=$2
    shift 2
    local codigos=("$@")
    
    echo "📋 Sessão $sessao_id - $sessao_nome (${#codigos[@]} manobras)"
    
    for i in "${!codigos[@]}"; do
        local ordem=$((i + 1))
        local codigo="${codigos[$i]}"
        
        # Executar INSERT direto no banco remoto
        npx wrangler d1 execute DB --remote --command="INSERT OR IGNORE INTO template_manobras (template_id, manobra_id, ordem, obrigatoria) SELECT $sessao_id, id, $ordem, 1 FROM cadastro_manobras WHERE codigo='$codigo';" > /dev/null 2>&1 || echo "  ⚠️  Erro: $codigo"
    done
    
    echo "  ✅ Concluído"
}

# SESSÃO 25: FAMILIARIZAÇÃO
vincular_sessao 25 "FAMILIARIZAÇÃO" \
    "FLY-BAS-X1" "FLY-BAS-X3" "OPS-NRM-X1" "WAR-LOW-29" "CAU-HOT-65" \
    "FLY-BAS-17" "WAR-OUT-15" "NAV-BAS-X2" "OPS-NRM-02" "FLY-BAS-05" \
    "FLY-BAS-06" "FLY-BAS-08" "FLY-BAS-09" "FLY-BAS-11" "APP-NRM-01" \
    "APP-NRM-02" "OPS-NRM-06" "FLY-BAS-18" "FLY-BAS-19" "OPS-NRM-08" \
    "FLY-BAS-20" "OPS-NRM-10"

# SESSÃO 26: EMERGÊNCIAS POWERPLANT
vincular_sessao 26 "EMERGÊNCIAS POWERPLANT" \
    "FLY-BAS-17" "WAR-OUT-15" "WAR-EEC-18" "CAU-CST-59" "WAR-FIR-21" \
    "CAU-OIL-68" "WAR-PWR-22" "FLY-BAS-19" "OPS-NRM-02" "OPS-NRM-08" \
    "FLY-BAS-05" "FLY-BAS-06" "FLY-BAS-08" "FLY-BAS-09" "APP-NRM-01" \
    "FLY-BAS-20" "WAR-LOW-29" "CAU-HOT-65" "OPS-NRM-06" "FLY-BAS-11" \
    "FLY-BAS-18" "APP-NRM-02"

# SESSÃO 27: SISTEMA ELÉTRICO & NOTURNO
vincular_sessao 27 "SISTEMA ELÉTRICO & NOTURNO" \
    "WAR-GEN-11" "WAR-BAT-14" "CAU-DCG-53" "OPS-NIG-03" "APP-NIG-05" \
    "FLY-BAS-17" "WAR-OUT-15" "OPS-NRM-02" "OPS-NRM-08" "FLY-BAS-05" \
    "FLY-BAS-06" "FLY-BAS-08" "FLY-BAS-09" "FLY-BAS-11" "APP-NRM-01" \
    "FLY-BAS-20" "OPS-NRM-06" "FLY-BAS-18" "NAV-BAS-X2" "APP-NRM-02" \
    "WAR-LOW-29" "FLY-BAS-19"

# SESSÃO 28: IFR & NAVEGAÇÃO AVANÇADA
vincular_sessao 28 "IFR & NAVEGAÇÃO AVANÇADA" \
    "NAV-IFR-10" "APP-IFR-15" "APP-IFR-16" "APP-IFR-17" "NAV-IFR-12" \
    "APP-IFR-18" "NAV-IFR-14" "FLY-BAS-17" "OPS-NRM-02" "OPS-NRM-08" \
    "FLY-BAS-05" "FLY-BAS-06" "FLY-BAS-08" "FLY-BAS-09" "FLY-BAS-11" \
    "FLY-BAS-20" "WAR-OUT-15" "OPS-NRM-06" "FLY-BAS-18" "NAV-BAS-X2" \
    "APP-NRM-01" "APP-NRM-02"

# SESSÃO 29: AFCS & AUTOPILOT
vincular_sessao 29 "AFCS & AUTOPILOT" \
    "OPS-AUT-20" "OPS-AUT-21" "OPS-AUT-22" "OPS-AUT-23" "WAR-AUT-25" \
    "OPS-AUT-26" "CAU-AUT-70" "FLY-BAS-17" "OPS-NRM-02" "OPS-NRM-08" \
    "FLY-BAS-05" "FLY-BAS-06" "FLY-BAS-08" "FLY-BAS-09" "APP-IFR-15" \
    "NAV-IFR-10" "NAV-IFR-12" "FLY-BAS-11" "FLY-BAS-20" "WAR-OUT-15" \
    "OPS-NRM-06" "APP-NRM-01"

# SESSÃO 30: OFFSHORE & CONFINED AREAS
vincular_sessao 30 "OFFSHORE & CONFINED AREAS" \
    "OPS-OFF-30" "OPS-OFF-31" "OPS-OFF-32" "WAR-OFF-35" "OPS-OFF-36" \
    "OPS-OFF-37" "FLY-BAS-17" "FLY-BAS-05" "FLY-BAS-06" "FLY-BAS-18" \
    "OPS-NRM-02" "OPS-NRM-08" "FLY-BAS-08" "FLY-BAS-09" "FLY-BAS-11" \
    "APP-NRM-01" "FLY-BAS-20" "WAR-OUT-15" "NAV-BAS-X2" "OPS-NRM-06" \
    "WAR-LOW-29" "FLY-BAS-19"

# SESSÃO 31: EMERGÊNCIAS SISTÊMICAS
vincular_sessao 31 "EMERGÊNCIAS SISTÊMICAS" \
    "WAR-HYD-40" "WAR-TRB-41" "CAU-HYD-72" "WAR-SMO-42" "CAU-VIB-75" \
    "FLY-BAS-17" "WAR-OUT-15" "FLY-BAS-19" "OPS-NRM-02" "OPS-NRM-08" \
    "FLY-BAS-05" "FLY-BAS-06" "FLY-BAS-08" "FLY-BAS-09" "FLY-BAS-11" \
    "APP-NRM-01" "FLY-BAS-20" "OPS-NRM-06" "FLY-BAS-18" "WAR-LOW-29" \
    "CAU-HOT-65" "APP-NRM-02"

# SESSÃO 32: ADVANCED MANEUVERS
vincular_sessao 32 "ADVANCED MANEUVERS" \
    "FLY-ADV-50" "FLY-ADV-51" "FLY-ADV-52" "FLY-ADV-53" "OPS-NRM-55" \
    "FLY-BAS-17" "FLY-BAS-05" "FLY-BAS-06" "FLY-BAS-18" "FLY-BAS-19" \
    "OPS-NRM-02" "OPS-NRM-08" "FLY-BAS-08" "FLY-BAS-09" "FLY-BAS-11" \
    "APP-NRM-01" "FLY-BAS-20" "WAR-OUT-15" "OPS-NRM-06" "NAV-BAS-X2" \
    "APP-NRM-02" "WAR-LOW-29"

# SESSÃO 33: WEATHER & ENVIRONMENT
vincular_sessao 33 "WEATHER & ENVIRONMENT" \
    "OPS-WEA-60" "OPS-WEA-61" "OPS-WEA-62" "CAU-WEA-80" "FLY-BAS-17" \
    "FLY-BAS-05" "FLY-BAS-06" "FLY-BAS-18" "OPS-NRM-02" "OPS-NRM-08" \
    "FLY-BAS-08" "FLY-BAS-09" "FLY-BAS-11" "APP-NRM-01" "APP-NRM-02" \
    "FLY-BAS-20" "WAR-OUT-15" "NAV-BAS-X2" "OPS-NRM-06" "APP-IFR-15" \
    "NAV-IFR-10" "OPS-NIG-03"

# SESSÃO 34: PROFICIENCY CHECK
vincular_sessao 34 "PROFICIENCY CHECK" \
    "OPS-CHK-70" "OPS-CHK-71" "FLY-CHK-72" "APP-CHK-73" "OPS-CHK-75" \
    "FLY-BAS-17" "FLY-BAS-05" "FLY-BAS-19" "WAR-OUT-15" "WAR-LOW-29" \
    "APP-IFR-15" "APP-IFR-16" "NAV-IFR-10" "NAV-IFR-12" "OPS-OFF-30" \
    "OPS-OFF-31" "WAR-HYD-40" "WAR-GEN-11" "OPS-NRM-02" "OPS-NRM-08" \
    "FLY-BAS-20" "APP-NRM-01"

echo ""
echo "✅ VINCULAÇÃO COMPLETA!"
echo ""
echo "📊 Verificando resultado..."
npx wrangler d1 execute DB --remote --command="SELECT template_id, COUNT(*) as qtd FROM template_manobras WHERE deleted_at IS NULL AND template_id BETWEEN 25 AND 34 GROUP BY template_id ORDER BY template_id;" 2>&1 | grep -A 15 "template_id" || echo "Consultando..."

echo ""
echo "🎉 PROCESSO CONCLUÍDO!"
