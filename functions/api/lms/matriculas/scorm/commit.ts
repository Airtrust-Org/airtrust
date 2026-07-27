import { proxyStagingScormRequest } from '../../../../_lib/scorm-staging-proxy';

export const onRequestPost = ({ request }: { request: Request }) => proxyStagingScormRequest(request);
