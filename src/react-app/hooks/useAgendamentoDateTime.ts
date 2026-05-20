import { useState, useCallback, useEffect } from 'react';
import { DateTimeUtils } from '../utils/dateTime';

interface ValidationResult {
  valido: boolean;
  erro?: string;
  duracao?: number;
}

export const useAgendamentoDateTime = (duracaoPadraoHoras: number = 2) => {
  const [dataInicio, setDataInicio] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [horaFim, setHoraFim] = useState('');
  const [autoCalculado, setAutoCalculado] = useState(false);
  const [duracaoPadrao, setDuracaoPadrao] = useState(duracaoPadraoHoras);
  
  const calcularFim = useCallback((dataI: string, horaI: string, duracao: number) => {
    if (!dataI || !horaI) return { data: '', hora: '' };
    
    if (!DateTimeUtils.validarFormatoDataBrasileira(dataI) || !DateTimeUtils.validarFormatoHora(horaI)) {
      return { data: '', hora: '' };
    }
    
    const resultado = DateTimeUtils.adicionarHoras(dataI, horaI, duracao);
    
    if (resultado) {
      return { data: resultado.data, hora: resultado.hora };
    }
    
    return { data: '', hora: '' };
  }, []);
  
  useEffect(() => {
    if (dataInicio && horaInicio && DateTimeUtils.validarFormatoDataBrasileira(dataInicio) && DateTimeUtils.validarFormatoHora(horaInicio)) {
      const { data, hora } = calcularFim(dataInicio, horaInicio, duracaoPadrao);
      if (data && hora) {
        setDataFim(data);
        setHoraFim(hora);
        setAutoCalculado(true);
      }
    }
  }, [dataInicio, horaInicio, duracaoPadrao, calcularFim]);
  
  const handleDataInicioChange = useCallback((novaData: string) => {
    setDataInicio(novaData);
  }, []);
  
  const handleHoraInicioChange = useCallback((novaHora: string) => {
    setHoraInicio(novaHora);
  }, []);
  
  const handleDataFimChange = useCallback((novaData: string) => {
    setDataFim(novaData);
    setAutoCalculado(false);
  }, []);
  
  const handleHoraFimChange = useCallback((novaHora: string) => {
    setHoraFim(novaHora);
    setAutoCalculado(false);
  }, []);
  
  const alterarDuracaoPadrao = useCallback((novaDuracao: number) => {
    if (novaDuracao <= 0 || novaDuracao > 8) {
      return false; // Não permite durações inválidas
    }
    
    setDuracaoPadrao(novaDuracao);
    return true;
  }, []);
  
  const recalcularComDuracao = useCallback((novaDuracao: number) => {
    if (dataInicio && horaInicio && alterarDuracaoPadrao(novaDuracao)) {
      const { data, hora } = calcularFim(dataInicio, horaInicio, novaDuracao);
      if (data && hora) {
        setDataFim(data);
        setHoraFim(hora);
        setAutoCalculado(true);
      }
    }
  }, [dataInicio, horaInicio, alterarDuracaoPadrao, calcularFim]);
  
  const validar = useCallback((): ValidationResult => {
    if (!dataInicio || !horaInicio || !dataFim || !horaFim) {
      return { valido: false, erro: 'Todos os campos de data/hora são obrigatórios' };
    }
    
    if (!DateTimeUtils.validarFormatoDataBrasileira(dataInicio)) {
      return { valido: false, erro: 'Formato de data de início inválido (use dd/mm/aaaa)' };
    }
    
    if (!DateTimeUtils.validarFormatoDataBrasileira(dataFim)) {
      return { valido: false, erro: 'Formato de data de fim inválido (use dd/mm/aaaa)' };
    }
    
    if (!DateTimeUtils.validarFormatoHora(horaInicio)) {
      return { valido: false, erro: 'Formato de hora de início inválido (use HH:mm)' };
    }
    
    if (!DateTimeUtils.validarFormatoHora(horaFim)) {
      return { valido: false, erro: 'Formato de hora de fim inválido (use HH:mm)' };
    }
    
    const duracao = DateTimeUtils.calcularDuracao(dataInicio, horaInicio, dataFim, horaFim);
    
    if (duracao <= 0) {
      return { valido: false, erro: 'Data/hora de fim deve ser posterior ao início' };
    }
    
    if (duracao > 8) {
      return { valido: false, erro: 'Duração não pode exceder 8 horas' };
    }
    
    if (duracao < 0.5) {
      return { valido: false, erro: 'Duração mínima é de 30 minutos' };
    }
    
    return { valido: true, duracao };
  }, [dataInicio, horaInicio, dataFim, horaFim]);
  
  const reset = useCallback(() => {
    setDataInicio('');
    setHoraInicio('');
    setDataFim('');
    setHoraFim('');
    setAutoCalculado(false);
  }, []);
  
  const preencherComValoresPadrao = useCallback(() => {
    const agora = new Date();
    const dataAtual = DateTimeUtils.formatDataBrasileira(agora);
    const horaAtual = DateTimeUtils.formatHora(agora);
    
    setDataInicio(dataAtual);
    setHoraInicio(horaAtual);
    
    const resultado = DateTimeUtils.adicionarHoras(dataAtual, horaAtual, duracaoPadrao);
    if (resultado) {
      setDataFim(resultado.data);
      setHoraFim(resultado.hora);
      setAutoCalculado(true);
    }
  }, [duracaoPadrao]);
  
  const getDataInicioISO = useCallback(() => {
    if (!dataInicio || !horaInicio) return '';
    return DateTimeUtils.toISOString(dataInicio, horaInicio);
  }, [dataInicio, horaInicio]);
  
  const getDataFimISO = useCallback(() => {
    if (!dataFim || !horaFim) return '';
    return DateTimeUtils.toISOString(dataFim, horaFim);
  }, [dataFim, horaFim]);
  
  return {
    dataInicio,
    horaInicio,
    dataFim,
    horaFim,
    autoCalculado,
    duracaoPadrao,
    
    handleDataInicioChange,
    handleHoraInicioChange,
    handleDataFimChange,
    handleHoraFimChange,
    alterarDuracaoPadrao,
    recalcularComDuracao,
    
    validar,
    reset,
    preencherComValoresPadrao,
    getDataInicioISO,
    getDataFimISO,
    
    getDadosCompletos: () => ({
      data_inicio: dataInicio,
      hora_inicio: horaInicio,
      data_fim: dataFim,
      hora_fim: horaFim,
      data_inicio_iso: getDataInicioISO(),
      data_fim_iso: getDataFimISO(),
      duracao_horas: validar().duracao || 0
    }),
    
    isValid: () => validar().valido,
    getError: () => validar().erro,
    getDuracao: () => validar().duracao || 0
  };
};
