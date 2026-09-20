import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const pilotIndex = read('public/pilot/index.html');
const pilotManifest = JSON.parse(read('public/pilot/pilot.webmanifest')) as {
  id: string;
  start_url: string;
  scope: string;
  display: string;
};
const pilotApp = read('public/pilot/pilot-app.js');
const pilotBootstrap = read('public/pilot/pilot-bootstrap.js');
const pilotWorkspace = read('public/pilot/pilot-workspace.js');
const pilotVault = read('public/pilot/pilot-vault.js');
const pilotRdvDraft = read('public/pilot/pilot-rdv-draft.js');
const pilotSync = read('public/pilot/pilot-sync.js');
const pilotLease = read('public/pilot/pilot-lease.js');
const pilotLeaseTrust = read('public/pilot/pilot-lease-trust.js');
const pilotSw = read('public/pilot/pilot-sw.js');
const swManager = read('src/lib/sw-manager.tsx');
const killSwitch = read('public/sw.js');
const rootIndex = read('index.html');

describe('Pilot Offline shell', () => {
  it('mantem os scripts estaticos do Pilot App sintaticamente validos como ESM moderno', () => {
    const assertParses = (source: string) => {
      const result = ts.transpileModule(source, {
        compilerOptions: {
          allowJs: true,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
        reportDiagnostics: true,
      });
      const errors = (result.diagnostics ?? [])
        .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      expect(errors).toEqual([]);
    };

    assertParses(pilotApp);
    assertParses(pilotBootstrap);
    assertParses(pilotWorkspace);
    assertParses(pilotVault);
    assertParses(pilotRdvDraft);
    assertParses(pilotSync);
    assertParses(pilotLease);
    assertParses(pilotLeaseTrust);
    assertParses(pilotSw);
  });

  it('mantem o app instalavel estritamente no escopo /pilot/ e oferece retorno ao AirTrust', () => {
    expect(pilotManifest.id).toBe('/pilot/');
    expect(pilotManifest.start_url).toBe('/pilot/');
    expect(pilotManifest.scope).toBe('/pilot/');
    expect(pilotManifest.display).toBe('standalone');
    expect(pilotIndex).toContain('href="/pilot/pilot.webmanifest"');
    expect(pilotIndex).toContain('href="/controle-voos/meus-voos"');
    expect(pilotIndex).toContain('Voltar ao AirTrust');
    expect(pilotIndex).toContain('src="/pilot/pilot-bootstrap.js"');
    expect(pilotApp).toContain("scope: '/pilot/'");
    expect(pilotApp).toContain("register('/pilot/pilot-sw.js'");
  });

  it('inicia sem top-level await e mantém duas colunas no tablet', () => {
    expect(pilotApp).toContain('async function bootstrapPilotApp()');
    expect(pilotApp).toContain('void bootstrapPilotApp();');
    expect(pilotApp).not.toContain("\ntry {\n  await registerPilotServiceWorker();");
    expect(pilotIndex).toContain('font-size: 17px');
    expect(pilotIndex).toContain('@media (max-width: 620px)');
    expect(pilotIndex).toContain('grid-template-columns: repeat(2, minmax(0,1fr))');
  });

  it('usa IndexedDB cifrado em vez de sessionStorage/localStorage para dados operacionais', () => {
    expect(pilotVault).toContain("const DB_NAME = 'airtrust-pilot-v1'");
    expect(pilotVault).toContain("'rdv_drafts'");
    expect(pilotVault).toContain("'flight_packages'");
    expect(pilotVault).toContain("'offline_leases'");
    expect(pilotVault).toContain("'stage_drafts'");
    expect(pilotVault).toContain("'outbox'");
    expect(pilotVault).toContain("'sync_receipts'");
    expect(pilotVault).toContain("'workflow_receipts'");
    expect(pilotVault).toContain("'conflicts'");
    expect(pilotVault).toContain('async putJsonBatch(entries)');
    expect(pilotVault).toContain('async getOrCreateDeviceId()');
    expect(pilotVault).toContain('async deleteJson(storeName, id)');
    expect(pilotVault).toContain("key_protection: 'NON_EXTRACTABLE_DEVICE_CRYPTOKEY'");
    expect(pilotVault).toContain('async openAutomatically()');
    expect(pilotVault).toContain("name: 'AES-GCM'");
    expect(pilotVault).toContain('false,');
    expect(pilotVault).toContain('crypto.subtle.encrypt');
    expect(pilotVault).toContain('crypto.subtle.decrypt');
    expect(pilotVault).not.toContain('localStorage');
    expect(pilotVault).not.toContain('sessionStorage');
  });

  it('so declara Salvo no tablet depois da persistencia local concluir', () => {
    const putIndex = pilotApp.indexOf('await vault.putJson(');
    const savedIndex = pilotApp.indexOf("saveStatus.textContent = 'Salvo no tablet.'");
    expect(putIndex).toBeGreaterThan(-1);
    expect(savedIndex).toBeGreaterThan(putIndex);
  });

  it('precacheia o shell e usa fallback offline apenas para navegacao /pilot/', () => {
    expect(pilotSw).toContain("const PILOT_CACHE_VERSION = 'airtrust-pilot-shell-v26'");
    expect(pilotSw).not.toContain("'/pilot/index.html'");
    expect(pilotSw).toContain("'/pilot/pilot-bootstrap.js'");
    expect(pilotSw).toContain("'/pilot/pilot-workspace.js'");
    expect(pilotSw).toContain("'/pilot/pilot-rdv-draft.js'");
    expect(pilotSw).toContain("'/pilot/pilot-sync.js'");
    expect(pilotSw).toContain("'/pilot/pilot-lease.js'");
    expect(pilotSw).toContain("'/pilot/pilot-lease-trust.js'");
    expect(pilotSw).toContain('url.pathname.startsWith(PILOT_SCOPE_PATH)');
    expect(pilotSw).toContain('caches.match(PILOT_SCOPE_PATH)');
    expect(pilotSw).toContain("fetch(PILOT_SCOPE_PATH, { cache: 'no-store', redirect: 'error' })");
    expect(pilotSw).toContain("if (cached) return cached;");
    expect(pilotSw).toContain("if (url.pathname.startsWith('/api/')) return;");
    expect(pilotSw).toContain("fetch(request, { cache: 'no-store' })");
  });

  it('recupera shell antigo sem deixar a tela presa em Verificando conexao', () => {
    expect(pilotBootstrap).toContain("airtrust_pilot_shell_recovery_v17");
    expect(pilotBootstrap).toContain("registration.update()");
    expect(pilotBootstrap).toContain("name.startsWith(PILOT_CACHE_PREFIX)");
    expect(pilotBootstrap).toContain('window.location.reload()');
    expect(pilotBootstrap).toContain("window.setTimeout(() => void recoverStaleShell(), 8000)");
    expect(pilotApp).toContain("window.__AIRTRUST_PILOT_APP_READY__ = true");
    expect(pilotApp).toContain("window.dispatchEvent(new Event('airtrust:pilot-app-ready'))");
    expect(pilotApp).toContain('Não foi possível iniciar o Pilot App:');
  });

  it('o cleanup legado preserva Service Worker e caches do Pilot App', () => {
    expect(swManager).toContain("const PILOT_SW_SCOPE_PATH = '/pilot/'");
    expect(swManager).toContain("const PILOT_CACHE_PREFIX = 'airtrust-pilot-'");
    expect(swManager).toContain('!isPilotServiceWorkerRegistration(registration)');
    expect(killSwitch).toContain("const PILOT_CACHE_PREFIX = 'airtrust-pilot-'");
    expect(killSwitch).toContain('!cacheName.startsWith(PILOT_CACHE_PREFIX)');
    expect(rootIndex).toContain("!name.startsWith('airtrust-pilot-')");
    expect(rootIndex).toContain("!new URL(registration.scope).pathname.startsWith('/pilot/')");
  });

  it('baixa pacote real autorizado sem transformar token em dado offline', () => {
    expect(pilotApp).toContain("'/controle-voos/voos/meus'");
    expect(pilotApp).toContain("'/offline-package'");
    expect(pilotApp).toContain("const PRODUCTION_API_BASE_URL = 'https://api.airtrust.online/api'");
    expect(pilotApp).toContain(
      "const STAGING_API_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev/api'",
    );
    expect(pilotApp).toContain('const API_BASE_URL = resolvePilotApiBase()');
    expect(pilotApp).toContain("'airtrust_token'");
    expect(pilotApp).toContain("Authorization: 'Bearer ' + accessToken");
    expect(pilotApp).toContain("'/auth/refresh'");
    expect(pilotApp).toContain("'airtrust_refresh_token'");
    expect(pilotApp).toContain('containsForbiddenPackageKey(packageData)');
    expect(pilotApp).toContain("await vault.putJson(\n      'flight_packages'");
    expect(pilotVault).toContain('async listJson(storeName)');
  });

  it('so confirma consulta offline depois do write cifrado e do read-back', () => {
    const writeIndex = pilotApp.indexOf("await vault.putJson(\n      'flight_packages'");
    const readBackIndex = pilotApp.indexOf(
      "const persisted = await vault.getJson('flight_packages', recordId)",
      writeIndex,
    );
    const readyIndex = pilotApp.indexOf('Voo preparado neste tablet.', readBackIndex);

    expect(writeIndex).toBeGreaterThan(-1);
    expect(readBackIndex).toBeGreaterThan(writeIndex);
    expect(readyIndex).toBeGreaterThan(readBackIndex);

    const writeSnippet = pilotApp.slice(writeIndex, readBackIndex);
    expect(writeSnippet).not.toMatch(/airtrust_token|refresh_token|Authorization/);
  });

  it('mantem o pacote-base read-only e separa rascunho local de sincronizacao', () => {
    expect(pilotIndex).toContain('Salvamento automático');
    expect(pilotIndex).toContain('Detalhes de sincronização');
    expect(pilotApp).toContain('contract?.read_only !== true');
    expect(pilotApp).toContain("typeof contract?.sync_supported !== 'boolean'");
    expect(pilotApp).toContain('contract?.regulated_edb !== false');
    expect(pilotIndex).toContain('Não sincronizado');
    expect(pilotIndex).toContain('technical-only');
  });

  it('expõe o voo como workspace integrado sem blocos MET ou performance desnecessários', () => {
    expect(pilotIndex).toContain('id="pilot-workspace-view"');
    expect(pilotApp).toContain('renderPilotWorkspace');
    expect(pilotWorkspace).toContain("['summary', 'Resumo']");
    expect(pilotWorkspace).toContain("['planning', 'Planejamento']");
    expect(pilotWorkspace).toContain("['fuel', 'Combustível']");
    expect(pilotWorkspace).toContain("['dossier', 'Dossiê']");
    expect(pilotWorkspace).toContain("['map', 'Mapa']");
    expect(pilotWorkspace).toContain("['edb-shadow', 'eDB Shadow']");
    expect(pilotWorkspace).not.toContain("['met', 'MET']");
    expect(pilotWorkspace).not.toContain("['performance', 'Performance']");
    expect(pilotWorkspace).not.toContain('Temperatura');
    expect(pilotWorkspace).not.toContain('raw_metar');
    expect(pilotWorkspace).toContain('NÃO OFICIAL — eDB SHADOW — SEM VALOR REGULATÓRIO');
    expect(pilotWorkspace).toContain('não contém assinatura');
    expect(pilotWorkspace).toContain("tabId !== 'edb-shadow'");
    expect(pilotWorkspace).toContain('Não substitui navegação ou aviônicos certificados');
    expect(pilotWorkspace).not.toMatch(/tile\.openstreetmap|mapbox|googleapis.*maps/i);
  });

  it('mantem a edicao offline fail-closed ate haver lease assinado e chave publica confiavel', () => {
    expect(pilotLeaseTrust).toContain('TRUSTED_PILOT_LEASE_KEYS = Object.freeze([');
    expect(pilotLeaseTrust).toContain("candidate.includes('*')");
    expect(pilotLeaseTrust).toContain('entry.origins');
    expect(pilotLease).toContain('isTrustedPilotLeaseKeyForOrigin');
    expect(pilotLease).toContain('resolveCurrentOrigin');
    expect(pilotLease).toContain('globalThis.location?.origin');
    expect(pilotLease).not.toContain('options?.origin');
    expect(pilotLease).toContain("envelope.alg !== 'ES256'");
    expect(pilotLease).toContain('crypto.subtle.verify');
    expect(pilotLease).toContain("claims.purpose !== 'offline_flight_lease'");
    expect(pilotLease).toContain('claims.device_id');
    expect(pilotRdvDraft).toContain('assertVerifiedLeaseAllowsDraft');
    expect(pilotApp).toContain('hasTrustedPilotLeaseKeys()');
    expect(pilotApp).toContain('verifyPilotOfflineLease');
    expect(pilotApp).toContain("'/offline-lease'");
  });

  it('salva RDV e etapas atomicamente e faz read-back antes de confirmar persistencia', () => {
    expect(pilotVault).toContain("this.database.transaction(storeNames, 'readwrite')");
    const batchIndex = pilotApp.indexOf('await vault.putJsonBatch(buildOperationalSaveEntries');
    const readRdvIndex = pilotApp.indexOf("await vault.getJson(\n        'rdv_drafts'", batchIndex);
    const readyIndex = pilotApp.indexOf(
      "rdvEditorSaveStatus.textContent = 'Salvo no tablet.'",
      readRdvIndex,
    );
    expect(batchIndex).toBeGreaterThan(-1);
    expect(readRdvIndex).toBeGreaterThan(batchIndex);
    expect(readyIndex).toBeGreaterThan(readRdvIndex);
  });

  it('aceita capability de sync booleana sem promover o pacote a eDB regulatorio', () => {
    expect(pilotApp).toContain("typeof contract?.sync_supported !== 'boolean'");
    expect(pilotApp).toContain('contract?.regulated_edb !== false');
    expect(pilotApp).toContain('contract?.sync_supported !== true');
  });

  it('bloqueia refresh silencioso com gravacao operacional pendente e mantem sync fail-closed', () => {
    expect(pilotApp).toContain("window.addEventListener('beforeunload'");
    expect(pilotApp).toContain('operationalNextSequence !== operationalLocalSequence');
    expect(pilotApp).toContain("event.returnValue = ''");
    expect(pilotApp).toContain('contract?.sync_supported !== true');
    expect(pilotApp).toContain('Sincronização ainda não foi habilitada para este pacote de voo.');
  });

  it('separa persistencia local de transmissao e exige receipt antes de remover a outbox', () => {
    expect(pilotIndex).toContain('id="sync-rdv-now"');
    expect(pilotIndex).toContain('Enviar informações do voo');
    expect(pilotApp).toContain("await vault.putJson(\n        'outbox'");
    expect(pilotApp).toMatch(/await vault\.getJson\(\s*'sync_receipts'/);
    const persistResultIndex = pilotApp.indexOf('async function persistFinalSyncResult');
    const receiptIndex = pilotApp.indexOf("'sync_receipts'", persistResultIndex);
    const deleteIndex = pilotApp.indexOf("await vault.deleteJson('outbox'", receiptIndex);
    expect(receiptIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(receiptIndex);
  });

  it('gera comando de sync deterministico sem incluir bearer e sem derivar ciclos', () => {
    expect(pilotSync).toContain('command_type: PILOT_SYNC_COMMAND_TYPE');
    expect(pilotSync).toContain('entity_type: PILOT_SYNC_ENTITY_TYPE');
    expect(pilotSync).toContain('operation_type: PILOT_SYNC_OPERATION_TYPE');
    expect(pilotSync).toContain('payload_hash');
    expect(pilotSync).toContain('canonicalJson(getSyncHashMaterial(command))');
    expect(pilotSync).toContain('ciclos: parseInteger(form.ciclos)');
    expect(pilotSync).not.toContain('Authorization');
    expect(pilotSync).not.toContain('airtrust_token');
  });

  it('mantem o voo travado offline ao perder ou recuperar sinal e so sincroniza por acao explicita', () => {
    expect(pilotVault).toContain("'active_sessions'");
    expect(pilotApp).toContain('offlineFlightLocked');
    expect(pilotApp).toContain('Modo voo offline mantido. O sinal voltou, mas nenhuma conexão automática será feita.');
    const onlineHandler = pilotApp.slice(
      pilotApp.indexOf("window.addEventListener('online'"),
      pilotApp.indexOf("window.addEventListener('offline'"),
    );
    expect(onlineHandler.indexOf('if (offlineFlightLocked)')).toBeGreaterThan(-1);
    expect(onlineHandler.indexOf('return;', onlineHandler.indexOf('if (offlineFlightLocked)'))).toBeLessThan(
      onlineHandler.indexOf('void loadOnlineFlights()'),
    );
    expect(onlineHandler.indexOf('return;', onlineHandler.indexOf('if (offlineFlightLocked)'))).toBeLessThan(
      onlineHandler.indexOf('void drainPilotOutbox()'),
    );
    expect(pilotApp).toContain("{ allowDuringFlight: true }");
    expect(pilotApp).toContain("result.status === 'conflict'");
    expect(pilotApp).not.toContain('last-write-wins');
  });

  it('mantem sync, finalizacao e envio a Coordenacao como acoes explicitamente separadas', () => {
    expect(pilotIndex).toContain('id="refresh-canonical-package"');
    expect(pilotIndex).toContain('id="finalize-rdv-server"');
    expect(pilotIndex).toContain('id="send-rdv-coordination"');
    expect(pilotIndex).toContain('Finalizar e encaminhar à Coordenação');
    expect(pilotIndex).toContain('Enviar à Coordenação');
    expect(pilotApp).toContain("'/controle-voos/pilot/offline-sync'");
    expect(pilotApp).toContain("'/rdv/finalizar-preenchimento'");
    expect(pilotApp).toContain("'/rdv/enviar'");
    expect(pilotApp).toContain("'/rdv/alertas'");
    expect(pilotApp).toContain("alert?.severidade === 'IMPEDE_ENVIO'");
    expect(pilotApp).toContain("rdv.status === 'preenchimento_finalizado'");
    expect(pilotApp).toContain("rdv.workflow_status === 'enviado'");
    expect(pilotApp).toContain("const editableWorkflow = ['rascunho', 'devolvido'].includes");
    expect(pilotApp).not.toContain("['rascunho', 'devolvido', 'reaberto'].includes");
  });

  it('persiste receipt de workflow cifrado e exige reconciliacao do ultimo sync antes de finalizar', () => {
    expect(pilotVault).toContain("'workflow_receipts'");
    expect(pilotApp).toContain("await vault.putJson(\n    'workflow_receipts'");
    expect(pilotApp).toContain('packageMatchesAcceptedSync');
    expect(pilotApp).toContain('server_entity_version');
    expect(pilotApp).toContain(
      'Atualize o pacote após o último receipt de transmissão antes de finalizar.',
    );
    expect(pilotApp).toContain('Recebimento confirmado pelo servidor');
  });

  it('captura quick actions de horario com sequencia monotona sem inferir ciclos', () => {
    expect(pilotApp).toContain("['PARTIDA', 'horario_motor_ligado']");
    expect(pilotApp).toContain("['DECOLAGEM', 'horario_decolagem']");
    expect(pilotApp).toContain("['POUSO', 'horario_pouso']");
    expect(pilotApp).toContain("['CORTE', 'horario_motor_desligado']");
    expect(pilotIndex).toContain('id="add-stage"');
    expect(pilotIndex).toContain('id="add-fueling"');
    expect(pilotApp).toContain("['Hora de partida', 'horario_motor_ligado', 'time'");
    expect(pilotApp).toContain("['Aeródromo de origem', 'origem_icao', 'text'");
    expect(pilotApp).not.toContain("label: 'Natureza do voo'");
    expect(pilotRdvDraft).not.toContain('PILOT_NATUREZA_OPTIONS');
    expect(pilotApp).toContain("className = 'stage-tabs'");
    expect(pilotApp).toContain("['Peso dos passageiros', 'peso_passageiros'");
    expect(pilotApp).toContain("['Peso da bagagem', 'peso_bagagem'");
    expect(pilotApp).toContain("label: 'Peso da tripulação'");
    expect(pilotApp).toContain("label: 'Peso vazio da aeronave'");
    const stageFieldsBlock = pilotApp.slice(pilotApp.indexOf('const stageFields = ['), pilotApp.indexOf('for (const [label, key, type', pilotApp.indexOf('const stageFields = [')));
    expect(stageFieldsBlock).not.toContain('Peso da tripulação');
    expect(stageFieldsBlock).not.toContain('Peso vazio da aeronave');
    expect(pilotApp).toContain("['Peso total', 'peso_total'");
    expect(pilotApp).toContain("['Observações da etapa', 'observacoes'");
    expect(pilotSync).toContain('fuelings:');
    expect(pilotSync).toContain('numero_voo: optionalText(rdvDraft.common?.numero_voo)');
    expect(pilotSync).toContain('numero_db: optionalText(rdvDraft.common?.numero_db)');
    expect(pilotSync).not.toContain('natureza_voo_codigo');
    expect(pilotSync).toContain('peso_tripulacao: parseNumber(common.peso_tripulacao');
    expect(pilotSync).toContain('peso_vazio: parseNumber(common.peso_vazio');
    expect(pilotSync).toContain('optionalText(item?.empresa_abastecimento_codigo)');
    expect(pilotApp).not.toContain("supplementalErrors.push('Informe a natureza do voo.')");
    expect(pilotApp).toContain('Litros abastecidos');
    expect(pilotApp).toContain("label: 'Etapa'");
    expect(pilotSync).toContain('etapa_numero: parseInteger(fueling?.etapa_numero)');
    expect(pilotApp).toContain('Número da nota');
    expect(pilotApp).toContain('Empresa de abastecimento');
    expect(pilotApp).toContain('pilotFuelingCompanyOptions(activePackageData())');
    expect(pilotSync).toContain('empresa_abastecimento_codigo');
    expect(pilotSync).toContain('client_local_id: optionalText(fueling?.local_id) || crypto.randomUUID()');
    expect(pilotSync).toContain('data_hora: time ? fromInputDateTime(time, flightDate) : new Date().toISOString()');
    expect(pilotRdvDraft).toContain('hora: toInputTime(now)');
    expect(pilotApp).not.toContain("['Hora', 'hora', 'time'");
    expect(pilotApp).not.toContain("['Nota do combustível', 'nota'");
    expect(pilotSync).not.toContain('nota: optionalText(fueling?.nota)');
    expect(pilotApp).toContain('Tempo no solo');
    expect(pilotApp).toContain('refreshAllStageDerivedTimes()');
    expect(pilotRdvDraft).toContain('applyStageContinuity');
    expect(pilotApp).toContain('monotonic_sequence: timingSequence');
    expect(pilotApp).toContain("['Partidas', 'starts', 'number', 'numeric', true");
    expect(pilotApp).toContain("fields.starts = String(fields.horario_motor_ligado || '').trim() ? '1' : ''");
    expect(pilotRdvDraft).toContain('Ciclos não são derivados de pousos');
    expect(pilotRdvDraft).not.toContain('next.ciclos =');
  });

  it('simplifica o fluxo operacional, não exibe PIN legado e preserva o vault antigo isolado', () => {
    expect(pilotIndex).toContain('1. Preparar voo');
    expect(pilotIndex).toContain('2. Registrar voo');
    expect(pilotIndex).toContain('3. Enviar');
    expect(pilotIndex).toContain('id="rdv-core-fields"');
    expect(pilotIndex).toContain('Dados comuns do voo');
    expect(pilotIndex).toContain('+ Nova etapa');
    expect(pilotIndex).toContain('Resumo automático do voo');
    expect(pilotIndex).toContain('expandable-panel');
    expect(pilotApp).toContain('Excluir esta etapa');
    expect(pilotApp).toContain("label: 'Relatório de voo'");
    expect(pilotApp).toContain("['Tempo de voo', activeRdvDraft.form.tempo_voo_total_hhmm");
    expect(pilotApp).toContain("['Tempo total', activeRdvDraft.form.tempo_total_hhmm");
    expect(pilotIndex).not.toContain('PIN offline');
    expect(pilotIndex).not.toContain('Código local antigo');
    expect(pilotIndex).not.toContain('Atualizar armazenamento deste tablet');
    expect(pilotApp).toContain('await vault.openAutomatically()');
    expect(pilotApp).toContain("vaultOpenState.status !== 'ready'");
    expect(pilotApp).not.toContain('showLegacyVaultMigration');
    expect(pilotVault).toContain("const DEVICE_DB_NAME = 'airtrust-pilot-v2'");
    expect(pilotVault).toContain('primaryDatabase.close()');
    expect(pilotVault).toContain("key_protection: 'NON_EXTRACTABLE_DEVICE_CRYPTOKEY'");
    expect(pilotVault).toContain('async provisionDeviceKey()');
    expect(pilotVault).toContain('async migrateLegacyPin(pin)');
    expect(pilotVault).toContain("name: 'PBKDF2'");
    expect(pilotVault).toContain('wrapped_key');
  });

  it('prioriza o voo do dia e mantém a seleção técnica fora da tela operacional', () => {
    expect(pilotIndex).toContain('id="authorized-flight-date"');
    expect(pilotIndex).toContain('id="flight-date-prev"');
    expect(pilotIndex).toContain('id="flight-date-today"');
    expect(pilotIndex).toContain('id="flight-date-next"');
    expect(pilotApp).toContain('flightDateKey(voo.data_programacao) === selectedDate');
    expect(pilotApp).toContain('authorizedFlightDate.value = localDateKey()');
    expect(pilotApp).toContain("buttonText: 'Abrir voo'");
    expect(pilotApp).toContain('await openAuthorizedFlight(targetedFlight.id)');
    expect(pilotIndex).toContain('technical-only');
  });

  it('mantém campos de hora com o mesmo tamanho físico dos demais no tablet', () => {
    expect(pilotIndex).toContain('.editor-grid input, .editor-grid select {');
    expect(pilotIndex).toContain('height: 52px;');
    expect(pilotIndex).toContain('.editor-grid input[type="time"]');
    expect(pilotIndex).toContain('min-inline-size: 0;');
    expect(pilotIndex).toContain('block-size: 52px;');
    expect(pilotIndex).toContain('-webkit-appearance: none;');
    expect(pilotIndex).toContain('appearance: none;');
    expect(pilotIndex).not.toContain('min-inline-size: 100%');
    expect(pilotIndex).toContain('@media (max-width: 620px)');
  });

  it('mantém seletor de hora nativo e formata IFR/noturno sem exigir dois-pontos', () => {
    expect(pilotApp).toContain("['Hora de partida', 'horario_motor_ligado', 'time'");
    expect(pilotApp).toContain("['Hora de decolagem', 'horario_decolagem', 'time'");
    expect(pilotApp).toContain("['Hora de pouso', 'horario_pouso', 'time'");
    expect(pilotApp).toContain("['Hora de corte', 'horario_motor_desligado', 'time'");
    expect(pilotApp).toContain('formatDurationDigits,');
    expect(pilotApp).toContain("input.inputMode = 'numeric'");
    expect(pilotApp).toContain("['IFR (duração)', 'tempo_ifr', 'duration'");
    expect(pilotApp).toContain("['Noturno (duração)', 'tempo_noturno', 'duration'");
  });

  it('expõe tempos derivados, unidades e erro real da transmissão bloqueada', () => {
    expect(pilotApp).toContain("['Tempo de voo', 'tempo_decolagem_pouso'");
    expect(pilotApp).toContain("['Tempo total', 'tempo_total'");
    expect(pilotApp).toContain("['IFR (duração)', 'tempo_ifr', 'duration'");
    expect(pilotApp).toContain("['Noturno (duração)', 'tempo_noturno', 'duration'");
    expect(pilotApp).toContain('toDurationInput(value)');
    expect(pilotApp).toContain("label: 'Unidade da carga'");
    expect(pilotApp).toContain("label: 'Unidade do combustível'");
    expect(pilotApp).toContain("'Transmissão bloqueada: ' + detail");
    expect(pilotApp).toContain("status: 'superseded'");
    expect(pilotRdvDraft).toContain('selecione a unidade do combustível');
  });
});
