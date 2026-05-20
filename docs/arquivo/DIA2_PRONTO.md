# 🎯 DIA 2 - SISTEMA DE MONITORAMENTO PRONTO

**Data:** 30 de Novembro de 2025  
**Status:** ✅ **TODOS OS SCRIPTS CRIADOS E PRONTOS PARA USO**

---

## 📦 ARQUIVOS CRIADOS

### Scripts principais:

1. ✅ `monitor-production-logs.sh` - Motor do monitoramento
2. ✅ `teste-monitoramento-1h.sh` - Teste rápido (1 hora)
3. ✅ `start-monitoramento-24h.sh` - Iniciar 24h em background
4. ✅ `stop-monitoramento.sh` - Parar monitoramento
5. ✅ `status-monitoramento.sh` - Ver status em tempo real

### Documentação:

6. ✅ `INSTRUCOES_MONITORAMENTO_DIA2.md` - Guia completo

---

## 🚀 INÍCIO RÁPIDO

### OPÇÃO 1: Teste de 1 hora (recomendado primeiro)

```bash
./teste-monitoramento-1h.sh
```

### OPÇÃO 2: Monitoramento completo 24h

```bash
# Iniciar
./start-monitoramento-24h.sh

# Ver status
./status-monitoramento.sh

# Parar
./stop-monitoramento.sh
```

---

## 📊 FLUXO RECOMENDADO

### 1️⃣ TESTE (1-2h)

```bash
# Executar teste curto
./teste-monitoramento-1h.sh

# Aguardar finalizar (1 hora)
# Pressionar Ctrl+C para parar antes se quiser

# Ver relatório
cat $(ls -1t reports/monitoring/summary-*.txt | head -1)
```

**Objetivo:** Validar que o script funciona e captura logs corretamente.

---

### 2️⃣ VALIDAÇÃO

Após teste de 1h, verificar:

- [x] Script executou sem erros?
- [x] Logs foram capturados?
- [x] Relatório foi gerado?
- [x] Contadores estão funcionando?

Se tudo OK ✅ → Prosseguir para 24h

---

### 3️⃣ MONITORAMENTO 24H

```bash
# Iniciar em background
./start-monitoramento-24h.sh

# Verificar status periodicamente
./status-monitoramento.sh

# Ver logs em tempo real (opcional)
tail -f reports/monitoring/monitoring-*.log

# Aguardar 24 horas...

# Parar (se quiser antes) ou aguardar término automático
./stop-monitoramento.sh
```

---

### 4️⃣ ANÁLISE DOS RESULTADOS

```bash
# Ver relatório final
cat $(ls -1t reports/monitoring/summary-*.txt | head -1)

# Ver relatórios parciais
ls -lh reports/monitoring/partial-report-*.txt

# Buscar erros específicos
grep "CRÍTICO" reports/monitoring/monitoring-*.log

# Top 10 erros mais frequentes
grep -E "CRÍTICO|AVISO" reports/monitoring/monitoring-*.log | \
  sed 's/\[.*\] \[.*\] //' | \
  sort | uniq -c | sort -rn | head -10
```

---

## 📈 O QUE O SCRIPT FAZ

### Automático:

1. **Captura logs** do Workers via `wrangler tail`
2. **Categoriza** cada linha (🔴 Crítico, 🟡 Aviso, 🟢 Info, 🔵 Debug)
3. **Conta erros** por tipo (500, SQL, R2, 404, Auth, Timeout)
4. **Gera relatórios** parciais a cada 6 horas
5. **Calcula taxa de erro** (erros críticos / total requests)
6. **Alerta** se taxa > 1%
7. **Lista Top 5** erros mais frequentes
8. **Gera recomendações** baseadas nos erros encontrados

### Manual (você faz):

1. ✅ Iniciar monitoramento
2. ✅ Aguardar período desejado (1h teste ou 24h completo)
3. ✅ Revisar relatórios
4. ✅ Enviar relatório formatado para decisão DIA 3

---

## 🎯 CRITÉRIOS DE SUCESSO

### ✅ Sistema ESTÁVEL (prosseguir DIA 3):

