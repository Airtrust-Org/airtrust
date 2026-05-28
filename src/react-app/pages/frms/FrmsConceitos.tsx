/**
 * FrmsConceitos — Página educativa sobre os cálculos do FRMS
 *
 * Explica de forma didática:
 *   - O que é FRMS
 *   - Como o Compliance Regulatório (%) é calculado
 *   - Como o índice estimado de efetividade (%) é calculado
 *   - O que significam os alertas e thresholds
 */
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Shield,
  Brain,
  AlertTriangle,
  BarChart3,
  Clock,
  Moon,
  Plane,
  RefreshCw,
  Activity,
} from 'lucide-react';

// ── Card wrapper ──────────────────────────────────────────────────────

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ── Nivel badge ───────────────────────────────────────────────────────

function NivelBadge({
  label,
  bg,
  text,
  range,
  desc,
}: {
  label: string;
  bg: string;
  text: string;
  range: string;
  desc: string;
}) {
  return (
    <div className={`rounded-xl p-4 ${bg}`}>
      <div className={`text-sm font-bold ${text} mb-0.5`}>{label}</div>
      <div className={`text-xs font-mono font-semibold ${text} mb-1`}>{range}</div>
      <div className={`text-xs ${text} opacity-80`}>{desc}</div>
    </div>
  );
}

// ── Fator row ─────────────────────────────────────────────────────────

function FatorRow({
  icon: Icon,
  name,
  desc,
  example,
}: {
  icon: React.ElementType;
  name: string;
  desc: string;
  example: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
        <Icon className="h-4 w-4 text-indigo-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{name}</p>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
      <div className="text-xs text-slate-400 italic text-right max-w-[140px] shrink-0">
        {example}
      </div>
    </div>
  );
}

