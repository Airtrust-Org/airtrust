# Tenant Bombeiros — isolamento e onboarding controlado

**Data:** 2026-10-12. **Situação:** fluxo de cadastro preparado no código. Este documento **não** confirma que a empresa foi criada em D1, que recebeu usuário, que o perfil regulatório foi ativado ou que existe conformidade com o edital.

## Empresa completamente separada

- Costa do Sol: empresa existente, perfil `HELICOPTER_OFFSHORE`, fontes operacionais e regras offshore atuais preservadas.
- Bombeiros: **novo tenant**, nome de exibição proposto `Bombeiros`, código único `bombeiros`, capacidade administrativa inicial **130 pessoas** (valor previsto para a POC), sem transferência de usuários/dados da Costa do Sol.
- A navegação depende de `empresas_config.modulos_ativos` e o FRMS do bombeiro exige **uma atribuição ativa única** de `FIREFIGHTER_AVIATION` ao `empresa_id` respectivo.
- Funções `Operador Aerotático`, `Tripulante Operacional`, `Operador de Guincho` e similares não são classificadas automaticamente como tripulação offshore. No novo perfil, só são aplicáveis após validação da atribuição efetiva do próprio tenant no backend.
- Nenhum menu específico dos bombeiros deve ser apresentado a usuários autenticados na Costa do Sol. O cadastro de empresas, como funcionalidade da plataforma, só é permitido ao superadministrador.

## Criação segura — aplicativo oficial

O superadministrador cria a empresa pelo formulário administrativo da aplicação ou por **`POST /api/empresas` autenticado com privilégio de plataforma**, não por SQL remoto ou seed. Modelo mínimo para cadastro **inativo**, sem dados de tripulação e sem FRMS operacional:

```json
{
  "nome": "Bombeiros",
  "codigo": "bombeiros",
  "plano": "enterprise",
  "max_funcionarios": 130,
  "max_storage_mb": 1000,
  "ativo": 0,
  "modulos_ativos": []
}
```

O código agora aceita status e módulos no cadastro inicial, sem período em que módulos legados fiquem inadvertidamente disponíveis. Código repetido e registro anterior removido **não podem ser reativados automaticamente** pelo fluxo de cadastro controlado; exigir revisão de dados antes da eventual reativação.

**Antes da criação real:** confirmar que `bombeiros` não existe na lista superadministrativa, que se trata de piloto interno aprovado, que dados contratuais e o operador autorizado estão identificados. Registrar identificador gerado e ambiente sem PII.

## Ativação bloqueada até validação

1. Manter `ativo=0` e `modulos_ativos=[]` enquanto o edital completo, o enquadramento regulatório da **aviação** dos bombeiros e as referências técnicas forem revisados.
2. Aprovar perfil regulatório `FIREFIGHTER_AVIATION` da nova empresa, parâmetros versionados, evidências, política de limiares, testes de prontidão e trilha de auditoria. Não clonar o perfil `HELICOPTER_OFFSHORE`.
3. Aplicar cadastro/atribuição do perfil/revisões **somente via procedimento governado Schema V2 ou configuração administrativa autorizada**; registrar evidências e verificar `checkFrmsGovernanceReadiness` para o novo `empresa_id`. Sem fallback offshore.
4. Liberar módulos mínimos de acordo com escopo aprovado (ex.: `dashboard`, `funcionarios`, `frms`); depois vincular o administrador do novo tenant indicado pelo cliente, pela aplicação e sem reutilizar credenciais de outra empresa.
5. Testar segregação bidirecional: usuário Costa do Sol não lista nem consulta Bombeiros, e vice-versa; checar `auth/empresas`, RBAC, dados de FRMS, escalas, casos, relatórios, offline e relatórios exportados.
6. Validar check-in de fadiga **de todos** os tripulantes antes da liberação, preservando pré-carregamento offline de voos planejados; testar ações e explicação da fadiga acumulada.
7. Validar relatório técnico/gerencial mensal, medidas e eficácia, LGPD, performance até 130 usuários e prova de conceito; atestado de experiência prática é evidência documental externa, não algo que o código possa produzir.
8. Produção somente com autorização específica para SHA, Worker/Pages, eventual alteração governada e comprovantes de pós-validação.

## Critérios de aceite

**Cadastro técnico:** empresa nova com identificador distinto, status inativo, módulos explícitos, sem usuários/casos/dados copiados; autenticação Costa do Sol inalterada.

**Perfil aeronáutico Bombeiros:** aprovação normativa independente e governança de parâmetros completas; sem uso de limites offshore por default.

**Operação:** gestão consegue ver check-in, principais causas, recomendação e responsável; liberação impedida se qualquer check-in do voo não estiver `RECEBIDO`.

**Edital:** somente declarar aptidão quando requisitos exatos e documentos oficiais tiverem sido confrontados com a implementação e aprovados em homologação.

## Estado deste documento

- Isolamento da classificação e criação restrita: alterações versionadas em PR.
- Criação real em D1, perfil regulatório ativo, admin do tenant, metodologia completa, relatório específico e prova de conceito: **não comprovados/não executados**.
