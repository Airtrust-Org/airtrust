import { Hono } from 'hono';
import type { Env } from '../types';

/**
 * Lookup router.
 * Funções e Setores são atendidos diretamente pelos roteadores auditados
 * `/api/funcoes` e `/api/setores` (definidos em funcoes.ts e setores.ts com RBAC
 * e auditoria completos).
 */
export const lookup = new Hono<{ Bindings: Env }>();
