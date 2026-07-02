// @vitest-environment jsdom

/**
 * Harness de preview NOTECHS — replica EXATAMENTE os valores de layout do
 * gerador real `gerarPDFFichaCliente` em src/react-app/services/pdf-ficha-client.ts.
 *
 * Nao usa browser APIs (fetch, URL.createObjectURL, apiFetch, getAccessToken).
 * Logo cai no fallback cinza claro "LOGO", igual ao fluxo real sem token.
 */
import { describe, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { jsPDF } from 'jspdf';
import {
  NOTECHS_ITENS,
  NOTECHS_ORDEM_BASE,
  splitManobrasNotechs,
} from '@/react-app/pages/simuladores/fichas/notechs';
import {
  FICHA_AVALIACAO_FAIXAS,
  FICHA_AVALIACAO_NOTAS,
} from '@/react-app/pages/simuladores/fichas/avaliacaoScale';

const OUT = path.resolve(process.cwd(), 'docs/analysis/notechs-previews-20260702');

// ══════════════════════════════════════════════════════════════════════
// Cores e constantes EXATAS do gerador real gerarPDFFichaCliente
// ══════════════════════════════════════════════════════════════════════
const C = {
  primary: '#2180B0', danger: '#C0152F', success: '#208090',
  text: '#134252', textSec: '#626C7C', border: '#E0E4E8', bgLight: '#F5F7FA', white: '#FFFFFF',
};
const NOTECHS_COLOR = '#7c3aed';
const MARGIN = 15;

function formatData(v: string) { return v; } // ja vem como dd/mm/yyyy

function getNotaColor(n: number) { return n>=8?'#10B981':n>=5?'#F59E0B':'#EF4444'; }
function getNotaText(n: number) { return n>=8?'#FFFFFF':'#111827'; }
function contrast(hex: string): string {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return (r*299+g*587+b*114)/1000>150?'#111827':'#FFFFFF';
}
function getDisplay(v?:string,p=''):string { const s=String(v||'').trim(); return s||p; }

// ══════════════════════════════════════════════════════════════════════
// Dados realistas baseados na ficha real Costa do Sol
// ══════════════════════════════════════════════════════════════════════

const REAL_MANOBRAS: Record<string,string[]> = {
SK76: [
  'Partida e Decolagem','Voo Nivelado','Curvas Padrao','Subida e Descida',
  'Aproximacao Visual','Pouso Normal','Falha de Motor em Voo','Autorrotacao 180',
  'Pane Eletrica em Voo','Falha Hidraulica','Incendio em Voo',
  'Perda de Comunicacoes','Procedimento IFR','Espera IFR',
  'Aproximacao ILS','Arremetida IFR','Pouso com Vento Cruzado','Emergencia Medica',
],
A139: [
  'Partida e Decolagem','Voo Pairado','Voo Translacional','Curvas Niveladas',
  'Subida/Descida OEI','Aproximacao Offshore','Pouso em Heliponto',
  'Falha Motor CAT A','Pane AFCS','Falha Dupla Hidraulica',
  'Incendio Motor','Perda Comunicacoes','Procedimento IFR',
  'Aproximacao GNSS','Espera Offshore','Arremetida OEI',
  'Pouso em Plataforma','Emergencia Medica',
],
LOFT: [
  'Briefing Operacional','Decolagem IMC','Navegacao IFR',
  'Falha Motor em Rota','Autorrotacao 180','Pane Eletrica Total',
  'Falha AFCS','Emergencia Fumaca','Aproximacao ILS CAT I',
  'Arremetida Tardia','Pouso Monomotor','Falha Trem de Pouso',
  'Evacuacao de Emergencia','Comunicacao ATC','Gestao de Recursos',
  'Tomada de Decisao','Debriefing Operacional','Integracao Tripulacao',
],
};

type M = {
  ordem:number;codigo:string;nome:string;descricao:string;
  resultado:number|string|null;observacoes?:string;tripulante?:'A'|'B'|'AB';
};

function tec(prefix:string, nomes:string[]):M[] {
  return nomes.slice(0,18).map((n,i)=>({
    ordem:i+1, codigo:`${prefix}-${String(i+1).padStart(2,'0')}`,
    nome:n, descricao:`Execucao operacional: ${n}`,
    resultado:((i%6)+5), observacoes:i%5===0?`Feedback instrutor #${i+1}`:'',
    tripulante:(i%3===0?'A':i%3===1?'B':'AB') as 'A'|'B'|'AB',
  }));
}

function notechsM():M[] {
  return NOTECHS_ITENS.map((item,i)=>({
    ordem:item.ordem, codigo:item.codigo, nome:item.tituloPt, descricao:item.tituloEn,
    resultado:[6,7,8,9,5][i%5], observacoes:i%4===0?'Feedback CRM':'',
    tripulante:'AB' as const,
  }));
}

// ══════════════════════════════════════════════════════════════════════
// GERADOR — replica pixel-por-pixel gerarPDFFichaCliente
// ══════════════════════════════════════════════════════════════════════
async function gerarPDF(
  fn:string, titulo:string, sim:string, tripNome:string, tripAnac:string,
  func:string, instrNome:string, instrAnac:string, prefix:string,
) {
  const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const pw=doc.internal.pageSize.getWidth(), ph=doc.internal.pageSize.getHeight(), cw=pw-2*MARGIN;

  // ── Header ─────────────────────────────────────────────────────────────
  const hTop=4, hH=22, hBot=hTop+hH;
  doc.setDrawColor(C.border); doc.setLineWidth(0.5); doc.line(0,hBot,pw,hBot);

  // Logo fallback (igual ao real sem token)
  doc.setFillColor(245,245,245);
  doc.roundedRect(MARGIN,hTop+1,34,16,2,2,'F');
  doc.setFontSize(6); doc.setTextColor(C.textSec);
  doc.text('LOGO',MARGIN+17,hTop+10,{align:'center'});

  // Status badge
  const badgeW=18, badgeH=7, badgeX=pw-MARGIN-badgeW;
  doc.setFillColor(C.success); doc.roundedRect(badgeX,hTop+2,badgeW,badgeH,2,2,'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(7);
  doc.text('CONCLUIDA',badgeX+badgeW/2,hTop+7,{align:'center'});

  // Titulo central
  const titX=pw/2;
  doc.setTextColor(C.primary); doc.setFont('helvetica','bold'); doc.setFontSize(10.5);
  doc.text('FICHA DE TREINAMENTO DE VOO',titX,hTop+6,{align:'center'});
  doc.setFontSize(6); doc.setTextColor(C.primary);
  doc.text('SESSAO',titX,hTop+11,{align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(C.textSec);
  doc.text(titulo,titX,hTop+16,{align:'center'});

  // ── Metadata Box ──────────────────────────────────────────────────────
  let cy=hBot+3;
  const SESSION_BOX_H=20;
  doc.setFillColor(C.bgLight); doc.setDrawColor(C.border);
  doc.roundedRect(MARGIN,cy,cw,SESSION_BOX_H,2,2,'FD');

  function info(label:string,value:string,x:number,lw:number,y:number) {
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(C.text);
    doc.text(label,x,y);
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(C.textSec);
    doc.text(value,x+lw,y);
  }
  const rY=cy+4.5, lh=5.5;
  info('Data:','02/07/2026',MARGIN+3,9,rY);
  info('Horario:','08:00-10:00',MARGIN+46,14,rY);
  info('Carga:','2.0h',MARGIN+90,12,rY);
  info('Simulador:',sim,MARGIN+120,16,rY);
  const r2=rY+lh;
  info('Tripulante:',tripNome,MARGIN+3,18,r2);
  info('ANAC:',tripAnac,MARGIN+88,9,r2);
  info('Funcao:',func,MARGIN+145,12,r2);
  const r3=r2+lh;
  info('Instrutor:',instrNome,MARGIN+3,16,r3);
  info('ANAC:',instrAnac,MARGIN+88,9,r3);

  cy+=SESSION_BOX_H+2;

  // ── Manobra Table ─────────────────────────────────────────────────────
  const tabCols = {
    num:MARGIN+3, cod:MARGIN+8, trip:MARGIN+28, itens:MARGIN+40,
    obs:MARGIN+82, nota:pw-MARGIN-12,
  };
  const tabW=cw;

  // Header row
  doc.setFillColor(C.primary); doc.rect(MARGIN,cy,cw,5.5,'F');
  doc.setTextColor(C.white); doc.setFont('helvetica','bold'); doc.setFontSize(6.5);
  doc.text('#',tabCols.num,cy+4); doc.text('CODIGO',tabCols.cod,cy+4);
  doc.text('TRIP.',tabCols.trip,cy+4); doc.text('ITENS',tabCols.itens,cy+4);
  doc.text('OBSERVACOES',tabCols.obs,cy+4); doc.text('NOTA',tabCols.nota,cy+4);
  cy+=6;

  const allManobras = [...tec(prefix, REAL_MANOBRAS[prefix]||REAL_MANOBRAS['SK76']), ...notechsM()];
  const { tecnicas: manobrasTecnicas, notechs: manobrasNotechs } = splitManobrasNotechs(allManobras);

  function drawRow(item:M, x:number, w:number, showOrdinal:boolean) {
    const ry=cy;
    doc.setFillColor(C.white); doc.setDrawColor(C.border); doc.rect(x,ry,w,5);

    // #
    doc.setFont('helvetica','normal'); doc.setFontSize(6); doc.setTextColor(C.textSec);
    const ord = showOrdinal ? String(item.ordem) : String(item.ordem-NOTECHS_ORDEM_BASE+1).padStart(2,'0');
    doc.text(ord, x+3, ry+3.7);

    // CODIGO
    doc.setFontSize(5.5); doc.setTextColor(C.text);
    doc.text(item.codigo, x+8, ry+3.7);

    // TRIP badge
    const trip=item.tripulante||'AB';
    const b=trip==='A'?{f:'#DBEAFE',t:'#1D4ED8'}:trip==='B'?{f:'#FEF3C7',t:'#B45309'}:{f:'#E2E8F0',t:'#334155'};
    doc.setFillColor(b.f); doc.setDrawColor(b.f);
    doc.roundedRect(x+22, ry+1, 7, 3, 1, 1, 'FD');
    doc.setTextColor(b.t); doc.setFontSize(5);
    doc.text(trip, x+25.5, ry+3.3, {align:'center'});

    // ITENS
    doc.setFontSize(6); doc.setTextColor(C.text);
    const nome = (item.nome||item.descricao||'').length>38 ? (item.nome||'').slice(0,36)+'...' : (item.nome||item.descricao||'');
    doc.text(nome, x+31, ry+3.7);

    // OBS
    if(item.observacoes) {
      doc.setFontSize(5); doc.setTextColor(C.textSec);
      doc.text(item.observacoes.slice(0,50), x+73, ry+3.7);
    }

    // NOTA badge
    const r=item.resultado;
    const isNR=r==='NR'||r==='NAO_REALIZADA';
    const n=typeof r==='number'?r:Number(r);
    const notaValida=!isNR&&r!==null&&r!==undefined&&!isNaN(n)&&n>0;
    const bw=10,bh=3.4,bx=x+w-bw-1,by=ry+(5-bh)/2;
    if(isNR) {
      doc.setFillColor('#64748B'); doc.roundedRect(bx,by,bw,bh,1,1,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(5); doc.setTextColor(C.white);
      doc.text('NR',bx+bw/2,by+bh-0.9,{align:'center'});
    } else if(notaValida) {
      doc.setFillColor(getNotaColor(n)); doc.roundedRect(bx,by,bw,bh,1,1,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(5);
      doc.setTextColor(getNotaText(n));
      doc.text(n.toFixed(1),bx+bw/2,by+bh-0.9,{align:'center'});
    } else {
      doc.setDrawColor(C.border); doc.setFillColor(C.white);
      doc.roundedRect(bx,by,bw,bh,1,1,'FD');
    }
  }

  // TECNICAS header
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(C.primary);
  doc.text('MANOBRAS TECNICAS (18)', MARGIN, cy-1);
  cy+=3;

  const mid=Math.ceil(manobrasTecnicas.length/2);
  const colW=(cw-2)/2;
  for(let i=0;i<mid;i++) {
    if(manobrasTecnicas[i]) drawRow(manobrasTecnicas[i],MARGIN,colW,true);
    if(manobrasTecnicas[i+mid]) drawRow(manobrasTecnicas[i+mid],MARGIN+colW+2,colW,true);
    cy+=5.5;
  }

  // NOTECHS header
  cy+=2;
  doc.setFillColor(NOTECHS_COLOR); doc.rect(MARGIN,cy-2,cw,5,'F');
  doc.setTextColor(C.white); doc.setFont('helvetica','bold'); doc.setFontSize(7);
  doc.text('NOTECHS — HABILIDADES NAO TECNICAS (CRM)', MARGIN+2, cy+1.8);
  cy+=5;

  const nMid=Math.ceil(manobrasNotechs.length/2);
  for(let i=0;i<nMid;i++) {
    if(manobrasNotechs[i]) drawRow(manobrasNotechs[i],MARGIN,colW,false);
    if(manobrasNotechs[i+nMid]) drawRow(manobrasNotechs[i+nMid],MARGIN+colW+2,colW,false);
    cy+=5.5;
  }

  // ── Regua ──────────────────────────────────────────────────────────────
  cy+=3;
  const regH=15, regW=cw;
  doc.setFillColor(C.bgLight); doc.setDrawColor(C.border);
  doc.roundedRect(MARGIN,cy,regW,regH,2,2,'FD');
  doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(C.text);
  doc.text('REGUA DE AVALIACAO',MARGIN+2,cy+3);

  const bandY=cy+5,bandH=4;
  let bx=MARGIN+2;
  const totalNotes=FICHA_AVALIACAO_NOTAS.length;
  const bandWTotal=regW-4;
  FICHA_AVALIACAO_FAIXAS.forEach(faixa=>{
    const bw=(faixa.noteIndexes.length/totalNotes)*bandWTotal;
    doc.setFillColor(faixa.color); doc.setDrawColor(faixa.color);
    doc.rect(bx,bandY,bw,bandH,'FD');
    doc.setTextColor(contrast(faixa.color)); doc.setFont('helvetica','bold'); doc.setFontSize(5);
    doc.text(faixa.rangeLabel,bx+bw/2,bandY+3,{align:'center'});
    bx+=bw;
  });
  const legY=bandY+bandH+1;
  let lx=MARGIN+2;
  FICHA_AVALIACAO_FAIXAS.forEach(faixa=>{
    const lw=(faixa.noteIndexes.length/totalNotes)*bandWTotal;
    doc.setFont('helvetica','normal'); doc.setFontSize(4.5); doc.setTextColor(C.text);
    doc.text(doc.splitTextToSize(faixa.description,lw-2).slice(0,2),lx+1,legY+2.5);
    lx+=lw;
  });
  cy+=regH+3;

  // ── Observacoes + Assinaturas ──────────────────────────────────────────
  doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(C.text);
  doc.text('OBSERVACOES GERAIS:',MARGIN,cy); cy+=4;
  doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(C.textSec);
  doc.text('Preview A4 — 18 tecnicas + 15 NOTECHS + regua + assinaturas. Layout fiel ao gerador real gerarPDFFichaCliente.',MARGIN,cy,{maxWidth:cw});
  cy+=6;

  doc.setDrawColor(C.border); doc.line(MARGIN,cy,pw-MARGIN,cy); cy+=5;

  // Two-compact signature boxes side by side
  const sigW=(cw-4)/2;
  doc.setFillColor(C.bgLight); doc.setDrawColor(C.border);
  doc.roundedRect(MARGIN,cy,sigW,12,1.5,1.5,'FD');
  doc.roundedRect(MARGIN+sigW+4,cy,sigW,12,1.5,1.5,'FD');
  doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(C.text);
  doc.text('Assinatura Tripulante',MARGIN+3,cy+4);
  doc.setFont('helvetica','normal'); doc.setFontSize(5.5); doc.setTextColor(C.textSec);
  doc.text('Data: 02/07/2026',MARGIN+3,cy+9);
  doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(C.text);
  doc.text('Assinatura Instrutor',MARGIN+sigW+7,cy+4);
  doc.setFont('helvetica','normal'); doc.setFontSize(5.5); doc.setTextColor(C.textSec);
  doc.text('Data: 02/07/2026',MARGIN+sigW+7,cy+9);

  const buf=Buffer.from(doc.output('arraybuffer'));
  await writeFile(path.join(OUT,fn),buf);
}

describe('NOTECHS previews A4 — layout fiel',()=>{
  it('SK76 Inicial',async()=>{
    await mkdir(OUT,{recursive:true});
    await gerarPDF('SK76_INICIAL_20260702.pdf','SK76 — Treinamento Inicial','SK76 FTD','Gabriel Ferreira Barreto','123456','PIC','Wilson Micael Martins Nery','654321','SK76');
  });
  it('A139 Periodico',async()=>{
    await mkdir(OUT,{recursive:true});
    await gerarPDF('A139_PERIODICO_20260702.pdf','AW139 — Periodico','AW139 FFS','Gabriel Ferreira Barreto','123456','PIC','Wilson Micael Martins Nery','654321','A139');
  });
  it('LOFT / Check',async()=>{
    await mkdir(OUT,{recursive:true});
    await gerarPDF('LOFT_CHECK_20260702.pdf','SK76 — LOFT / Check','SK76 FTD','Gabriel Ferreira Barreto','123456','PIC','Wilson Micael Martins Nery','654321','LOFT');
  });
});
