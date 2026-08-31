import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FormDateInput } from './FormDateInput';

describe('FormDateInput semantic accessibility', () => {
  it('associates the visible label and helper text with a semantic 44px field', () => {
    render(
      <FormDateInput
        label="Data de validade"
        value=""
        onChange={vi.fn()}
        helperText="Informe a data do documento"
      />,
    );

    const input = screen.getByLabelText('Data de validade');
    const helper = screen.getByText('Informe a data do documento');

    expect(input).toHaveClass('at-field', 'at-focus', 'min-h-11');
    expect(input).toHaveAttribute('aria-describedby', helper.id);
  });

  it('links validation feedback without exposing the label text as an unstable id', () => {
    const onChange = vi.fn();
    const onValidationError = vi.fn();

    render(
      <FormDateInput
        label="Data inicial da escala"
        value="2026-08-01"
        minDate="2026-08-10"
        onChange={onChange}
        onValidationError={onValidationError}
      />,
    );

    const input = screen.getByLabelText('Data inicial da escala');
    fireEvent.change(input, { target: { value: '2026-08-05' } });

    const error = screen.getByText(/Data não pode ser anterior/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', error.id);
    expect(error.id).not.toContain('Data inicial da escala');
    expect(onChange).toHaveBeenCalledWith('2026-08-05');
    expect(onValidationError).toHaveBeenCalledTimes(1);
  });
});
