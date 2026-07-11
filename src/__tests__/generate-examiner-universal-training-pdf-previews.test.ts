// @vitest-environment jsdom

import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/react-app/config/api', () => ({
  getAccessToken: () => 'fake-test-token',
}));

vi.mock('@/react-app/lib/apiFetch', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const logoBuf = readFileSync(resolve(process.cwd(), 'public/favicon-32x32.png'));
  const logoDataUrl = `data:image/png;base64,${logoBuf.toString('base64')}`;
  return {
    apiFetch: async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('logo-base64')) {
        return new Response(JSON.stringify({ success: true, data: logoDataUrl }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    },
  };
});

const OUT_DIR = '/tmp/airtrust-test-output/examiner-universal-pdf-previews-20260710';

vi.mock('@/react-app/utils/pdfPreview', () => ({
  previewPdfBeforeDownload: async (opts: {
    fileName: string;
    fetcher: () => Promise<Response>;
  }) => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const res = await opts.fetcher();
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir('/tmp/airtrust-test-output/examiner-universal-pdf-previews-20260710', { recursive: true });
    await writeFile(resolve('/tmp/airtrust-test-output/examiner-universal-pdf-previews-20260710', opts.fileName), buf);
  },
}));

import { gerarPDFFichaCliente } from '@/react-app/services/pdf-ficha-client';
import { buildFichaModeloPdfData } from '@/react-app/pages/simuladores/fichas/fichaModeloPdf';

