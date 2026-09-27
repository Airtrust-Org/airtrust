import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Brain, AlertTriangle, BarChart3, Clock, Activity } from 'lucide-react';
import { useFrmsConfiguracoes } from '@/react-app/hooks/useFrms';

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
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

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl bg-slate-900 px-5 py-3.5 font-mono text-sm text-emerald-400">
      {children}
    </div>
  );
}

function Badge({
  label,
  range,
  desc,
  className,
}: {
  label: string;
  range: string;
  desc: string;
  className: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${className}`}>
      <p className="text-sm font-bold">{label}</p>
      <p className="mt-0.5 text-xs font-mono font-semibold">{range}</p>
      <p className="mt-1 text-xs opacity-90">{desc}</p>
    </div>
  );
}

export default function FrmsConceitos() {
  const navigate = useNavigate();
  const { data: governedConfig } = useFrmsConfiguracoes();
  const limites = governedConfig?.limites ?? {};
  const value = (key: string): number | null => {
    const n = Number(limites[key]);
    return Number.isFinite(n) ? n : null;
  };
  const aviso = value('ALERTA_AVISO_PCT');
  const atencao = value('ALERTA_ATENCAO_PCT');
  const critico = value('ALERTA_CRITICO_PCT');
  const violacao = value('ALERTA_VIOLACAO_PCT');
  const effVerde = value('EFFECTIV_VERDE_MIN');
  const effAmarelo = value('EFFECTIV_AMARELO_MAX');
  const effVermelho = value('EFFECTIV_VERMELHO_MAX');
  const pct = (n: number | null) => n == null ? 'configurado' : `${n}%`;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-sm sm:px-6">
        <button
          onClick={() => navigate('/frms')}
          className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao FRMS
        </button>
        <span className="text-slate-300">|</span>
        <span className="text-sm font-semibold text-slate-700">Como funciona o FRMS</span>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div className="pb-2 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700">
            <Activity className="h-3.5 w-3.5" />
            FRMS — Fatigue Risk Management System
          </div>
          <h1 className="mb-3 text-2xl font-bold text-slate-900">Como o FRMS organiza os indicadores</h1>
          <p className="mx-auto max-w-2xl text-base text-slate-500">
            O AirTrust separa duas leituras: <strong>Compliance Regulatório</strong> e{' '}
            <strong>Efetividade Estimada</strong>.
          </p>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Ferramenta de triagem operacional. Os índices apoiam revisão humana e não são diagnóstico
          médico, não são validação SAFTE-FAST e não determinam automaticamente aptidão ou
          restrição operacional.
        </div>

        <Section>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100">
              <Activity className="h-4 w-4 text-blue-700" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Visão rápida</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <StepCard
              step="1"
              title="Coleta da jornada"
              description="A leitura parte dos dados de jornada e horários operacionais do tripulante."
            />
            <StepCard
              step="2"
              title="Compliance regulatório"
              description="As horas acumuladas são comparadas com limites configurados em cada janela."
            />
            <StepCard
              step="3"
              title="Efetividade estimada"
              description="A jornada recebe ajustes operacionais e circadianos para estimar prontidão."
            />
            <StepCard
              step="4"
              title="Faixas de triagem"
              description="Os resultados entram em faixas de triagem para priorizar análise operacional."
            />
          </div>
        </Section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-5 text-red-800">
            <div className="mb-2 flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <span className="font-bold">Compliance Regulatório</span>
            </div>
            <p className="text-sm">
              Mede consumo de limites configurados/regulatórios. Quanto menor o consumo do limite,
              melhor. Acima de 100% indica extrapolação de limite.
            </p>
          </div>
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
            <div className="mb-2 flex items-center gap-2">
              <Brain className="h-5 w-5" />
              <span className="font-bold">Efetividade Estimada</span>
            </div>
            <p className="text-sm">
              Proxy operacional local. Quanto maior, melhor. Usa parâmetros metodológicos da
              jornada e sempre exige revisão humana.
            </p>
          </div>
        </div>

        <Section>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100">
              <Shield className="h-4 w-4 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Compliance regulatório no código atual</h2>
          </div>

          <p className="mb-3 text-sm text-slate-600">
            O compliance canônico combina <strong>limites obrigatórios de voo, trabalho e repouso</strong>
            com a proveniência de cada regra. Lei, RBAC/ANAC, ACT/CCT e política interna permanecem
            identificados separadamente.
          </p>
          <p className="mb-4 text-sm text-slate-600">
            Limites específicos dos Apêndices B/C do RBAC 117 só entram quando o perfil regulatório
            ativo documenta essa aplicabilidade. Se a evidência necessária estiver ausente, o estado
            é <strong>Não avaliado</strong>, nunca conformidade presumida.
          </p>
          <p className="mb-4 text-sm text-slate-600">
            A visão de consumo de HV continua útil como indicador, mas não substitui a decisão
            regulatória consolidada, que também considera o tempo legal de trabalho e sua fonte.
          </p>

          <Formula>
            pct_limite = valor_real_na_janela ÷ limite_aplicável_da_mesma_janela × 100
            <br />
            decisão_regulatória = pior_regra_obrigatória_documentada + qualidade_da_evidência
          </Formula>

          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            Os valores mostrados abaixo vêm da revisão governada ativa do tenant. Alterações de
            configuração não devem ser reproduzidas por números fixos nesta página.
          </div>

          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Faixas de triagem de compliance (limiares configuráveis)
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Badge
              label="Normal"
              range={aviso == null ? 'abaixo do aviso configurado' : `< ${pct(aviso)}`}
              desc="Consumo abaixo da zona de aviso"
              className="border-emerald-200 bg-emerald-50 text-emerald-800"
            />
            <Badge
              label="Aviso"
              range={aviso == null || atencao == null ? 'faixa configurada' : `${pct(aviso)} até < ${pct(atencao)}`}
              desc="Tendência de consumo elevada"
              className="border-amber-200 bg-amber-50 text-amber-800"
            />
            <Badge
              label="Atenção"
              range={atencao == null || critico == null ? 'faixa configurada' : `${pct(atencao)} até < ${pct(critico)}`}
              desc="Zona de pressão operacional"
              className="border-orange-200 bg-orange-50 text-orange-800"
            />
            <Badge
              label="Crítico"
              range={critico == null || violacao == null ? 'faixa configurada' : `${pct(critico)} até ${pct(violacao)}`}
              desc="Próximo do limite"
              className="border-orange-300 bg-orange-50 text-orange-900"
            />
            <Badge
              label="Violação"
              range={violacao == null ? 'acima do limite configurado' : `> ${pct(violacao)}`}
              desc="Limite excedido"
              className="border-red-200 bg-red-50 text-red-800"
            />
          </div>
        </Section>

        <Section>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100">
              <Brain className="h-4 w-4 text-emerald-700" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Efetividade estimada no código atual</h2>
          </div>

          <p className="mb-2 text-sm text-slate-600">
            A efetividade é um índice estimado (proxy local). Não é validação científica externa,
            não é validação SAFTE-FAST e não é diagnóstico.
          </p>
          <p className="mb-4 text-sm text-slate-600">
            Forma simplificada fiel ao cálculo atual:
          </p>

          <Formula>
            totalCalibrado = total_fatorizado_jornada + ajuste_repouso_sono + ajuste_apresentacao_wocl + ajuste_basica_circadiana + fatorProgressivo
            <br />
            effectiveness = max(0, min(100, 100 + totalCalibrado × 100))
          </Formula>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Entram diretamente no total</p>
              <p className="mt-2 text-sm text-slate-600">
                Horário de apresentação, duração da jornada, repouso/sono, noturno de
                decolagem/pouso, ciclo embarcado e fator progressivo do período embarcado.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Contexto basal e indicadores auxiliares</p>
              <p className="mt-2 text-sm text-slate-600">
                <strong>fator_basica_pct</strong> é contexto basal. Ele não entra na soma de
                <code> total_fatorizado_jornada</code>; pode existir ajuste circadiano específico
                quando há horário de apresentação. Indicadores de HV/KSS ajudam leitura operacional,
                mas KSS não entra na fórmula de effectiveness atual.
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Faixas da efetividade (limiares configuráveis)
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Badge
              label="Alta"
              range={effVerde == null ? 'faixa verde configurada' : `≥ ${pct(effVerde)}`}
              desc="Margem operacional preservada"
              className="border-emerald-200 bg-emerald-50 text-emerald-800"
            />
            <Badge
              label="Atenção"
              range={effAmarelo == null || effVerde == null ? 'faixa configurada' : `> ${pct(effAmarelo)} e < ${pct(effVerde)}`}
              desc="Redução estimada moderada"
              className="border-sky-200 bg-sky-50 text-sky-800"
            />
            <Badge
              label="Degradada"
              range={effVermelho == null || effAmarelo == null ? 'faixa configurada' : `> ${pct(effVermelho)} e ≤ ${pct(effAmarelo)}`}
              desc="Redução relevante"
              className="border-amber-200 bg-amber-50 text-amber-800"
            />
            <Badge
              label="Baixa"
              range={effVermelho == null ? 'faixa crítica configurada' : `≤ ${pct(effVermelho)}`}
              desc="Priorização para análise"
              className="border-red-200 bg-red-50 text-red-800"
            />
          </div>
        </Section>

        <Section>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100">
              <BarChart3 className="h-4 w-4 text-indigo-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Como ler o Mapa FRMS</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <p className="mb-1 font-semibold text-slate-800">Aba Compliance</p>
              <p>
                A visão de consumo mostra a janela de HV dominante; a decisão regulatória final é
                produzida separadamente pelo backend canônico e pode incluir trabalho, repouso e perfil aplicável.
              </p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-slate-800">Aba Efetividade</p>
              <p>
                A célula mostra a <strong>effectiveness_pct</strong> registrada para o dia.
              </p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-slate-800">Clique na célula</p>
              <p>Seleciona dia e tripulante para abrir explicação e curva temporal.</p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-slate-800">Clique no nome</p>
              <p>Abre a ficha individual com histórico e detalhes da jornada.</p>
            </div>
          </div>
        </Section>

        <Section>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100">
              <Clock className="h-4 w-4 text-slate-700" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Perguntas rápidas</h2>
          </div>
          <div className="space-y-3 text-sm text-slate-600">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">Por que um dia fica sem dado?</p>
              <p className="mt-1">Sem jornada processada, não há base para compliance/efetividade do dia.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">
                Por que compliance pode estar bom e efetividade pior no mesmo dia?
              </p>
              <p className="mt-1">
                Porque compliance mede consumo de limite regulatório e efetividade mede impacto
                operacional/circadiano da jornada.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">
                Por que tripulantes iniciam iguais e terminam com índices diferentes?
              </p>
              <p className="mt-1">
                Horários, repouso, duração, noturno e progressão embarcada mudam por jornada.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">Como tratar dado estimado?</p>
              <p className="mt-1">
                Priorize revisão humana e, quando possível, complete o dado operacional real.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">O que fazer com recálculo pendente?</p>
              <p className="mt-1">
                Tratar como limitação temporária da leitura e repetir a análise após o recálculo.
              </p>
            </div>
          </div>
        </Section>

        <Section>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Faixas, notificações e horário de referência</h2>
          </div>
          <p className="mb-3 text-sm text-slate-600">
            As faixas são de triagem operacional. Não substituem decisão humana nem determinam ação
            automática.
          </p>
          <p className="mb-3 text-sm text-slate-600">
            Os limiares são configuráveis em FRMS → Configurações, incluindo compliance e
            efetividade.
          </p>
          <p className="text-sm text-slate-600">
            Sobre tempo: o produto usa UTC em partes do processamento e integração, mas também usa
            calendário operacional/local em partes da visualização e consolidação. Por isso, a
            leitura deve sempre considerar o contexto da tela.
          </p>
        </Section>

        <Section className="border-slate-700 bg-slate-900 text-slate-300">
          <h3 className="mb-2 text-sm font-semibold text-white">Referências e normativas</h3>
          <ul className="space-y-1.5 text-xs text-slate-400">
            <li>
              • <strong className="text-slate-200">ICAO Doc 9966</strong> — contexto para FRMS.
            </li>
            <li>
              • <strong className="text-slate-200">RBAC 117</strong> — limites e diretrizes de
              fadiga aplicáveis ao cenário operacional.
            </li>
            <li>
              • <strong className="text-slate-200">Lei 13.475, RBAC 117 e instrumentos coletivos aplicáveis</strong> — fontes identificadas separadamente no compliance.
            </li>
            <li>
              • <strong className="text-slate-200">Modelos biomatemáticos</strong> — referência
              conceitual para proxy local, sem claim de validação externa.
            </li>
          </ul>
        </Section>

        <div className="pb-6 pt-2 text-center">
          <button
            onClick={() => navigate('/frms')}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
          >
            <BarChart3 className="h-4 w-4" />
            Voltar ao Dashboard FRMS
          </button>
        </div>
      </div>
    </div>
  );
}
