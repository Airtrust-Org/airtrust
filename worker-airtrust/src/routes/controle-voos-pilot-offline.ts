import { Hono } from 'hono';
import type { Env } from '../types';
import catalogManagement from './controle-voos-catalog-management';
import pilotOfflineCore from './controle-voos-pilot-offline-core';

const pilotRoutes = new Hono<{ Bindings: Env }>();

// Rotas de extensao do Controle de Voos ficam agrupadas aqui para evitar
// ampliar o arquivo legado controle-voos.ts. Catalogos operacionais sao
// independentes do runtime offline, mas compartilham o mesmo prefixo de API.
pilotRoutes.route('/', catalogManagement);

pilotRoutes.route('/', pilotOfflineCore);

export default pilotRoutes;
