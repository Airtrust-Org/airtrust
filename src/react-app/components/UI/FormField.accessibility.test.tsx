import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormField } from './FormField';
import { Input, Select } from './Input';

describe('FormField accessibility', () => {
  it('associa o rótulo ao input nativo', () => {
    render(
      <FormField label="Nome">
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByLabelText('Nome')).toBeInstanceOf(HTMLInputElement);
  });

  it('associa o rótulo a componentes que repassam id (Input, Select)', () => {
    render(
      <>
        <FormField label="E-mail">
          <Input type="email" />
        </FormField>
        <FormField label="Setor">
          <Select
            options={[
              { value: '', label: 'Selecione' },
              { value: 'ops', label: 'Operações' },
            ]}
          />
        </FormField>
      </>,
    );
    expect(screen.getByLabelText('E-mail')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText('Setor')).toBeInstanceOf(HTMLSelectElement);
  });

  it('respeita o id informado pelo consumidor', () => {
    render(
      <FormField label="CPF">
        <input id="cpf-custom" />
      </FormField>,
    );
    expect(screen.getByLabelText('CPF').id).toBe('cpf-custom');
  });

  it('anuncia obrigatório e liga erro e dica via aria-describedby', () => {
    const { rerender } = render(
      <FormField label="Matrícula" required hint="Somente números">
        <input />
      </FormField>,
    );
    const field = screen.getByRole('textbox', { name: /Matrícula/ });
    expect(field.getAttribute('aria-required')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Somente números').id).toBe(field.getAttribute('aria-describedby'));

    rerender(
      <FormField label="Matrícula" required error="Campo obrigatório">
        <input />
      </FormField>,
    );
    const invalid = screen.getByRole('textbox', { name: /Matrícula/ });
    expect(invalid.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('Campo obrigatório');
    expect(invalid.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
  });

  it('mantém o aria-describedby interno do Input quando não há erro nem dica', () => {
    render(
      <FormField label="Nome">
        <Input helperText="Como no documento" />
      </FormField>,
    );
    const input = screen.getByLabelText('Nome');
    const helper = screen.getByText('Como no documento');
    expect(input.getAttribute('aria-describedby')).toBe(helper.id);
  });

  it('não injeta id em wrappers que não são controles', () => {
    const { container } = render(
      <FormField label="Período" controlId="periodo-ctl">
        <div>
          <input id="periodo-ctl" />
        </div>
      </FormField>,
    );
    expect(container.querySelector('div > div')?.id).toBe('');
    expect(screen.getByLabelText('Período').id).toBe('periodo-ctl');
  });
});
