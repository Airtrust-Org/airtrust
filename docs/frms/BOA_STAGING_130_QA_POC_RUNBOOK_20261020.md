# BOA/CBMMG — protocolo de execução da POC e ensaio de 130 usuários sintéticos

Data: 20/10/2026. Frente única: PR #1650. Status: **pré-condições para execução**, NÃO certificado de aceitação.

## 1. Portões antes de executar qualquer chamada remota

- [ ] Edital integral, anexos, respostas e retificações oficiais conferidos por responsável pela licitação; matriz `BOA_CBMMG_LICITACAO_POC_MATRIX_20261020.md` reconciliada com o instrumento vigente.
- [ ] Parecer científico e procedimento de fadiga específico da aviação BOA aprovados por responsável técnico competente, incluindo KSS, PVT adaptado, limites operacionais, triagem, revisão humana e responsabilidade por liberação.
- [ ] Tratamento LGPD com finalidade, hipótese jurídica, categorias de dado sensível, ciclo de retenção/exclusão, necessidade de RIPD, segregação de acesso, logs, criptografia e incidente aprovado pelo controlador/operador; nenhuma conta real ou dado de saúde real em QA.
- [ ] Tenant `bombeiros` específico provisionado por fluxo governado, `empresa_id` **não 6**, `FIREFIGHTER_AVIATION` aprovado e `setores_gestores`/papéis exclusivamente de QA.
- [ ] Check de `main`, PR, SHA, todos os oito gates; snapshot staging Worker+Pages+schema e autorização atual do ambiente/artefato. Nunca inferir esquema aplicado apenas porque existe migration versionada.
- [ ] Credenciais de **130 contas fictícias e distintas** emitidas por canal seguro, armazenadas fora do Git e fora de logs, com expiração e revogação planejada.
- [ ] Autorização explícita do responsável pelo staging para carga e janela de execução; sem competir com outras frentes no ambiente.
- [ ] Backups/recuperação e evidência prévia de isolamento bidirecional BOA ↔ empresa 6.

**Não execute o ensaio em produção, nem importe 130 funcionários sem Schema V2 e autorização de escrita.**

## 2. Ensaio de leitura autenticada de 130 contas

Script: `scripts/validation/boa/staging-130-readonly.mjs`.

Ele verifica a nova rota **somente GET** `/api/bombeiros/frms/checkin/status`, que usa identidade autenticada do tripulante e retorna exclusivamente status do seu recibo e código da ocorrência vinculada. Exige a revisão `FIREFIGHTER_AVIATION` aprovada. As credenciais de usuário devem corresponder aos próprios funcionários fictícios; não configurar perfil administrador genérico para simular tripulantes.

Arquivo JSON **fora do repositório**, criado por processo autorizado, com **130 objetos** distintos do formato:

```json
[
  {"label":"BOA-QA-001","token":"ACCESS_JWT_SYNTHETIC_001"},
  {"label":"BOA-QA-002","token":"ACCESS_JWT_SYNTHETIC_002"}
]
```

O fragmento é **somente ilustrativo**; o arquivo efetivo precisa de 130 JWTs de acesso válidos, nunca de senhas, refresh tokens ou credenciais de produção. Não incluir esses tokens em issue, PR, comentários, screenshots ou artefatos.

Exemplo de invocação **após autorização do staging e provisionamento** (host substituído pelo staging verdadeiro):

```bash
BOA_QA_READONLY_APPROVED=SIM \
BOA_QA_STAGING_BASE_URL=https://app.staging.example.test/ \
BOA_QA_EXPECTED_TENANT_ID=130 \
BOA_QA_TOKENS_FILE=/private/boa-qa-credentials.json \
BOA_QA_CONCURRENCY=20 \
node scripts/validation/boa/staging-130-readonly.mjs
```

