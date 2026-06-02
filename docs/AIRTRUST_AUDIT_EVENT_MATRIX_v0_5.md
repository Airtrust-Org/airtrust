# AirTrust Audit Event Matrix v0.5

Data: 2026-06-02
HEAD auditado: `13dd8280a55eebc91f3051f94974306bcba2a721`

| Categoria | Evento | Deve auditar agora? | Requer migration? | Dados permitidos | Dados proibidos | Severidade |
| --- | --- | --- | --- | --- | --- | --- |
| Auth | Login bem-sucedido | Parcial | Sim para contrato canonico | user_id, empresa_id, request_id, status | senha, token, cookie, payload bruto | Alta |
| Auth | Login falho | Parcial | Sim para contrato canonico | identificador minimizado, request_id, motivo tecnico resumido | senha, hash, payload bruto | Alta |
| Auth | Impersonacao administrativa | Sim | Nao para fase minima | actor_user_id, target_user_id, empresa_id, request_id, duracao | email alvo, nome alvo, token emitido | Critica |
| Tenant | Troca/selecao de empresa | Nao de forma canonica | Sim | actor_user_id, empresa_id origem/destino, request_id | payload JWT bruto | Alta |
| Admin | Reset/backfill administrativo | Sim | Nao para fase minima | actor_user_id, empresa_id, request_id, contagens, modulo, status | SQL, stack, payload bruto, emails desnecessarios | Critica |
| Empresa | Criacao/edicao/exclusao de empresa | Sim | Nao para fase minima | actor_user_id, empresa_id recurso, request_id, campos sanitizados | SMTP password, links, segredos | Alta |
| RBAC | Convite/criacao de usuario | Parcial | Sim | actor_user_id, empresa_id, role, request_id | invite token/link, password, email desnecessario | Alta |
| RBAC | Alteracao de role/permissao | Parcial | Sim | actor_user_id, empresa_id, role anterior/novo, request_id | payload bruto do usuario | Alta |
| Assets | Download/acesso a asset privado | Sim | Nao para fase minima | actor_user_id, empresa_id, request_id, prefixo/logical scope, status | nome real do arquivo, URL assinada, conteudo | Alta |
| Documentos | Download de documento/ASO/certificado | Parcial | Sim | actor_user_id, empresa_id, request_id, tipo_documento, status | CPF, ASO, URL completa, conteudo | Critica |
| Export | Exportacao/PDF | Nao de forma uniforme | Sim | actor_user_id, empresa_id, request_id, tipo, filtros resumidos, contagem | linhas exportadas, dados pessoais, conteudo PDF | Alta |
| FRMS | Alteracao de fadiga/jornada | Parcial | Sim para contrato unificado | empresa_id, registro_id, acao, request_id futuro | sono detalhado, KSS, payload medico bruto | Critica |
| Qualificacoes | Alteracao de historico/certificado | Parcial | Sim | actor_user_id, empresa_id, request_id, ids tecnicos | CPF, arquivos, links R2, payload completo | Alta |
| Escalas | Alteracao de escala/alocacao | Parcial | Sim | actor_user_id, empresa_id, request_id, contadores, ids | justificativas livres extensas, payload bruto | Alta |
| Suporte | Acesso interno por tenant/motivo | Nao | Sim | operador, tenant, request_id, motivo, janela, tipo de acao | login como cliente sem trilha, payload bruto | Critica |
