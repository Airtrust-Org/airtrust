# Roteiro da reunião prévia — eDB AirTrust

> **Duração-alvo:** 60 minutos  
> **Objetivo:** obter orientação suficiente para fechar arquitetura, avaliação independente e processo RBAC 135

## 1. Abertura — 5 minutos

- apresentação dos participantes;
- identificação do operador e do fornecedor;
- confirmação de que o papel permanece oficial;
- confirmação de que a reunião busca orientação, não aprovação antecipada;
- pedido de autorização para registrar ata e decisões técnicas.

## 2. Contexto operacional — 5 minutos

- operação RBAC 135 e perfil da frota candidata;
- fluxo atual do Diário de Bordo impresso;
- Controle de Voos e integração SIGVOOS;
- usuários operacionais e de manutenção;
- conectividade esperada nas bases, aeronaves e operações offshore.

## 3. Escopo do eDB — 5 minutos

Apresentar como incluídos:

- volumes e termos;
- registros por etapa;
- tripulação, horários, tempos, combustível, POB, carga, natureza e ocorrências;
- situação técnica;
- discrepância, ação corretiva e retorno ao serviço;
- assinaturas;
- PED/offline;
- fiscalização, exportação e retenção.

Declarar como excluídos da primeira autorização:

- MRO/SDRMe completo;
- FRMS como parte do eDB;
- integrações externas não especificadas;
- uso por operadores ou aeronaves não autorizados.

## 4. Arquitetura — 10 minutos

Apresentar o fluxo:

```text
SIGVOOS/entrada manual
        ↓
Controle de Voos — dado operacional editável
        ↓
Rascunho eDB com procedência e lacunas
        ↓ revisão deliberada
Snapshot regulado imutável
        ↓ assinatura PIC/manutenção
Contrassinatura do operador
        ↓
Volume oficial, fiscalização e retenção
```

Enfatizar:

- integração nunca assina;
- alteração posterior de `cv_*` não muda registro assinado;
- correção cria nova versão e conserva o original;
- ativação é limitada por operador, aeronave e ato autorizativo;
- shadow mode não altera a fonte oficial.

## 5. Assinatura — 10 minutos

Apresentar sem fechar método:

- separação entre login e assinatura;
- intenção de uso único;
- conteúdo canônico;
- finalidade explícita;
- reautenticação;
- certificado, revogação e timestamp;
- assinatura online, offline e híbrida;
- assinatura do operador e exportações.

Perguntas P0:

1. Quais atos exigem certificado ICP-Brasil individual?
2. É aceita assinatura eletrônica individual reforçada combinada com assinatura digital do operador?
3. Qual evidência temporal é exigida online e offline?
4. Como preservar verificação após expiração ou revogação posterior?
5. A contrassinatura do operador exige ação humana deliberada?

## 6. PED e offline — 10 minutos

Apresentar:

- alternativas PWA, nativo, híbrido e terminal dedicado;
- pacote cifrado dos últimos 30 dias;
- situação técnica e aviso de inicialização;
- revogação de dispositivo;
- sincronização idempotente;
- conflitos sem “última escrita vence”;
- contingência e equipamento reserva;
- determinação de não interferência pelo operador.

Perguntas P0:

1. PWA instalada pode ser aceita como PED stand-alone?
2. Quais testes e controles mínimos são esperados?
3. Como tratar assinatura offline e seu instante jurídico?
4. O modo de fiscalização deve funcionar sem rede?
5. Qual procedimento se o pacote estiver incompleto ou expirado?

## 7. Processo e avaliação independente — 10 minutos

Confirmar:

- possibilidade de ateste do software e autorização do primeiro operador no mesmo processo;
- FOP 219, D-144-01, FAI e manuais;
- processos separados de manuais;
- TFAC aplicável;
- inspeções e demonstrações;
- escopo da EO e migração da frota.

Perguntas P0:

1. Qual alternativa do art. 3º, II, da Resolução nº 458 é esperada?
2. Qual qualificação deve possuir a entidade avaliadora?
3. O ateste pode ser do software multi-tenant, com EO por operador?
4. Quais mudanças do SaaS exigem novo ateste?
5. Quais manuais e demonstrações devem integrar a solicitação?
6. É aceito shadow mode com papel oficial para formar evidência?
7. Como delimitar o primeiro conjunto de matrículas?

## 8. Encerramento — 5 minutos

- recapitular decisões e pendências;
- identificar respostas que dependem de consulta interna da ANAC;
- solicitar registro institucional das orientações críticas;
- confirmar próximo protocolo e documentos;
- confirmar ponto focal e canal de comunicação;
- combinar prazo ou evento para resposta das pendências, sem presumir aprovação.

## Materiais de apoio

Manter prontos, mas apresentar somente se necessário:

- baseline artigo por artigo;
- matriz de 54 controles;
- mapa de campos;
- threat model de 24 ameaças;
- conceito PED/offline;
- plano de implementação em PRs;
- RFP da avaliação independente;
- exemplo sintético de rascunho shadow;
- roteiro de demonstração futura.

## Regras de condução

- não improvisar resposta regulatória;
- distinguir “entendemos”, “propomos” e “a ANAC confirmou”;
- não discutir cronograma de autorização como compromisso;
- não demonstrar dados reais;
- registrar texto exato quando a orientação afetar arquitetura;
- converter toda decisão em item do `DECISION_REGISTER.csv`.
