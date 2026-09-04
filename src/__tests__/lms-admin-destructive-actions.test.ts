import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const courseSource = readFileSync(resolve(process.cwd(), 'src/react-app/pages/lms/LmsAdminCursos.tsx'), 'utf8');
const enrollmentSource = readFileSync(resolve(process.cwd(), 'src/react-app/pages/lms/LmsMatriculas.tsx'), 'utf8');
const lmsHooksSource = readFileSync(resolve(process.cwd(), 'src/react-app/hooks/useLms.ts'), 'utf8');

describe('LMS administrative destructive action contracts', () => {
  it('keeps course deletion behind RowActionsMenu and preserves confirmation plus DELETE endpoint', () => {
    expect(courseSource).toContain("label: 'Excluir curso'");
    expect(courseSource).toContain('onSelect: () => handleDelete(curso)');
    expect(courseSource).toContain('if (!confirm(`Excluir o curso');
    expect(courseSource).not.toContain('title="Excluir curso"');
    expect(lmsHooksSource).toContain('lmsRequest<void>(`/cursos/${id}`, { method: \'DELETE\' })');
  });

  it('keeps enrollment cancellation behind RowActionsMenu and preserves the existing modal mutation', () => {
    expect(enrollmentSource).toContain("label: 'Cancelar matrícula'");
    expect(enrollmentSource).toContain('onSelect: () => setCancelTarget(m)');
    expect(enrollmentSource).toContain('onClick={handleCancelarConfirmado}');
    expect(enrollmentSource).not.toContain('title="Remover matrícula"');
    expect(lmsHooksSource).toContain('lmsRequest<{ id: number; cancelado: boolean }>(`/matriculas/${matriculaId}`,');
    expect(lmsHooksSource).toContain("method: 'DELETE'");
  });
});
