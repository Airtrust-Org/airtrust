import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

// Métricas customizadas
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // Ramp up para 20 usuários
    { duration: '1m', target: 20 }, // Manter 20 usuários
    { duration: '30s', target: 50 }, // Ramp up para 50
    { duration: '2m', target: 50 }, // Manter 50
    { duration: '30s', target: 100 }, // Ramp up para 100
    { duration: '2m', target: 100 }, // Manter 100
    { duration: '30s', target: 0 }, // Ramp down
  ],
  thresholds: {
    // 95% das requests devem ser < 500ms
    http_req_duration: ['p(95)<500'],

    // 99% das requests devem ser < 1000ms
    'http_req_duration{name:alertas}': ['p(99)<1000'],

    // Taxa de erro < 1%
    errors: ['rate<0.01'],

    // Taxa de sucesso > 99%
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'https://airtrust-api-production.airtrust.workers.dev';
const TOKEN = __ENV.API_TOKEN;

export default function () {
  const params = {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    tags: { name: 'default' },
  };

  // Grupo 1: Endpoints de Leitura
  group('Leitura - Alertas e Resumo', function () {
    // GET /alertas
    let res = http.get(
      `${BASE_URL}/api/qualificacoes/alertas`,
      Object.assign({}, params, { tags: { name: 'alertas' } }),
    );

    const alertasOk = check(res, {
      'alertas: status 200': (r) => r.status === 200,
      'alertas: response time < 500ms': (r) => r.timings.duration < 500,
      'alertas: tem campo data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data !== undefined;
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!alertasOk);

    sleep(0.5);

    // GET /alertas/resumo
    res = http.get(
      `${BASE_URL}/api/qualificacoes/alertas/resumo`,
      Object.assign({}, params, { tags: { name: 'resumo' } }),
    );

    const resumoOk = check(res, {
      'resumo: status 200': (r) => r.status === 200,
      'resumo: response time < 300ms': (r) => r.timings.duration < 300,
      'resumo: tem stats': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data && body.data.total !== undefined;
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!resumoOk);
  });

  sleep(1);

  // Grupo 2: Histórico
  group('Leitura - Histórico', function () {
    let res = http.get(
      `${BASE_URL}/api/qualificacoes/historico?limit=20`,
      Object.assign({}, params, { tags: { name: 'historico' } }),
    );

    const historicoOk = check(res, {
      'historico: status 200': (r) => r.status === 200,
      'historico: response time < 600ms': (r) => r.timings.duration < 600,
      'historico: tem array de dados': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!historicoOk);
  });

  sleep(1);

  // Grupo 3: Tipos de Qualificação
  group('Leitura - Tipos', function () {
    let res = http.get(
      `${BASE_URL}/api/qualificacoes/tipos`,
      Object.assign({}, params, { tags: { name: 'tipos' } }),
    );

    const tiposOk = check(res, {
      'tipos: status 200': (r) => r.status === 200,
      'tipos: response time < 400ms': (r) => r.timings.duration < 400,
      'tipos: tem vencimento_fim_mes': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data && body.data.length > 0 && body.data[0].vencimento_fim_mes !== undefined;
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!tiposOk);
  });

  sleep(2);

  // Grupo 4: Filtros (10% dos usuários)
  if (Math.random() < 0.1) {
    group('Filtros - Por Urgência', function () {
      const urgencias = ['critical', 'high', 'medium', 'low'];
      const urgencia = urgencias[Math.floor(Math.random() * urgencias.length)];

      let res = http.get(`${BASE_URL}/api/qualificacoes/alertas?urgencia=${urgencia}`, params);

      check(res, {
        'filtro urgência: status 200': (r) => r.status === 200,
        'filtro urgência: response time < 800ms': (r) => r.timings.duration < 800,
      });
    });
  }

  sleep(1);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';

  let output = '\n';
  output += indent + '=====================================\n';
  output += indent + '📊 RESUMO DO TESTE DE PERFORMANCE\n';
  output += indent + '=====================================\n\n';

  output += indent + `Duração total: ${(data.state.testRunDurationMs / 1000).toFixed(2)}s\n`;
  output += indent + `Requests: ${data.metrics.http_reqs.values.count}\n`;
  output += indent + `Requests/s: ${data.metrics.http_reqs.values.rate.toFixed(2)}\n\n`;

  output += indent + 'Response Times:\n';
  output += indent + `  Min: ${data.metrics.http_req_duration.values.min.toFixed(2)}ms\n`;
  output += indent + `  Avg: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
  output += indent + `  Med: ${data.metrics.http_req_duration.values.med.toFixed(2)}ms\n`;
  output += indent + `  P90: ${data.metrics.http_req_duration.values['p(90)'].toFixed(2)}ms\n`;
  output += indent + `  P95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  output += indent + `  P99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;
  output += indent + `  Max: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms\n\n`;

  const errorRate = ((data.metrics.errors?.values?.rate || 0) * 100).toFixed(2);
  const failRate = ((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2);

  output += indent + 'Errors:\n';
  output += indent + `  Error Rate: ${errorRate}%\n`;
  output += indent + `  Failed Requests: ${failRate}%\n\n`;

  // Thresholds
  output += indent + 'Thresholds:\n';
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    const status = threshold.ok ? '✓ PASS' : '✗ FAIL';
    output += indent + `  ${status} - ${name}\n`;
  }

  return output;
}
