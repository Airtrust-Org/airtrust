import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';

interface Option {
  id: number | string;
  label: string;
  value: any;
  metadata?: any;
}

interface AdvancedComboboxProps {
  options: Option[];
  value?: Option | null;
  onChange: (option: Option | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  renderOption?: (option: Option) => React.ReactNode;
}

export default function AdvancedCombobox({
  options,
  value,
  onChange,
  placeholder = "Selecione uma opção...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhuma opção encontrada",
  loading = false,
  disabled = false,
  className = "",
  renderOption
}: AdvancedComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex(prev => 
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(prev => 
            prev > 0 ? prev - 1 : filteredOptions.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
            onChange(filteredOptions[highlightedIndex]);
            setIsOpen(false);
            setSearchTerm('');
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setSearchTerm('');
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, highlightedIndex, filteredOptions, onChange]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchTerm]);

  const handleToggle = () => {
    if (disabled || loading) return;
    
    setIsOpen(!isOpen);
    if (!isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleSelectOption = (option: Option) => {
    onChange(option);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const defaultRenderOption = (option: Option) => (
    <div className="flex items-center justify-between w-full">
      <span className="truncate">{option.label}</span>
      {value?.id === option.id && (
        <Check className="w-4 h-4 text-primary flex-shrink-0 ml-2" />
      )}
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled || loading}
        className={`
          relative w-full bg-white border border-gray-300 rounded-lg pl-3 pr-10 py-2 text-left
          focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
          ${disabled || loading ? 'bg-gray-100 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400'}
          ${isOpen ? 'ring-2 ring-blue-500 border-primary' : ''}
        `}
      >
        <span className="block truncate">
          {loading ? 'Carregando...' : value ? value.label : placeholder}
        </span>
        
        {/* Clear button */}
        {value && !disabled && !loading && (
          <button
            type="button"
            onClick={handleClearSelection}
            className="absolute inset-y-0 right-8 flex items-center pr-2 hover:text-gray-700"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
        
        {/* Dropdown arrow */}
        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transform transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          {/* Options List */}
          <ul
            ref={listRef}
            className="max-h-60 overflow-auto py-1"
            role="listbox"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-gray-500 text-center">
                {emptyMessage}
              </li>
            ) : (
              filteredOptions.map((option, index) => (
                <li
                  key={option.id}
                  onClick={() => handleSelectOption(option)}
                  className={`
                    px-3 py-2 cursor-pointer transition-colors
                    ${index === highlightedIndex ? 'bg-primary/10 text-blue-700' : 'hover:bg-gray-50'}
                    ${value?.id === option.id ? 'bg-primary/20 text-primary' : ''}
                  `}
                  role="option"
                  aria-selected={value?.id === option.id}
                >
                  {renderOption ? renderOption(option) : defaultRenderOption(option)}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
