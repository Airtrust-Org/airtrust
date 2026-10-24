import { describe, expect, it, vi } from 'vitest';
import { listScormPackageVersions } from '../../lib/lms/lms-scorm-package-version-service';

describe('SCORM candidate version tenant readback contract', () => {
  it('returns canonical empresaId/cursoId from the tenant-filtered D1 row', async () => {
    const row = {
      id: '223e4567-e89b-12d3-a456-426614174000',
      empresa_id: 9201,
      curso_id: 7301,
      package_sha256: 'a'.repeat(64),
      r2_prefix: 'lms/scorm/9201/7301/_candidates/223e4567-e89b-12d3-a456-426614174000/',
      launch_file: 'index.html',
      status: 'VALIDATED',
      validation_result_json: null,
      active_prefix: null,
    };
    const all = vi.fn().mockResolvedValue({ results: [row] });
    const bind = vi.fn().mockReturnValue({ all });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    const versions = await listScormPackageVersions(db, 9201, 7301);

    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE p.empresa_id = ? AND p.curso_id = ?'));
    expect(bind).toHaveBeenCalledWith(9201, 7301);
    expect(versions[0]).toMatchObject({ empresaId: 9201, cursoId: 7301,
      packageId: row.id, packageSha256: row.package_sha256, status: 'VALIDATED', active: false });
  });
});
