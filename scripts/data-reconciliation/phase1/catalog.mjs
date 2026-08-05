import c0 from './catalog-qualificacoes.mjs';
import c1 from './catalog-usuarios.mjs';
import c2 from './catalog-lms.mjs';
import c3 from './catalog-simuladores.mjs';
import c4 from './catalog-treinamentos.mjs';
import c5 from './catalog-rdv.mjs';
import c6 from './catalog-frms-escalas.mjs';
import c7 from './catalog-documentos.mjs';

export const findings = Object.freeze([...c0, ...c1, ...c2, ...c3, ...c4, ...c5, ...c6, ...c7]);

const categorySet = new Set(findings.map((item) => item.category));
export const categories = Object.freeze(Array.from(categorySet).sort());
