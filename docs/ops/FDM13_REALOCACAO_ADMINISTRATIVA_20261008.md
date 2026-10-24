# FDM 13 — realocação controlada e crédito administrativo (tenant 6)

**Decisão da Gerência de Treinamento, 08/10/2026.** O curso legado `lms_cursos.id=13` será aposentado **somente depois** de zerar vínculos de matrícula ativos. A nova distribuição é exclusivamente:
- `COMANDANTE` e `COPILOTO` → curso LMS **71**, modelo `FDM-TRIPULACAO`;
- `MECANICO` e `AUXILIAR DE MANUTENCAO` → curso LMS **72**, modelo `FDM-MECANICO`;
- todos os demais cargos da turma antiga → **não** transferir para nenhum FDM; cancelar logicamente as matrículas antigas, com auditoria preservada.

O curso LMS **73** (Comitê/Gatekeeper) **não recebe nenhuma transferência do FDM 13**. Permanece publicado e seus requisitos independentes de Compliance/designação permanecem vigentes. Pessoas com designação formal não a perdem: esta decisão é apenas sobre a turma histórica.

## Estado de referência (obrigatória revisão antes da escrita)

Produção read-only, Worker `42fb61b7dc703a6cd894887ce8c99aa66e7ac2d8`, relatório `37713881508`:
- 27 matrículas visíveis no FDM 13: 11 tripulação, 10 manutenção, 6 fora do escopo, 0 classificação desconhecida;
- 15 com progresso bruto 100, **zero matrículas concluídas canonicamente**; os 15 podem incluir pessoas das seis excluídas, portanto não assumir que são 15 elegíveis;
- cursos 71/72/73 publicados com launch SCORM, porém vínculos de `qualificacao_tipo_codigo` divergentes ou ausentes; três destinos sem matrículas no snapshot `37713995899`.
- a API de matrículas exclui funcionários inativos/desligados: a contagem 27 não prova que não existam outros registros ativos invisíveis ao endpoint.

## Contrato de governança para execução

1. Fixar SHA candidato da main, proveniência da versão do Worker publicado, oito gates e autorização **explícita para esse SHA e escopo D1/LMS**. Formar ponto de recuperação governado, plano de compensação e trilha de auditoria. Não executar SQL remoto improvisado.
2. Obter snapshot D1 no fluxo governado abrangendo **todas** as matrículas curso 13 (funcionários ativos e inativos), condições de exclusão e histórico/SCORM. Garantir que a contagem fonte não mudou desde o dry-run. Tenant 6 em todas as leituras/escritas.
3. Verificar IDs e unicidade dos modelos de qualificação, publicar/corrigir associação **71 → FDM-TRIPULACAO** e **72 → FDM-MECANICO** (73 separado). Confirmar formatos, versões de pacote, flags de conclusão, autorizações e registros.
4. Gerar plano de realocação por funcionário, sem listas de nomes/PII em artifacts, logs ou GitHub. Conferir duplicidades destino/legado e diferenças de função/setor. Quem não pertence a dois cargos autorizados fica só na lista de cancelamento lógico. Funcionario inativo sem vínculo novo exige decisão documentada e preservação de histórico.
5. Para 11+10 elegíveis, criar ou reutilizar matrícula nova **sem copiar CMI, quiz, nota ou estado do pacote SCORM antigo**. Conceder crédito por equivalência **somente mediante verificação individual** de evidência do treinamento legado, avaliação aplicável e compatibilidade programática. Identificar no registro `administrative_reason`: que é **equivalência administrativa** por falha de finalização do curso 13, com aprovação do gestor; nunca alegar que o empregado percorreu fisicamente o SCORM 71/72. Não marcar automaticamente só por 99% ou 100% bruto. Se não comprovável, nova matrícula permanece pendente para fazer o novo treinamento.
6. Usar rotas governadas do LMS com RBAC admin, justificativa, logs e idempotência. O `PATCH /api/lms/matriculas/:id/status` exige `CONCLUIDO`, curso correto e razão administrativa suficiente, e pode gerar qualificação; sua exceção é uma decisão formal verificável, não remendo silencioso. Verificar pontuação, progresso SCORM, documento de equivalência e autorização por pessoa antes de cada chamada.
7. Só após confirmar cada destino, cancelar logicamente a matrícula antiga (`DELETE /api/lms/matriculas/:id` faz `status=CANCELADO` e `deleted_at`, mantendo a evidência; gera notificação). As seis excluídas são canceladas sem criar qualquer destino. Avaliar comunicações aos alunos antes da execução.
8. Pós-condições obrigatórias no D1 e na API, independentemente de funcionários inativos: `empresa_id=6 AND curso_id=13 AND deleted_at IS NULL` = **0**, 21 mapeamentos revistos ou bloqueados com justificação, cursos 71/72 corretos, sem duplicidade, auditar qualificações e certificados de equivalência, nenhuma alteração indevida ao curso73 ou a outros tenants. Só depois arquivar o catálogo #13; preservar histórico e reverter pelo plano governado quando necessário.

**Bloqueadores de produção:** vínculo exato aos modelos, evidência dos 99% elegíveis, snapshot de funcionários inativos, recovery e autorização SHA-específica. A ordem gerencial autoriza preparar a remediação, mas não substitui os gates e a autorização de release exigida pelo contrato do projeto.

## Auditoria EAD paralela — não esquecer

Continuar a análise dos **52** cursos ativos/publicados (49 originais + os três FDM novos). No último relatório, 2057 matrículas e 335 conclusões canônicas; 38 em 99%/100% bruto sem conclusão, apenas quatro explicitamente sinalizadas pelo endpoint de inconsistências SCORM (cursos #7/#13/#55/#65). Investigar os outros 34 sem inferir falha do pacote apenas pelo robô; dar prioridade a PBN, MEL, Operações Offshore e Doutrinamento Básico. Produzir decisão final curso a curso usando histórico real, versão SCORM ativa e testes de conclusão, sem fabricar status.
