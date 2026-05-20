import { useState, useEffect } from 'react';

/**
 * ⚠️ PADRÃO BRASILEIRO OBRIGATÓRIO - AIRTRUST ⚠️
 * 
 * Componentes de input que seguem OBRIGATORIAMENTE o padrão brasileiro:
 * ✅ Datas: SEMPRE dd/mm/aaaa (nunca mm/dd/yyyy ou yyyy-mm-dd)
 * ✅ Placeholders: SEMPRE "dd/mm/aaaa"
 * ✅ Máscaras: SEMPRE dd/mm/aaaa
 * ✅ Validação: SEMPRE formato brasileiro
 * ✅ Cultura: SEMPRE pt-BR
 */

export class DateTimeBrasil {
  /**
   * Formatar data para o padrão brasileiro dd/mm/aaaa
   */
  static formatarDataBrasil(data: Date | string): string {
    if (!data) return '';
    
    const dateObj = typeof data === 'string' ? new Date(data) : data;
    
    if (isNaN(dateObj.getTime())) return '';
    
    const dia = dateObj.getDate().toString().padStart(2, '0');
    const mes = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const ano = dateObj.getFullYear().toString();
    
    return `${dia}/${mes}/${ano}`;
  }
  
  /**
   * Validar formato brasileiro de data dd/mm/aaaa
   */
  static validarDataBrasil(dataBrasil: string): boolean {
    if (!dataBrasil) return false;
    
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = dataBrasil.match(regex);
    
    if (!match) return false;
    
    const [, dia, mes, ano] = match;
    const diaNum = parseInt(dia, 10);
    const mesNum = parseInt(mes, 10);
    const anoNum = parseInt(ano, 10);
    
    if (diaNum < 1 || diaNum > 31) return false;
    if (mesNum < 1 || mesNum > 12) return false;
    if (anoNum < 1900 || anoNum > 2100) return false;
    
    const dataVerificacao = new Date(anoNum, mesNum - 1, diaNum);
    
    return (
      dataVerificacao.getFullYear() === anoNum &&
      dataVerificacao.getMonth() === mesNum - 1 &&
      dataVerificacao.getDate() === diaNum
    );
  }
  
  /**
   * Converter data brasileira dd/mm/aaaa para objeto Date
   */
  static converterDataBrasil(dataBrasil: string): Date | null {
    if (!this.validarDataBrasil(dataBrasil)) return null;
    
    const [dia, mes, ano] = dataBrasil.split('/').map(Number);
    return new Date(ano, mes - 1, dia);
  }
  
  /**
   * Converter data brasileira + hora para Date
   */
  static converterDataHoraBrasil(dataBrasil: string, hora: string): Date | null {
    const dataObj = this.converterDataBrasil(dataBrasil);
    if (!dataObj) return null;
    
    const [h, m] = hora.split(':').map(Number);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    
    dataObj.setHours(h, m, 0, 0);
    return dataObj;
  }
}

interface InputDataBrasilProps {
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  id?: string;
}

/**
 * 🇧🇷 Input de Data no Padrão Brasileiro
 * 
 * Características obrigatórias:
 * - Formato: dd/mm/aaaa
 * - Placeholder: "dd/mm/aaaa"
 * - Máscara automática
 * - Validação brasileira
 */
