const TAB_DEFINITIONS = [
  ['summary', 'Resumo'],
  ['planning', 'Planejamento'],
  ['met', 'MET'],
  ['rdv', 'Etapas / RDV'],
  ['fuel', 'Combustível'],
  ['dossier', 'Dossiê'],
  ['map', 'Mapa'],
  ['edb-shadow', 'eDB Shadow'],
  ['performance', 'Performance'],
];

function text(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function numberText(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) + suffix : '—';
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return text(value);
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function el(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.role) node.setAttribute('role', options.role);
  return node;
}

function appendKeyValueGrid(parent, entries) {
  const grid = el('div', { className: 'pilot-workspace-grid' });
  for (const [label, value] of entries) {
    const cell = el('div', { className: 'pilot-workspace-kv' });
    cell.append(
      el('span', { text: label }),
      el('strong', { text: text(value) }),
    );
    grid.append(cell);
  }
  parent.append(grid);
}

function appendNotice(parent, message, kind = 'info') {
  const notice = el('div', {
    className: 'pilot-workspace-notice ' + kind,
    text: message,
  });
  parent.append(notice);
  return notice;
}

function airportLabel(airport, fallback) {
  if (!airport) return text(fallback);
  const code = airport.codigo_icao || airport.codigo || airport.codigo_iata || fallback;
  return [code, airport.nome].filter(Boolean).join(' · ');
}

function routeLabel(packageData) {
  const stages = Array.isArray(packageData?.etapas) ? packageData.etapas : [];
  if (stages.length > 0) {
    const codes = [];
    for (const stage of stages) {
      if (stage.origem_icao && codes[codes.length - 1] !== stage.origem_icao) {
        codes.push(stage.origem_icao);
      }
      if (stage.destino_icao) codes.push(stage.destino_icao);
    }
    if (codes.length > 0) return codes.join(' → ');
  }
  return (
    airportLabel(packageData?.origem, packageData?.voo?.origem_id) +
    ' → ' +
    airportLabel(packageData?.destino, packageData?.voo?.destino_id)
  );
}

function renderHelideckSafety(parent, safety) {
  const section = el('section', { className: 'pilot-workspace-section' });
  section.append(el('h3', { text: 'Helideck Safety Check' }));

  if (!safety || safety.status !== 'AVAILABLE') {
    appendNotice(
      section,
      'Verificação de proximidade indisponível neste pacote: faltam coordenadas controladas do destino.',
      'attention',
    );
    parent.append(section);
    return;
  }

  appendKeyValueGrid(section, [
    ['Destino', safety.destination_code],
    ['Unidade', safety.destination_name],
    [
      'Coordenadas',
      safety.destination_coordinates
        ? Number(safety.destination_coordinates.latitude).toFixed(5) +
          ', ' +
          Number(safety.destination_coordinates.longitude).toFixed(5)
        : null,
    ],
  ]);

  const nearby = Array.isArray(safety.nearby) ? safety.nearby : [];
  if (nearby.length === 0) {
    appendNotice(
      section,
      'Nenhuma outra plataforma/helideck com coordenadas controladas foi encontrada no catálogo do tenant.',
      'ok',
    );
  } else {
    const heading = el('strong', { text: 'Unidades próximas ao destino' });
    heading.className = 'pilot-workspace-subheading';
    section.append(heading);
    const list = el('div', { className: 'pilot-workspace-list' });
    for (const item of nearby) {
      const card = el('div', { className: 'pilot-workspace-row-card' });
      card.append(
        el('strong', {
          text:
            text(item.code) +
            (item.name ? ' · ' + text(item.name) : ''),
        }),
        el('span', {
          text:
            numberText(item.distance_nm, ' NM') +
            ' · ' +
            text(item.operational_class),
        }),
      );
      list.append(card);
    }
    section.append(list);
  }

  appendNotice(
    section,
    text(
      safety.disclaimer,
      'Apoio à conferência de identificação. Não substitui procedimento operacional nem navegação certificada.',
    ),
    'attention',
  );
  parent.append(section);
}

