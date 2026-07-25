/**
 * Módulo para gerenciar a persistência local (localStorage) de estado SCORM.
 *
 * Exporta a função que constrói o script injetado na página de lançamento do SCORM.
 * A lógica obedece à política de fail-closed para evitar perda de dados e corrupção inter-ciclos.
 */

export interface ResumeStorageScriptConfig {
  matriculaId: number | null;
  cicloId: number;
  numeroCiclo: number;
}

export function buildResumeStorageScript(cfg: ResumeStorageScriptConfig): string {
  return `
  var MATRICULA_ID = ${cfg.matriculaId};
  var CICLO_ID = ${cfg.cicloId};
  var NUMERO_CICLO = ${cfg.numeroCiclo};
  var LEGACY_RESUME_KEY = MATRICULA_ID == null ? null : 'airtrust:scorm:resume:' + String(MATRICULA_ID);
  var LOCAL_RESUME_KEY = MATRICULA_ID == null ? null : 'airtrust:scorm:resume:' + String(MATRICULA_ID) + ':' + String(CICLO_ID);

  function readLocalResumeBackup() {
    if (!LOCAL_RESUME_KEY || typeof localStorage === 'undefined') return null;

    try {
      var raw = localStorage.getItem(LOCAL_RESUME_KEY);

      if (!raw && LEGACY_RESUME_KEY) {
        if (NUMERO_CICLO === 1) {
          // No ciclo 1, podemos migrar de forma segura, porque sabemos que não existe ciclo anterior.
          var legacyRaw = localStorage.getItem(LEGACY_RESUME_KEY);
          if (legacyRaw) {
            try {
              var legacyParsed = JSON.parse(legacyRaw);
              if (legacyParsed && typeof legacyParsed === 'object' && typeof legacyParsed.location === 'string' && legacyParsed.location.trim()) {
                // Reescreve no novo contrato
                var migrated = {
                  schema_version: 2,
                  matricula_id: MATRICULA_ID,
                  ciclo_id: CICLO_ID,
                  numero_ciclo: NUMERO_CICLO,
                  location: legacyParsed.location,
                  progress_pct: typeof legacyParsed.progress_pct === 'number' ? legacyParsed.progress_pct : 0,
                  updated_at: legacyParsed.updated_at || new Date().toISOString(),
                  reason: legacyParsed.reason || 'migrated-from-legacy'
                };
                localStorage.setItem(LOCAL_RESUME_KEY, JSON.stringify(migrated));
                
                // Reler a chave nova para ter certeza que gravou (fail-closed)
                if (localStorage.getItem(LOCAL_RESUME_KEY)) {
                  localStorage.removeItem(LEGACY_RESUME_KEY);
                  raw = JSON.stringify(migrated);
                }
              }
            } catch (_e) {
              // JSON inválido: rejeita sem apagar, emite diagnóstico (silencioso para o user)
              console.info('[SCORM_TELEMETRY] LEGACY_RESUME_INVALID', { matriculaId: MATRICULA_ID });
            }
          }
        } else {
          // Se numero_ciclo > 1, um legado sem ciclo pode pertencer a um ciclo antigo (ex. ciclo 1).
          // Política: fail-closed. Não usar, não migrar, não apagar.
          if (localStorage.getItem(LEGACY_RESUME_KEY)) {
            console.info('[SCORM_TELEMETRY] LEGACY_RESUME_AMBIGUOUS', { matriculaId: MATRICULA_ID, numeroCiclo: NUMERO_CICLO });
          }
        }
      }

      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (typeof parsed.location !== 'string' || !parsed.location.trim()) return null;
      
      // Validação do schema_version = 2
      if (parsed.schema_version === 2) {
        if (parsed.matricula_id !== MATRICULA_ID || parsed.ciclo_id !== CICLO_ID) {
          console.info('[SCORM_TELEMETRY] RESUME_SCHEMA_MISMATCH', { matriculaId: MATRICULA_ID, cicloId: CICLO_ID });
          return null;
        }
      }

      return parsed;
    } catch (_error) {
      console.info('[SCORM_TELEMETRY] RESUME_PARSE_ERROR', { matriculaId: MATRICULA_ID });
      return null;
    }
  }

  function clearLocalResumeBackup() {
    if (!LOCAL_RESUME_KEY || typeof localStorage === 'undefined') return;

    try {
      localStorage.removeItem(LOCAL_RESUME_KEY);
      // Não apaga a LEGACY_RESUME_KEY aqui, pois se não foi migrada, é porque
      // (a) pertencia a um ciclo antigo, ou (b) estava corrompida.
      // Somente apagamos durante a migração bem-sucedida.
    } catch (_error) {
      // Ignorar indisponibilidade de storage local.
    }
  }

  function writeLocalResumeBackup(reason) {
    if (!LOCAL_RESUME_KEY || typeof localStorage === 'undefined') return;
    var location = getScormLocation();
    var marker = parseLocationMarker(location);
    if (!marker || marker.current <= 1) return;

    var previous = readLocalResumeBackup();
    var previousMarker = parseLocationMarker(previous && previous.location);
    if (previousMarker && previousMarker.current > marker.current) {
      return;
    }

    try {
      var progress_pct = 0;
      if (marker.total && marker.total > 0) {
        progress_pct = Math.round((marker.current / marker.total) * 100);
      } else if (typeof calculateSimulatedProgress === 'function') {
        progress_pct = calculateSimulatedProgress();
      }

      var payload = {
        schema_version: 2,
        matricula_id: MATRICULA_ID,
        ciclo_id: CICLO_ID,
        numero_ciclo: NUMERO_CICLO,
        location: location,
        progress_pct: progress_pct,
        updated_at: new Date().toISOString(),
        total_slides: marker.total || null,
        reason: reason || 'unknown'
      };

      localStorage.setItem(LOCAL_RESUME_KEY, JSON.stringify(payload));
    } catch (_error) {
      // Ignorar quota exceeded ou outras falhas de IO.
    }
  }
  `;
}
