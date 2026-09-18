import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const index = read('public/pilot/index.html');
const preflight = read('public/pilot/pilot-preflight.js');
const sw = read('public/pilot/pilot-sw.js');

describe('Pilot complete offline preflight', () => {
  it('mantem o controlador de preflight sintaticamente valido e carregado no Pilot App', () => {
    const result = ts.transpileModule(preflight, {
      compilerOptions: {
        allowJs: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
      reportDiagnostics: true,
    });
    const errors = (result.diagnostics ?? [])
      .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));

    expect(errors).toEqual([]);
    expect(index).toContain('src="/pilot/pilot-preflight.js"');
    expect(sw).toContain("'/pilot/pilot-preflight.js'");
  });

  it('transforma Abrir voo em gate de pacote + lease + rascunho + shell', () => {
    expect(index).toContain('Meus voos');
    expect(index).toContain('id="authorized-flight-date"');
    expect(preflight).toContain("'Abrir voo'");
    expect(preflight).toContain('ensureOperationalDraftOpen(runId)');
    expect(preflight).toContain('assertPilotShellReady()');
    expect(preflight).toContain("navigator.serviceWorker.ready");
    expect(preflight).toContain("'/pilot/'");
    expect(preflight).toContain("'/pilot/pilot-sw.js'");
    expect(preflight).toContain('leaseLooksReady() && isVisible(editor)');
    expect(preflight).toContain('PRONTO PARA USO OFFLINE — pacote, lease e rascunho verificados neste tablet.');
  });

  it('falha fechado e nao anuncia readiness quando uma etapa do preflight nao conclui', () => {
    expect(preflight).toContain('NÃO PRONTO PARA USO OFFLINE');
    expect(preflight).toContain('Não foi possível preparar este voo para uso offline');
    expect(preflight).toContain("leaseStatus?.classList.contains('error')");
    expect(preflight).toContain('O voo não ficou pronto para preenchimento offline neste tablet.');
    expect(preflight).toContain('Falha ao preparar uso offline.');
  });

  it('mantem a indicação operacional ao perder conectividade depois do readiness', () => {
    expect(preflight).toContain("window.addEventListener('offline'");
    expect(preflight).toContain("startsWith('PRONTO PARA USO OFFLINE')");
    expect(preflight).toContain('OFFLINE — operação local ativa. Pacote, lease e rascunho permanecem disponíveis neste tablet.');
  });
});
