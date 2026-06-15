import type { D1Database } from '@cloudflare/workers-types';
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runSigvoosImporterBatch,
  type SigvoosImporterRunnerOptions,
  type SigvoosImporterRunnerPayloadInput,
  type SigvoosImporterRunnerReport,
} from './sigvoos-importer-runner';

const DEFAULT_ALLOWED_LOCAL_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../__tests__/fixtures',
);

const WRAPPED_INPUT_KEYS = new Set([
  'payload',
  'label',
  'empresaId',
  'sourceWindowStart',
  'sourceWindowEnd',
  'actorUserId',
]);

type FileResultLoadStatus = 'LOADED' | 'REJECTED' | 'ERROR';
type FileResultSourceType = 'LOCAL_FILE' | 'INLINE_PAYLOAD';

export interface SigvoosShadowLocalInvokerWrappedInput {
  payload: unknown;
  label?: string;
  empresaId?: number;
  sourceWindowStart?: string;
  sourceWindowEnd?: string;
  actorUserId?: number | null;
}

export type SigvoosShadowLocalInvokerInput =
  | string
  | SigvoosShadowLocalInvokerWrappedInput
  | Record<string, unknown>
  | ReadonlyArray<unknown>;

export interface SigvoosShadowLocalInvokerWarning {
  source: 'INVOKER' | 'RUNNER';
  code:
    | 'EXTERNAL_URL_REJECTED'
    | 'UNSAFE_LOCAL_PATH_REJECTED'
    | 'FILE_READ_ERROR'
    | 'INVALID_JSON'
    | 'NO_PAYLOADS_LOADED'
    | 'RUNNER_PAYLOAD_EMPTY'
    | 'RUNNER_PAYLOAD_REUSED'
    | 'RUNNER_PAYLOAD_CONFLICT'
    | 'RUNNER_PAYLOAD_ERROR';
  message: string;
  inputIndex?: number;
  label?: string;
  sourcePath?: string;
}

export interface SigvoosShadowLocalInvokerFileResult {
  inputIndex: number;
  label: string;
  empresaId: number;
  sourceType: FileResultSourceType;
  loadStatus: FileResultLoadStatus;
  runnerStatus?: 'PROCESSED' | 'PARTIAL' | 'REUSED' | 'CONFLICT' | 'EMPTY' | 'ERROR';
  sourcePath?: string;
  resolvedPath?: string;
  errorMessage?: string;
}

export interface SigvoosShadowLocalInvokerReport {
  mode: 'LOCAL_SHADOW';
  totalFiles: number;
  loadedFiles: number;
  failedFiles: number;
  runnerSummary: SigvoosImporterRunnerReport;
  fileResults: SigvoosShadowLocalInvokerFileResult[];
  warnings: SigvoosShadowLocalInvokerWarning[];
  startedAt: string;
  finishedAt: string;
}

