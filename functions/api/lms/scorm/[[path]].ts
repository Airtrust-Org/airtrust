import { proxyStagingScormRequest } from '../../../_lib/scorm-staging-proxy';

export const onRequest = ({ request }: { request: Request }) => proxyStagingScormRequest(request);
