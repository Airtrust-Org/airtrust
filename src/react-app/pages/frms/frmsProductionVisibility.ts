export interface FrmsPersonLike {
  nome?: string | null;
  funcionario_nome?: string | null;
  nome_guerra?: string | null;
  cargo?: string | null;
  funcao?: string | null;
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function isSyntheticFrmsFixture(person: FrmsPersonLike): boolean {
  const haystack = [
    person.nome,
    person.funcionario_nome,
    person.nome_guerra,
    person.cargo,
    person.funcao,
  ]
    .map(normalize)
    .filter(Boolean)
    .join(' | ');

  if (!haystack) return false;

  return (
    /(^|[^A-Z0-9])QA([^A-Z0-9]|$)/.test(haystack) ||
    haystack.includes('FICTICIO') ||
    haystack.includes('FIXTURE') ||
    haystack.includes('SYNTHETIC') ||
    haystack.includes('DADO DE TESTE') ||
    haystack.includes('TEST DATA')
  );
}

export function shouldExposeFrmsPerson(
  person: FrmsPersonLike,
  production = import.meta.env.PROD,
): boolean {
  return !production || !isSyntheticFrmsFixture(person);
}
