import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import NativeCoursePreview from '@/react-app/pages/lms/native/NativeCoursePreview';
import type { NativeLearnerCourse } from '../worker-airtrust/src/lib/lms/lms-native-course-contract';

const course: NativeLearnerCourse = {
  schema: 'AIRTRUST_NATIVE_COURSE_V1',
  courseId: 'nr6-epi',
  packageVersion: 'rc1',
  title: 'NR-6 — EPI',
  locale: 'pt-BR',
  policy: { mode: 'SCORED', masteryScore: 80 },
  assets: [{ id: 'hero', path: 'media/hero.webp', sha256: 'a'.repeat(64), mime: 'image/webp' }],
  units: [
    {
      id: 'intro', title: 'Introdução', kind: 'lesson', questionIds: [],
      blocks: [
        { type: 'heading', text: 'Segurança no trabalho' },
        { type: 'paragraph', text: '<img src=x onerror=alert(1)>' },
        { type: 'image', assetId: 'hero', alt: 'Capacete e EPI' },
      ],
    },
    {
      id: 'quiz', title: 'Avaliação', kind: 'assessment', blocks: [],
      questionIds: ['q1'],
    },
  ],
  questions: [
    { id: 'q1', prompt: 'Qual procedimento?', options: [
      { id: 'a', text: 'Ignorar' }, { id: 'b', text: 'Verificar o EPI' },
    ] },
  ],
};

describe('NativeCoursePreview — display only', () => {
  it('renders content literally and does not execute user-authored markup', () => {
    const resolve = vi.fn(() => '/api/lms/native/assets/hero');
    const { container } = render(<NativeCoursePreview course={course} resolveAssetHref={resolve} />);
    expect(screen.getByRole('heading', { name: 'NR-6 — EPI' })).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect(screen.getByRole('img', { name: 'Capacete e EPI' }).getAttribute('src'))
      .toBe('/api/lms/native/assets/hero');
    expect(screen.queryByRole('button', { name: /concluir|finalizar|certificado/i })).toBeNull();
  });

  it('navigates between units and permits local sample choices but never grades', () => {
    const { container } = render(<NativeCoursePreview course={course} resolveAssetHref={() => null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByRole('heading', { name: 'Avaliação' })).toBeInTheDocument();
    const fieldset = container.querySelector('fieldset');
    expect(fieldset).not.toBeNull();
    fireEvent.click(within(fieldset!).getByRole('radio', { name: 'Verificar o EPI' }));
    expect(within(fieldset!).getByRole('radio', { name: 'Verificar o EPI' })).toBeChecked();
    expect(screen.queryByText(/aprovado|concluído|nota/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByRole('heading', { name: 'Introdução' })).toBeInTheDocument();
  });

  it('refuses non-LMS and external media urls before rendering', () => {
    for (const url of ['https://host.invalid/asset', 'javascript:alert(1)', '/api/lms/../secret', '/api/lms/%2fsecret']) {
      const { container, unmount } = render(<NativeCoursePreview course={course} resolveAssetHref={() => url} />);
      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByText('Mídia indisponível nesta visualização: Capacete e EPI')).toBeInTheDocument();
      unmount();
    }
  });

  it('shows no client grading or server writes at any step', () => {
    const resolve = vi.fn(() => null);
    render(<NativeCoursePreview course={course} resolveAssetHref={resolve} />);
    expect(screen.getByText(/não são gravadas e não concluem treinamentos/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar no AirTrust' })).toBeNull();
  });
});
