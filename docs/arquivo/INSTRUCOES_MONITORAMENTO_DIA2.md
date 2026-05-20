# 🔍 MONITORAMENTO DE LOGS - DIA 2

**Data:** 30 de Novembro de 2025  
**Script:** `monitor-production-logs.sh`  
**Status:** ✅ Pronto para execução

---

## 📋 INSTRUÇÕES DE USO

### 1️⃣ TESTE RÁPIDO (1-2 horas)

```bash
# Executar monitoramento por 1 hora (teste)
DURATION=1 ./monitor-production-logs.sh

# Ou 2 horas
DURATION=2 ./monitor-production-logs.sh
```

### 2️⃣ MONITORAMENTO COMPLETO (24 horas)

```bash
# Executar em background (recomendado)
nohup ./monitor-production-logs.sh > /dev/null 2>&1 &

# Verificar PID do processo
ps aux | grep monitor-production-logs

# Ver logs em tempo real (opcional)
tail -f reports/monitoring/monitoring-*.log
```

### 3️⃣ PARAR MONITORAMENTO

```bash
# Encontrar PID
ps aux | grep monitor-production-logs

# Parar processo (vai gerar relatório final automaticamente)
kill <PID>

# Ou pressionar Ctrl+C se estiver rodando no terminal
```

---

## 📊 RELATÓRIOS GERADOS

### Arquivos criados automaticamente:

```
reports/monitoring/
├── monitoring-YYYYMMDD-HHMM.log          # Log completo (todas as linhas)
├── partial-report-1-YYYYMMDD-HHMM.txt    # Relatório 6h
├── partial-report-2-YYYYMMDD-HHMM.txt    # Relatório 12h
├── partial-report-3-YYYYMMDD-HHMM.txt    # Relatório 18h
├── partial-report-4-YYYYMMDD-HHMM.txt    # Relatório 24h
└── summary-YYYYMMDD-HHMM.txt             # Relatório final (ao terminar)
```

### Ver relatório final:

```bash
cat reports/monitoring/summary-*.txt
```

---

## 🎯 CATEGORIZAÇÃO DE LOGS

### 🔴 CRÍTICO (mostrado no terminal + salvo)

- Erros 500 (Internal Server Error)
- Exceções não tratadas (stack traces)
- Erros SQL (SQLITE_ERROR, query failed)
- Erros R2 (bucket error, upload failed)
- Timeouts (>30s)

### 🟡 AVISO (mostrado no terminal + salvo)

- Erros 404 (rotas não encontradas)
- Falhas de autenticação (401/403)
- Warnings genéricos

### 🟢 INFO (salvo apenas no log)

- Logs normais de requisições
- Operações bem-sucedidas

### 🔵 DEBUG (salvo apenas no log)

- Informações de debug detalhadas

---

## 📈 MÉTRICAS COLETADAS

1. **Total de requests**
2. **Taxa de erro geral** (% de erros críticos)
3. **Contadores por tipo de erro:**

   - Erros 500
   - Erros SQL
   - Erros R2
   - Timeouts
   - 404s
   - Falhas Auth
   - Warnings

4. **Top 5 erros mais frequentes**
5. **Recomendações automáticas**

---

## ⚠️ ALERTAS AUTOMÁTICOS

- **Taxa de erro > 1%**: ❌ CRÍTICO
- **Taxa de erro > 0.5%**: ⚠️ AVISO
- **Taxa de erro < 0.5%**: ✅ OK

---

## 🔧 VARIÁVEIS DE AMBIENTE

```bash
# Duração customizada (padrão: 24h)
DURATION=6 ./monitor-production-logs.sh

# Ambiente (padrão: production)
ENV=staging ./monitor-production-logs.sh

# Ambos
DURATION=12 ENV=production ./monitor-production-logs.sh
```

---

## 📝 EXEMPLO DE USO COMPLETO

