# Perfil do primeiro operador requerente — Costa do Sol

> **Data-base da verificação:** 2026-08-02 (BRT)  
> **Status:** operador designado; dados regulatórios públicos devem ser reconfirmados imediatamente antes do protocolo

## Identificação

- **Operador requerente:** COSTA DO SOL TAXI AEREO S.A.
- **Tenant AirTrust:** `empresa_id = 6`
- **Código interno histórico:** `cds`
- **CNPJ:** `11.223.764/0001-62`
- **Sede social publicada pela ANAC:** Rio de Janeiro (RJ)
- **COA publicado na Portaria nº 12.859/SPO, de 19 de outubro de 2023:** `2013-05-00AO-01-04`
- **Revisão publicada:** 33
- **Data de emissão publicada:** 17 de outubro de 2023
- **Regulamento operacional:** RBAC nº 135

## Fontes de verificação

1. Portaria ANAC nº 12.859/SPO, de 19 de outubro de 2023 — revisão 33 do COA:  
   https://www.anac.gov.br/assuntos/legislacao/legislacao-1/portarias/2023/portaria-12859
2. Portaria ANAC nº 8.225/SPO, de 2 de junho de 2022 — cumprimento dos requisitos para exploração de serviços aéreos:  
   https://www.anac.gov.br/assuntos/legislacao/legislacao-1/portarias/2022/portaria-8225
3. Página oficial das Especificações Operativas, a ser consultada novamente no dia do protocolo:  
   https://www.gov.br/anac/pt-br/eo
4. Migração interna `0226_restore_costa_do_sol_and_user_tenant_enforcement.sql` — vínculo do tenant AirTrust `empresa_id = 6` com a Costa do Sol.

## Regra de precedência

Os dados publicados pela ANAC prevalecem sobre valores de seed, fixture ou migração interna. O CNPJ `00.000.000/0001-00` presente na migration 0226 é um valor técnico de restauração e **não pode ser utilizado** em formulário, carta, ata, anexo ou protocolo regulatório.

Antes de preencher o FOP 200 oficial, devem ser reconfirmados no processo e nos documentos vigentes do operador:

- revisão atual e cópia vigente do COA;
- Especificações Operativas vigentes;
- razão social e endereço cadastral atuais;
- base principal;
- representante legal e poderes;
- Diretor de Operações;
- Diretor de Manutenção ou responsável equivalente;
- Gestor de Segurança Operacional;
- procurador e ponto focal perante a ANAC, quando aplicável.

## Escopo inicial do AirTrust

A Costa do Sol é o primeiro operador proposto para conduzir a reunião prévia e a futura solicitação de alteração de EO referente ao Diário de Bordo Digital AirTrust.

A designação do operador não autoriza:

- uso do AirTrust como Diário de Bordo oficial;
- substituição do papel;
- ativação para toda a empresa, frota ou aeronave;
- assinatura regulatória;
- escrita offline;
- shadow pilot com dados reais;
- migration ou deploy do Regulated Records Core.

O primeiro escopo de aeronaves, matrículas, bases e participantes deve ser definido pelo operador e registrado como proposta no FOP 200, sem afirmar autorização prévia da ANAC.
