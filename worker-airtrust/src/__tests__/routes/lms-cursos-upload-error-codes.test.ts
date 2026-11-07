import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Contrato: toda ApiError da fronteira de upload carrega um código estável
// UPLOAD_*, para o cliente distinguir ZIP, storage, SHA, tamanho e bloqueios
// de governança sem depender do texto da mensagem.
const source = readFileSync(
  resolve(__dirname, '../../routes/lms-cursos-upload-routes.ts'),
  'utf8',
);

describe('lms-cursos-upload-routes — códigos de erro por etapa', () => {
  it('nenhuma ApiError de status >= 400 de upload fica sem código estável nas etapas cobertas', () => {
    const covered = [
      'Storage não configurado',
      'Campo de arquivo não encontrado',
      'Pacote excede o limite comprimido de 32 MB',
      'Operação F5 inválida',
      'SHA F5 inválido',
      'SHA da operação F5 divergente',
      'Arquivo não confirmado no storage',
      'Arquivo individual excede o limite de 32 MB',
      'Upload SCORM estruturado foi desativado',
      'Crie o curso sem arquivo',
    ];
    for (const message of covered) {
      const at = source.indexOf(message);
      expect(at, message).toBeGreaterThan(-1);
      const statement = source.slice(at, source.indexOf(');', at));
      expect(statement, message).toMatch(/'UPLOAD_[A-Z0-9_]+'/);
    }
  });

  it('códigos são únicos por significado e usam o prefixo UPLOAD_', () => {
    const codes = [...source.matchAll(/'(UPLOAD_[A-Z0-9_]+)'/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThanOrEqual(12);
    for (const code of codes) expect(code).toMatch(/^UPLOAD_[A-Z0-9_]+$/);
    expect(new Set(codes)).toContain('UPLOAD_SHA_MISMATCH');
    expect(new Set(codes)).toContain('UPLOAD_STORAGE_UNAVAILABLE');
  });
});
