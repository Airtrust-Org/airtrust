# Schema V2 0550 — Perfis VIEWER → ALUNO, Costa do Sol

## Evidência de produção (somente leitura, 2026-10-13)

Tenant verificado: Costa do Sol, `empresa_id=6`. São 26 usuários com vínculo `usuarios_empresas.role=viewer`, todos com `usuarios.perfil=ALUNO`, todos com perfil explícito VIEWER ativo, nenhum com perfil explícito ALUNO/STUDENT, privilégio elevado ou outro tenant. Nenhum dos 26 é Coordenação.

A Coordenação é um único registro separado, com `usuarios.perfil=USUARIO`, vínculo `role=user`, nome correspondente a Coordenação e perfil explícito `COORDENACAO_VOO` ativo. Não incluir identificadores pessoais nem e-mails neste artefato.

## Decisão e limite

Converter **exatamente 26** vínculos de alunos para `student` e desativar seus VIEWER explícitos. O gatilho 0514 cria o perfil explícito `student` do mesmo tenant, e a SQL o reativa quando já existe inativo. Manter `usuarios.perfil=ALUNO`, matrículas, credenciais e históricos inalterados.

Converter somente o vínculo compatível da **única Coordenação** de `user` para `viewer`, mantendo `usuarios.perfil=USUARIO` e o perfil técnico `COORDENACAO_VOO` ativo, sem criar capacidades. Não tocar em outros tenants, gestores, administradores ou instrutores.

## Governança e segurança

Aplicar apenas pelo Schema V2 com mudança `usuarios-costa-do-sol-viewer-aluno-0550`, manifest e hashes revisados, SHA exato, oito gates, backup/ponto de recuperação oficial e autorização específica. Nunca usar execução remota avulsa. SQL usa guardas `CHECK` **antes** dos UPDATEs: as contagens de 26 alunos, 26 perfis explícitos legados, uma Coordenação `user` e exatamente uma identificação de Coordenação precisam coincidir. Qualquer divergência aborta o lote.

Preflight remota confirma baseline, contrato 0514, mudança ainda não aplicada, 26 candidatos, nenhuma elevação/perfil cruzado, Coordenação única. Proteger pela atomicidade do executor oficial e não misturar com scripts legados.

## Teste, validação e recuperação

Executar fixture SQLite focada: 26 VIEWER com ALUNO, uma Coordenação técnica com USER, um admin, um instrutor e um aluno de outro tenant. Verificar após a transação 26 STUDENT, um VIEWER de Coordenação e nenhum viewer de aluno, mantendo perfis privilegiados/tenant alheio. As variantes com 25/27 VIEWER, com administrador contaminado ou Coordenação ausente/duplicada devem falhar antes de qualquer UPDATE.

Pós-condições governadas: ledger único, Costa do Sol com um VIEWER/Coordenação, 0 USER, exatamente 26 novos STUDENT no conjunto, 0 VIEWER explícito ativo associado aos ALUNO reconciliados, acesso técnico de Coordenação ainda ativo. Capturar D1 Time Travel recovery point antes do lote. Reversão após êxito só via mudança compensatória governada com revalidação, não SQL remoto improvisado.

**Separação de etapas:** merge/CI e deploy Worker/Pages não aplicam esta migração. Dados reais só mudam com execução autorizada do Schema V2.