export interface SigvoosShadowLocalInvokerOptions extends SigvoosImporterRunnerOptions {
  allowedLocalRoots?: string[];
  allowUnsafeLocalPathForDevOnly?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isWrappedInput(value: unknown): value is SigvoosShadowLocalInvokerWrappedInput {
  return (
    isRecord(value) &&
    'payload' in value &&
    Object.keys(value).every((key) => WRAPPED_INPUT_KEYS.has(key))
  );
}

function isExternalUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function isWithinAllowedRoots(filePath: string, allowedRoots: readonly string[]): boolean {
  return allowedRoots.some((allowedRoot) => filePath === allowedRoot || filePath.startsWith(`${allowedRoot}${sep}`));
}

function toRunnerWarningCode(
  code: 'PAYLOAD_EMPTY' | 'PAYLOAD_REUSED' | 'PAYLOAD_CONFLICT' | 'PAYLOAD_ERROR',
): SigvoosShadowLocalInvokerWarning['code'] {
  switch (code) {
    case 'PAYLOAD_EMPTY':
      return 'RUNNER_PAYLOAD_EMPTY';
    case 'PAYLOAD_REUSED':
      return 'RUNNER_PAYLOAD_REUSED';
    case 'PAYLOAD_CONFLICT':
      return 'RUNNER_PAYLOAD_CONFLICT';
    case 'PAYLOAD_ERROR':
      return 'RUNNER_PAYLOAD_ERROR';
  }
}

function toWrappedInput(
  input: SigvoosShadowLocalInvokerInput,
  inputIndex: number,
): SigvoosShadowLocalInvokerWrappedInput {
  if (typeof input === 'string') {
    throw new Error(`SIGVOOS_SHADOW_LOCAL_INVALID_INLINE_INPUT_${inputIndex}`);
  }

  if (isWrappedInput(input)) {
    return input;
  }

  return {
    payload: input,
  };
}

export async function invokeSigvoosShadowLocal(
  db: D1Database,
  defaultEmpresaId: number,
  inputs: ReadonlyArray<SigvoosShadowLocalInvokerInput>,
  options: SigvoosShadowLocalInvokerOptions = {},
): Promise<SigvoosShadowLocalInvokerReport> {
  const startedAt = new Date().toISOString();
  const allowedRoots = (options.allowedLocalRoots?.length ? options.allowedLocalRoots : [DEFAULT_ALLOWED_LOCAL_ROOT]).map(
    (root) => resolve(root),
  );
  const fileResults: SigvoosShadowLocalInvokerFileResult[] = [];
  const warnings: SigvoosShadowLocalInvokerWarning[] = [];
  const runnerInputs: SigvoosImporterRunnerPayloadInput[] = [];
  const loadedFileResults: SigvoosShadowLocalInvokerFileResult[] = [];

  for (const [index, rawInput] of inputs.entries()) {
    const inputIndex = index + 1;

    if (typeof rawInput === 'string') {
      if (isExternalUrl(rawInput)) {
        fileResults.push({
          inputIndex,
          label: `file-${inputIndex}`,
          empresaId: defaultEmpresaId,
          sourceType: 'LOCAL_FILE',
          loadStatus: 'REJECTED',
          sourcePath: rawInput,
          errorMessage: 'external URLs are not allowed in local shadow mode',
        });
        warnings.push({
          source: 'INVOKER',
          code: 'EXTERNAL_URL_REJECTED',
          inputIndex,
          label: `file-${inputIndex}`,
          sourcePath: rawInput,
          message: `entrada ${inputIndex} rejeitada: URL externa nao permitida`,
        });
        continue;
      }

      const resolvedPath = resolve(rawInput);
      const label = basename(resolvedPath);

      if (!options.allowUnsafeLocalPathForDevOnly && !isWithinAllowedRoots(resolvedPath, allowedRoots)) {
        fileResults.push({
          inputIndex,
          label,
          empresaId: defaultEmpresaId,
          sourceType: 'LOCAL_FILE',
          loadStatus: 'REJECTED',
          sourcePath: rawInput,
          resolvedPath,
          errorMessage: 'local path outside allowed fixtures/test roots',
        });
        warnings.push({
          source: 'INVOKER',
          code: 'UNSAFE_LOCAL_PATH_REJECTED',
          inputIndex,
          label,
          sourcePath: resolvedPath,
          message: `entrada ${inputIndex} rejeitada: caminho fora das fixtures/testes permitidas`,
        });
        continue;
      }

      try {
        const rawJson = await readFile(resolvedPath, 'utf8');
        const payload = JSON.parse(rawJson) as unknown;
        const result: SigvoosShadowLocalInvokerFileResult = {
          inputIndex,
          label,
          empresaId: defaultEmpresaId,
          sourceType: 'LOCAL_FILE',
          loadStatus: 'LOADED',
          sourcePath: rawInput,
          resolvedPath,
        };

        fileResults.push(result);
        loadedFileResults.push(result);
        runnerInputs.push({
          label,
          empresaId: defaultEmpresaId,
          payload,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error ?? 'SIGVOOS_SHADOW_LOCAL_FILE_ERROR');
        const code =
          error instanceof SyntaxError
            ? 'INVALID_JSON'
            : 'FILE_READ_ERROR';

        fileResults.push({
          inputIndex,
          label,
          empresaId: defaultEmpresaId,
          sourceType: 'LOCAL_FILE',
          loadStatus: 'ERROR',
          sourcePath: rawInput,
          resolvedPath,
          errorMessage,
        });
        warnings.push({
          source: 'INVOKER',
          code,
          inputIndex,
          label,
          sourcePath: resolvedPath,
          message: `entrada ${inputIndex} falhou: ${errorMessage}`,
        });
      }

      continue;
    }

    const wrapped = toWrappedInput(rawInput, inputIndex);
    const label = wrapped.label || `inline-${inputIndex}`;
    const empresaId = wrapped.empresaId ?? defaultEmpresaId;
    const result: SigvoosShadowLocalInvokerFileResult = {
      inputIndex,
      label,
      empresaId,
      sourceType: 'INLINE_PAYLOAD',
      loadStatus: 'LOADED',
    };

    fileResults.push(result);
    loadedFileResults.push(result);
    runnerInputs.push({
      payload: wrapped.payload,
      label,
      empresaId,
      actorUserId: wrapped.actorUserId,
      sourceWindowStart: wrapped.sourceWindowStart,
      sourceWindowEnd: wrapped.sourceWindowEnd,
    });
  }

  if (runnerInputs.length === 0) {
    warnings.push({
      source: 'INVOKER',
      code: 'NO_PAYLOADS_LOADED',
      message: 'nenhum payload local valido foi carregado para o shadow mode',
    });
  }

  const runnerSummary = await runSigvoosImporterBatch(db, defaultEmpresaId, runnerInputs, {
    continueOnError: options.continueOnError ?? true,
    actorUserId: options.actorUserId,
    sourceWindowStart: options.sourceWindowStart,
    sourceWindowEnd: options.sourceWindowEnd,
  });

  for (const [index, payloadReport] of runnerSummary.byPayload.entries()) {
    const fileResult = loadedFileResults[index];
    if (!fileResult) continue;
    fileResult.runnerStatus = payloadReport.status;
  }

  for (const warning of runnerSummary.warnings) {
    const fileResult = loadedFileResults[warning.payloadIndex - 1];
    warnings.push({
      source: 'RUNNER',
      code: toRunnerWarningCode(warning.code),
      inputIndex: fileResult?.inputIndex,
      label: warning.label,
      sourcePath: fileResult?.resolvedPath ?? fileResult?.sourcePath,
      message: warning.message,
    });
  }

  const finishedAt = new Date().toISOString();

  return {
    mode: 'LOCAL_SHADOW',
    totalFiles: inputs.length,
    loadedFiles: loadedFileResults.length,
    failedFiles: fileResults.filter((result) => result.loadStatus !== 'LOADED' || result.runnerStatus === 'ERROR').length,
    runnerSummary,
    fileResults,
    warnings,
    startedAt,
    finishedAt,
  };
}
