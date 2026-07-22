export function relinkGuias(input: {
  dbPath: string;
  empresaId: number;
  versaoMatriz?: string;
  contract: { sessions: Array<{ codigo_canonico: string; aeronave: string; programa: string; ciclo: string | null; html_relpath: string }> };
}): {
  ok: true;
  created: number;
  deactivatedStale: number;
  totalActiveLinks: number;
  byAeronave: Record<string, number>;
};
export function runRelinkCli(argv?: string[]): ReturnType<typeof relinkGuias>;