// ── Formula block ─────────────────────────────────────────────────────

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-xl bg-slate-900 px-5 py-3.5 font-mono text-sm text-emerald-400 overflow-x-auto">
      {children}
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-white">
        {step}
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function FrmsConceitos() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-sm px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/frms')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao FRMS
        </button>
        <span className="text-slate-300">|</span>
        <span className="text-sm font-semibold text-slate-700">Como funciona o FRMS</span>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Hero */}
        <div className="text-center pb-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-4 py-1.5 text-xs font-semibold text-blue-700 mb-4">
            <Activity className="h-3.5 w-3.5" />
            FRMS — Fatigue Risk Management System
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">Como o FRMS calcula fadiga</h1>
          <p className="text-base text-slate-500 max-w-2xl mx-auto">
            O AirTrust monitora duas dimensões de fadiga em tempo real: o{' '}
            <strong>cumprimento regulatório</strong> das jornadas e a{' '}
            <strong>efetividade cognitiva</strong> estimada do tripulante.
          </p>
        </div>

        <Section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100">
              <Activity className="h-4 w-4 text-blue-700" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Visão rápida do cálculo</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <StepCard
              step="1"
              title="Coleta da jornada"
              description="O sistema lê data, horários, duração, horas de voo, base, aclimatação, tipo de operação e posição do tripulante no ciclo embarcado."
            />
            <StepCard
              step="2"
              title="Cálculo regulatório"
              description="As horas de voo são somadas nas janelas configuradas e comparadas com os limites de 7 dias, mês e 365 dias para gerar o compliance."
            />
            <StepCard
              step="3"
              title="Cálculo biomatemático"
              description="A jornada recebe penalidades operacionais e circadianas, como horário de apresentação, repouso anterior, janela noturna e progressão embarcada."
            />
            <StepCard
              step="4"
              title="Classificação final"
              description="O resultado é convertido em percentuais, enquadrado em faixas de severidade e exibido no heatmap, nos cards, nas fichas e nos alertas."
            />
          </div>
        </Section>

        {/* Dois painéis — visão geral */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-red-600" />
              <span className="font-bold text-red-800">Painel B — Compliance</span>
            </div>
            <p className="text-sm text-red-700">
              Mede <strong>quanto do limite regulatório</strong> de horas de voo e jornada foi
              consumido em cada janela operacional. Escala de 0% a 101%+.
            </p>
            <p className="mt-2 text-xs text-red-600 font-medium">Quanto MENOR, melhor.</p>
          </div>
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-5 w-5 text-emerald-700" />
              <span className="font-bold text-emerald-800">Painel A — Efetividade</span>
            </div>
            <p className="text-sm text-emerald-700">
              Estima a <strong>capacidade cognitiva residual</strong> do tripulante após os fatores
              de fadiga da jornada. Escala de 0% a 100%.
            </p>
            <p className="mt-2 text-xs text-emerald-700 font-medium">Quanto MAIOR, melhor.</p>
          </div>
        </div>

        {/* ── PAINEL B: COMPLIANCE ── */}
        <Section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100">
              <Shield className="h-4 w-4 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Painel B — Compliance Regulatório</h2>
          </div>

          <p className="text-sm text-slate-600 mb-4">
            Para cada período (7 dias, 28 dias ou 365 dias), calculamos quantas{' '}
            <strong>horas de voo mínimas</strong> o tripulante acumulou e dividimos pelo{' '}
            <strong>limite máximo</strong>
            configurado para aquele período.
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Entrada
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Horas de voo acumuladas em cada janela regulatória.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Comparação
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Cada soma é dividida pelo limite configurado e convertida em percentual.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Resultado
              </p>
              <p className="mt-2 text-sm text-slate-700">
                O sistema usa o pior percentual para classificar a severidade do tripulante.
              </p>
            </div>
          </div>

          <Formula>
            compliance_7d = horas_voo_7dias ÷ limite_hv_7dias × 100
            <br />
            <span className="text-slate-400">// Ex: 38h ÷ 45h × 100 = 84.4%</span>
          </Formula>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-5">
            <p className="text-sm font-semibold text-blue-900">Exemplo didático</p>
            <div className="mt-2 space-y-1 text-sm text-blue-800">
              <p>Tripulante com 38h voadas em 7 dias, 82h no mês e 640h em 365 dias.</p>
              <p>Se os limites forem 45h, 90h e 960h, os percentuais serão 84,4%, 91,1% e 66,7%.</p>
              <p>
                O FRMS guarda os três valores, mas classifica pelo pior: <strong>91,1%</strong>,
                portanto a severidade entra em <strong>Atenção</strong>.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Limites padrão configurados
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {[
                { label: 'HV 7 dias', value: '45 h', desc: 'Máx. horas em 7 dias corridos' },
                { label: 'HV Mês', value: '90 h', desc: 'Máx. horas no mês calendário' },
                { label: 'HV 365 dias', value: '960 h', desc: 'Máx. horas em 365 dias' },
                { label: 'FDP máximo', value: '11 h', desc: 'Duração máxima de jornada' },
                { label: 'Repouso mínimo', value: '12 h', desc: 'Repouso entre jornadas' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-white border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="text-xl font-bold text-slate-900 my-0.5">{item.value}</p>
                  <p className="text-xs text-slate-400">{item.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">
              * Configuráveis em FRMS → Configurações. Os valores acima são apenas os padrões
              iniciais.
            </p>
          </div>

          <p className="text-sm text-slate-600 mb-3">
            O sistema usa o <strong>pior pct</strong> entre todos os períodos como indicador de
            severidade para cada tripulante. O heatmap mostra o compliance de 7 dias por célula-dia.
          </p>

          {/* Alertas compliance */}
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Níveis de alerta — Compliance
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <NivelBadge
              label="Normal"
              bg="bg-emerald-50 border border-emerald-200"
              text="text-emerald-800"
              range="< 85%"
              desc="Operação regular, dentro dos limites"
            />
            <NivelBadge
              label="Aviso"
              bg="bg-amber-50 border border-amber-200"
              text="text-amber-800"
              range="85–89%"
              desc="Tendência de consumo elevada, pede acompanhamento"
            />
            <NivelBadge
              label="Atenção"
              bg="bg-orange-50 border border-orange-200"
              text="text-orange-800"
              range="90–94%"
              desc="Zona de pressão operacional antes do crítico"
            />
            <NivelBadge
              label="Crítico"
              bg="bg-orange-50 border border-orange-200"
              text="text-orange-800"
              range="95–100%"
              desc="Muito próximo do limite regulatório configurado"
            />
            <NivelBadge
              label="Violação"
              bg="bg-red-50 border border-red-200"
              text="text-red-800"
              range="≥ 101%"
              desc="Limite regulatório ultrapassado"
            />
          </div>
        </Section>

        {/* ── PAINEL A: EFETIVIDADE ── */}
        <Section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100">
              <Brain className="h-4 w-4 text-emerald-700" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Painel A — Índice estimado de efetividade</h2>
          </div>

          <p className="text-sm text-slate-600 mb-2">
            Baseado em proxy local inspirado em modelos biomatemáticos de fadiga, o sistema calcula
            um conjunto de <em>fatores de penalidade</em> para cada jornada. Cada fator representa
            uma fonte operacional associada a risco de fadiga, sem afirmar validação SAFTE-FAST.
          </p>

          <Formula>
            totalCalibrado = total_fatorizado_jornada + ajuste_repouso_sono + fatorProgressivo
            <br />
            effectiveness = max(0, min(100, 100 + totalCalibrado × 100))
            <br />
            <span className="text-slate-400">
              // Ex: totalCalibrado = -0.15 → effectiveness = 85%
            </span>
          </Formula>

          <p className="text-sm text-slate-600 mb-4">
            Quando todos os fatores são zero (jornada ideal), a efetividade é <strong>100%</strong>.
            Cada fator de penalidade reduz a efetividade proporcionalmente. O ajuste de sono refina
            o fator de repouso e o fator progressivo adiciona degradação ao longo do período
            embarcado.
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">O que entra na soma final</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                <li>Horário de apresentação</li>
                <li>Duração da jornada</li>
                <li>Repouso anterior e estimativa de sono</li>
                <li>Penalidades noturnas de decolagem e pouso</li>
                <li>Progressão do período embarcado</li>
                <li>Base away e aclimatação, quando informadas</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">O que ajuda no diagnóstico</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                <li>Indicadores auxiliares de horas de voo</li>
                <li>Fatores percentuais de leitura operacional</li>
                <li>Detalhamento dos componentes na ficha do tripulante</li>
                <li>Classificação de severidade por faixa</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-4">
            <p className="text-sm font-semibold text-emerald-900">Exemplo didático</p>
            <div className="mt-2 space-y-1 text-sm text-emerald-800">
              <p>
                Uma jornada longa, iniciada às 05h20, com repouso curto e pouso dentro da WOCL
                acumula várias penalidades.
              </p>
              <p>
                Se a soma calibrada final for <strong>-0,18</strong>, a fórmula gera{' '}
                <strong>82%</strong> de efetividade.
              </p>
              <p>
                Isso posiciona o tripulante em <strong>Moderada</strong>, indicando degradação leve,
                porém mensurável.
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 mb-4">
            Para diagnóstico, o sistema também grava indicadores como{' '}
            <strong>fator_basica_pct</strong> e fatores de HV. Eles ajudam a explicar a jornada, mas{' '}
            <strong>não entram</strong>
            diretamente na soma final da effectiveness.
          </p>

          {/* Fatores */}
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Fatores de penalidade calculados
          </p>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <FatorRow
              icon={Clock}
              name="Duração da Jornada"
              desc="Jornadas muito longas ou muito curtas recebem penalidade operacional. Este é o fator de duração que entra no total da effectiveness."
              example="Jornada 10h+ → penalidade de duração"
            />
            <FatorRow
              icon={Clock}
              name="Horário de Apresentação"
              desc="Apresentações em amanhecer, tarde, noite ou madrugada recebem penalidades circadianas diferentes conforme a janela configurada."
              example="Apresentação às 05h30 → penalidade de amanhecer"
            />
            <FatorRow
              icon={RefreshCw}
              name="Repouso Anterior"
              desc="Repouso insuficiente antes da jornada reduz a effectiveness. Quando há horários completos, o modelo ajusta esse fator pela estimativa de sono efetivo."
              example="Repouso 8h → penalidade relevante"
            />
            <FatorRow
              icon={Moon}
              name="Operação Noturna — Decolagem"
              desc="Decolagens na janela noturna operacional configurada ativam penalidade adicional. Esta janela operacional e diferente da WOCL fisiologica de despertar."
              example="Decolagem 23h30 → fator noturno"
            />
            <FatorRow
              icon={Moon}
              name="Operação Noturna — Pouso"
              desc="Pousos na mesma janela noturna operacional somam nova penalidade. A WOCL fisiologica (02h-06h) e aplicada no modelo de despertar/sono, separadamente."
              example="Pouso 00h45 → fator noturno pouso"
            />
            <FatorRow
              icon={BarChart3}
              name="Ciclo Embarcado"
              desc="O fator de ciclo embarcado penaliza a progressão do dia 1 ao dia máximo configurado, refletindo acúmulo homeostático."
              example="Dia 7 de 15 → penalidade intermediária"
            />
            <FatorRow
              icon={Plane}
              name="Período Embarcado Progressivo"
              desc="Além do fator de ciclo, a fórmula final aplica um ajuste progressivo extra com base em qual dia do período embarcado o tripulante está."
              example="Dia 14 de 14 → degradação adicional"
            />
            <FatorRow
              icon={Plane}
              name="Base AWAY e Aclimatação"
              desc="Operação fora da base e condição não aclimatada adicionam penalidades específicas quando esses campos estão presentes na jornada."
              example="Base AWAY + não aclimatado → soma de penalidades"
            />
          </div>

          {/* Alertas effectiveness */}
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-5 mb-3">
            Níveis de efetividade cognitiva
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NivelBadge
              label="Alta"
              bg="bg-emerald-50 border border-emerald-200"
              text="text-emerald-800"
              range="≥ 90%"
              desc="Plenas condições cognitivas operacionais"
            />
            <NivelBadge
              label="Moderada"
              bg="bg-sky-50 border border-sky-200"
              text="text-sky-800"
              range="77–90%"
              desc="Leve degradação, monitorar padrão"
            />
            <NivelBadge
              label="Degradada"
              bg="bg-amber-50 border border-amber-200"
              text="text-amber-800"
              range="65–77%"
              desc="Redução mensurável de performance cognitiva"
            />
            <NivelBadge
              label="Baixa"
              bg="bg-red-50 border border-red-200"
              text="text-red-800"
              range="< 65%"
              desc="Fadiga severa — avaliar restrição operacional"
            />
          </div>
        </Section>

        {/* ── HEATMAP ── */}
        <Section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100">
              <BarChart3 className="h-4 w-4 text-indigo-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Como ler o Mapa FRMS</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm text-slate-600">
            <div>
              <p className="font-semibold text-slate-800 mb-1">Aba Compliance (🔴)</p>
              <p>
                Cada célula = um dia × um tripulante. A cor representa o{' '}
                <strong>pct_limite_7d</strong>— percentual do limite de 7 dias de horas de voo
                consumido <em>naquele dia</em>. Células cinzas = dias sem dados (sem jornada
                registrada).
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-800 mb-1">Aba Efetividade (🧠)</p>
              <p>
                Cada célula representa a <strong>effectiveness_pct registrada naquele dia</strong>{' '}
                para o tripulante. Quando não há jornada processada no dia, a célula fica sem dado.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-800 mb-1">Clique em uma célula</p>
              <p>
                Seleciona o tripulante e exibe a <strong>Curva de Efetividade temporal</strong>
                abaixo do heatmap — mostrando a evolução da efetividade ao longo do tempo.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-800 mb-1">Clique no nome</p>
              <p>
                Abre a <strong>Ficha Individual</strong> do tripulante com histórico completo de
                jornadas, radar de componentes e evolução detalhada.
              </p>
            </div>
          </div>
        </Section>

        <Section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100">
              <Clock className="h-4 w-4 text-slate-700" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Perguntas rápidas</h2>
          </div>
          <div className="space-y-4 text-sm text-slate-600">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">
                Por que um dia fica sem cor no heatmap?
              </p>
              <p className="mt-1">
                Porque não houve jornada processada para aquele tripulante naquele dia, então o
                sistema não tem base para calcular compliance ou effectiveness.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">
                Por que o compliance pode estar bom e a effectiveness ruim?
              </p>
              <p className="mt-1">
                Porque são leituras diferentes: uma mede consumo de limite regulatório e a outra
                estima desgaste cognitivo da jornada específica.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">
                O que mais altera a effectiveness na prática?
              </p>
              <p className="mt-1">
                Normalmente: madrugada, repouso curto, duração longa e progressão de dias
                embarcados. O sistema soma esses componentes na jornada processada.
              </p>
            </div>
          </div>
        </Section>

        {/* ── DADOS E LIMITES ── */}
        <Section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Alertas e Notificações</h2>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            O sistema gera alertas automaticamente ao final de cada processamento de jornada. Os
            alertas são persistidos em{' '}
            <code className="bg-slate-100 px-1 rounded text-xs">frms_alerta</code> e podem ser
            consultados no painel de alertas.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="font-bold text-amber-800 mb-1">AVISO</p>
              <p className="text-xs text-amber-700">
                Compliance entre 85–89%. Sistema registra tendência de consumo elevado.
              </p>
            </div>
            <div className="rounded-xl bg-orange-50 border border-orange-200 p-4">
              <p className="font-bold text-orange-800 mb-1">ATENÇÃO</p>
              <p className="text-xs text-orange-700">
                Compliance entre 90–94%. Requer revisão ativa do planejamento de escala.
              </p>
            </div>
            <div className="rounded-xl bg-orange-50 border border-orange-200 p-4">
              <p className="font-bold text-orange-800 mb-1">CRÍTICO</p>
              <p className="text-xs text-orange-700">
                Compliance entre 95–100%. Zona crítica, ainda sem violação formal.
              </p>
            </div>
            <div className="rounded-xl bg-red-50 border border-red-200 p-4">
              <p className="font-bold text-red-800 mb-1">VIOLAÇÃO</p>
              <p className="text-xs text-red-700">
                Compliance a partir de 101%. Limite regulatório excedido, com ação imediata.
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Os thresholds de todos os níveis são configuráveis em{' '}
            <strong>FRMS → Configurações → Limites de Alerta</strong>. Datas e cálculos usam sempre
            o horário UTC para consistência com registros FIRA.
          </p>
        </Section>

        {/* ── FONTES ── */}
        <Section className="bg-slate-900 border-slate-700 text-slate-300">
          <h3 className="text-sm font-semibold text-white mb-2">Referências e Normativas</h3>
          <ul className="text-xs space-y-1.5 text-slate-400">
            <li>
              • <strong className="text-slate-200">ICAO Doc 9966</strong> — Fatigue Risk Management
              Systems Manual (2nd Ed.)
            </li>
            <li>
              • <strong className="text-slate-200">Modelos biomatemáticos</strong> — referência
              conceitual para degradação de efetividade, sem implementação proprietária validada
            </li>
            <li>
              • <strong className="text-slate-200">RBAC 117</strong> — Gerenciamento de Fadiga para
              Operações de Aviação Regular (ANAC Brasil)
            </li>
            <li>
              • <strong className="text-slate-200">RBAC 135 / 91</strong> — Limites de jornada e
              repouso para operações de táxi-aéreo e aviação geral
            </li>
          </ul>
        </Section>

        {/* CTA */}
        <div className="text-center pt-2 pb-6">
          <button
            onClick={() => navigate('/frms')}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition-colors shadow-sm"
          >
            <BarChart3 className="h-4 w-4" />
            Voltar ao Dashboard FRMS
          </button>
        </div>
      </div>
    </div>
  );
}
