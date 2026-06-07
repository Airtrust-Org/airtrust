-- ============================================================
-- LOTE 3 APPLY — frms_jornada sem tenant
-- ATENÇÃO: Contém UPDATE real. NÃO EXECUTAR sem autorização.
-- Pré-condições: ver docs/AIRTRUST_FRMS_TENANT_RECONCILIATION_DRY_RUN_20260607.md
-- Escopo estrito: apenas 76 IDs automáticos de alta confiança.
-- ============================================================

-- PRÉ-CHECK obrigatório:
-- 1. HEAD == origin/main no commit revisado.
-- 2. Nenhuma duplicidade / órfão / funcionário inativo introduzido desde o dry-run.
-- 3. 0391 segue isolada; FIRA rotulado fica fora deste apply.

-- PASSO 1: mover somente IDs explícitos e ainda elegíveis
UPDATE frms_jornada
SET empresa_id = 6,
    updated_at = datetime('now')
WHERE empresa_id IS NULL
  AND deleted_at IS NULL
  AND id IN (
    '76b5b26c-68a1-4b71-bc27-5d26de7c200e',
    '61ad3fc4-5322-44b2-ab31-1c90ecd67454',
    '8e0a6cf4-7ae7-4d6c-ad86-09a56afa86b6',
    'cec75b47-9065-4459-87c3-5fc981c39485',
    'a7ad7416-81d7-473b-9cf7-4f562c70aa75',
    'd5552790-3208-43dd-80b2-a5e9fde5bbf0',
    '1e00b1d8-655e-434d-9d34-20c0b8194170',
    '8b1a7e11-7462-45d0-868b-2b84a3dcef0a',
    'b3dec22d-a39b-4ded-84b5-646a16588680',
    '224bdf44-d2ee-44d7-8a3f-1c6b76af570b',
    '1c759b8c-7f48-4edb-8b3d-39bb04b1a826',
    'ed2588ec-24c0-40b5-bd38-9377c5520949',
    '24e92259-72f1-4eb6-a472-f226a24b31c5',
    '025c06c0-293c-44da-a7fd-1d2da752fc4e',
    '95d43067-0f3a-4fb4-94f9-6cf7738ebd0b',
    '9ff79403-1428-4730-8b30-8272dcc16cb5',
    '4cc552e4-2bb5-4ecb-a00e-8aa0ca08010e',
    '0e8c9ce7-6bc6-4d17-83ad-8cf9249de411',
    '3111914a-03eb-4aaa-b66c-e3a52fa119df',
    'e34eea6a-3bb0-4c82-87d6-f40ea0a5af33',
    '1a2e2cb0-f201-4380-afda-56e94d64770f',
    'd33af9f0-891e-434c-839b-330bad14f24a',
    'a8ee99ed-265f-4f0e-9dae-4b7c065f0a9f',
    '9c1aa295-b6fb-4f7e-aa62-3915f9befdcc',
    '7defd7f5-b8a9-4788-9e71-be5a6b6acae3',
    'fd4e9c5d-6f68-40c1-a160-745fbbcc504f',
    '7e61d317-804e-4901-a22b-e7e0559b106e',
    'fe97e982-644a-453e-ab60-2c6d7557dc44',
    'cbf899ae-98b1-4aa0-a012-8d232f8ca640',
    'd0a58112-867e-4a37-9884-00d760644cf6',
    '8b96f911-af9d-4089-8121-057dac6747e1',
    'bbac9c96-760a-4391-8496-7e8f40ef7b09',
    '026a2f4b-d2dc-49ad-8244-f95c5f112059',
    '92b7a0f7-1ba5-4c4c-87ba-4a8f3b1a8c7e',
    '300b2937-58f8-4388-9016-6b47bcc5147a',
    'be203c90-4477-4a24-8325-3454685ac8b6',
    '51b987eb-c4ee-489c-8917-5b6ce6bacf06',
    'bffb58ef-ef13-4c85-9296-f1daf8400dc3',
    '43e0c9b5-db02-4766-91a3-3092894a7f5b',
    '9a99a444-4b81-40f8-88d4-2dafd1b86d08',
    '12f27ebe-ea4d-4462-9625-64c0a003eef0',
    '0be35ba8-3dda-4826-aaf7-8ab7544b3ada',
    'ab302546-a8ed-4941-ae4c-ce5054a90a3d',
    'add6983f-bfeb-40c5-ba55-a065dfca1c80',
    '6706c71c-b353-4951-9ebc-37ffb2d2c628',
    '81ee145b-4f44-4b14-9468-d3f0e814153a',
    '0b89ba66-9ae1-4b4b-9ef0-2dcf29b55da9',
    '7f2b74a2-a9ed-4bdd-8bf6-4f97463833ac',
    '50c7b59f-9aab-4dca-a05f-6a5768254ff4',
    '0c4ed953-428f-4457-bd07-44d765e4ad9a',
    '4f41113f-83f1-4ef8-a364-61b801af94b3',
    'b3d2a796-7e60-40f8-b140-40814600a4d8',
    '2ff1ccad-ead7-4270-b9aa-c65f97e90b18',
    'da2138f9-0d3f-45ca-94f9-7c9c0c39df96',
    'f2056a6c-da11-43a0-b83a-93c531cd4376',
    '39fb3656-0b14-433c-9f0a-487bffa6064d',
    '2e6173da-06ed-47bb-8964-1f7142b1bca1',
    '25d37f80-6505-4063-95a5-ee36953ba298',
    'b1b7b37c-40a7-47aa-9db5-03c572578103',
    'e87f9744-d1e3-4820-9246-a060164678d3',
    '463b9094-eff0-48c1-92aa-2830be400590',
    '0839fb35-e5f9-4fa9-9435-f434e8ebdec3',
    '5ce23593-e166-4be7-be0c-37128e45d111',
    '68885c39-e180-414d-842c-367dcbfdc2e6',
    'ca6332c9-67fa-4a1c-a819-52397cffaf96',
    '6e9114cc-5e7f-4b00-94cd-0897bb93d8a3',
    '06b54319-8db8-4595-8ab9-ee9062c20081',
    '3fd34bae-b9b6-4c9f-bf20-28244d03200c',
    'b6277b7b-c312-419b-8559-1d5451e28e92',
    '467cf236-541f-4263-ae2d-46de6b43e751',
    'b8df893e-ccee-47f6-944b-68a032df5365',
    'c08ddf6c-95cb-42bb-ac90-8565e736b34f',
    '685a164d-b2b4-4074-a7d0-45b6df71e637',
    '24179678-86d8-4fd9-9887-661bf964ca8f',
    '2ec939ad-d728-46c8-a693-ceb9624de9bc',
    '442b17f2-2d81-4853-a9ec-15d1f5d1c343'
  )
  AND EXISTS (
    SELECT 1
    FROM funcionarios f
    WHERE f.id = CAST(frms_jornada.tripulante_id AS INTEGER)
      AND f.empresa_id = 6
      AND f.deleted_at IS NULL
      AND COALESCE(f.ativo, 1) = 1
      AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
  )
  AND (observacao IS NULL OR observacao NOT LIKE '%FIRA_HISTORICO%')
  AND NOT (
    COALESCE(horas_voo_minutos, 0) > COALESCE(duracao_jornada_minutos, 0)
    AND COALESCE(duracao_jornada_minutos, 0) > 0
  )
  AND NOT (
    COALESCE(duracao_jornada_minutos, 0) = 0
    AND COALESCE(horas_voo_minutos, 0) > 0
  );