- Taxa de erro < 0.5%
- Zero erros 500 recorrentes
- Zero erros SQL
- Zero erros R2
- 404s apenas em rotas esperadas (favicon, assets)

### ⚠️ Sistema ACEITÁVEL (prosseguir DIA 3 com atenção):

- Taxa de erro 0.5% - 1%
- Alguns 404s em rotas não essenciais
- Falhas auth ocasionais (<50 em 24h)

### ❌ Sistema CRÍTICO (corrigir antes DIA 3):

- Taxa de erro > 1%
- Erros 500 recorrentes (mesmo stack trace)
- Erros SQL frequentes
- Erros R2 bloqueando uploads
- Timeouts constantes

---

## 📋 TEMPLATE DE RELATÓRIO

Após 24h (ou teste), preencher e enviar:

```
═══════════════════════════════════════════
RELATÓRIO DIA 2 - MONITORAMENTO DE LOGS
═══════════════════════════════════════════

1. EXECUÇÃO:
   - Duração monitorada: [X horas]
   - Comando usado: [./start-monitoramento-24h.sh]
   - PID do processo: [ver com ps aux]

2. ESTATÍSTICAS GERAIS:
   [Copiar de summary-*.txt]

3. ERROS CRÍTICOS:
   [Copiar de summary-*.txt]

4. AVISOS:
   [Copiar de summary-*.txt]

5. TOP 5 ERROS:
   [Copiar de summary-*.txt]

6. RECOMENDAÇÕES:
   [Copiar de summary-*.txt]

7. ANÁLISE:
   - Sistema estável? [Sim/Não + por quê]
   - Erro crítico recorrente? [Sim/Não + qual]
   - Padrão suspeito? [Descrever]

8. DECISÃO:
   [ ] ✅ Taxa < 0.5% - PROSSEGUIR DIA 3
   [ ] ⚠️ Taxa 0.5-1% - PROSSEGUIR DIA 3 (monitorar)
   [ ] ❌ Taxa > 1% - CORRIGIR ANTES DIA 3

═══════════════════════════════════════════
```

---

## 🔧 TROUBLESHOOTING

### Script não inicia

```bash
# Verificar permissões
chmod +x *.sh

# Verificar wrangler
wrangler --version

# Se não instalado
npm install -g wrangler
```

### Nenhum log aparece

```bash
# Verificar se Workers está em produção
cd worker-airtrust
wrangler tail --env production

# Gerar tráfego de teste
for i in {1..10}; do
  curl -s https://airtrust-api-production.airtrust.workers.dev/api/health
done
```

### Relatório vazio

- **Causa:** Nenhuma request no período
- **Solução:** Aguardar tráfego real ou gerar requests de teste

### Processo travado

```bash
# Forçar término
kill -9 $(cat monitor.pid)
rm monitor.pid
```

---

## ✅ CHECKLIST FINAL

Antes de iniciar 24h:

- [x] ✅ Scripts criados e executáveis
- [x] ✅ Diretório `reports/monitoring` criado
- [x] ✅ Wrangler instalado e configurado
- [x] ✅ Workers em produção
- [ ] 🔄 Teste de 1h executado e validado
- [ ] 🔄 Relatório de teste revisado
- [ ] 🔄 Decisão de prosseguir para 24h
- [ ] 🔄 Monitoramento 24h iniciado
- [ ] 🔄 Relatório final gerado
- [ ] 🔄 Decisão para DIA 3 enviada

---

## 🎉 PRÓXIMOS PASSOS

### AGORA:

1. Executar teste de 1h: `./teste-monitoramento-1h.sh`
2. Validar funcionamento
3. Decidir: iniciar 24h ou ajustar

### APÓS 1H TESTE:

1. Revisar relatório
2. Se OK → Iniciar 24h: `./start-monitoramento-24h.sh`
3. Aguardar...

### APÓS 24H:

1. Parar: `./stop-monitoramento.sh` (ou automático)
2. Revisar relatório final
3. Enviar relatório formatado
4. **Aguardar liberação DIA 3** 🚀

---

**Tudo pronto!** Execute `./teste-monitoramento-1h.sh` para começar! 🎯