function renderSummary(panel, packageData, workspace) {
  const voo = packageData.voo || {};
  const rdv = packageData.rdv || {};
  panel.append(el('h2', { text: 'Resumo operacional' }));
  appendKeyValueGrid(panel, [
    ['Aeronave', packageData.aeronave?.modelo || voo.prefixo],
    ['Matrícula / voo', voo.prefixo],
    ['Rota', routeLabel(packageData)],
    ['Status do voo', voo.status],
    ['RDV', rdv.numero],
    ['Fluxo RDV', rdv.workflow_status || rdv.status],
    ['Partida prevista', formatDateTime(voo.horario_previsto_partida)],
    ['Chegada prevista', formatDateTime(voo.horario_previsto_chegada)],
  ]);

  const met = workspace?.met_snapshot;
  const metAvailable = met?.status === 'AVAILABLE';
  appendNotice(
    panel,
    metAvailable
      ? 'MET armazenada no tablet. Consulte a aba MET para horário, idade e fonte de cada observação.'
      : 'MET não disponível neste pacote. O Pilot App não assume validade meteorológica sem evidência.',
    metAvailable ? 'ok' : 'attention',
  );

  renderHelideckSafety(panel, workspace?.helideck_safety);
}

function renderPlanning(panel, packageData, workspace) {
  const planning = workspace?.planning || {};
  panel.append(el('h2', { text: 'Planejamento' }));
  appendKeyValueGrid(panel, [
    ['Data', planning.data_programacao || packageData.voo?.data_programacao],
    ['Origem', airportLabel(packageData.origem, packageData.voo?.origem_id)],
    ['Destino', airportLabel(packageData.destino, packageData.voo?.destino_id)],
    ['Alternado', airportLabel(packageData.alternado, packageData.voo?.alternado_destino_id)],
    ['Aeronave', packageData.aeronave?.modelo],
    ['Tripulantes', planning.crew_count],
    ['Etapas', planning.stage_count],
    ['Versão do voo', planning.flight_version || packageData.voo?.versao],
  ]);

  const crew = Array.isArray(packageData.tripulantes) ? packageData.tripulantes : [];
  const section = el('section', { className: 'pilot-workspace-section' });
  section.append(el('h3', { text: 'Tripulação' }));
  if (crew.length === 0) {
    appendNotice(section, 'Nenhum tripulante no snapshot.', 'attention');
  } else {
    const list = el('div', { className: 'pilot-workspace-list' });
    for (const member of crew) {
      const card = el('div', { className: 'pilot-workspace-row-card' });
      card.append(
        el('strong', { text: text(member.nome, 'Funcionário #' + text(member.funcionario_id)) }),
        el('span', { text: text(member.funcao) }),
      );
      list.append(card);
    }
    section.append(list);
  }
  panel.append(section);

  if (planning.observacoes) {
    const obs = el('section', { className: 'pilot-workspace-section' });
    obs.append(el('h3', { text: 'Observações do planejamento' }));
    obs.append(el('p', { className: 'pilot-workspace-copy', text: text(planning.observacoes) }));
    panel.append(obs);
  }
}

function weatherUnavailableReason(reason) {
  const reasons = {
    LOCATION_CATALOG_UNAVAILABLE: 'catálogo operacional indisponível',
    REDEMET_NOT_CONFIGURED: 'fonte REDEMET não configurada no ambiente',
    NO_REDEMET_STATIONS: 'nenhuma estação REDEMET controlada para a rota',
    LOCATION_NOT_CATALOGUED: 'localidade não cadastrada no catálogo controlado',
    WEATHER_SOURCE_NOT_REDEMET: 'localidade não usa REDEMET como fonte',
    REDEMET_STATION_UNAVAILABLE: 'estação REDEMET não cadastrada',
    REDEMET_FETCH_FAILED: 'consulta REDEMET indisponível na preparação do pacote',
    SEM_OBSERVACAO_COMPATIVEL: 'sem observação compatível na janela consultada',
  };
  return reasons[reason] || text(reason, 'evidência indisponível');
}

