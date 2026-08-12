import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/routes/lms-matriculas-mel-manutencao.ts'),
  'utf8',
);

describe('LMS MEL Manutenção — contrato de matrícula automática', () => {
  it('mantém autorização, tenant e escopo setorial antes do processamento', () => {
    expect(source).toContain("app.post('/processar', requireRole('admin', 'manager')");
    expect(source).toContain('const empresaId = getEmpresaIdSafe(c);');
    expect(source).toContain('const access = await getEmployeeSectorAccess(c, empresaId);');
    expect(source).toContain("access.mode === 'restricted'");
    expect(source).toContain('access.setorIds.includes(setorManutencao.id)');
    expect(source).toContain(
      "throw new ApiError('Acesso negado: setor Manutenção fora do seu escopo', 403)",
    );
  });

  it('não duplica matrícula ativa e preserva o vínculo canônico curso-funcionário-empresa', () => {
    expect(source).toContain('async function findExistingMatricula(');
    expect(source).toContain('WHERE curso_id = ?');
    expect(source).toContain('AND funcionario_id = ?');
    expect(source).toContain('AND empresa_id = ?');
    expect(source).toContain('if (existente && !existente.deleted_at)');
    expect(source).toContain("status: 'JA_MATRICULADO'");
    expect(source).toContain('ensureMatriculaCycle(db, { matriculaId, origin:');
  });

  it('vincula somente curso ativo da qualificação MEL e envia link do curso sem bloquear a matrícula', () => {
    expect(source).toContain('AND qualificacao_tipo_id = ?');
    expect(source).toContain('WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL');
    expect(source).toContain('async function sendMelMatriculaEmail(');
    expect(source).toContain('`${frontendUrl}/lms/cursos/${params.cursoId}`');
    expect(source).toContain('await sendEmail(env, {');
    expect(source).toContain("console.warn('[mel-manutencao] Falha ao enviar email:', err);");
  });
});
