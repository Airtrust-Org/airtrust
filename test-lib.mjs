import fs from 'fs';
import { checkWorkflowContent } from './scripts/ci/cloudflare-secret-contract-lib.mjs';

const content = fs.readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
const violations = checkWorkflowContent('deploy-staging.yml', content);
console.log(violations);