function renderMet(panel, workspace) {
  panel.append(el('h2', { text: 'Meteorologia' }));
  appendNotice(
    panel,
    'MET armazenada no tablet é um snapshot. Disponibilidade offline não significa que a informação continua válida.',
    'attention',
  );

  const met = workspace?.met_snapshot;
  appendKeyValueGrid(panel, [
    ['Pacote MET gerado em', formatDateTime(met?.generated_at)],
    ['Estado', met?.status],
    ['Fonte', 'DECEA / REDEMET quando disponível'],
  ]);

  const observations = Array.isArray(met?.observations) ? met.observations : [];
  if (observations.length === 0) {
    appendNotice(panel, 'Nenhuma evidência meteorológica foi incluída neste pacote.', 'attention');
    return;
  }

  const list = el('div', { className: 'pilot-workspace-list' });
  for (const observation of observations) {
    const card = el('article', { className: 'pilot-workspace-met-card' });
    const header = el('div', { className: 'pilot-workspace-card-head' });
    header.append(
      el('strong', { text: text(observation.code) }),
      el('span', {
        className:
          'pilot-workspace-state ' +
          (observation.status === 'AVAILABLE' ? 'ok' : 'attention'),
        text: text(observation.quality || observation.status),
      }),
    );
    card.append(header);
    if (observation.status === 'AVAILABLE') {
      appendKeyValueGrid(card, [
        ['Estação', observation.station_icao],
        ['Observado em', formatDateTime(observation.observed_at_utc)],
        ['Idade no preparo', numberText(observation.age_minutes, ' min')],
        ['Temperatura', numberText(observation.temperature_c, ' °C')],
        ['Vento', numberText(observation.wind_speed_kt, ' kt')],
        ['UR derivada', numberText(observation.relative_humidity_pct, '%')],
      ]);
      const raw = el('p', {
        className: 'pilot-workspace-metar',
        text: text(observation.raw_metar),
      });
      card.append(raw);
    } else {
      appendNotice(
        card,
        'Indisponível: ' + weatherUnavailableReason(observation.reason),
        'attention',
      );
    }
    list.append(card);
  }
  panel.append(list);
}

function renderRdv(panel, packageData) {
  panel.append(el('h2', { text: 'Etapas / RDV' }));
  appendNotice(
    panel,
    'Esta aba consulta o snapshot cifrado do pacote. A edição offline permanece no rascunho operacional e a transmissão à Coordenação continua sendo uma ação separada.',
    'info',
  );

  const rdv = packageData.rdv || {};
  appendKeyValueGrid(panel, [
    ['Número RDV', rdv.numero],
    ['Status', rdv.status],
    ['Fluxo', rdv.workflow_status],
    ['POB', rdv.pob],
    ['Carga', rdv.carga_kg != null ? rdv.carga_kg + ' kg' : null],
    ['Versão', rdv.versao],
  ]);

  const stages = Array.isArray(packageData.etapas) ? packageData.etapas : [];
  const list = el('div', { className: 'pilot-workspace-list' });
  for (const stage of stages) {
    const card = el('article', { className: 'pilot-workspace-stage-card' });
    card.append(
      el('strong', {
        text:
          'Etapa ' +
          text(stage.numero_etapa) +
          ' · ' +
          text(stage.origem_icao) +
          ' → ' +
          text(stage.destino_icao),
      }),
    );
    appendKeyValueGrid(card, [
      ['Partida', formatDateTime(stage.horario_motor_ligado)],
      ['Decolagem', formatDateTime(stage.horario_decolagem)],
      ['Pouso', formatDateTime(stage.horario_pouso)],
      ['Corte', formatDateTime(stage.horario_motor_desligado)],
      ['PAX', stage.pax],
      ['Payload', stage.payload != null ? stage.payload + ' kg' : null],
      [
        'Combustível',
        numberText(stage.combustivel_inicio) +
          ' → ' +
          numberText(stage.combustivel_fim) +
          ' ' +
          text(stage.unidade_combustivel, ''),
      ],
    ]);
    list.append(card);
  }
  if (stages.length === 0) appendNotice(panel, 'Nenhuma etapa no snapshot.', 'attention');
  else panel.append(list);
}

