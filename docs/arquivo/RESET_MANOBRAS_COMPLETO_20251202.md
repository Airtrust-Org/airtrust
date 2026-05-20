# Reset Completo de Manobras - 02/12/2025

## 🎯 Objetivo

Reset completo do banco de manobras, mantendo APENAS as 72 manobras únicas fornecidas na lista do usuário, e populando exatamente 220 relacionamentos nos 10 modelos de sessão (22 manobras cada).

## ✅ Execuções Realizadas

### 1. Reset Completo do Banco

**Script:** `reset-manobras-completo.sh`

```sql
PRAGMA foreign_keys = OFF;
DELETE FROM modelos_sessao_manobras;  -- Todos relacionamentos
DELETE FROM manobras;                  -- Todas manobras antigas
-- INSERT 72 manobras únicas
PRAGMA foreign_keys = ON;
```

**Resultado:**

- ✅ 808 rows written (72 manobras + audit)
- ✅ Database: 6.60 MB
- ✅ Tempo: 0.01s

### 2. População dos 220 Relacionamentos

**Script:** `seed-220-manobras-final.sh`

```sql
PRAGMA foreign_keys = OFF;
DELETE FROM modelos_sessao_manobras WHERE modelo_id BETWEEN 16 AND 25;

-- 10 blocos INSERT (um por modelo)
-- 22 INSERTs por bloco
-- 220 relacionamentos total

PRAGMA foreign_keys = ON;
```

**Resultado:**

- ✅ 1110 rows written (220 relacionamentos + audit)
- ✅ Database: 6.62 MB
- ✅ Tempo: 0.01s

## 📊 Dados Finais

### Manobras Criadas (72 únicas)

#### Controle & Procedimentos Básicos (8)

- `FLY-BAS-X1` - Controle geral VFR
- `FLY-BAS-X2` - Controle geral IFR
- `FLY-BAS-X3` - Hover & taxi
- `FLY-BAS-X4` - Recuperação atitudes anormais
- `FLY-BAS-17` - Autorotação
- `OPS-NRM-X1` - Procedimentos normais
- `OPS-NRM-X2` - Decolagens & pousos
- `OPS-NRM-X3` - Circuito de tráfego

#### Aproximações (4)

- `OPS-APP-X1` - Precision approach
- `OPS-APP-X2` - Non-precision approach
- `OPS-APP-X3` - Missed approach
- `OPS-APP-X4` - Aproximação grande ângulo

#### Navegação (4)

- `OPS-NAV-X1` - Navegação FMS & convencional
- `OPS-NAV-X2` - Uso AP & automação
- `OPS-NAV-X3` - Holding pattern
- `OPS-NAV-X4` - SID & STAR

#### Offshore (2)

- `OPS-OFF-X1` - Navegação offshore
- `OPS-OFF-X2` - Aproximação offshore

#### Warnings - Rotor (2)

- `WAR-LOW-29` - Rotor RPM low
- `WAR-HIG-29` - Rotor RPM high

#### Warnings - Engine (4)

- `WAR-OUT-15` - Engine failure
- `WAR-EEC-18` - EEC failure
- `WAR-IDL-16` - Engine stuck IDLE
- `WAR-OIL-18` - Oil pressure low

#### Warnings - Electrical (3)

- `WAR-GEN-11` - Dual DC GEN failure
- `WAR-BAT-14` - Main battery overheat
- `WAR-AUX-14` - Aux battery overheat

#### Warnings - Fire & Smoke (3)

- `WAR-FIR-21` - Engine fire
- `WAR-CAB-23` - Cabin/cockpit smoke
- `WAR-BAG-23` - Baggage fire

#### Warnings - Outros (8)

- `WAR-GER-27` - Landing gear emergency
- `WAR-MGB-30` - MGB oil pressure low/temp high
- `WAR-TMP-30` - MGB oil temp high
- `WAR-STA-X1` - Static port obstruction
- `WAR-TDR-X1` - Tail rotor drive failure
- `WAR-TCS-X1` - Tail rotor control failure
- `WAR-MRC-X1` - Main rotor binding
- `WAR-TRC-X1` - Tail rotor binding

#### Cautions - Powerplant (7)

- `CAU-HOT-65` - Hot start
- `CAU-CST-59` - Compressor stall
- `CAU-OVS-64` - Engine overspeed
- `CAU-NGO-63` - NG overspeed
- `CAU-CND-61` - Compressor no demand
- `CAU-TNF-62` - Throttle non-follow
- `CAU-LIC-60` - OEI limit timer

#### Cautions - Fuel (3)

- `CAU-FLO-73` - Fuel low
- `CAU-2FP-74` - Double fuel pump failure
- `CAU-EFP-75` - Engine fuel pump failure

#### Cautions - Electrical (5)

- `CAU-DCG-53` - Single DC GEN failure
- `CAU-BOF-55` - Battery offline
- `CAU-DCB-56` - DC bus failure
- `CAU-ACB-57` - AC bus failure
- `CAU-28D-58` - 28V DC failure

#### Cautions - Hydraulic (2)

- `CAU-HYP-77` - Hydraulic pressure low
- `CAU-SRV-80` - Servo bypass

#### Cautions - Avionics (9)

- `CAU-ADS-46` - ADS failure
- `CAU-AHR-47` - AHRS failure
- `CAU-DUD-46` - Display unit degraded
- `CAU-PFD-45` - PFD failure
- `CAU-MFD-45` - MFD failure
- `CAU-EIC-45` - EICAS failure
- `CAU-ADC-48` - ADC failure
- `CAU-GPS-52` - GPS failure
- `CAU-FMS-51` - FMS failure