```bash
# 1. Iniciar monitoramento em background (24h)
nohup ./monitor-production-logs.sh > /dev/null 2>&1 &
echo $! > monitor.pid

# 2. Verificar se está rodando
ps -p $(cat monitor.pid)

# 3. Ver logs em tempo real (opcional)
tail -f reports/monitoring/monitoring-*.log

# 4. Após 6h, ver relatório parcial
cat reports/monitoring/partial-report-1-*.txt

# 5. Após 24h (ou quando quiser parar), finalizar
kill $(cat monitor.pid)

# 6. Ver relatório final
cat reports/monitoring/summary-*.txt

# 7. Limpar PID
rm monitor.pid
```

---

## 🚨 TROUBLESHOOTING

### Erro: "wrangler não encontrado"

```bash
npm install -g wrangler
```

### Erro: "bc: command not found" (macOS)

```bash
# bc não é necessário, script funciona sem ele
# Apenas não mostrará alertas de taxa de erro
```

### Logs não aparecem

```bash
# Verificar se Workers está em produção
cd worker-airtrust
wrangler tail --env production

# Se não houver tráfego, gerar algumas requisições
curl https://airtrust-api-production.airtrust.workers.dev/api/health
```

---

## ✅ CHECKLIST PRÉ-EXECUÇÃO

- [ ] Script executável (`chmod +x monitor-production-logs.sh`)
- [ ] Wrangler instalado (`wrangler --version`)
- [ ] Workers em produção (deploy recente)
- [ ] Tráfego existente ou testes planejados
- [ ] Espaço em disco (logs podem crescer)

---

## 📊 TEMPLATE DE RELATÓRIO PARA ENVIO

```
═══════════════════════════════════════════
RELATÓRIO DIA 2 - MONITORAMENTO DE LOGS
═══════════════════════════════════════════

1. EXECUÇÃO:
   - Duração monitorada: [copiar de summary]
   - Comando usado: nohup ./monitor-production-logs.sh &
   - PID do processo: [verificar com ps aux]

2. ESTATÍSTICAS GERAIS:
   [copiar seção "ESTATÍSTICAS GERAIS" do summary]

3. ERROS CRÍTICOS:
   [copiar seção "ERROS CRÍTICOS" do summary]

4. AVISOS:
   [copiar seção "AVISOS" do summary]

5. TOP 5 ERROS MAIS FREQUENTES:
   [copiar seção "TOP 5" do summary]

6. HORÁRIOS DE PICO:
   [analisar log manualmente ou "Não detectado"]

7. RELATÓRIOS GERADOS:
   - Log completo: [path]
   - Relatórios parciais: [quantidade]
   - Relatório final: [path]

   CONTEÚDO DO SUMMARY:
   [colar conteúdo completo do summary-*.txt]

8. RECOMENDAÇÕES:
   [copiar seção "RECOMENDAÇÕES" do summary]

9. ANÁLISE:
   - Sistema estável? [Sim/Não + explicação]
   - Erro crítico recorrente? [Sim/Não + qual]
   - Padrão suspeito? [Descrever ou "Nenhum"]

10. DECISÃO:
    [ ] ✅ Taxa < 0.5% - PROSSEGUIR DIA 3
    [ ] ⚠️ Taxa 0.5-1% - PROSSEGUIR DIA 3 (com atenção)
    [ ] ❌ Taxa > 1% - CORRIGIR ANTES DIA 3
═══════════════════════════════════════════
```

---

## 🎯 PRÓXIMOS PASSOS

### Após teste de 1-2h:

1. Executar: `DURATION=1 ./monitor-production-logs.sh`
2. Revisar: `cat reports/monitoring/summary-*.txt`
3. Validar: Script funciona, logs são capturados
4. Decidir: Iniciar monitoramento 24h completo

### Após monitoramento 24h:

1. Parar processo: `kill <PID>`
2. Revisar relatório final
3. Enviar relatório formatado
4. Aguardar liberação para **DIA 3** 🚀

---

**Data de criação:** 30/11/2025  
**Última atualização:** 30/11/2025  
**Status:** ✅ Script pronto e testado