const ITENS: Record<string, Array<{ codigo: string; nome: string; descricao: string }>> = {
  'EXA-V01': [
    ['EXA-V01-01', 'Planejamento da sessão', 'Planejar a sessão conforme objetivo, programa e padrão aplicável.'],
    ['EXA-V01-02', 'Sequência do cenário', 'Definir sequência coerente e executável para a avaliação.'],
    ['EXA-V01-03', 'Condições de início', 'Confirmar condições operacionais, documentais e técnicas para iniciar.'],
    ['EXA-V01-04', 'Briefing do exame', 'Conduzir briefing claro, completo e proporcional ao cenário.'],
    ['EXA-V01-05', 'Funções e responsabilidades', 'Definir papéis, responsabilidades e limites de atuação.'],
    ['EXA-V01-06', 'Transferência de controles', 'Estabelecer procedimentos para transferência e assunção dos controles.'],
    ['EXA-V01-07', 'Configuração do dispositivo', 'Preparar o dispositivo de treinamento para o cenário planejado.'],
    ['EXA-V01-08', 'Condução conforme SOP', 'Conduzir o cenário de acordo com o SOP aplicável.'],
    ['EXA-V01-09', 'Observação sem interferência', 'Observar o desempenho sem fornecer orientação indevida.'],
    ['EXA-V01-10', 'Vigilância da operação', 'Manter monitoramento contínuo da segurança e da execução.'],
    ['EXA-V01-11', 'Identificação de desvios', 'Reconhecer desvios em relação aos padrões estabelecidos.'],
    ['EXA-V01-12', 'Procedimentos normais', 'Avaliar a execução dos procedimentos normais aplicáveis.'],
    ['EXA-V01-13', 'Listas aplicáveis', 'Avaliar a utilização correta das listas e da ECL aplicável.'],
    ['EXA-V01-14', 'Coordenação da tripulação', 'Avaliar coordenação, comunicação e distribuição de tarefas.'],
    ['EXA-V01-15', 'Gerenciamento do tempo', 'Controlar duração, sequência e progressão da sessão.'],
    ['EXA-V01-16', 'Critérios de avaliação', 'Aplicar critérios de forma uniforme, objetiva e rastreável.'],
    ['EXA-V01-17', 'Debriefing da sessão', 'Conduzir debriefing baseado nas evidências observadas.'],
    ['EXA-V01-18', 'Registro interno', 'Preencher corretamente a ficha interna de treinamento.'],
  ].map(([codigo, nome, descricao]) => ({ codigo, nome, descricao })),
  'EXA-V02': [
    ['EXA-V02-01', 'Planejamento da anormalidade', 'Planejar condição anormal adequada ao objetivo da sessão.'],
    ['EXA-V02-02', 'Seleção da condição', 'Selecionar condição compatível com nível, equipamento e tempo disponível.'],
    ['EXA-V02-03', 'Avaliação dos riscos', 'Identificar riscos e estabelecer limites para o cenário.'],
    ['EXA-V02-04', 'Configuração do dispositivo', 'Configurar corretamente o dispositivo para a condição planejada.'],
    ['EXA-V02-05', 'Briefing específico', 'Apresentar objetivos, limites e medidas de segurança da sessão.'],
    ['EXA-V02-06', 'Inserção da condição', 'Inserir a condição no momento e contexto planejados.'],
    ['EXA-V02-07', 'Reconhecimento da condição', 'Avaliar se a condição foi identificada adequadamente.'],
    ['EXA-V02-08', 'Aplicação da ECL', 'Avaliar seleção, sequência e execução da ECL aplicável.'],
    ['EXA-V02-09', 'Sequência dos procedimentos', 'Avaliar a ordem e a disciplina na execução dos procedimentos.'],
    ['EXA-V02-10', 'Gerenciamento dos sistemas', 'Avaliar o gerenciamento dos sistemas afetados.'],
    ['EXA-V02-11', 'Distribuição de tarefas', 'Avaliar a divisão adequada de funções entre os tripulantes.'],
    ['EXA-V02-12', 'Tomada de decisão', 'Avaliar decisões, prioridades e alternativas adotadas.'],
    ['EXA-V02-13', 'Ausência de coaching', 'Manter postura de examinador sem instrução durante a avaliação.'],
    ['EXA-V02-14', 'Treinamento insuficiente', 'Identificar indícios de treinamento inadequado ou insuficiente.'],
    ['EXA-V02-15', 'Desvios de segurança', 'Reconhecer condutas ou condições que afetem a segurança.'],
    ['EXA-V02-16', 'Continuação ou interrupção', 'Decidir justificadamente entre continuar, repetir ou interromper.'],
    ['EXA-V02-17', 'Debriefing da sessão', 'Apresentar análise objetiva baseada nas evidências observadas.'],
    ['EXA-V02-18', 'Registro das evidências', 'Registrar desvios, decisões e resultados na ficha interna.'],
  ].map(([codigo, nome, descricao]) => ({ codigo, nome, descricao })),
  'EXA-V03': [
    ['EXA-V03-01', 'Planejamento da emergência', 'Planejar cenário de emergência compatível com o objetivo.'],
    ['EXA-V03-02', 'Seleção da emergência', 'Selecionar emergência adequada ao nível e ao tempo disponível.'],
    ['EXA-V03-03', 'Riscos e limites', 'Definir riscos, limites e condições de encerramento.'],
    ['EXA-V03-04', 'Preparação do IOS', 'Configurar o IOS para a execução segura do cenário.'],
    ['EXA-V03-05', 'Briefing de segurança', 'Definir responsabilidades, limites e medidas de intervenção.'],
    ['EXA-V03-06', 'Inserção da emergência', 'Inserir a emergência de forma segura e controlada.'],
    ['EXA-V03-07', 'Ações imediatas', 'Avaliar reconhecimento e ações iniciais do examinando.'],
    ['EXA-V03-08', 'Aplicação da ECL', 'Avaliar seleção e execução da ECL aplicável.'],
    ['EXA-V03-09', 'Prioridades operacionais', 'Avaliar definição e manutenção das prioridades operacionais.'],
    ['EXA-V03-10', 'Controle da aeronave', 'Avaliar manutenção do controle e estabilidade da operação.'],
    ['EXA-V03-11', 'Coordenação PF/PM', 'Avaliar coordenação, distribuição de tarefas e cross-check.'],
    ['EXA-V03-12', 'Comunicação na emergência', 'Avaliar clareza, oportunidade e disciplina das comunicações.'],
    ['EXA-V03-13', 'Vigilância do examinador', 'Manter consciência contínua da evolução e dos riscos.'],
    ['EXA-V03-14', 'Necessidade de intervenção', 'Reconhecer corretamente quando a intervenção se torna necessária.'],
    ['EXA-V03-15', 'Momento da intervenção', 'Avaliar consequências de intervenção tardia ou inadequada.'],
    ['EXA-V03-16', 'Assunção dos controles', 'Intervir e assumir os controles conforme o assento aplicável.'],
    ['EXA-V03-17', 'Recuperação do cenário', 'Restabelecer condições seguras e encerrar adequadamente.'],
    ['EXA-V03-18', 'Debriefing e registro', 'Debrifar e registrar as evidências relevantes da sessão.'],
  ].map(([codigo, nome, descricao]) => ({ codigo, nome, descricao })),
  'EXA-V04': [
    ['EXA-V04-01', 'Planejamento do exame', 'Planejar integralmente a avaliação prática.'],
    ['EXA-V04-02', 'Seleção dos eventos', 'Selecionar eventos coerentes com os objetivos e padrões.'],
    ['EXA-V04-03', 'Preparação do cenário', 'Preparar dispositivo, condições e sequência do exame.'],
    ['EXA-V04-04', 'Briefing do exame', 'Conduzir briefing completo e objetivo.'],
    ['EXA-V04-05', 'Responsabilidades e controles', 'Definir funções e procedimentos de transferência dos controles.'],
    ['EXA-V04-06', 'Condução organizada', 'Conduzir o exame de forma ordenada e eficiente.'],
    ['EXA-V04-07', 'Observação sem coaching', 'Avaliar sem orientar indevidamente o examinando.'],
    ['EXA-V04-08', 'Sequência e tempo', 'Gerenciar progressão, duração e cobertura da avaliação.'],
    ['EXA-V04-09', 'Desempenho técnico', 'Avaliar objetivamente o desempenho técnico observado.'],
    ['EXA-V04-10', 'Aplicação dos padrões', 'Aplicar os mesmos critérios de forma consistente.'],
    ['EXA-V04-11', 'Treinamento insuficiente', 'Identificar deficiências relacionadas a treinamento inadequado.'],
    ['EXA-V04-12', 'Condições que afetam segurança', 'Reconhecer comportamentos ou condições que afetem a segurança.'],
    ['EXA-V04-13', 'Decisão sobre o exame', 'Decidir entre continuar, repetir, interromper ou encerrar.'],
    ['EXA-V04-14', 'Medidas de segurança', 'Aplicar medidas de segurança conforme o assento ocupado.'],
    ['EXA-V04-15', 'Resultado interno', 'Determinar o resultado interno conforme o padrão da empresa.'],
    ['EXA-V04-16', 'Fundamentação do resultado', 'Justificar o resultado com evidências observáveis.'],
    ['EXA-V04-17', 'Debriefing final', 'Conduzir debriefing estruturado e objetivo.'],
    ['EXA-V04-18', 'Encerramento da ficha', 'Concluir os registros e assinaturas internas aplicáveis.'],
  ].map(([codigo, nome, descricao]) => ({ codigo, nome, descricao })),
};

