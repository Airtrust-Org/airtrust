
const validarDadosImportacao = async (dados: any[], db: any): Promise<any[]> => {
  const erros: any[] = [];
  const matriculasExistentes = new Map();
  
  const funcionariosExistentes = await db.prepare(`
    SELECT id, matricula FROM funcionarios WHERE deleted_at IS NULL
  `).all();
  
  funcionariosExistentes.results.forEach((f: any) => {
    matriculasExistentes.set(String(f.matricula), f.id);
  });
  
  dados.forEach((linha: any, index: number) => {
    if (!matriculasExistentes.has(String(linha.funcionario_matricula))) {
      erros.push({
        linha: index + 1,
        erro: `Matrícula ${linha.funcionario_matricula} não encontrada`,
        sugestao: `Cadastre o funcionário primeiro ou use matrícula válida`
      });
    }
    
    if (!linha.data_conclusao || isNaN(new Date(linha.data_conclusao).getTime())) {
      erros.push({
        linha: index + 1,
        erro: 'Data de conclusão inválida',
        valor: linha.data_conclusao
      });
    }
  });
  
  return erros;
};

const mapearColunas = (headers: string[]): any => {
  const mapeamento: any = {};
  
  const aliases: Record<string, string[]> = {
    nome: ['nome', 'name'],
    cpf: ['cpf', 'documento', 'doc'],
    matricula: ['mat.', 'mat', 'matricula', 'matrícula', 'registration'],
    email: ['email', 'e-mail', 'mail'],
    telefone: ['telefone', 'phone', 'fone', 'celular'],
    data_nascimento: ['data de nasc.', 'data_de_nasc', 'nascimento', 'birth', 'dt nasc'],
    data_admissao: ['admissao', 'admissão', 'data_admissao', 'dt admissao', 'dt admissão'],
    licenca: ['licença', 'licenca', 'license', 'licença aeronáutica'],
    anv: ['anv', 'aeronave', 'aircraft'],
    canac: ['canac', 'codigo_anac', 'código anac', 'codigo anac', 'anac', 'cod anac'],
    sispat: ['sispat', 'codigo_sispat', 'código sispat', 'cod sispat'],
    prestador: ['prestserv', 'prestador', 'funcao', 'função', 'codigo_prestserv', 'código prestserv'],
    base: ['base', 'location', 'local'],
    contrato: ['contrato', 'contract', 'tipo contrato']
  };
  
  Object.keys(aliases).forEach(campo => {
    for (const header of headers) {
      const headerLower = header.toLowerCase().trim();
      
      if (aliases[campo].some((alias: string) => headerLower === alias)) {
        mapeamento[campo] = header;
        break;
      }
    }
  });
  
  return mapeamento;
};

