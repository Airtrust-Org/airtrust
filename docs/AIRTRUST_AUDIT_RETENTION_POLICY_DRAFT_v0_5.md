# AirTrust — Audit Retention Policy Draft v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `e84c08d2c3979ed46026c171d3ca94f72b2e01fd`
**Status:** Draft técnico. Depende de validação jurídica antes de qualquer obrigação ser tratada como definitiva.

## Objetivo

Propor uma política técnica inicial de retenção, anonimização e descarte para o Audit Trail/LGPD v2 sem assumir decisão legal final neste sprint.

## Premissas

- o AirTrust trata dados operacionais e, em alguns fluxos, dados sensíveis ligados a FRMS/saúde operacional.
- retenção única para todos os eventos é inadequada.
- o evento canônico deve carregar `retention_class`.
- descarte deve preferir anonimização ou minimização adicional quando a trilha operacional ainda tiver valor estatístico.

## Classes de retenção propostas

| Classe | Uso principal | Janela técnica sugerida | Observação |
|---|---|---|---|
| `OPS_SHORT` | eventos operacionais de baixo risco, leitura simples, diagnósticos sem sensibilidade | 90 dias | Base técnica, não obrigação legal |
| `BUSINESS_MEDIUM` | mudanças operacionais normais por tenant | 12 meses | Ajuda em troubleshooting e reconciliação |
| `COMPLIANCE_LONG` | mutações de usuário, documentos, certificados, permissões | 24 meses | Deve ser revalidada com jurídico |
| `SECURITY_LONG` | auth, guard rails, impersonação, falhas de autorização, operações admin | 24 a 36 meses | Pode exigir retenção superior por incidente/regulatório |
| `LGPD_SENSITIVE` | FRMS, exports sensíveis, acessos com potencial alto de impacto ao titular | 12 a 24 meses com minimização forte | Requer revisão jurídica específica |
| `SUPPORT_CONTROLLED` | entrada de suporte, leitura sensível, break-glass | 24 meses | Justificativa e trilha precisam sobreviver a auditoria interna |

## Eventos curtos

Candidatos a `OPS_SHORT`:

- leituras de asset privado sem download.
- checagens operacionais read-only de baixo risco.
- eventos de guard informativos sem incidente.

## Eventos médios

Candidatos a `BUSINESS_MEDIUM`:

- alterações de escala.
- mudanças de sessão de simulador.
- eventos administrativos de baixa sensibilidade por tenant.

## Eventos longos

Candidatos a `COMPLIANCE_LONG`:

- mudanças de usuário e vínculo.
- acesso/download de documento ou certificado.
- alterações de módulo por tenant.
- alterações de qualificação relevantes para prontidão operacional.

## Eventos de segurança

Candidatos a `SECURITY_LONG`:

- login/logout privilegiado.
- impersonação.
- falhas repetidas de autorização.
- bloqueios de guard operacional.
- operações administrativas críticas.

## Eventos LGPD

Candidatos a `LGPD_SENSITIVE`:

- submissão e revisão FRMS.
- export de dados potencialmente pessoais/sensíveis.
- acesso a dados com componente médico/saúde operacional.

Nesses casos, retenção longa demais aumenta risco; retenção curta demais pode prejudicar investigação. A decisão final precisa equilibrar base legal, necessidade operacional e risco residual.

## Eventos de suporte

Todo evento de suporte com entrada em tenant de cliente deve usar `SUPPORT_CONTROLLED`, incluindo:

- `tenant_enter`.
- leitura sensível.
- impersonação ou equivalente.
- encerramento do atendimento com justificativa.

## Critérios de anonimização

Quando a janela de retenção expirar, preferir anonimização se ainda houver utilidade estatística/forense mínima:

- substituir `actor_user_id` por identificador irreversível quando a identidade nominal não for mais necessária.
- remover hashes de IP/User-Agent se já não agregarem valor investigativo.
- manter `empresa_id`, `event_category`, `event_action`, `success`, `risk_level`, `created_at` em granularidade adequada se permitido juridicamente.

## Critérios de descarte

Descartar integralmente quando:

- o evento não tiver obrigação legal/contratual de retenção.
- não houver incidente, disputa ou investigação aberta associada.
- o prazo da classe já tiver expirado.
- o dado residual mantido não trouxer valor operacional proporcional ao risco.

## Suspensão de descarte

Suspender purge/anonimização quando houver:

- incidente de segurança em investigação.
- solicitação formal de auditoria interna/externa.
- disputa contratual ou trabalhista que dependa da trilha.
- orientação jurídica específica.

## O que precisa de validação jurídica

- prazo final por classe.
- retenção específica de eventos FRMS e dados correlatos.
- retenção mínima/máxima de eventos de suporte em tenant de cliente.
- compatibilidade com direitos do titular e políticas de exclusão/portabilidade.
- necessidade de preservar ou remover hashes de IP/User-Agent.

## Conclusão

Este documento é um draft técnico. Ele define classes e critérios para orientar o desenho do Audit Trail v2, mas não substitui parecer jurídico, DPA, política de privacidade ou procedimento formal de atendimento LGPD.
