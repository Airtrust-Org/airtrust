import { Suspense, useEffect, useState } from 'react';
import { TrendingUp, Users, Activity, BookOpen, BarChart3, Download } from 'lucide-react';
import { API_BASE_URL, fetchWithAuth } from '../../config/api';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import AppLayout from '../../components/AppLayout';
import { PageLayout } from '../../components/layout/PageLayout';
import { Button } from '../../components/UI/Button';
import { SkeletonCard } from '../../components/UI/Skeleton';
import QualificationHistoryReportPanel from './QualificationHistoryReportPanel';
import { downloadRelatoriosDashboardCsv } from './relatoriosDashboardCsv';

interface CertificacaoMesMetric {
  mes?: string;
  total?: number;
}

interface ComplianceSetorMetric {
  setor?: string;
  taxa_compliance?: number;
}

interface SimuladorUsoMetric {
  nome?: string;
  total_sessoes?: number;
}

interface TreinamentoCategoriaMetric {
  categoria?: string;
  total?: number;
}

interface RelatorioMetricEnvelope<T> {
  success?: boolean;
  dados?: T[];
}

const DashboardCharts = lazyWithRetry(
  () => import('./DashboardCharts'),
  'RelatoriosDashboardCharts',
);

function RelatoriosLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="h-[640px] rounded-2xl border border-slate-200 bg-white animate-pulse" />
    </div>
  );
}

export default function RelatoriosDashboard() {
  const [certMes, setCertMes] = useState<CertificacaoMesMetric[]>([]);
  const [complianceSetor, setComplianceSetor] = useState<ComplianceSetorMetric[]>([]);
  const [simUso, setSimUso] = useState<SimuladorUsoMetric[]>([]);
  const [treinCat, setTreinCat] = useState<TreinamentoCategoriaMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const [certResp, compResp, simResp, treinResp] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/relatorios/certificacoes-mes`),
        fetchWithAuth(`${API_BASE_URL}/relatorios/compliance-setor`),
        fetchWithAuth(`${API_BASE_URL}/relatorios/simuladores-uso`),
        fetchWithAuth(`${API_BASE_URL}/relatorios/treinamentos-categoria`),
      ]);

      const [certData, compData, simData, treinData] = (await Promise.all([
        certResp.json(),
        compResp.json(),
        simResp.json(),
        treinResp.json(),
      ])) as [
        RelatorioMetricEnvelope<CertificacaoMesMetric>,
        RelatorioMetricEnvelope<ComplianceSetorMetric>,
        RelatorioMetricEnvelope<SimuladorUsoMetric>,
        RelatorioMetricEnvelope<TreinamentoCategoriaMetric>,
      ];

      if (certData.success) setCertMes(certData.dados || []);
      if (compData.success) setComplianceSetor(compData.dados || []);
      if (simData.success) setSimUso(simData.dados || []);
      if (treinData.success) setTreinCat(treinData.dados || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportarCSV = () => {
    downloadRelatoriosDashboardCsv({ certMes, complianceSetor, simUso, treinCat });
  };

  const semDados =
    certMes.length === 0 &&
    complianceSetor.length === 0 &&
    simUso.length === 0 &&
    treinCat.length === 0;

  const statsCards = [
    {
      label: 'Cert./Mês (Média)',
      value:
        certMes.length > 0
          ? Math.round(certMes.reduce((a, b) => a + (b.total || 0), 0) / certMes.length)
          : 0,
      icon: <TrendingUp className="w-5 h-5 text-primary" />,
      iconBg: 'bg-primary/10',
      valueClass: 'text-primary',
    },
    {
      label: 'Compliance Médio',
      value:
        complianceSetor.length > 0
          ? Math.round(
              complianceSetor.reduce((a, b) => a + (b.taxa_compliance || 0), 0) /
                complianceSetor.length,
            ) + '%'
          : '0%',
      icon: <Users className="w-5 h-5 text-emerald-600" />,
      iconBg: 'bg-emerald-50',
      valueClass: 'text-emerald-600',
    },
    {
      label: 'Total Sessões',
      value: simUso.reduce((a, b) => a + (b.total_sessoes || 0), 0),
      icon: <Activity className="w-5 h-5 text-violet-600" />,
      iconBg: 'bg-violet-50',
      valueClass: 'text-violet-600',
    },
    {
      label: 'Treinamentos',
      value: treinCat.reduce((a, b) => a + (b.total || 0), 0),
      icon: <BookOpen className="w-5 h-5 text-orange-600" />,
      iconBg: 'bg-orange-50',
      valueClass: 'text-orange-600',
    },
  ];

  return (
    <AppLayout>
      <PageLayout
        title="Relatórios e Análises"
        subtitle="Relatórios de qualificações e métricas operacionais"
        action={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={exportarCSV}
            disabled={loading || semDados}
          >
            Exportar CSV
          </Button>
        }
      >
        <div className="space-y-6">
          <QualificationHistoryReportPanel />

          {loading ? (
            <RelatoriosLoadingSkeleton />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
                {statsCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
                  >
                    <div
                      className={`w-11 h-11 ${card.iconBg} rounded-full flex items-center justify-center mx-auto mb-3`}
                    >
                      {card.icon}
                    </div>
                    <p className="text-sm text-slate-500">{card.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${card.valueClass}`}>{card.value}</p>
                  </div>
                ))}
              </div>

              <Suspense
                fallback={
                  <div className="h-[640px] rounded-2xl border border-slate-200 bg-white animate-pulse" />
                }
              >
                <DashboardCharts
                  certMes={certMes}
                  complianceSetor={complianceSetor}
                  simUso={simUso}
                  treinCat={treinCat}
                />
              </Suspense>

              {semDados && (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
                  <BarChart3 className="w-14 h-14 mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-800 mb-1">
                    Sem dados disponíveis
                  </h3>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    Não há dados suficientes para gerar os painéis analíticos. O relatório de
                    histórico acima continua disponível conforme os registros autorizados ao
                    usuário.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </PageLayout>
    </AppLayout>
  );
}
