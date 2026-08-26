# LMS — sinalização de pendência por módulo

Esta frente amplia de forma backwards-compatible o `AIRTRUST_COMPLETION_DIAGNOSTICS_V1` com `moduleResults[]` para que o AirTrust possa informar exatamente em qual módulo uma avaliação ficou abaixo da nota mínima.

O diagnóstico continua estritamente informativo: não altera `lesson_status`, score canônico, matrícula, qualificação nem certificado.

Pacotes V1 existentes sem `moduleResults` continuam válidos; o parser normaliza a ausência para `[]` e mantém o fallback global atual.

A sinalização visual dentro do menu do próprio pacote SCORM depende de o pacote emitir `moduleResults` e renderizar seu estado interno; isso não é controlado pelo React do AirTrust por estar dentro do iframe.
