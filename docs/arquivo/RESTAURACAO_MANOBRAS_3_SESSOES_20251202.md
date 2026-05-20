# 🔄 RESTAURAÇÃO: Manobras das 3 primeiras sessões

**Data:** 02/12/2025 01:05  
**Ação:** Restaurar manobras deletadas acidentalmente
**Commit:** Próximo

---

## 📋 CONTEXTO

Durante correção do bug "deletar manobras ao editar tipo de sessão", as 3 primeiras sessões de treinamento tiveram suas manobras deletadas:

- ❌ **ID 16:** `A139-I-01/12` - SESSÃO 1: FAMILIARIZAÇÃO → 0 manobras
- ❌ **ID 17:** `A139-I-02/12` - SESSÃO 2: EMERGÊNCIAS POWERPLANT → 0 manobras
- ❌ **ID 18:** `A139-I-03/12` - SESSÃO 3: SISTEMA ELÉTRICO → 0 manobras

**Causa:** Frontend chamava `salvarManobras([])` com `substituir: true` ao editar apenas tipo_sessao, causando soft delete de todas as manobras.

---

## ✅ RESTAURAÇÃO EXECUTADA

### Comando SQL:

```sql
UPDATE modelos_sessao_manobras
SET deleted_at = NULL
WHERE modelo_id IN (16, 17, 18) AND deleted_at IS NOT NULL;
```

### Resultado:

```
✅ SESSÃO 1 (ID 16): 22 manobras restauradas
✅ SESSÃO 2 (ID 17): 22 manobras restauradas
✅ SESSÃO 3 (ID 18): 22 manobras restauradas
```

### Manobras restauradas por sessão:

#### **SESSÃO 1: FAMILIARIZAÇÃO (22 manobras)**

1. FLY-BAS-X1 - Controle geral VFR
2. FLY-BAS-X3 - Hover & taxi
3. OPS-NRM-X1 - Procedimentos normais
4. OPS-NRM-X2 - Decolagens & pousos
5. OPS-NRM-X3 - Circuito de tráfego
6. WAR-LOW-29 - Rotor RPM low
7. WAR-HIG-29 - Rotor RPM high
8. CAU-HOT-65 - Hot start
9. CAU-CST-59 - Compressor stall
10. CAU-OVS-64 - Engine overspeed
11. CAU-NGO-63 - NG overspeed
12. CAU-CND-61 - Compressor no demand
13. CAU-TNF-62 - Throttle non-follow
14. CAU-FLO-73 - Fuel low
15. CAU-2FP-74 - Double fuel pump failure
16. CAU-EFP-75 - Engine fuel pump failure
17. WAR-OIL-18 - Oil pressure low
18. CAU-LIC-60 - OEI limit timer
19. WAR-EEC-18 - EEC failure
20. WAR-IDL-16 - Engine stuck IDLE
21. WAR-GER-27 - Landing gear emergency
22. FLY-BAS-17 - Autorotação

#### **SESSÃO 2: EMERGÊNCIAS POWERPLANT (22 manobras)**

1. FLY-BAS-17 - Autorotação
2. WAR-OUT-15 - Engine failure
3. WAR-EEC-18 - EEC failure
4. WAR-IDL-16 - Engine stuck IDLE
5. CAU-CST-59 - Compressor stall
6. CAU-OVS-64 - Engine overspeed
7. CAU-NGO-63 - NG overspeed
8. WAR-OIL-18 - Oil pressure low
9. CAU-HOT-65 - Hot start
10. WAR-LOW-29 - Rotor RPM low
11. WAR-HIG-29 - Rotor RPM high
12. CAU-LIC-60 - OEI limit timer
13. CAU-CND-61 - Compressor no demand
14. CAU-TNF-62 - Throttle non-follow
15. CAU-FLO-73 - Fuel low
16. CAU-2FP-74 - Double fuel pump failure
17. CAU-EFP-75 - Engine fuel pump failure
18. FLY-BAS-X1 - Controle geral VFR
19. FLY-BAS-X3 - Hover & taxi
20. OPS-NRM-X2 - Decolagens & pousos
21. OPS-NRM-X3 - Circuito de tráfego
22. OPS-NRM-X1 - Procedimentos normais

#### **SESSÃO 3: SISTEMA ELÉTRICO (22 manobras)**

1. WAR-GEN-11 - Dual DC GEN failure
2. WAR-BAT-14 - Main battery overheat
3. WAR-AUX-14 - Aux battery overheat
4. CAU-DCG-53 - Single DC GEN failure
5. CAU-BOF-55 - Battery offline
6. CAU-DCB-56 - DC bus failure
7. CAU-ACB-57 - AC bus failure
8. CAU-28D-58 - 28V DC failure
9. FLY-BAS-X1 - Controle geral VFR
10. FLY-BAS-X3 - Hover & taxi
11. OPS-NRM-X2 - Decolagens & pousos
12. OPS-NRM-X3 - Circuito de tráfego
13. WAR-OUT-15 - Engine failure
14. FLY-BAS-17 - Autorotação
15. CAU-FLO-73 - Fuel low
16. WAR-LOW-29 - Rotor RPM low
17. WAR-HIG-29 - Rotor RPM high
18. CAU-HOT-65 - Hot start
19. CAU-LIC-60 - OEI limit timer
20. WAR-GER-27 - Landing gear emergency
21. CAU-HYP-77 - Hydraulic pressure low
22. OPS-NRM-X1 - Procedimentos normais

---

## 📊 VERIFICAÇÃO

Query de validação:

```sql
SELECT
  m.id,
  m.codigo,
  m.nome,
  COUNT(msm.id) as total_manobras
FROM modelos_sessao m
LEFT JOIN modelos_sessao_manobras msm ON m.id = msm.modelo_id AND msm.deleted_at IS NULL
WHERE m.id IN (16, 17, 18)
GROUP BY m.id;
```

Resultado ✅:

```
ID 16: 22 manobras ✅
ID 17: 22 manobras ✅
ID 18: 22 manobras ✅
```

---

## 🔧 PRÓXIMOS PASSOS

1. ✅ Restauração completada
2. ⏳ Commit e deploy (se necessário)
3. ⏳ Teste no frontend para confirmar manobras visíveis

---

## 📝 NOTAS

- Soft delete preservado (auditoria mantida)
- Ordenação original mantida
- Sem perda de dados históricos
- Backend não foi alterado
- Frontend já corrigido no commit anterior