const MODELOS = [
  { codigo: 'EXA-V01', nome: 'Treinamento Prático de Examinador — SOP Normal e Condução Inicial' },
  { codigo: 'EXA-V02', nome: 'Treinamento Prático de Examinador — SOP Anormal e Avaliação' },
  { codigo: 'EXA-V03', nome: 'Treinamento Prático de Examinador — Emergência, Intervenção e Segurança' },
  { codigo: 'EXA-V04', nome: 'Treinamento Prático de Examinador — Atuação Integrada' },
];

describe('examiner universal training (EXA-V01..V04) pdf previews', () => {
  MODELOS.forEach(({ codigo, nome }, idx) => {
    it(`${codigo}: 18 técnicos + 15 NOTECHS = 33 itens, sem FAP/QRH, mesmo layout para qualquer aeronave`, async () => {
      const fileName = `${codigo}_universal_preview_20260710.pdf`;
      const pdfData = buildFichaModeloPdfData(
        {
          id: 9000 + idx,
          codigo,
          nome,
          tipo_sessao_nome: 'EXAMINADOR',
          modelo_aeronave: '', // universal: nenhum equipamento fixo no modelo
        },
        ITENS[codigo].map((item, i) => ({
          ordem: i + 1,
          manobra_codigo: item.codigo,
          manobra_nome: item.nome,
          manobra_descricao: item.descricao,
          observacoes: null,
          tripulante: 'AB',
        })),
        '/api/empresas/minha/logo-base64',
      );

      // 18 técnicos + 15 NOTECHS injetados por buildFichaModeloPdfData via NOTECHS_ITENS
      expect(pdfData.manobras.length).toBe(33);
      expect(pdfData.manobras.slice(0, 18).map((m) => m.codigo)).toEqual(
        ITENS[codigo].map((i) => i.codigo),
      );
      expect(pdfData.manobras.slice(18)).toHaveLength(15);

      // Nenhuma menção a QRH ou FAP em qualquer item ou título da ficha.
      const fullText = JSON.stringify(pdfData).toUpperCase();
      expect(fullText).not.toContain('QRH');
      expect(fullText).not.toContain('FAP');

      pdfData.fileName = fileName;
      await gerarPDFFichaCliente(pdfData);

      expect(existsSync(path.join(OUT_DIR, fileName))).toBe(true);
    });
  });

  it('produces the exact same 33-item list regardless of which aircraft is passed as equipment metadata', async () => {
    const buildFor = (modelo_aeronave: string) =>
      buildFichaModeloPdfData(
        { id: 9999, codigo: 'EXA-V01', nome: 'Treinamento Prático de Examinador — SOP Normal e Condução Inicial', modelo_aeronave },
        ITENS['EXA-V01'].map((item, i) => ({
          ordem: i + 1,
          manobra_codigo: item.codigo,
          manobra_nome: item.nome,
          manobra_descricao: item.descricao,
          observacoes: null,
          tripulante: 'AB',
        })),
      );

    const aw139 = buildFor('AW139');
    const sk76 = buildFor('SK76');

    expect(aw139.manobras.map((m) => m.codigo)).toEqual(sk76.manobras.map((m) => m.codigo));
    expect(aw139.manobras.map((m) => m.nome)).toEqual(sk76.manobras.map((m) => m.nome));
    expect(aw139.manobras.length).toBe(33);
    expect(sk76.manobras.length).toBe(33);
  });
});
