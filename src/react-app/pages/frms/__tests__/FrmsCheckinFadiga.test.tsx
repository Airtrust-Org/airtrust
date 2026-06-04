import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrmsCheckinFadiga, {
  isFadigaCheckinSubmitReady,
  isValidWakeTime,
  mapKssToSubjectiveFatigue,
  normalizeWakeTimeInput,
  optionalBinaryResponseToPayload,
} from '../FrmsCheckinFadiga';
import { resolveFadigaPostSavePath } from '../frmsPostSaveNavigation';

const mutateAsyncMock = vi.fn();
const refetchMock = vi.fn();
const navigateMock = vi.fn();
const useFadigaHistoricoMock = vi.fn();
const useFadigaPainelMock = vi.fn();
const usePermissionsMock = vi.fn();
let submitPending = false;

vi.mock('react-router-dom', () => ({
  Link: ({ to, children }: { to: string; children: any }) => <a href={to}>{children}</a>,
  useNavigate: () => navigateMock,
}));

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: any }) => <div>{children}</div>,
}));

vi.mock('@/react-app/components/PageHeader', () => ({
  default: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock('@/react-app/hooks/useFadigaCheckin', () => ({
  useCheckinHoje: () => ({ data: null, refetch: refetchMock }),
  useSubmitCheckin: () => ({ mutateAsync: mutateAsyncMock, isPending: submitPending }),
  useFadigaHistorico: (...args: unknown[]) => useFadigaHistoricoMock(...args),
  useFadigaPainel: (...args: unknown[]) => useFadigaPainelMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('FrmsCheckinFadiga helpers', () => {
  it('permite submissao com aptidao sim sem observacao', () => {
    expect(
      isFadigaCheckinSubmitReady({
        sonoOpcao: 'ate8',
        wakeTime: '05:30',
        qualidadeSono: 4,
        kssScore: 3,
        fitForDutyChoice: 'sim',
        aceiteTermos: true,
        aceitePrivacidade: true,
        observacao: '',
      }),
    ).toBe(true);
  });

  it('exige observacao quando aptidao nao ou coordenacao', () => {
    expect(
      isFadigaCheckinSubmitReady({
        sonoOpcao: 'ate8',
        wakeTime: '05:30',
        qualidadeSono: 4,
        kssScore: 3,
        fitForDutyChoice: 'nao',
        aceiteTermos: true,
        aceitePrivacidade: true,
        observacao: '',
      }),
    ).toBe(false);

    expect(
      isFadigaCheckinSubmitReady({
        sonoOpcao: 'ate8',
        wakeTime: '05:30',
        qualidadeSono: 4,
        kssScore: 3,
        fitForDutyChoice: 'coord',
        aceiteTermos: true,
        aceitePrivacidade: true,
        observacao: 'Preciso revisar antes da jornada',
      }),
    ).toBe(true);
  });

  it('preserva null no payload opcional', () => {
    expect(optionalBinaryResponseToPayload(null)).toBeNull();
    expect(optionalBinaryResponseToPayload(true)).toBe(true);
    expect(optionalBinaryResponseToPayload(false)).toBe(false);
  });

  it('mapeia KSS para escala subjetiva legado-compativel', () => {
    expect(mapKssToSubjectiveFatigue(1)).toBe(1);
    expect(mapKssToSubjectiveFatigue(3)).toBe(3);
    expect(mapKssToSubjectiveFatigue(5)).toBe(5);
    expect(mapKssToSubjectiveFatigue(7)).toBe(8);
    expect(mapKssToSubjectiveFatigue(9)).toBe(10);
  });

  it('normaliza wake time em formatos aceitos', () => {
    expect(normalizeWakeTimeInput('1230')).toBe('12:30');
    expect(normalizeWakeTimeInput('0730')).toBe('07:30');
    expect(normalizeWakeTimeInput('730')).toBe('07:30');
    expect(normalizeWakeTimeInput('0630')).toBe('06:30');
    expect(normalizeWakeTimeInput('7:30')).toBe('07:30');
    expect(normalizeWakeTimeInput('07h00')).toBe('07:00');
    expect(normalizeWakeTimeInput('7h30')).toBe('07:30');
  });

  it('rejeita wake time incompleto ou invalido', () => {
    expect(normalizeWakeTimeInput('')).toBeNull();
    expect(normalizeWakeTimeInput('07')).toBeNull();
    expect(normalizeWakeTimeInput('7')).toBeNull();
    expect(normalizeWakeTimeInput('2360')).toBeNull();
    expect(normalizeWakeTimeInput('2400')).toBeNull();
    expect(normalizeWakeTimeInput('9999')).toBeNull();
  });

  it('valida faixa e formato aceitos para wake time', () => {
    expect(isValidWakeTime('00:00')).toBe(true);
    expect(isValidWakeTime('06:30')).toBe(true);
    expect(isValidWakeTime('23:59')).toBe(true);
    expect(isValidWakeTime('700')).toBe(true);
    expect(isValidWakeTime('7h30')).toBe(true);
    expect(isValidWakeTime('00:80')).toBe(false);
    expect(isValidWakeTime('24:00')).toBe(false);
    expect(isValidWakeTime('25:61')).toBe(false);
    expect(isValidWakeTime('6')).toBe(false);
  });

  it('resolve home correta apos salvar fadiga por perfil', () => {
    expect(resolveFadigaPostSavePath('INSTRUTOR')).toBe('/home');
    expect(resolveFadigaPostSavePath('ALUNO')).toBe('/home');
    expect(resolveFadigaPostSavePath('TRIPULANTE')).toBe('/home');
    expect(resolveFadigaPostSavePath('GESTOR')).toBe('/');
    expect(resolveFadigaPostSavePath('ADMINISTRADOR')).toBe('/');
  });
});

describe('FrmsCheckinFadiga UI', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    refetchMock.mockReset();
    navigateMock.mockReset();
    useFadigaHistoricoMock.mockReset();
    useFadigaPainelMock.mockReset();
    usePermissionsMock.mockReset();
    submitPending = false;
    mutateAsyncMock.mockResolvedValue({ data: { requires_frat_review: 0 } });
    refetchMock.mockResolvedValue(undefined);
    useFadigaHistoricoMock.mockReturnValue({ data: { data: [] }, isLoading: false });
    useFadigaPainelMock.mockReturnValue({ data: [], isLoading: false });
    usePermissionsMock.mockReturnValue({ isAdmin: false, isGestor: false, role: 'INSTRUTOR' });
  });

  function preencherFormularioValido() {
    fireEvent.click(screen.getByRole('radio', { name: '6-8h' }));
    fireEvent.change(screen.getByLabelText('Hora em que acordou'), { target: { value: '0530' } });
    fireEvent.click(screen.getByLabelText('Qualidade 4 - Boa'));
    fireEvent.click(screen.getByLabelText('KSS 3: Alerta'));
    fireEvent.click(document.getElementById('fit-choice-sim') as HTMLElement);
    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));
  }

  it('renderiza KSS com titulo claro e descritores', () => {
    render(<FrmsCheckinFadiga />);

    expect(screen.getByText('Bloco 2 - Sonolência agora')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Quão sonolento ou alerta você está agora? Escolha a opção que melhor descreve seu estado neste momento.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Escala KSS (1-9)')).toBeInTheDocument();
    expect(screen.getByText(/Extremamente alerta/)).toBeInTheDocument();
  });

  it('renderiza qualidade do sono com niveis e descritores claros', () => {
    render(<FrmsCheckinFadiga />);

    expect(screen.getByLabelText('Qualidade 1 - Muito ruim')).toBeInTheDocument();
    expect(screen.getByLabelText('Qualidade 2 - Ruim')).toBeInTheDocument();
    expect(screen.getByLabelText('Qualidade 3 - Regular')).toBeInTheDocument();
    expect(screen.getByLabelText('Qualidade 4 - Boa')).toBeInTheDocument();
    expect(screen.getByLabelText('Qualidade 5 - Muito boa')).toBeInTheDocument();
    expect(
      screen.getByText('Dormi muito mal; acordei várias vezes ou quase não descansei.'),
    ).toBeInTheDocument();
  });

  it('remove sintomas redundantes da UI', () => {
    render(<FrmsCheckinFadiga />);

    expect(screen.queryByText('Sintomas atuais')).not.toBeInTheDocument();
    expect(screen.queryByText('Concentração reduzida')).not.toBeInTheDocument();
    expect(screen.queryByText(/48h/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nível subjetivo de fadiga/i)).not.toBeInTheDocument();
  });

  it('envia payload minimo valido e compativel com null em meds/alcool', async () => {
    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('radio', { name: '6-8h' }));
    fireEvent.change(screen.getByLabelText('Hora em que acordou'), { target: { value: '0530' } });
    fireEvent.click(screen.getByLabelText('Qualidade 4 - Boa'));
    fireEvent.click(screen.getByLabelText('KSS 3: Alerta'));
    fireEvent.click(document.getElementById('fit-choice-sim') as HTMLElement);

    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));

    fireEvent.click(document.getElementById('meds-ult-12h-sim') as HTMLElement);
    fireEvent.click(document.getElementById('meds-ult-12h-prefiro-nao') as HTMLElement);
    fireEvent.click(document.getElementById('alcool-ult-12h-sim') as HTMLElement);
    fireEvent.click(document.getElementById('alcool-ult-12h-prefiro-nao') as HTMLElement);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Check-in Diário' }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));

    const payload = mutateAsyncMock.mock.calls[0][0] as Record<string, unknown>;

    expect(payload.kss_score).toBe(3);
    expect(payload.horas_sono_24h).toBe(7);
    expect(payload.qualidade_sono).toBe(4);
    expect(payload.wake_time).toBe('05:30');
    expect(payload.hora_acordou).toBe('05:30');
    expect(payload.fit_for_duty).toBe(true);
    expect(payload.meds_ult_12h).toBeNull();
    expect(payload.alcool_ult_12h).toBeNull();
    expect(payload.subjective_fatigue_level).toBe(3);
    expect(payload.sleepiness_level).toBe(3);
    expect(payload).not.toHaveProperty('sintomas');
    expect(payload).not.toHaveProperty('horas_sono_48h');
    expect(payload.motivo_inaptidao).toBeUndefined();
  });

  it('sucesso de instrutor fecha formulario e volta para home correta', async () => {
    render(<FrmsCheckinFadiga />);

    preencherFormularioValido();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Check-in Diário' }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/home', { replace: true }));
  });

  it('sucesso de aluno/tripulante volta para home correta', async () => {
    usePermissionsMock.mockReturnValue({ isAdmin: false, isGestor: false, role: 'ALUNO' });
    render(<FrmsCheckinFadiga />);

    preencherFormularioValido();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Check-in Diário' }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/home', { replace: true }));
  });

  it('erro de envio permanece no formulario sem redirecionar', async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error('Falha segura'));
    render(<FrmsCheckinFadiga />);

    preencherFormularioValido();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Check-in Diário' }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('evita double submit quando mutation esta pendente', () => {
    submitPending = true;
    render(<FrmsCheckinFadiga />);

    preencherFormularioValido();
    const submitButton = screen.getByRole('button', { name: 'Confirmar Check-in Diário' });
    expect(submitButton).toBeDisabled();
    fireEvent.click(submitButton);

    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('mantem observacao obrigatoria para resposta nao apto', () => {
    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('radio', { name: '4-5h' }));
    fireEvent.change(screen.getByLabelText('Hora em que acordou'), { target: { value: '0530' } });
    fireEvent.click(screen.getByLabelText('Qualidade 3 - Regular'));
    fireEvent.click(screen.getByLabelText('KSS 6: Alguns sinais de sonolência'));
    fireEvent.click(document.getElementById('fit-choice-nao') as HTMLElement);
    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));

    expect(screen.getByText(/observação é obrigatória/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar Check-in Diário' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Explique o motivo para revisão pela coordenação'), {
      target: { value: 'Não dormi adequadamente e preciso revisar com a coordenação.' },
    });

    expect(screen.getByRole('button', { name: 'Confirmar Check-in Diário' })).toBeEnabled();
  });

  it('inicia vazio e normaliza wake time no blur', () => {
    render(<FrmsCheckinFadiga />);

    const wakeInput = screen.getByLabelText('Hora em que acordou') as HTMLInputElement;
    expect(wakeInput.value).toBe('');

    fireEvent.change(wakeInput, { target: { value: '0700' } });
    expect(wakeInput.value).toBe('0700');
    fireEvent.blur(wakeInput);
    expect(wakeInput.value).toBe('07:00');

    fireEvent.change(wakeInput, { target: { value: '700' } });
    expect(wakeInput.value).toBe('700');
    fireEvent.blur(wakeInput);
    expect(wakeInput.value).toBe('07:00');

    fireEvent.change(wakeInput, { target: { value: '7h30' } });
    fireEvent.blur(wakeInput);
    expect(wakeInput.value).toBe('07:30');

    fireEvent.change(wakeInput, { target: { value: '' } });
    expect(wakeInput.value).toBe('');
  });

  it('exibe indicador de pendencias quando formulario incompleto', () => {
    render(<FrmsCheckinFadiga />);

    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(/respostas pendentes/);
    expect(status).toHaveTextContent(/Horas de sono/);
    expect(status).toHaveTextContent(/Qualidade do sono/);
    expect(status).toHaveTextContent(/e mais/);
  });

  it('remove indicador de pendencias quando formulario completo', async () => {
    render(<FrmsCheckinFadiga />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '6-8h' }));
    fireEvent.change(screen.getByLabelText('Hora em que acordou'), { target: { value: '0530' } });
    fireEvent.click(screen.getByLabelText('Qualidade 4 - Boa'));
    fireEvent.click(screen.getByLabelText('KSS 3: Alerta'));
    fireEvent.click(document.getElementById('fit-choice-sim') as HTMLElement);
    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('usa fieldset e legend para agrupamento semantico com radios nativos', () => {
    render(<FrmsCheckinFadiga />);

    // fieldset provides group semantics; native radio names create the radio group
    expect(screen.getByRole('radio', { name: '6-8h' })).toHaveAttribute('name', 'sono-24h');
    expect(screen.getByLabelText('Qualidade 3 - Regular')).toHaveAttribute('name', 'qualidade-sono');
    expect(screen.getByLabelText('KSS 5: Nem alerta nem sonolento')).toHaveAttribute('name', 'kss');
  });

  it('renderiza radios em cards estruturados (block/flex + w-full)', () => {
    render(<FrmsCheckinFadiga />);

    const qualidadeInput = screen.getByLabelText('Qualidade 4 - Boa');
    const qualidadeLabel = qualidadeInput.closest('label');
    expect(qualidadeLabel).toBeTruthy();
    expect(qualidadeLabel).toHaveClass('block');
    expect(qualidadeLabel).toHaveClass('w-full');

    const kssInput = screen.getByLabelText('KSS 8: Sonolento, com esforço para ficar acordado');
    const kssLabel = kssInput.closest('label');
    expect(kssLabel).toBeTruthy();
    expect(kssLabel).toHaveClass('block');
    expect(kssLabel).toHaveClass('w-full');

    const medsLabel = document.getElementById('meds-ult-12h-sim');
    expect(medsLabel).toBeTruthy();
    expect(medsLabel).toHaveClass('flex');
    expect(medsLabel).toHaveClass('w-full');
  });

  it('mantem radios nativos sem atributos aria custom de role radio', () => {
    const { container } = render(<FrmsCheckinFadiga />);
    expect(container.querySelector('[role="radio"]')).toBeNull();
    expect(container.querySelector('[aria-checked]')).toBeNull();
    expect(container.querySelector('[aria-pressed]')).toBeNull();
  });

  it('exibe borda vermelha e aria-invalid em horario invalido', () => {
    render(<FrmsCheckinFadiga />);

    const wakeInput = screen.getByLabelText('Hora em que acordou');
    fireEvent.change(wakeInput, { target: { value: '2400' } });
    fireEvent.blur(wakeInput);

    expect(wakeInput).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText('Informe um horário válido no formato HH:mm. Minutos devem ficar entre 00 e 59.'),
    ).toBeInTheDocument();
  });

  it('bloqueia envio quando horario e invalido e mostra mensagem clara', () => {
    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('radio', { name: '6-8h' }));
    const wakeInput = screen.getByLabelText('Hora em que acordou');
    fireEvent.change(wakeInput, { target: { value: '2400' } });
    fireEvent.blur(wakeInput);
    fireEvent.click(screen.getByLabelText('Qualidade 4 - Boa'));
    fireEvent.click(screen.getByLabelText('KSS 3: Alerta'));
    fireEvent.click(document.getElementById('fit-choice-sim') as HTMLElement);
    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));

    expect(
      screen.getByText('Informe um horário válido no formato HH:mm. Minutos devem ficar entre 00 e 59.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar Check-in Diário' })).toBeDisabled();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('submete 0630 como 06:30', async () => {
    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('radio', { name: '6-8h' }));
    fireEvent.change(screen.getByLabelText('Hora em que acordou'), { target: { value: '0630' } });
    fireEvent.click(screen.getByLabelText('Qualidade 4 - Boa'));
    fireEvent.click(screen.getByLabelText('KSS 3: Alerta'));
    fireEvent.click(document.getElementById('fit-choice-sim') as HTMLElement);
    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Check-in Diário' }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    const payload = mutateAsyncMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.wake_time).toBe('06:30');
    expect(payload.hora_acordou).toBe('06:30');
  });

  it('renderiza status operacional com rotulos seguros na aba Histórico', () => {
    useFadigaHistoricoMock.mockReturnValue({
      data: {
        data: [
          {
            id: 'chk-1',
            data_checkin: '2026-05-29',
            kss_score: 8,
            horas_sono: 4.5,
            score_fadiga: 82,
            nivel_fadiga: 'VERMELHO',
            status_operacional: 'INAPTO',
          },
        ],
      },
      isLoading: false,
    });

    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }));

    expect(screen.getByText('Requer revisão operacional')).toBeInTheDocument();
    expect(screen.queryByText(/^INAPTO$/)).not.toBeInTheDocument();
  });

  it('mantem disclaimer de triagem operacional no check-in', () => {
    render(<FrmsCheckinFadiga />);
    expect(screen.getByText(/Ferramenta de triagem operacional/i)).toBeInTheDocument();
    expect(screen.getByText(/não determina automaticamente aptidão ou restrição operacional/i)).toBeInTheDocument();
  });
});
