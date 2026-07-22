export function runCompensatoryRollback(input: {
  d1Local: string;
  importUuid: string;
  empresaId: number;
  compensationUuid?: string;
  argv?: string[];
}): {
  ok: boolean;
  idempotent?: boolean;
  status: string;
  rollback_uuid?: string;
  [key: string]: unknown;
};

export function runRollbackCli(argv?: string[]): void;