function renderFuel(panel, packageData) {
  panel.append(el('h2', { text: 'Combustível' }));
  const stages = Array.isArray(packageData.etapas) ? packageData.etapas : [];
  const fuel = Array.isArray(packageData.abastecimentos) ? packageData.abastecimentos : [];

  const timeline = el('div', { className: 'pilot-fuel-timeline' });
  for (const stage of stages) {
    const card = el('article', { className: 'pilot-fuel-node' });
    card.append(
      el('strong', {
        text:
          'Etapa ' +
          text(stage.numero_etapa) +
          ' · ' +
          text(stage.origem_icao) +
          ' → ' +
          text(stage.destino_icao),
      }),
      el('span', {
        text:
          'Início ' +
          numberText(stage.combustivel_inicio) +
          ' → Final ' +
          numberText(stage.combustivel_fim) +
          ' ' +
          text(stage.unidade_combustivel, ''),
      }),
    );
    const start = Number(stage.combustivel_inicio);
    const end = Number(stage.combustivel_fim);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      card.append(
        el('span', {
          className: 'muted',
          text: 'Diferença início–final: ' + numberText(start - end) + ' ' + text(stage.unidade_combustivel, ''),
        }),
      );
    }
    timeline.append(card);

    for (const entry of fuel.filter((item) => Number(item.etapa_id) === Number(stage.id))) {
      const refuel = el('article', { className: 'pilot-fuel-node refuel' });
      refuel.append(
        el('strong', { text: 'Abastecimento · ' + text(entry.localidade) }),
        el('span', {
          text:
            numberText(entry.combustivel_abastecido) +
            ' ' +
            text(entry.unidade, '') +
            ' · ' +
            text(entry.fornecedor, 'fornecedor não informado'),
        }),
      );
      if (entry.tem_anexo) {
        refuel.append(
          el('span', {
            className: 'muted',
            text: 'Comprovante vinculado; o conteúdo do anexo ainda não está incluído offline.',
          }),
        );
      }
      timeline.append(refuel);
    }
  }

  const unbound = fuel.filter(
    (entry) => !stages.some((stage) => Number(stage.id) === Number(entry.etapa_id)),
  );
  for (const entry of unbound) {
    const refuel = el('article', { className: 'pilot-fuel-node refuel' });
    refuel.append(
      el('strong', { text: 'Abastecimento · ' + text(entry.localidade) }),
      el('span', {
        text:
          numberText(entry.combustivel_abastecido) +
          ' ' +
          text(entry.unidade, '') +
          ' · ' +
          text(entry.fornecedor, 'fornecedor não informado'),
      }),
    );
    timeline.append(refuel);
  }

  if (timeline.childElementCount === 0) {
    appendNotice(panel, 'Sem etapas ou abastecimentos no snapshot.', 'attention');
  } else {
    panel.append(timeline);
  }
}

function renderDossier(panel, workspace) {
  panel.append(el('h2', { text: 'Dossiê Digital do Voo' }));
  appendNotice(
    panel,
    'Documentos críticos só são considerados disponíveis offline quando o próprio pacote declara essa disponibilidade. Links web isolados não contam como disponibilidade offline.',
    'info',
  );
  const entries = Array.isArray(workspace?.dossier?.entries)
    ? workspace.dossier.entries
    : [];
  if (entries.length === 0) {
    appendNotice(panel, 'Nenhum item de dossiê neste pacote.', 'attention');
    return;
  }
  const list = el('div', { className: 'pilot-workspace-list' });
  for (const entry of entries) {
    const card = el('article', { className: 'pilot-workspace-row-card dossier' });
    const top = el('div', { className: 'pilot-workspace-card-head' });
    top.append(
      el('strong', { text: text(entry.name) }),
      el('span', {
        className:
          'pilot-workspace-state ' +
          (entry.available_offline ? 'ok' : 'attention'),
        text: entry.available_offline ? 'Offline: sim' : 'Offline: não',
      }),
    );
    card.append(top);
    appendKeyValueGrid(card, [
      ['Categoria', entry.category],
      ['Fonte', entry.source],
      ['Atualizado em', formatDateTime(entry.updated_at)],
      ['Integridade', entry.integrity_state],
      ['Versão', entry.version],
    ]);
    if (entry.attachment_count > 0 && entry.attachment_payloads_offline === false) {
      appendNotice(
        card,
        entry.attachment_count +
          ' anexo(s) vinculado(s); somente metadados estão neste pacote.',
        'attention',
      );
    }
    list.append(card);
  }
  panel.append(list);
}

