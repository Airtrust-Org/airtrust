import React from 'react';
import styles from './templates.module.css';

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'textarea' | 'select' | 'checkbox' | 'number';
  placeholder?: string;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  error?: string;
}

interface FormTemplateProps {
  title: string;
  description?: string;
  fields: FormField[];
  values: Record<string, string | boolean | number>;
  onChange: (name: string, value: string | boolean | number) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  loading?: boolean;
}

export const FormTemplate: React.FC<FormTemplateProps> = ({
  title,
  description,
  fields,
  values,
  onChange,
  onSubmit,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  onCancel,
  loading = false,
}) => {
  return (
    <div className={styles.pageLayout}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={onSubmit} className={styles.form}>
        <div className={styles.formGrid}>
          {fields.map((field) => (
            <div
              key={field.name}
              className={`${styles.formGroup} ${field.type === 'textarea' ? styles.fullWidth : ''}`}
            >
              <label htmlFor={field.name} className={styles.formLabel}>
                {field.label}
                {field.required && <span className={styles.required}>*</span>}
              </label>

              {field.type === 'textarea' ? (
                <textarea
                  id={field.name}
                  name={field.name}
                  placeholder={field.placeholder}
                  value={values[field.name] as string}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  required={field.required}
                  className={`${styles.formInput} ${field.error ? styles.error : ''}`}
                  rows={4}
                />
              ) : field.type === 'select' ? (
                <select
                  id={field.name}
                  name={field.name}
                  value={values[field.name] as string}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  required={field.required}
                  className={`${styles.formInput} ${field.error ? styles.error : ''}`}
                >
                  <option value="">Select an option</option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  id={field.name}
                  name={field.name}
                  checked={values[field.name] as boolean}
                  onChange={(e) => onChange(field.name, e.target.checked)}
                  className={styles.formCheckbox}
                />
              ) : (
                <input
                  type={field.type}
                  id={field.name}
                  name={field.name}
                  placeholder={field.placeholder}
                  value={values[field.name] as string}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  required={field.required}
                  className={`${styles.formInput} ${field.error ? styles.error : ''}`}
                />
              )}

              {field.error && <p className={styles.formError}>{field.error}</p>}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className={styles.formActions}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className={styles.btnSecondary}
            >
              {cancelLabel}
            </button>
          )}
          <button type="submit" disabled={loading} className={styles.btnPrimary}>
            {loading ? 'Saving...' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FormTemplate;