`BOA_QA_EXPECTED_TENANT_ID=130` é **apenas exemplo fictício**, não pressupõe o ID que será atribuído aos Bombeiros. `BOA_QA_CONCURRENCY` deve ser 1–130. Começar com concorrência baixa após aceite do responsável e só elevar dentro da janela aprovada. A contagem de 130 representa contas únicas; concorrência 130 representa tentativas simultâneas de GET, **não** um teste de jornadas operacionais e escritas.

O script falha fechado se não houver confirmação, HTTPS, hostname staging/dev, 130 JWTs diferentes, tenant válido ou dados respondidos no contrato esperado. Não faz POST, PUT, DELETE, PATCH, uploads, migrações ou geração de usuários. Rejeita redirects e não imprime JWT, conteúdos de resposta, informações clínicas, nomes ou ID do funcionário. Emite somente totais de aprovação/falha e latências p50/p95/p99. Falhas de 401/403, timeout, integridade ou fonte incompleta invalidam o lote.

Testes offline de proteção, sem qualquer rede:

```bash
node --test scripts/__tests__/boa-staging-130-readonly.test.mjs
node --check scripts/validation/boa/staging-130-readonly.mjs
```

**Nota:** esse ensaio não comprova 130 escritas simultâneas, capacidade do D1 sob criação de casos, ingestão PVT ou recuperação de desastre. Essas provas exigem procedimento separado de staging com dados sintéticos, limites de escrita autorizados e restauração auditável.

## 3. Prova de conceito — sequência de aceite físico

| Cena | Responsável e prova | Critério de reprovação |
| --- | --- | --- |
| A: metodologia/triagem | Tripulante QA autentica, registra check-in BOA, recebe recibo; gestor revisa; demonstra KSS/PVT como informações declaradas, não aptidão | Qualquer score offshore, inferência de liberação, ausência tratada como normal |
| B: fatores aeronáuticos | Testa missão diurna/noturna, sobreaviso, jornada, recuperação, privação de sono e decisões humanas segundo método aprovado | Sem fonte temporal/escala, coeficientes não homologados ou avaliação clínica simulada como real |
| C: casos/relatórios | Caso BOA validado com autor, prazo, mitigação, eficácia; comparação mensal com supressão de grupo/célula e versão do método | Caso sem responsável, encerramento sem eficácia, relatório vendido como assinado sem ser |
| D: disponibilidade/integridade | Ensaios GET e write separados, ambos governados, logs sem PII; validação de isolamento, concorrência, rollback e plano de recuperação | Cross-tenant, permissões elevadas, falha silenciosa, índices sem proveniência |
| E: LGPD | Aprovações do controlador; demonstra matriz RBAC comando/gestor/tripulante/responsável clínico, direitos, retenção e auditoria | Admin recebe dados clínicos, logs/backup não segregados, ausência de base jurídica |

Para o requisito **8 — experiência da licitante**, anexar atestados/documentos de terceiros, com escopo, período, responsável e validação de autenticidade. Desenvolvimento de código não produz automaticamente essa evidência; não fabricar documentação.

## 4. Status comprovado nesta PR e limitações

- Implementação em código do fluxo check-in → caso → tratamento → eficácia, leitura do recibo pela tripulação e prévia mensal gerencial/técnica; empresa 6 bloqueada.
- Testes anteriores: oito gates oficiais do SHA `85686bb958809e1240d43d2b92e142ce77637ed3` aprovados. Alterações posteriores **exigem nova CI no HEAD**.
- Testes locais com SQLite/fixtures e consultas de 130 funcionários fictícios, não um teste real de 130 JWTs/dados do Cloudflare.
- **Não comprovado/executado**: tenant staging, aprovação científica/jurídica, QA de 130 contas reais sintéticas, deploy, migration/seed/import, banco remoto, prova de conceito, relatório oficial assinado, atestados de experiência.

**Portão de liberação:** não integrar nem publicar a PR em ambiente real antes de comprovar os oito gates atuais, proteção de branch, habilitação específica do ambiente, segurança científica e LGPD. Produção depende de autorização atual para SHA/artefato/escopo.
