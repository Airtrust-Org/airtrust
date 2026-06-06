import { describe, expect, it, vi } from 'vitest';
import { notifyDataChanged, onDataChanged } from '../data-sync';

describe('data sync event bus', () => {
  it('notifies same-tab listeners by scope', () => {
    const callback = vi.fn();
    const cleanup = onDataChanged(callback, ['escala']);

    notifyDataChanged('treinamentos');
    notifyDataChanged('escala');

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('escala');
    cleanup();
  });
});