export const InputDataBrasil: React.FC<InputDataBrasilProps> = ({
  value,
  onChange,
  placeholder = "dd/mm/aaaa", // 🇧🇷 OBRIGATÓRIO
  required = false,
  disabled = false,
  className = "",
  name,
  id
}) => {
  const [valorInterno, setValorInterno] = useState(value);
  const [erro, setErro] = useState<string | null>(null);
  
  useEffect(() => {
    setValorInterno(value);
  }, [value]);
  
  const aplicarMascara = (input: string): string => {
    const apenasNumeros = input.replace(/\D/g, '');
    
    let masked = apenasNumeros;
    
    if (masked.length >= 3) {
      masked = masked.substring(0, 2) + '/' + masked.substring(2);
    }
    
    if (masked.length >= 6) {
      masked = masked.substring(0, 5) + '/' + masked.substring(5, 9);
    }
    
    return masked;
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const valorComMascara = aplicarMascara(inputValue);
    
    setValorInterno(valorComMascara);
    
    if (valorComMascara.length === 10) {
      if (DateTimeBrasil.validarDataBrasil(valorComMascara)) {
        setErro(null);
        onChange(valorComMascara);
      } else {
        setErro('Data inválida no formato dd/mm/aaaa');
      }
    } else if (valorComMascara.length === 0) {
      setErro(null);
      onChange('');
    } else {
      setErro(null);
      onChange(valorComMascara);
    }
  };
  
  const handleBlur = () => {
    if (valorInterno && valorInterno.length > 0 && valorInterno.length < 10) {
      setErro('Data incompleta. Use o formato dd/mm/aaaa');
    } else if (valorInterno && !DateTimeBrasil.validarDataBrasil(valorInterno)) {
      setErro('Data inválida no formato dd/mm/aaaa');
    }
  };
  
  return (
    <div className="space-y-1">
      <input
        type="text"
        value={valorInterno}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        name={name}
        id={id}
        maxLength={10}
        className={`
          w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          ${erro ? 'border-red-500 focus:ring-red-500' : ''}
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
          ${className}
        `}
      />
      {erro && (
        <p className="text-red-500 text-sm">
          🇧🇷 {erro}
        </p>
      )}
    </div>
  );
};

interface InputHoraBrasilProps {
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  id?: string;
}

/**
 * 🇧🇷 Input de Hora no Padrão Brasileiro
 * 
 * Características obrigatórias:
 * - Formato: HH:mm
 * - Placeholder: "HH:mm"
 * - Máscara automática
 * - Validação 24h
 */
export const InputHoraBrasil: React.FC<InputHoraBrasilProps> = ({
  value,
  onChange,
  placeholder = "HH:mm",
  required = false,
  disabled = false,
  className = "",
  name,
  id
}) => {
  const [valorInterno, setValorInterno] = useState(value);
  const [erro, setErro] = useState<string | null>(null);
  
  useEffect(() => {
    setValorInterno(value);
  }, [value]);
  
  const aplicarMascara = (input: string): string => {
    const apenasNumeros = input.replace(/\D/g, '');
    
    let masked = apenasNumeros;
    
    if (masked.length >= 3) {
      masked = masked.substring(0, 2) + ':' + masked.substring(2, 4);
    }
    
    return masked;
  };
  
  const validarHora = (hora: string): boolean => {
    if (!hora || hora.length !== 5) return false;
    
    const [h, m] = hora.split(':').map(Number);
    
    return !isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const valorComMascara = aplicarMascara(inputValue);
    
    setValorInterno(valorComMascara);
    
    if (valorComMascara.length === 5) {
      if (validarHora(valorComMascara)) {
        setErro(null);
        onChange(valorComMascara);
      } else {
        setErro('Hora inválida no formato HH:mm');
      }
    } else if (valorComMascara.length === 0) {
      setErro(null);
      onChange('');
    } else {
      setErro(null);
      onChange(valorComMascara);
    }
  };
  
  const handleBlur = () => {
    if (valorInterno && valorInterno.length > 0 && valorInterno.length < 5) {
      setErro('Hora incompleta. Use o formato HH:mm');
    } else if (valorInterno && !validarHora(valorInterno)) {
      setErro('Hora inválida no formato HH:mm');
    }
  };
  
  return (
    <div className="space-y-1">
      <input
        type="text"
        value={valorInterno}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        name={name}
        id={id}
        maxLength={5}
        className={`
          w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          ${erro ? 'border-red-500 focus:ring-red-500' : ''}
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
          ${className}
        `}
      />
      {erro && (
        <p className="text-red-500 text-sm">
          🇧🇷 {erro}
        </p>
      )}
    </div>
  );
};

export default {
  InputDataBrasil,
  InputHoraBrasil,
  DateTimeBrasil
};
