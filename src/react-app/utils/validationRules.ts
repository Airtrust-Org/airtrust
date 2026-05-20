import { ValidationResult } from '../components/shared/ImportValidator';

export function validarFuncionario(func: any, linha: number): ValidationResult[] {
  const erros: ValidationResult[] = [];

  if (!func.nome || func.nome.trim() === '') {
    erros.push({ 
      linha, 
      tipo: 'erro', 
      campo: 'nome', 
      mensagem: 'Nome é obrigatório', 
      valorOriginal: func.nome 
    });
  }

  if (!func.matricula || func.matricula.trim() === '') {
    erros.push({ 
      linha, 
      tipo: 'erro', 
      campo: 'matricula', 
      mensagem: 'Matrícula é obrigatória', 
      valorOriginal: func.matricula 
    });
  }

  if (func.cpf && !validarCPF(func.cpf)) {
    erros.push({ 
      linha, 
      tipo: 'erro', 
      campo: 'cpf', 
      mensagem: 'CPF inválido', 
      valorOriginal: func.cpf 
    });
  }

  if (func.email && !validarEmail(func.email)) {
    erros.push({ 
      linha, 
      tipo: 'aviso', 
      campo: 'email', 
      mensagem: 'Formato de email pode estar incorreto', 
      valorOriginal: func.email 
    });
  }

  if (func.tipo_funcionario === 'TRIPULANTE') {
    if (!func.codigo_anac) {
      erros.push({ 
        linha, 
        tipo: 'erro', 
        campo: 'codigo_anac', 
        mensagem: 'Código ANAC obrigatório para tripulantes', 
        valorOriginal: func.codigo_anac 
      });
    }

    if (!func.tipo_licenca) {
      erros.push({ 
        linha, 
        tipo: 'erro', 
        campo: 'tipo_licenca', 
        mensagem: 'Tipo de licença obrigatório para tripulantes', 
        valorOriginal: func.tipo_licenca 
      });
    }

    const tiposValidos = ['PCH', 'PPH', 'PCA', 'PLA', 'PL', 'INVA', 'COMISSARIO', 'MEC_VOO'];
    if (func.tipo_licenca && !tiposValidos.includes(func.tipo_licenca.toUpperCase())) {
      erros.push({ 
        linha, 
        tipo: 'erro', 
        campo: 'tipo_licenca', 
        mensagem: `Tipo de licença inválido. Valores aceitos: ${tiposValidos.join(', ')}`, 
        valorOriginal: func.tipo_licenca 
      });
    }

    if (!func.numero_licenca_aeronautica) {
      erros.push({ 
        linha, 
        tipo: 'erro', 
        campo: 'numero_licenca_aeronautica', 
        mensagem: 'Número da licença obrigatório para tripulantes', 
        valorOriginal: func.numero_licenca_aeronautica 
      });
    }

    if (!func.categoria_cma) {
      erros.push({ 
        linha, 
        tipo: 'erro', 
        campo: 'categoria_cma', 
        mensagem: 'Categoria CMA obrigatória para tripulantes', 
        valorOriginal: func.categoria_cma 
      });
    }

    const categoriasValidas = ['1', '2', '3'];
    if (func.categoria_cma && !categoriasValidas.includes(String(func.categoria_cma))) {
      erros.push({ 
        linha, 
        tipo: 'erro', 
        campo: 'categoria_cma', 
        mensagem: 'Categoria CMA inválida. Valores aceitos: 1, 2 ou 3', 
        valorOriginal: func.categoria_cma 
      });
    }
  }

  if (func.eh_instrutor && !['SIM', 'NAO', 'S', 'N', '1', '0'].includes(String(func.eh_instrutor).toUpperCase())) {
    erros.push({ 
      linha, 
      tipo: 'aviso', 
      campo: 'eh_instrutor', 
      mensagem: 'Valor deve ser SIM ou NAO', 
      valorOriginal: func.eh_instrutor,
      valorSugerido: 'NAO'
    });
  }

  if (func.eh_examinador && !['SIM', 'NAO', 'S', 'N', '1', '0'].includes(String(func.eh_examinador).toUpperCase())) {
    erros.push({ 
      linha, 
      tipo: 'aviso', 
      campo: 'eh_examinador', 
      mensagem: 'Valor deve ser SIM ou NAO', 
      valorOriginal: func.eh_examinador,
      valorSugerido: 'NAO'
    });
  }

  return erros;
}

