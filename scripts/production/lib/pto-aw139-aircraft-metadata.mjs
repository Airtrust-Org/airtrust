// Tenant-6 aircraft metadata correction — no curriculum or historical records.
const TENANT=6;
export const PAIRS=Object.freeze([
  [99,'A139-I-06/12@M2026.07-V2'],
  [101,'A139-I-08/12@M2026.07-V2'],
  [106,'A139-P-01/04-C1@M2026.07-V2'],
  [107,'A139-P-02/04-C1-OFFSHORE@M2026.07-V1'],
  [112,'A139-P-01/04-C2@M2026.07-V2'],
  [113,'A139-P-02/04-C2-OFFSHORE@M2026.07-V1'],
  [118,'A139-P-01/04-C3@M2026.07-V2'],
  [119,'A139-P-02/04-C3-OFFSHORE@M2026.07-V1'],
  [123,'A139-S-02/02-C3@M2026.07-V2'],
]);
export function assertPtoAw139MetadataState({rows,links},stage='before'){
  if(rows?.length!==9||links?.length!==9)throw Error('MODEL_OR_LINK_COUNT_DRIFT');
  const expected=new Map(PAIRS),seen=new Set(),linkIds=new Set();
  for(const m of rows){
    const id=Number(m.id);
    if(seen.has(id)||expected.get(id)!==m.codigo)throw Error('MODEL_ID_CODE_DRIFT');
    seen.add(id);
    if(Number(m.empresa_id)!==TENANT||Number(m.ativo)!==1||m.deleted_at!==null)
      throw Error('MODEL_SCOPE_DRIFT');
    if(m.modelo_aeronave!==(stage==='before'?null:'AW139'))
      throw Error('MODEL_AIRCRAFT_DRIFT');
  }
  for(const link of links){
    const id=Number(link.id);
    if(linkIds.has(id)||!expected.has(id))throw Error('MODEL_LINK_ID_DRIFT');
    linkIds.add(id);
    if(Number(link.n)!==18||Number(link.s76)!==0||
      Number(link.cross_tenant)!==0||Number(link.orphan)!==0)
      throw Error('MODEL_LINKS_NOT_SAFE');
  }
  if(linkIds.size!==9)throw Error('MODEL_LINKS_MISSING');
  return true;
}
const ids=PAIRS.map(([id])=>id).join(',');
const sqlText=x=>"'"+String(x).replace(/'/g,"''")+"'";
const cases=PAIRS.map(([id,code])=>`WHEN ${id} THEN ${sqlText(code)}`).join(' ');
const validCode=alias=>`(CASE ${alias}.id ${cases} ELSE NULL END)=${alias}.codigo`;
export function buildPtoAw139MetadataUpdateSql(){
  // A global nine-row guard prevents an update of eight rows if one fails.
  return `UPDATE modelos_sessao AS m
    SET modelo_aeronave='AW139',updated_at=datetime('now')
    WHERE m.empresa_id=${TENANT} AND m.id IN (${ids})
      AND m.ativo=1 AND m.deleted_at IS NULL AND m.modelo_aeronave IS NULL
      AND ${validCode('m')}
      AND (SELECT COUNT(*) FROM modelos_sessao AS b
        WHERE b.empresa_id=${TENANT} AND b.id IN (${ids})
          AND b.ativo=1 AND b.deleted_at IS NULL AND b.modelo_aeronave IS NULL
          AND ${validCode('b')}
          AND (SELECT COUNT(*) FROM modelos_sessao_manobras AS bl
            WHERE bl.modelo_id=b.id AND bl.deleted_at IS NULL)=18
          AND NOT EXISTS (SELECT 1 FROM modelos_sessao_manobras AS bl
            LEFT JOIN manobras AS ba ON ba.id=bl.manobra_id
            WHERE bl.modelo_id=b.id AND bl.deleted_at IS NULL
              AND (ba.id IS NULL OR ba.empresa_id<>${TENANT}
                OR UPPER(COALESCE(ba.tipo_aeronave,'')) IN ('S76','SK76'))))=9
      AND (SELECT COUNT(*) FROM modelos_sessao_manobras AS l
        WHERE l.modelo_id=m.id AND l.deleted_at IS NULL)=18`;
}
