/**
 * 🇧🇷 COMPONENTE PADRÃO DE INPUT DE DATA BRASILEIRA
 * 
 * Características obrigatórias:
 * ✅ Formato: SEMPRE dd/mm/aaaa
 * ✅ Máscara: Aplicação automática em tempo real
 * ✅ Validação: Rigorosa e brasileira
 * ✅ UX: Intuitiva para usuários brasileiros
 */

import { useState, useEffect } from 'react';
import { DatesBrasil } from '../../../shared/utils/datesBrasil';

interface InputDataBrasilProps {
  value: string;
  onChange: (dataBrasil: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
  error?: string;
  minDate?: string; // dd/mm/aaaa
  maxDate?: string; // dd/mm/aaaa
  showToday?: boolean;
  id?: string;
  name?: string;
}

export const InputDataBrasil: React.FC<InputDataBrasilProps> = ({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  required = false,
  disabled = false,
  className = "",
  label,
  error,
  minDate,
  maxDate,
  showToday = true,
  id,
  name
}) => {
  const [inputValue, setInputValue] = useState(value || '');
  const [localError, setLocalError] = useState('');
  const [focused, setFocused] = useState(false);
  
  useEffect(() => {
    if (value !== inputValue) {
      setInputValue(DatesBrasil.converterParaBrasil(value) || '');
    }
  }, [value]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valorDigitado = e.target.value;
    const valorComMascara = DatesBrasil.aplicarMascaraBrasil(valorDigitado);
    
    setInputValue(valorComMascara);
    
    if (valorComMascara.length === 10) {
      if (DatesBrasil.validarFormatoBrasil(valorComMascara)) {
        let validacao = true;
        let mensagemErro = '';
        
        if (minDate && DatesBrasil.validarFormatoBrasil(minDate)) {
          if (DatesBrasil.compararDatas(valorComMascara, minDate) < 0) {
            validacao = false;
            mensagemErro = `Data deve ser posterior a ${minDate}`;
          }
        }
        
        if (maxDate && DatesBrasil.validarFormatoBrasil(maxDate)) {
          if (DatesBrasil.compararDatas(valorComMascara, maxDate) > 0) {
            validacao = false;
            mensagemErro = `Data deve ser anterior a ${maxDate}`;
          }
        }
        
        if (validacao) {
          setLocalError('');
          onChange(valorComMascara);
        } else {
          setLocalError(mensagemErro);
        }
      } else {
        setLocalError('Data inválida');
      }
    } else if (valorComMascara === '') {
      setLocalError('');
      onChange('');
    }
  };
  
  const handleBlur = () => {
    setFocused(false);
    
    if (inputValue && inputValue.length === 10) {
      if (!DatesBrasil.validarFormatoBrasil(inputValue)) {
        setLocalError('Data inválida');
      }
    } else if (inputValue && inputValue.length > 0) {
      setLocalError('Data incompleta');
    }
  };
  
  const handleFocus = () => {
    setFocused(true);
    setLocalError('');
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    
    if (allowedKeys.includes(e.key)) {
      return;
    }
    
    if (e.key >= '0' && e.key <= '9') {
      return;
    }
    
    if (e.key === '/' && inputValue.length < 10) {
      return;
    }
    
    e.preventDefault();
  };
  
  const preencherHoje = () => {
    const hoje = DatesBrasil.hoje();
    setInputValue(hoje);
    onChange(hoje);
    setLocalError('');
  };
  
  const errorMessage = error || localError;
  
  return (
    <div className="input-data-brasil-container">
      {label && (
        <label 
          htmlFor={id}
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          {label} {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <input
          id={id}
          name={name}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          maxLength={10}
          autoComplete="off"
          className={`
            w-full px-4 py-3 border rounded-lg text-base
            focus:ring-2 focus:ring-primary focus:border-primary
            disabled:bg-gray-100 disabled:cursor-not-allowed
            transition-colors duration-200
            ${errorMessage ? 'border-red-500 bg-red-50' : focused ? 'border-primary' : 'border-gray-300'}
            ${className}
          `}
        />
        
        <div className="absolute inset-y-0 right-0 flex items-center">
          {showToday && !disabled && (
            <button
              type="button"
              onClick={preencherHoje}
              className="mr-2 px-2 py-1 text-xs bg-primary/20 text-primary rounded hover:bg-blue-200 transition-colors"
              title="Preencher com data de hoje"
            >
              Hoje
            </button>
          )}
          
          <div className="pr-3 pointer-events-none">
            <span className="text-gray-400 text-lg">🇧🇷</span>
          </div>
        </div>
      </div>
      
      {errorMessage && (
        <div className="mt-2 flex items-center">
          <span className="text-red-500 text-sm">❌</span>
          <p className="ml-2 text-sm text-red-600">{errorMessage}</p>
        </div>
      )}
      
      {focused && !errorMessage && (
        <p className="mt-2 flex items-center text-xs text-gray-500">
          <span className="mr-2">📅</span>
          Formato brasileiro: dd/mm/aaaa
          {showToday && (
            <span className="ml-4">
              💡 Clique em "Hoje" para preencher automaticamente
            </span>
          )}
        </p>
      )}
      
      {inputValue && DatesBrasil.validarFormatoBrasil(inputValue) && !errorMessage && (
        <p className="mt-1 text-xs text-green-600">
          ✅ {DatesBrasil.formatarPorExtenso(inputValue)}
        </p>
      )}
    </div>
  );
};

/**
 * Hook personalizado para gerenciar datas brasileiras
 */
export const useDateBrasil = (initialValue: string = '') => {
  const [dataBrasil, setDataBrasil] = useState(() => 
    DatesBrasil.converterParaBrasil(initialValue) || ''
  );
  const [dataISO, setDataISO] = useState('');
  const [isValid, setIsValid] = useState(false);
  
  useEffect(() => {
    if (dataBrasil) {
      const valid = DatesBrasil.validarFormatoBrasil(dataBrasil);
      setIsValid(valid);
      setDataISO(valid ? DatesBrasil.brasilParaISO(dataBrasil) : '');
    } else {
      setIsValid(false);
      setDataISO('');
    }
  }, [dataBrasil]);
  
  return {
    dataBrasil,
    dataISO,
    isValid,
    setDataBrasil,
    hoje: DatesBrasil.hoje(),
    ontem: DatesBrasil.adicionarDias(DatesBrasil.hoje(), -1),
    amanha: DatesBrasil.adicionarDias(DatesBrasil.hoje(), 1),
    adicionarDias: (dias: number) => DatesBrasil.adicionarDias(dataBrasil, dias),
    ehFutura: () => DatesBrasil.ehFutura(dataBrasil),
    ehPassada: () => DatesBrasil.ehPassada(dataBrasil),
    formatarPorExtenso: () => DatesBrasil.formatarPorExtenso(dataBrasil),
    diferencaParaHoje: () => DatesBrasil.diferencaEmDias(dataBrasil, DatesBrasil.hoje())
  };
};

/**
 * Hook para múltiplas datas brasileiras
 */
export const useMultipleDatesBrasil = (...initialValues: string[]) => {
  const dates = initialValues.map(value => useDateBrasil(value));
  
  return {
    dates,
    allValid: dates.every(d => d.isValid || !d.dataBrasil),
    hasAnyDate: dates.some(d => d.dataBrasil),
    toISO: () => dates.map(d => d.dataISO),
    toBrasil: () => dates.map(d => d.dataBrasil)
  };
};