export function validarCertificacao(cert: any, linha: number): ValidationResult[] {
  const erros: ValidationResult[] = [];

  if (!cert.funcionario_matricula) {
    erros.push({ 
      linha, 
      tipo: 'erro', 
      campo: 'funcionario_matricula', 
      mensagem: 'Matrícula do funcionário é obrigatória', 
      valorOriginal: cert.funcionario_matricula 
    });
  }

  if (!cert.tipo && !cert.categoria) {
    erros.push({ 
      linha, 
      tipo: 'erro', 
      campo: 'tipo/categoria', 
      mensagem: 'Tipo ou categoria da certificação é obrigatório', 
      valorOriginal: cert.tipo || cert.categoria 
    });
  }

  if (!cert.numero) {
    erros.push({ 
      linha, 
      tipo: 'erro', 
      campo: 'numero', 
      mensagem: 'Número da certificação é obrigatório', 
      valorOriginal: cert.numero 
    });
  }

  if (cert.data_emissao && !validarData(cert.data_emissao)) {
    erros.push({ 
      linha, 
      tipo: 'erro', 
      campo: 'data_emissao', 
      mensagem: 'Data de emissão inválida. Use formato DD/MM/AAAA ou AAAA-MM-DD', 
      valorOriginal: cert.data_emissao 
    });
  }

  if (cert.data_vencimento && !validarData(cert.data_vencimento)) {
    erros.push({ 
      linha, 
      tipo: 'erro', 
      campo: 'data_vencimento', 
      mensagem: 'Data de vencimento inválida. Use formato DD/MM/AAAA ou AAAA-MM-DD', 
      valorOriginal: cert.data_vencimento 
    });
  }

  if (cert.data_emissao && cert.data_vencimento && validarData(cert.data_emissao) && validarData(cert.data_vencimento)) {
    const emissao = new Date(cert.data_emissao);
    const vencimento = new Date(cert.data_vencimento);
    
    if (vencimento <= emissao) {
      erros.push({ 
        linha, 
        tipo: 'erro', 
        campo: 'data_vencimento', 
        mensagem: 'Data de vencimento deve ser posterior à data de emissão', 
        valorOriginal: cert.data_vencimento 
      });
    }
  }

  return erros;
}

export function validarTreinamento(trein: any, linha: number): ValidationResult[] {
  const erros: ValidationResult[] = [];

  if (!trein.codigo) {
    erros.push({ 
      linha, 
      tipo: 'erro', 
      campo: 'codigo', 
      mensagem: 'Código é obrigatório', 
      valorOriginal: trein.codigo 
    });
  }

  if (!trein.nome) {
    erros.push({ 
      linha, 
      tipo: 'erro', 
      campo: 'nome', 
      mensagem: 'Nome é obrigatório', 
      valorOriginal: trein.nome 
    });
  }

  const periodosValidos = ['UNICO', 'ANUAL', 'BIENAL', 'TRIENAL', 'QUINQUENAL', 'RECORRENTE'];
  if (trein.periodicidade && !periodosValidos.includes(trein.periodicidade.toUpperCase())) {
    erros.push({ 
      linha, 
      tipo: 'erro', 
      campo: 'periodicidade', 
      mensagem: `Periodicidade inválida. Valores aceitos: ${periodosValidos.join(', ')}`, 
      valorOriginal: trein.periodicidade 
    });
  }

  const tiposValidos = ['TREINAMENTO', 'CHECK', 'EXAME_MEDICO', 'LICENCA', 'HABILITACAO'];
  if (trein.tipo && !tiposValidos.includes(trein.tipo.toUpperCase())) {
    erros.push({ 
      linha, 
      tipo: 'erro', 
      campo: 'tipo', 
      mensagem: `Tipo inválido. Valores aceitos: ${tiposValidos.join(', ')}`, 
      valorOriginal: trein.tipo 
    });
  }

  if (trein.carga_horaria && (isNaN(trein.carga_horaria) || trein.carga_horaria < 0)) {
    erros.push({ 
      linha, 
      tipo: 'aviso', 
      campo: 'carga_horaria', 
      mensagem: 'Carga horária deve ser um número positivo', 
      valorOriginal: trein.carga_horaria,
      valorSugerido: 0
    });
  }

  if (trein.intervalo_meses && (isNaN(trein.intervalo_meses) || trein.intervalo_meses < 0)) {
    erros.push({ 
      linha, 
      tipo: 'aviso', 
      campo: 'intervalo_meses', 
      mensagem: 'Intervalo em meses deve ser um número positivo', 
      valorOriginal: trein.intervalo_meses,
      valorSugerido: 0
    });
  }

  return erros;
}


/**
 * Valida CPF brasileiro
 */
function validarCPF(cpf: string): boolean {
  cpf = cpf.replace(/\D/g, '');
  
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // Todos os dígitos iguais
  
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  let digito1 = resto >= 10 ? 0 : resto;
  
  if (digito1 !== parseInt(cpf.charAt(9))) return false;
  
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpf.charAt(i)) * (11 - i);
  }
  resto = 11 - (soma % 11);
  let digito2 = resto >= 10 ? 0 : resto;
  
  return digito2 === parseInt(cpf.charAt(10));
}

/**
 * Valida formato de email
 */
function validarEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Valida se string é uma data válida
 */
function validarData(data: string): boolean {
  if (!data) return false;
  
  const parsed = new Date(data);
  
  return !isNaN(parsed.getTime());
}

/**
 * Normaliza valor booleano (SIM/NAO)
 */
export function normalizarBooleano(valor: any): 'SIM' | 'NAO' {
  const valorStr = String(valor).toUpperCase().trim();
  return ['SIM', 'S', '1', 'TRUE', 'YES'].includes(valorStr) ? 'SIM' : 'NAO';
}

/**
 * Normaliza data para formato ISO
 */
export function normalizarData(data: string): string | null {
  if (!data) return null;
  
  try {
    const parsed = new Date(data);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString().split('T')[0];
  } catch {
    return null;
  }
}
