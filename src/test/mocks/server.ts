import { setupServer } from 'msw/node';
import { escalasHandlers } from './handlers/escalas.handlers';
import { frmsHandlers } from './handlers/frms.handlers';

export const server = setupServer(...escalasHandlers, ...frmsHandlers);
