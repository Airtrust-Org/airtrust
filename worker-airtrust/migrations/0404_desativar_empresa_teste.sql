-- ============================================================
-- Migration: 0404_desativar_empresa_teste.sql
-- Modulo: Platform / Tenant — Higiene pré-piloto multiempresa
-- Descricao: Desativa empresa de teste ativa (id=2) como
--            precondicao de higiene para piloto controlado.
--            Empresa 2 ("Teste Empresa 001") nao possui
--            usuarios, funcionarios ou dados operacionais.
--            Desativacao reversivel — dados preservados.
-- Autor: AirTrust Engineering
-- Data: 2026-06-09
-- Dependencias: nenhuma
-- ============================================================

UPDATE empresas
   SET ativo = 0,
       updated_at = datetime('now')
 WHERE id = 2
   AND ativo = 1;
