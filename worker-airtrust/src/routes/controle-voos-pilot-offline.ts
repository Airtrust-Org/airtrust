import { Hono } from 'hono';
import type { Env } from '../types';
import pilotOfflineCore from './controle-voos-pilot-offline-core';
import pilotSelfCreate from './controle-voos-pilot-self-create';

const pilotRoutes = new Hono<{ Bindings: Env }>();

// Self-service precisa ser montado antes do runtime offline para manter
// o endpoint estático /voos/meus/criar fora de qualquer captura genérica.
pilotRoutes.route('/', pilotSelfCreate);
pilotRoutes.route('/', pilotOfflineCore);

export default pilotRoutes;
