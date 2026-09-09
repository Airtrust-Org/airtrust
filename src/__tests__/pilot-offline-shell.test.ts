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
    assertParses(pilotWorkspace);
    assertParses(pilotVault);
    assertParses(pilotRdvDraft);
    assertParses(pilotSync);
    assertParses(pilotLease);
    assertParses(pilotLeaseTrust);
    assertParses(pilotSw);
  });

  it('mantem o app instalavel estritamente no escopo /pilot/', () => {
    expect(pilotManifest.id).toBe('/pilot/');
    expect(pilotManifest.start_url).toBe('/pilot/');
    expect(pilotManifest.scope).toBe('/pilot/');
    expect(pilotManifest.display).toBe('standalone');
    expect(pilotIndex).toContain('href="/pilot/pilot.webmanifest"');
    expect(pilotApp).toContain("scope: '/pilot/'");
    expect(pilotApp).toContain("register('/pilot/pilot-sw.js'");
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
    expect(pilotVault).toContain("name: 'PBKDF2'");
    expect(pilotVault).toContain("name: 'AES-GCM'");
    expect(pilotVault).toContain('crypto.subtle.encrypt');
    expect(pilotVault).toContain('crypto.subtle.decrypt');
    expect(pilotVault).not.toContain('localStorage');
    expect(pilotVault).not.toContain('sessionStorage');
  });

  it('so declara Salvo no tablet depois da persistencia local concluir', () => {
    const putIndex = pilotApp.indexOf("await vault.putJson(");
    const savedIndex = pilotApp.indexOf("saveStatus.textContent = 'Salvo no tablet.'");
    expect(putIndex).toBeGreaterThan(-1);
    expect(savedIndex).toBeGreaterThan(putIndex);
  });

  it('precacheia o shell e usa fallback offline apenas para navegacao /pilot/', () => {
    expect(pilotSw).toContain("const PILOT_CACHE_VERSION = 'airtrust-pilot-shell-v7'");
    expect(pilotSw).toContain("'/pilot/index.html'");
    expect(pilotSw).toContain("'/pilot/pilot-workspace.js'");
    expect(pilotSw).toContain("'/pilot/pilot-rdv-draft.js'");
    expect(pilotSw).toContain("'/pilot/pilot-sync.js'");
    expect(pilotSw).toContain("'/pilot/pilot-lease.js'");
    expect(pilotSw).toContain("'/pilot/pilot-lease-trust.js'");
    expect(pilotSw).toContain("url.pathname.startsWith(PILOT_SCOPE_PATH)");
    expect(pilotSw).toContain("caches.match('/pilot/index.html')");
    expect(pilotSw).toContain("if (url.pathname.startsWith('/api/')) return;");
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
    expect(pilotApp).toContain("Authorization: 'Bearer ' + token");
    expect(pilotApp).toContain("containsForbiddenPackageKey(packageData)");
    expect(pilotApp).toContain("await vault.putJson(\n      'flight_packages'");
    expect(pilotVault).toContain('async listJson(storeName)');
  });

  it('so confirma consulta offline depois do write cifrado e do read-back', () => {
    const writeIndex = pilotApp.indexOf("await vault.putJson(\n      'flight_packages'");
    const readBackIndex = pilotApp.indexOf(
      "const persisted = await vault.getJson('flight_packages', recordId)",
      writeIndex,
    );
    const readyIndex = pilotApp.indexOf('Consulta offline disponível.', readBackIndex);

    expect(writeIndex).toBeGreaterThan(-1);
    expect(readBackIndex).toBeGreaterThan(writeIndex);
    expect(readyIndex).toBeGreaterThan(readBackIndex);

    const writeSnippet = pilotApp.slice(writeIndex, readBackIndex);
    expect(writeSnippet).not.toMatch(/airtrust_token|refresh_token|Authorization/);
  });

  it('mantem o pacote-base read-only e separa rascunho local de sincronizacao', () => {
    expect(pilotIndex).toContain('não é Diário de Bordo oficial');
    expect(pilotIndex).toContain('outbox cifrada e receipt idempotente');
    expect(pilotApp).toContain("contract?.read_only !== true");
    expect(pilotApp).toContain("typeof contract?.sync_supported !== 'boolean'");
    expect(pilotApp).toContain("contract?.regulated_edb !== false");
    expect(pilotIndex).toContain('Rascunho operacional local');
    expect(pilotIndex).toContain('Não sincronizado');
  });

  it('expõe o voo como workspace integrado sem promover mapa ou performance a funções certificadas', () => {
    expect(pilotIndex).toContain('id="pilot-workspace-view"');
    expect(pilotApp).toContain("renderPilotWorkspace");
    expect(pilotWorkspace).toContain("['summary', 'Resumo']");
    expect(pilotWorkspace).toContain("['planning', 'Planejamento']");
    expect(pilotWorkspace).toContain("['met', 'MET']");
    expect(pilotWorkspace).toContain("['fuel', 'Combustível']");
    expect(pilotWorkspace).toContain("['dossier', 'Dossiê']");
    expect(pilotWorkspace).toContain("['map', 'Mapa']");
    expect(pilotWorkspace).toContain("['performance', 'Performance']");
    expect(pilotWorkspace).toContain("['edb-shadow', 'eDB Shadow']");
    expect(pilotWorkspace).toContain('NÃO OFICIAL — eDB SHADOW — SEM VALOR REGULATÓRIO');
    expect(pilotWorkspace).toContain('não contém assinatura');
    expect(pilotWorkspace).toContain("tabId !== 'edb-shadow'");
    expect(pilotWorkspace).toContain('MET armazenada no tablet é um snapshot');
    expect(pilotWorkspace).toContain('Não substitui navegação ou aviônicos certificados');
    expect(pilotWorkspace).toContain('Aguardando fonte técnica versionada');
    expect(pilotWorkspace).not.toMatch(/tile\.openstreetmap|mapbox|googleapis.*maps/i);
  });

  it('mantem a edicao offline fail-closed ate haver lease assinado e chave publica confiavel', () => {
    expect(pilotLeaseTrust).toContain('TRUSTED_PILOT_LEASE_KEYS = Object.freeze([])');
    expect(pilotLease).toContain("envelope.alg !== 'ES256'");
    expect(pilotLease).toContain("crypto.subtle.verify");
    expect(pilotLease).toContain("claims.purpose !== 'offline_flight_lease'");
    expect(pilotLease).toContain("claims.device_id");
    expect(pilotRdvDraft).toContain('assertVerifiedLeaseAllowsDraft');
    expect(pilotApp).toContain('hasTrustedPilotLeaseKeys()');
    expect(pilotApp).toContain('verifyPilotOfflineLease');
    expect(pilotApp).toContain("'/offline-lease'");
  });

  it('salva RDV e etapas atomicamente e faz read-back antes de confirmar persistencia', () => {
    expect(pilotVault).toContain("this.database.transaction(storeNames, 'readwrite')");
    const batchIndex = pilotApp.indexOf('await vault.putJsonBatch(buildOperationalSaveEntries');
    const readRdvIndex = pilotApp.indexOf("await vault.getJson(\n        'rdv_drafts'", batchIndex);
    const readyIndex = pilotApp.indexOf("rdvEditorSaveStatus.textContent = 'Salvo no tablet.'", readRdvIndex);
    expect(batchIndex).toBeGreaterThan(-1);
    expect(readRdvIndex).toBeGreaterThan(batchIndex);
    expect(readyIndex).toBeGreaterThan(readRdvIndex);
  });

  it('aceita capability de sync booleana sem promover o pacote a eDB regulatorio', () => {
    expect(pilotApp).toContain("typeof contract?.sync_supported !== 'boolean'");
    expect(pilotApp).toContain("contract?.regulated_edb !== false");
    expect(pilotApp).toContain("contract?.sync_supported !== true");
  });

  it('bloqueia refresh silencioso com gravacao operacional pendente e mantem sync fail-closed', () => {
    expect(pilotApp).toContain("window.addEventListener('beforeunload'");
    expect(pilotApp).toContain('operationalNextSequence !== operationalLocalSequence');
    expect(pilotApp).toContain("event.returnValue = ''");
    expect(pilotApp).toContain("contract?.sync_supported !== true");
    expect(pilotApp).toContain('Sincronização ainda não foi habilitada para este pacote de voo.');
  });

  it('separa persistencia local de transmissao e exige receipt antes de remover a outbox', () => {
    expect(pilotIndex).toContain('id="sync-rdv-now"');
    expect(pilotIndex).toContain('“Transmitido” só será');
    expect(pilotApp).toContain("await vault.putJson(\n        'outbox'");
    expect(pilotApp).toMatch(/await vault\.getJson\(\s*'sync_receipts'/);
    const persistResultIndex = pilotApp.indexOf('async function persistFinalSyncResult');
    const receiptIndex = pilotApp.indexOf("'sync_receipts'", persistResultIndex);
    const deleteIndex = pilotApp.indexOf("await vault.deleteJson('outbox'", receiptIndex);
    expect(receiptIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(receiptIndex);
  });

  it('gera comando de sync deterministico sem incluir bearer e sem derivar ciclos', () => {
    expect(pilotSync).toContain("command_type: PILOT_SYNC_COMMAND_TYPE");
    expect(pilotSync).toContain("entity_type: PILOT_SYNC_ENTITY_TYPE");
    expect(pilotSync).toContain("operation_type: PILOT_SYNC_OPERATION_TYPE");
    expect(pilotSync).toContain('payload_hash');
    expect(pilotSync).toContain('canonicalJson(getSyncHashMaterial(command))');
    expect(pilotSync).toContain('ciclos: parseInteger(form.ciclos)');
    expect(pilotSync).not.toContain('Authorization');
    expect(pilotSync).not.toContain('airtrust_token');
  });

  it('reenvia outbox pendente ao recuperar conectividade sem last-write-wins', () => {
    expect(pilotApp).toContain("record.value?.status === 'pending'");
    expect(pilotApp).toContain("void drainPilotOutbox()");
    expect(pilotApp).toContain("result.status === 'conflict'");
    expect(pilotApp).toContain('O rascunho local foi preservado');
    expect(pilotApp).not.toContain('last-write-wins');
  });

  it('mantem sync, finalizacao e envio a Coordenacao como acoes explicitamente separadas', () => {
    expect(pilotIndex).toContain('id="refresh-canonical-package"');
    expect(pilotIndex).toContain('id="finalize-rdv-server"');
    expect(pilotIndex).toContain('id="send-rdv-coordination"');
    expect(pilotIndex).toMatch(/Transmitir o rascunho\s+offline não envia automaticamente o RDV à Coordenação/);
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
    expect(pilotApp).toContain('Atualize o pacote após o último receipt de transmissão antes de finalizar.');
    expect(pilotApp).toContain('Recebimento confirmado pelo servidor');
  });

  it('captura quick actions de horario com sequencia monotona sem inferir ciclos', () => {
    expect(pilotApp).toContain("['PARTIDA', 'horario_motor_ligado']");
    expect(pilotApp).toContain("['DECOLAGEM', 'horario_decolagem']");
    expect(pilotApp).toContain("['POUSO', 'horario_pouso']");
    expect(pilotApp).toContain("['CORTE', 'horario_motor_desligado']");
    expect(pilotApp).toContain('monotonic_sequence: timingSequence');
    expect(pilotRdvDraft).toContain('Ciclos não são derivados de pousos');
    expect(pilotRdvDraft).not.toContain('next.ciclos =');
  });
});
