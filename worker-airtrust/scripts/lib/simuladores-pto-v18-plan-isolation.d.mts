export type PtoV18IsolationModel = {
  codigo: string;
  aeronave: 'AW139' | 'SK76' | null;
  tipo_estruturado: string;
};
export type PtoV18IsolationItem = {
  modelo: string;
  aeronave: 'AW139' | 'SK76' | null;
  codigo: string;
  ordem: number;
};
export function assertPtoV18ModelIsolation(plan: {
  models: PtoV18IsolationModel[];
  items: PtoV18IsolationItem[];
  functional_catalog: Array<{ codigo: string }>;
  notechs: Array<{ codigo: string }>;
}): true;
