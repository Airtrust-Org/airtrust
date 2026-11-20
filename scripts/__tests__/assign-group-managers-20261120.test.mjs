import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateEffectiveRules,digest} from '../production/assign-group-managers-20261120.mjs';

const activeRules=()=>[
 {id:668,qualificacao_tipo_id:203,obrigatoriedade:'OBRIGATORIA',auto_matricular_ead:1,vigencia_inicio:null,vigencia_fim:null,modalidade_requerida:'EAD'},
 {id:669,qualificacao_tipo_id:184,obrigatoriedade:'OBRIGATORIA',auto_matricular_ead:1,vigencia_inicio:null,vigencia_fim:null,modalidade_requerida:'EAD'},
];

test('effective training policies are valid on the reviewed date',()=>{
 assert.doesNotThrow(()=>validateEffectiveRules(activeRules(),'2026-11-20'));
});

test('an expiry changed after dry-run invalidates the reviewed hash before any POST',()=>{
 const before=activeRules();
 const reviewedHash=digest({rules:before});
 const after=activeRules();
 after[1].vigencia_fim='2026-11-19';
 assert.notEqual(digest({rules:after}),reviewedHash);
 assert.throws(()=>validateEffectiveRules(after,'2026-11-20'),/RULE_NOT_EFFECTIVE/);
});

test('a start date in the future is rejected even with unchanged published courses',()=>{
 const rules=activeRules();
 rules[0].vigencia_inicio='2026-11-21';
 assert.throws(()=>validateEffectiveRules(rules,'2026-11-20'),/RULE_NOT_EFFECTIVE/);
});

test('policy modifications remain visible to state digest',()=>{
 const a=activeRules(),b=activeRules();
 b[0].modalidade_requerida='PRESENCIAL';
 assert.notEqual(digest({rules:a}),digest({rules:b}));
});