const processarCSVFuncionarios = (csvData: any[]): { funcionarios: any[], erros: any[] } => {
  if (!csvData || csvData.length === 0) {
    throw new Error('Arquivo CSV vazio');
  }
  
  const headers = Object.keys(csvData[0]);
  
  const mapeamento = mapearColunas(headers);
  
  const funcionarios: any[] = [];
  const erros: any[] = [];
  
  csvData.forEach((row: any, index: number) => {
    try {
      const matricula = row[mapeamento.matricula];
      
      if (!matricula || matricula.trim() === '') {
        throw new Error('Matrícula é obrigatória');
      }
      
      const funcionario = {
        nome: row[mapeamento.nome] || `Funcionário ${matricula}`,
        cpf: row[mapeamento.cpf] || null,
        matricula: matricula.trim(),
        email: row[mapeamento.email] || null,
        telefone: row[mapeamento.telefone] || null,
        data_nascimento: row[mapeamento.data_nascimento] || null,
        data_admissao: row[mapeamento.data_admissao] || null,
        licenca: row[mapeamento.licenca] || null,
        licenca_aeronautica: row[mapeamento.licenca] || null,
        anv: row[mapeamento.anv] || null,
        canac: row[mapeamento.canac] || null,
        codigo_anac: row[mapeamento.canac] || null,
        codigo_canac: row[mapeamento.canac] || null,
        sispat: row[mapeamento.sispat] || null,
        codigo_sispat: row[mapeamento.sispat] || null,
        prestador: row[mapeamento.prestador] || null,
        codigo_prestserv: row[mapeamento.prestador] || null,
        base: row[mapeamento.base] || null,
        contrato: row[mapeamento.contrato] || 'CLT',
        funcao: row[mapeamento.prestador] || 'OPERACIONAL',
        status: 'ATIVO',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      funcionarios.push(funcionario);
      
    } catch (error) {
      erros.push({
        linha: index + 1,
        erro: (error as Error).message,
        dados: row
      });
    }
  });
  
  return { funcionarios, erros };
};

export async function gerarProximoCertificacaoId(db: any, matricula: string, codigoTreinamento: string, dataConclusao?: string): Promise<string> {
  
  const matriculaNormalizada = normalizarMatricula(matricula);
  
  const ano = dataConclusao ? new Date(dataConclusao).getFullYear() : new Date().getFullYear();
  
  
  const ultimoSequencial = await db.prepare(`
    SELECT MAX(
      CAST(
        SUBSTR(certificacao_id, -2) AS INTEGER
      )
    ) as max_seq
    FROM certificacoes_v3 
    WHERE certificacao_id LIKE ? 
      AND certificacao_id NOT LIKE '%CANCELADO%'
  `).bind(`${matriculaNormalizada}-${codigoTreinamento}-${ano}-%`).first();
  
  const proximoSequencial = ((ultimoSequencial?.max_seq || 0) + 1).toString().padStart(2, '0');
  
  const certificacaoId = `${matriculaNormalizada}-${codigoTreinamento}-${ano}-${proximoSequencial}`;
  
  return certificacaoId;
}

export function normalizarMatricula(matricula: string): string {
  if (!matricula || typeof matricula !== 'string') {
    throw new Error('Matrícula inválida ou vazia');
  }
  
  const numeroLimpo = matricula.replace(/\D/g, '');
  
  if (!numeroLimpo || numeroLimpo.length === 0) {
    throw new Error('Matrícula deve conter números');
  }
  
  if (numeroLimpo.length > 5) {
    throw new Error('Matrícula não pode ter mais de 5 dígitos');
  }
  
  return numeroLimpo.padStart(5, '0');
}

export function calcularDataVencimento(dataConlusao: string, treinamentoCodigo: string): string {
  const data = new Date(dataConlusao);
  
  const regrasVencimento: Record<string, number> = {
    'CMA': 12,    // CMA vence em 12 meses
    'ICAO': 24,   // ICAO vence em 24 meses
    'OPS': 6,     // Operacional vence em 6 meses
    'SGV': 12,    // Segurança vence em 12 meses
    'CRM': 12,    // CRM vence em 12 meses
    'DEFAULT': 12 // Padrão 12 meses
  };
  
  const prefixo = treinamentoCodigo.split('-')[0] || 'DEFAULT';
  const mesesVencimento = regrasVencimento[prefixo.toUpperCase()] || regrasVencimento['DEFAULT'];
  
  data.setMonth(data.getMonth() + mesesVencimento);
  
  return data.toISOString().split('T')[0];
}

export function calcularDiasParaVencimento(dataVencimento: string): number {
  const hoje = new Date();
  const vencimento = new Date(dataVencimento);
  const diffTime = vencimento.getTime() - hoje.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

export function determinarComplianceStatus(diasParaVencimento: number): string {
  if (diasParaVencimento < 0) return 'VENCIDO';
  if (diasParaVencimento <= 30) return 'VENCENDO';
  return 'VALIDO';
}

export async function gerarProximoIdCertificacao(colaboradorId: number, treinamentoId: number, dataConclusao: string, db: any): Promise<string> {
  
  const dados = await db.prepare(`
    SELECT 
      f.matricula,
      t.codigo as treinamento_codigo
    FROM funcionarios f, catalogo_treinamentos_v2 t
    WHERE f.id = ? AND t.id = ?
  `).bind(colaboradorId, treinamentoId).first();
  
  if (!dados) {
    throw new Error('Colaborador ou treinamento não encontrado');
  }
  
  
  const matricula = String(dados.matricula).padStart(5, '0');
  const codigoTreinamento = dados.treinamento_codigo;
  
  const anoTreinamento = new Date(dataConclusao).getFullYear();
  
  
  const ultimoSequencial = await db.prepare(`
    SELECT MAX(
      CAST(
        SUBSTR(certificacao_id, -2) AS INTEGER
      )
    ) as max_seq
    FROM historico_certificacoes_v2 
    WHERE certificacao_id LIKE ? 
      AND deleted_at IS NULL
  `).bind(`${matricula}-${codigoTreinamento}-${anoTreinamento}-%`).first();
  
  const proximoSequencial = ((ultimoSequencial?.max_seq || 0) + 1).toString().padStart(2, '0');
  
  const certificacaoId = `${matricula}-${codigoTreinamento}-${anoTreinamento}-${proximoSequencial}`;
  
  return certificacaoId;
}

export { validarDadosImportacao, mapearColunas, processarCSVFuncionarios };