#### Cautions - AFCS (5)

- `CAU-APO-38` - AP OFF
- `CAU-APF-37` - AP failure
- `CAU-MIS-40` - AP MISTRIM
- `CAU-SAS-41` - SAS degraded
- `CAU-AFD-41` - AFCS degraded

#### Cautions - Transmission & Outros (2)

- `CAU-MGP-105` - MGB chip detected
- `CAU-O2P-82` - O2 pressure low

**Total: 72 manobras únicas**

### Modelos de Sessão (10)

| ID  | Código       | Nome                             | Manobras |
| --- | ------------ | -------------------------------- | -------- |
| 16  | A139-I-01/12 | SESSÃO 1: FAMILIARIZAÇÃO         | 22       |
| 17  | A139-I-02/12 | SESSÃO 2: EMERGÊNCIAS POWERPLANT | 22       |
| 18  | A139-I-03/12 | SESSÃO 3: SISTEMA ELÉTRICO       | 22       |
| 19  | A139-I-04/12 | SESSÃO 4: IFR & NAVEGAÇÃO        | 22       |
| 20  | A139-I-05/12 | SESSÃO 5: AFCS & AUTOPILOT       | 22       |
| 21  | A139-I-06/12 | SESSÃO 6: AFCS DEGRADAÇÕES       | 22       |
| 22  | A139-I-07/12 | SESSÃO 7: AVIÔNICOS FAILURES     | 22       |
| 23  | A139-I-08/12 | SESSÃO 8: ROTOR & TRANSMISSÃO    | 22       |
| 24  | A139-I-09/12 | SESSÃO 9: FOGO & FUMAÇA          | 22       |
| 25  | A139-I-10/12 | SESSÃO 10: OFFSHORE              | 22       |

**Total: 220 relacionamentos**

## 🔍 Verificação

```bash
# Verificar total de manobras
wrangler d1 execute airtrust-db --remote --command \
  "SELECT COUNT(*) as total FROM manobras"
# Resultado: 72

# Verificar manobras por modelo
wrangler d1 execute airtrust-db --remote --command \
  "SELECT ms.id, ms.codigo, COUNT(msm.id) as total
   FROM modelos_sessao ms
   LEFT JOIN modelos_sessao_manobras msm ON msm.modelo_id = ms.id
   WHERE ms.id BETWEEN 16 AND 25
   GROUP BY ms.id"
# Resultado: 10 linhas, cada uma com total = 22
```

## 📁 Arquivos Criados/Modificados

### Scripts Criados

1. ✅ `scripts/reset-manobras-completo.sh` - Reset completo do banco
2. ✅ `scripts/seed-220-manobras-final.sh` - População dos 220 relacionamentos
3. ✅ `scripts/create-manobras-genericas.sh` - Criação das manobras X-suffix (descartado)
4. ✅ `scripts/create-manobras-complementares.sh` - Complementares (descartado)
5. ✅ `scripts/create-manobras-war-x1.sh` - WAR manobras (descartado)
6. ✅ `scripts/seed-manobras-modelos.sh` - Seed original (descartado)

### Frontend Modificado

- ✅ `src/react-app/pages/simuladores/cadastros/modelos-sessao/index.tsx`
  - Conversão: grid cards → table layout
  - Colunas: Código | Nome | Tipo | Duração | Manobras | Ações

## 🚀 Deploy

### Build

```bash
npm run build
# ✓ built in 2.43s
```

### Commit

```bash
git commit -m "feat: reset completo manobras + 220 relacionamentos populados [2025-12-02]"
# Commit: 27e3dcdb
# Branch: fix/importacao-completa-limpeza
```

### Próximo Passo

```bash
git push origin fix/importacao-completa-limpeza
chmod +x deploy-full-automated.sh
./deploy-full-automated.sh
```

## ⚠️ Importante

### O que foi feito

✅ Deletadas TODAS as manobras antigas (239 registros)  
✅ Criadas APENAS as 72 manobras da lista fornecida  
✅ Populados EXATAMENTE 220 relacionamentos (22 por modelo)  
✅ Ordem das manobras respeitada (1-22 conforme CSV)  
✅ UI convertida para formato de tabela

### O que NÃO foi feito

❌ Não criadas manobras extras  
❌ Não mantidas manobras antigas  
❌ Não alterados os 10 modelos de sessão existentes

## 📝 Notas Técnicas

1. **PRAGMA foreign_keys = OFF/ON**: Necessário para deletar manobras sem conflitos de FK
2. **SELECT subqueries**: Usadas para pegar manobra_id pelo código
3. **ordem sequencial**: 1-22 para cada modelo, conforme especificado
4. **obrigatoria = 1**: Todas manobras marcadas como obrigatórias
5. **created_at = datetime('now')**: Timestamp automático

## ✅ Status Final

- **Manobras no banco:** 72 (CORRETO ✅)
- **Relacionamentos:** 220 (CORRETO ✅)
- **Build:** Sucesso (2.43s ✅)
- **Commit:** 27e3dcdb ✅
- **Deploy:** Pendente ⏳

---

**Data:** 02/12/2025  
**Commit:** 27e3dcdb  
**Database:** 6.62 MB  
**Status:** ✅ Pronto para deploy