function svgElement(name, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function renderRouteSchematic(parent, route) {
  const legs = Array.isArray(route?.legs) ? route.legs : [];
  if (legs.length === 0) {
    appendNotice(parent, 'Sem pernas para renderizar o esquema de rota.', 'attention');
    return;
  }

  const svg = svgElement('svg', {
    viewBox: '0 0 800 250',
    role: 'img',
    'aria-label': 'Esquema vetorial das pernas do voo',
    class: 'pilot-route-svg',
  });
  const y = 110;
  const margin = 70;
  const step = legs.length > 0 ? (800 - margin * 2) / legs.length : 0;

  legs.forEach((leg, index) => {
    const x1 = margin + step * index;
    const x2 = margin + step * (index + 1);
    svg.append(
      svgElement('line', {
        x1,
        y1: y,
        x2,
        y2: y,
        class: 'pilot-route-line',
      }),
      svgElement('circle', {
        cx: x1,
        cy: y,
        r: 9,
        class: 'pilot-route-point',
      }),
    );
    const from = svgElement('text', {
      x: x1,
      y: y - 24,
      'text-anchor': 'middle',
      class: 'pilot-route-label',
    });
    from.textContent = text(leg.from);
    svg.append(from);

    const distance = svgElement('text', {
      x: (x1 + x2) / 2,
      y: y + 32,
      'text-anchor': 'middle',
      class: 'pilot-route-distance',
    });
    distance.textContent =
      leg.distance_nm == null ? 'distância indisponível' : numberText(leg.distance_nm, ' NM');
    svg.append(distance);

    if (index === legs.length - 1) {
      svg.append(
        svgElement('circle', {
          cx: x2,
          cy: y,
          r: 9,
          class: 'pilot-route-point',
        }),
      );
      const to = svgElement('text', {
        x: x2,
        y: y - 24,
        'text-anchor': 'middle',
        class: 'pilot-route-label',
      });
      to.textContent = text(leg.to);
      svg.append(to);
    }
  });

  parent.append(svg);
}

function renderMap(panel, workspace) {
  panel.append(el('h2', { text: 'Mapa / Route Schematic' }));
  appendNotice(
    panel,
    text(
      workspace?.route_schematic?.disclaimer,
      'Esquema de rota para consciência situacional. Não substitui navegação ou aviônicos certificados.',
    ),
    'attention',
  );
  renderRouteSchematic(panel, workspace?.route_schematic);

  const legs = Array.isArray(workspace?.route_schematic?.legs)
    ? workspace.route_schematic.legs
    : [];
  const list = el('div', { className: 'pilot-workspace-list compact' });
  for (const leg of legs) {
    const card = el('div', { className: 'pilot-workspace-row-card' });
    card.append(
      el('strong', {
        text:
          'Perna ' +
          text(leg.sequence) +
          ' · ' +
          text(leg.from) +
          ' → ' +
          text(leg.to),
      }),
      el('span', {
        text:
          (leg.distance_nm == null ? 'Distância indisponível' : numberText(leg.distance_nm, ' NM')) +
          ' · qualidade ' +
          text(leg.data_quality),
      }),
    );
    list.append(card);
  }
  panel.append(list);
  renderHelideckSafety(panel, workspace?.helideck_safety);
}

function renderEdbShadow(panel, packageData) {
  panel.append(el('h2', { text: 'eDB Shadow' }));
  const shadow = packageData?.edb_shadow;
  const contract = shadow?.contract;

  const validContract =
    contract?.name === 'airtrust-pilot-edb-shadow' &&
    Number(contract?.version) === 1 &&
    contract?.classification === 'NON_OFFICIAL_SHADOW' &&
    contract?.official_logbook === false &&
    contract?.replaces_paper === false &&
    contract?.contains_signature === false &&
    contract?.persists_regulated_record === false &&
    contract?.authorizes_return_to_service === false;

  if (!validContract) {
    appendNotice(
      panel,
      'Contrato eDB shadow ausente ou incompatível. Nenhuma informação eDB é considerada válida neste pacote.',
      'error',
    );
    return;
  }

  const banner = el('div', {
    className: 'pilot-edb-shadow-banner',
    text: 'NÃO OFICIAL — eDB SHADOW — SEM VALOR REGULATÓRIO',
  });
  panel.append(banner);
  appendNotice(
    panel,
    'Esta projeção serve somente para detectar lacunas e divergências. Não é Diário de Bordo oficial, não substitui papel, não contém assinatura e não autoriza retorno ao serviço.',
    'attention',
  );

  if (shadow.state === 'UNAVAILABLE') {
    appendNotice(
      panel,
      'Projeção shadow indisponível neste pacote: ' + text(shadow.reason),
      'attention',
    );
    return;
  }
  if (shadow.state === 'AVAILABLE_PARTIAL') {
    appendNotice(
      panel,
      'O rascunho shadow foi armazenado, mas o assessment de prontidão não ficou disponível. Não inferir prontidão.',
      'attention',
    );
  }

  const assessment = shadow.assessment;
  const readiness = assessment?.readiness;
  appendKeyValueGrid(panel, [
    ['Estado do snapshot', shadow.state],
    ['Gerado em', formatDateTime(shadow.generated_at)],
    ['Status do rascunho', shadow.preview?.status],
    ['Readiness shadow', readiness?.status],
    ['Score técnico', readiness?.score],
    ['Completude', readiness?.completenessPercent != null ? readiness.completenessPercent + '%' : null],
    ['Concordância de campos', readiness?.fieldAgreementPercent != null ? readiness.fieldAgreementPercent + '%' : null],
    ['Maior severidade', assessment?.max_severity],
    ['Recomendação', assessment?.recommendation],
  ]);

  if (assessment) {
    appendNotice(
      panel,
      assessment.official_reference_compared === false &&
        assessment.paper_reference_required === true
        ? 'A referência oficial em papel NÃO foi comparada. A comparação com o procedimento oficial continua obrigatória.'
        : 'Estado da comparação oficial não comprovado.',
      'attention',
    );
  }

  const technicalStatus = assessment?.technical_status;
  if (technicalStatus) {
    const technical = el('section', { className: 'pilot-workspace-section' });
    technical.append(el('h3', { text: 'Situação técnica shadow' }));
    appendKeyValueGrid(technical, [
      ['Estado', technicalStatus.status],
      ['Fonte disponível', technicalStatus.sourceAvailable === true ? 'Sim' : 'Não'],
      ['Efeito oficial', technicalStatus.officialEffect],
    ]);
    appendNotice(
      technical,
      'A situação técnica nesta projeção possui efeito oficial NONE.',
      'attention',
    );
    panel.append(technical);
  }

  const draft = shadow.preview?.draft;
  if (draft && typeof draft === 'object') {
    const draftSection = el('section', { className: 'pilot-workspace-section' });
    draftSection.append(el('h3', { text: 'Rascunho projetado' }));
    appendKeyValueGrid(draftSection, [
      ['Contrato', draft.schemaVersion],
      ['Referência do voo', draft.sourceFlightReference],
      ['Etapas projetadas', Array.isArray(draft.legs) ? draft.legs.length : null],
      ['Volume', draft.volumeNumber],
      ['Matrícula', draft.aircraft?.registration],
      ['Modelo', draft.aircraft?.model],
    ]);
    panel.append(draftSection);
  }

  const findings = Array.isArray(shadow.preview?.findings)
    ? shadow.preview.findings
    : [];
  const findingSection = el('section', { className: 'pilot-workspace-section' });
  findingSection.append(el('h3', { text: 'Lacunas / divergências shadow' }));
  if (findings.length === 0) {
    appendNotice(
      findingSection,
      'Nenhum finding sanitizado neste snapshot. Isso não equivale a conformidade regulatória.',
      'ok',
    );
  } else {
    const list = el('div', { className: 'pilot-workspace-list' });
    for (const finding of findings) {
      const card = el('div', { className: 'pilot-workspace-row-card' });
      card.append(
        el('strong', { text: text(finding.code) }),
        el('span', { text: text(finding.path) }),
      );
      list.append(card);
    }
    findingSection.append(list);
  }
  panel.append(findingSection);
}

function renderPerformance(panel, packageData) {
  panel.append(el('h2', { text: 'Performance' }));
  appendNotice(
    panel,
    'Não disponível nesta entrega. Performance, peso/CG e Power Check só serão habilitados por modelo após existir fonte técnica versionada e evidência rastreável.',
    'attention',
  );
  appendKeyValueGrid(panel, [
    ['Modelo', packageData.aeronave?.modelo],
    ['Estado', 'Aguardando fonte técnica versionada'],
    ['Cálculo automático', 'Desabilitado'],
  ]);
}

function renderPanel(panel, tabId, packageData, workspace) {
  if (tabId === 'summary') return renderSummary(panel, packageData, workspace);
  if (tabId === 'planning') return renderPlanning(panel, packageData, workspace);
  if (tabId === 'met') return renderMet(panel, workspace);
  if (tabId === 'rdv') return renderRdv(panel, packageData);
  if (tabId === 'fuel') return renderFuel(panel, packageData);
  if (tabId === 'dossier') return renderDossier(panel, workspace);
  if (tabId === 'map') return renderMap(panel, workspace);
  if (tabId === 'edb-shadow') return renderEdbShadow(panel, packageData);
  if (tabId === 'performance') return renderPerformance(panel, packageData);
}

export function renderPilotWorkspace(container, packageData) {
  container.replaceChildren();
  const workspace = packageData?.workspace;
  const header = el('div', { className: 'pilot-workspace-header' });
  header.append(
    el('div', { className: 'pilot-workspace-eyebrow', text: 'UM VOO = UM WORKSPACE OPERACIONAL' }),
    el('strong', { text: routeLabel(packageData) }),
  );
  container.append(header);

  if (!workspace || workspace?.contract?.name !== 'airtrust-pilot-workspace') {
    appendNotice(
      container,
      'Este pacote foi criado por uma versão anterior do Pilot App. Atualize o pacote online para receber o workspace integrado.',
      'attention',
    );
    return;
  }

  const tabList = el('div', { className: 'pilot-workspace-tabs', role: 'tablist' });
  tabList.setAttribute('aria-label', 'Áreas do voo');
  const panels = new Map();
  const buttons = [];

  function activate(tabId, focus = false) {
    for (const button of buttons) {
      const selected = button.dataset.tabId === tabId;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
      button.classList.toggle('active', selected);
      if (selected && focus) button.focus();
    }
    for (const [id, panel] of panels) {
      panel.hidden = id !== tabId;
    }
  }

  const visibleTabs =
    packageData?.edb_shadow?.state && packageData.edb_shadow.state !== 'DISABLED'
      ? TAB_DEFINITIONS
      : TAB_DEFINITIONS.filter(([tabId]) => tabId !== 'edb-shadow');

  visibleTabs.forEach(([tabId, label], index) => {
    const button = el('button', {
      className: 'pilot-workspace-tab',
      text: label,
      role: 'tab',
    });
    button.type = 'button';
    button.dataset.tabId = tabId;
    button.id = 'pilot-tab-' + tabId;
    button.setAttribute('aria-controls', 'pilot-panel-' + tabId);
    button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    button.tabIndex = index === 0 ? 0 : -1;
    button.addEventListener('click', () => activate(tabId));
    tabList.append(button);
    buttons.push(button);

    const panel = el('div', { className: 'pilot-workspace-panel', role: 'tabpanel' });
    panel.id = 'pilot-panel-' + tabId;
    panel.setAttribute('aria-labelledby', button.id);
    panel.hidden = index !== 0;
    renderPanel(panel, tabId, packageData, workspace);
    panels.set(tabId, panel);
  });

  tabList.addEventListener('keydown', (event) => {
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    activate(buttons[next].dataset.tabId, true);
  });

  container.append(tabList, ...panels.values());
  activate('summary');
}
