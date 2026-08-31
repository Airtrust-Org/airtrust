import { useEffect, useId, useState } from 'react';
import { frontendErrorMessage } from '@/react-app/lib/api-contract';
import { BaseModal } from '../modals/BaseModal';
import ModernCheckbox from './ModernCheckbox';

interface FieldConfig {
  name: string;
  label: string;
  type: 'text' | 'select' | 'number' | 'checkbox' | 'textarea';
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
}

interface ModalCadastroProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fields: FieldConfig[];
  initialData?: any;
  onSave: (data: any) => Promise<void>;
}

export function ModalCadastro({
  isOpen,
  onClose,
  title,
  fields,
  initialData,
  onSave,
}: ModalCadastroProps) {
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const formId = useId();

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      const defaultData: any = {};
      fields.forEach((field) => {
        if (field.type === 'checkbox') {
          defaultData[field.name] = true;
        } else {
          defaultData[field.name] = '';
        }
      });
      setFormData(defaultData);
    }
    setError('');
  }, [initialData, isOpen, fields]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await onSave(formData);
      onClose();
    } catch (err: unknown) {
      setError(frontendErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function handleChange(name: string, value: any) {
    setFormData({ ...formData, [name]: value });
  }

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="at-surface at-focus at-interactive min-h-11 rounded-lg border px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form={formId}
        disabled={loading}
        className="at-focus min-h-11 rounded-lg bg-primary px-4 py-2 font-medium text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {loading ? 'Salvando...' : 'Salvar'}
      </button>
    </>
  );

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={title} size="sm" footer={footer}>
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
        {error && (
          <div
            role="alert"
            className="at-status-critical rounded-lg border p-3 text-sm"
            style={{ borderColor: 'var(--at-critical)' }}
          >
            {error}
          </div>
        )}

        {fields.map((field) => {
          const fieldId = `${formId}-${field.name}`;

          return (
            <div key={field.name}>
              {field.type !== 'checkbox' && (
                <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-gray-700">
                  {field.label}
                  {field.required && (
                    <span
                      className="ml-1"
                      style={{ color: 'var(--at-critical)' }}
                      aria-hidden="true"
                    >
                      *
                    </span>
                  )}
                </label>
              )}

              {field.type === 'select' ? (
                <select
                  id={fieldId}
                  value={formData[field.name] || ''}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  required={field.required}
                  className="at-field at-focus min-h-11 w-full rounded-lg border px-3 py-2"
                >
                  <option value="">Selecione...</option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'checkbox' ? (
                <ModernCheckbox
                  checked={formData[field.name] || false}
                  onChange={(checked) => handleChange(field.name, checked)}
                  label={field.placeholder || field.label}
                />
              ) : field.type === 'textarea' ? (
                <textarea
                  id={fieldId}
                  value={formData[field.name] || ''}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  required={field.required}
                  placeholder={field.placeholder}
                  rows={3}
                  className="at-field at-focus w-full rounded-lg border px-3 py-2"
                />
              ) : (
                <input
                  id={fieldId}
                  type={field.type}
                  value={formData[field.name] || ''}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  required={field.required}
                  placeholder={field.placeholder}
                  className="at-field at-focus min-h-11 w-full rounded-lg border px-3 py-2"
                />
              )}
            </div>
          );
        })}
      </form>
    </BaseModal>
  );
}
