# Schema V2 0551 — Retorno do papel da Coordenação para USER

Decisão final do usuário: os 26 antigos VIEWER devem permanecer STUDENT (na interface, **Aluno**); a única conta da Coordenação Costa do Sol deve ter o vínculo anterior `usuarios_empresas.role=user`, nunca VIEWER, mantendo `usuarios.perfil=USUARIO` e `COORDENACAO_VOO` explícito ativo.

Diagnóstico: a migration 0550 foi concluída em produção, convertendo os 26 alunos, mas fez a mudança indevida do único vínculo da Coordenação de USER para VIEWER. A mudança 0551 **reverte apenas esse vínculo** e desativa o perfil explícito VIEWER que a 0550 possa ter criado; mantém USER explícito ativo. Nenhum outro aluno, empresa, matrícula, gestor, administrador ou instrutor é modificado.

Aplicação: somente Schema V2 oficial, change_id `coordenacao-role-user-restore-0551`, manifesto de hashes e SHA exato com autorização vigente, oito gates, recovery Time Travel, preflight e pós-condições. A guarda inicial exige ledger 0550, exatamente um viewer correspondente à Coordenação, nenhum USER atual, Coordenação única e exatamente 26 alunos convertidos com VIEWER desativado. Se divergir, a execução falha antes de escrever.

Postcondições: nenhum viewer da Costa do Sol, exatamente um USER que é Coordenação e conserva COORDENACAO_VOO ativo, VIEWER explícito da Coordenação inativo, 26 alunos previamente reconciliados ainda STUDENT; ledger da 0551 presente. Somente compensação governada caso necessário, nunca SQL remoto manual.