-- Esperado: 76 linhas afetadas

-- PASSO 2: verificação pós-apply
WITH auto_ids AS (
  SELECT id
  FROM frms_jornada
  WHERE id IN (
    '76b5b26c-68a1-4b71-bc27-5d26de7c200e',
    '61ad3fc4-5322-44b2-ab31-1c90ecd67454',
    '8e0a6cf4-7ae7-4d6c-ad86-09a56afa86b6',
    'cec75b47-9065-4459-87c3-5fc981c39485',
    'a7ad7416-81d7-473b-9cf7-4f562c70aa75',
    'd5552790-3208-43dd-80b2-a5e9fde5bbf0',
    '1e00b1d8-655e-434d-9d34-20c0b8194170',
    '8b1a7e11-7462-45d0-868b-2b84a3dcef0a',
    'b3dec22d-a39b-4ded-84b5-646a16588680',
    '224bdf44-d2ee-44d7-8a3f-1c6b76af570b',
    '1c759b8c-7f48-4edb-8b3d-39bb04b1a826',
    'ed2588ec-24c0-40b5-bd38-9377c5520949',
    '24e92259-72f1-4eb6-a472-f226a24b31c5',
    '025c06c0-293c-44da-a7fd-1d2da752fc4e',
    '95d43067-0f3a-4fb4-94f9-6cf7738ebd0b',
    '9ff79403-1428-4730-8b30-8272dcc16cb5',
    '4cc552e4-2bb5-4ecb-a00e-8aa0ca08010e',
    '0e8c9ce7-6bc6-4d17-83ad-8cf9249de411',
    '3111914a-03eb-4aaa-b66c-e3a52fa119df',
    'e34eea6a-3bb0-4c82-87d6-f40ea0a5af33',
    '1a2e2cb0-f201-4380-afda-56e94d64770f',
    'd33af9f0-891e-434c-839b-330bad14f24a',
    'a8ee99ed-265f-4f0e-9dae-4b7c065f0a9f',
    '9c1aa295-b6fb-4f7e-aa62-3915f9befdcc',
    '7defd7f5-b8a9-4788-9e71-be5a6b6acae3',
    'fd4e9c5d-6f68-40c1-a160-745fbbcc504f',
    '7e61d317-804e-4901-a22b-e7e0559b106e',
    'fe97e982-644a-453e-ab60-2c6d7557dc44',
    'cbf899ae-98b1-4aa0-a012-8d232f8ca640',
    'd0a58112-867e-4a37-9884-00d760644cf6',
    '8b96f911-af9d-4089-8121-057dac6747e1',
    'bbac9c96-760a-4391-8496-7e8f40ef7b09',
    '026a2f4b-d2dc-49ad-8244-f95c5f112059',
    '92b7a0f7-1ba5-4c4c-87ba-4a8f3b1a8c7e',
    '300b2937-58f8-4388-9016-6b47bcc5147a',
    'be203c90-4477-4a24-8325-3454685ac8b6',
    '51b987eb-c4ee-489c-8917-5b6ce6bacf06',
    'bffb58ef-ef13-4c85-9296-f1daf8400dc3',
    '43e0c9b5-db02-4766-91a3-3092894a7f5b',
    '9a99a444-4b81-40f8-88d4-2dafd1b86d08',
    '12f27ebe-ea4d-4462-9625-64c0a003eef0',
    '0be35ba8-3dda-4826-aaf7-8ab7544b3ada',
    'ab302546-a8ed-4941-ae4c-ce5054a90a3d',
    'add6983f-bfeb-40c5-ba55-a065dfca1c80',
    '6706c71c-b353-4951-9ebc-37ffb2d2c628',
    '81ee145b-4f44-4b14-9468-d3f0e814153a',
    '0b89ba66-9ae1-4b4b-9ef0-2dcf29b55da9',
    '7f2b74a2-a9ed-4bdd-8bf6-4f97463833ac',
    '50c7b59f-9aab-4dca-a05f-6a5768254ff4',
    '0c4ed953-428f-4457-bd07-44d765e4ad9a',
    '4f41113f-83f1-4ef8-a364-61b801af94b3',
    'b3d2a796-7e60-40f8-b140-40814600a4d8',
    '2ff1ccad-ead7-4270-b9aa-c65f97e90b18',
    'da2138f9-0d3f-45ca-94f9-7c9c0c39df96',
    'f2056a6c-da11-43a0-b83a-93c531cd4376',
    '39fb3656-0b14-433c-9f0a-487bffa6064d',
    '2e6173da-06ed-47bb-8964-1f7142b1bca1',
    '25d37f80-6505-4063-95a5-ee36953ba298',
    'b1b7b37c-40a7-47aa-9db5-03c572578103',
    'e87f9744-d1e3-4820-9246-a060164678d3',
    '463b9094-eff0-48c1-92aa-2830be400590',
    '0839fb35-e5f9-4fa9-9435-f434e8ebdec3',
    '5ce23593-e166-4be7-be0c-37128e45d111',
    '68885c39-e180-414d-842c-367dcbfdc2e6',
    'ca6332c9-67fa-4a1c-a819-52397cffaf96',
    '6e9114cc-5e7f-4b00-94cd-0897bb93d8a3',
    '06b54319-8db8-4595-8ab9-ee9062c20081',
    '3fd34bae-b9b6-4c9f-bf20-28244d03200c',
    'b6277b7b-c312-419b-8559-1d5451e28e92',
    '467cf236-541f-4263-ae2d-46de6b43e751',
    'b8df893e-ccee-47f6-944b-68a032df5365',
    'c08ddf6c-95cb-42bb-ac90-8565e736b34f',
    '685a164d-b2b4-4074-a7d0-45b6df71e637',
    '24179678-86d8-4fd9-9887-661bf964ca8f',
    '2ec939ad-d728-46c8-a693-ceb9624de9bc',
    '442b17f2-2d81-4853-a9ec-15d1f5d1c343'
  )
)
SELECT 'auto_ids_em_empresa_6' AS check_item, COUNT(*) AS valor
FROM frms_jornada
WHERE empresa_id = 6
  AND id IN (SELECT id FROM auto_ids)

UNION ALL

SELECT 'null_ativos_residuais', COUNT(*)
FROM frms_jornada
WHERE empresa_id IS NULL
  AND deleted_at IS NULL

UNION ALL

SELECT 'auto_ids_ainda_null', COUNT(*)
FROM frms_jornada
WHERE empresa_id IS NULL
  AND id IN (SELECT id FROM auto_ids);
-- Esperado: 76 / 591 / 0
