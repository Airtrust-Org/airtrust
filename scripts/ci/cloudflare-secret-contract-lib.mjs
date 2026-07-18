// Pure text-based checks for the canonical Cloudflare/AirTrust secret
// contract (docs/ops/CLOUDFLARE_CREDENTIAL_CONTRACT.md). Deliberately avoids
// a YAML parser dependency: workflows in this repo use consistent 2-space
// indentation, so line-based block splitting is enough and keeps this guard
// dependency-free and easy to unit test with plain strings.

const GENERIC_TOKEN_REF = /secrets(?:\.CLOUDFLARE_API_TOKEN\b|\['CLOUDFLARE_API_TOKEN'\]|\["CLOUDFLARE_API_TOKEN"\])/;
const WORKER_TOKEN_REF = /secrets(?:\.CLOUDFLARE_WORKER_API_TOKEN\b|\['CLOUDFLARE_WORKER_API_TOKEN'\]|\["CLOUDFLARE_WORKER_API_TOKEN"\])/;
const PAGES_TOKEN_REF = /secrets(?:\.CLOUDFLARE_PAGES_API_TOKEN\b|\['CLOUDFLARE_PAGES_API_TOKEN'\]|\["CLOUDFLARE_PAGES_API_TOKEN"\])/;
const SMOKE_EMAIL_REF = /secrets(?:\.STAGING_SMOKE_EMAIL\b|\['STAGING_SMOKE_EMAIL'\]|\["STAGING_SMOKE_EMAIL"\])/;
const SMOKE_PASSWORD_REF = /secrets(?:\.STAGING_SMOKE_PASSWORD\b|\['STAGING_SMOKE_PASSWORD'\]|\["STAGING_SMOKE_PASSWORD"\])/;
const ACCOUNT_ID_REF = /secrets(?:\.CLOUDFLARE_ACCOUNT_ID\b|\['CLOUDFLARE_ACCOUNT_ID'\]|\["CLOUDFLARE_ACCOUNT_ID"\])/;

const SCOPED_SECRET_REF = new RegExp(
  [WORKER_TOKEN_REF, PAGES_TOKEN_REF, SMOKE_EMAIL_REF, SMOKE_PASSWORD_REF].map((r) => r.source).join('|'),
);

const CREATE_TOKEN_INSTRUCTION =
  /(create\s+a\s+new\s+(cloudflare\s+)?(api\s+)?token|crie\s+um\s+novo\s+token|criar\s+um\s+novo\s+token|gerar\s+um\s+novo\s+token|generate\s+a\s+new\s+(api\s+)?token)/i;

const ACCOUNT_ID_LITERAL = /\b[0-9a-f]{32}\b/i;

const SMOKE_LABELED_AS_TOKEN = /(smoke\s+token|token\s+de\s+smoke)/i;
const SMOKE_MAPPED_TO_TOKEN_VAR =
  /\b[A-Z_]*TOKEN[A-Z_]*\s*:\s*\$\{\{\s*secrets\.STAGING_SMOKE_(EMAIL|PASSWORD)\s*\}\}/;

const INTERNAL_VARS = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_WORKER_API_TOKEN',
  'CLOUDFLARE_PAGES_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'STAGING_SMOKE_EMAIL',
  'STAGING_SMOKE_PASSWORD'
].join('|');

const TOKEN_LENGTH_PRINTED = new RegExp(`\\$\\{#(${INTERNAL_VARS})\\}`);

const TOKEN_VALUE_ECHOED = new RegExp(
  `\\b(echo|print|printf)\\b[^\\n]*\\$(\\{(${INTERNAL_VARS})\\}|(${INTERNAL_VARS})\\b)` +
  `|\\bprintenv\\b` +
  `|(?:^|\\n|;|\\||&&)\\s*env\\b(?!\\s*[:=.]|\\.)` +
  `|\\bset\\s+-x\\b` +
  `|\\bprint\\s*\\(\\s*os\\.environ\\s*\\)` +
  `|\\bprint\\s*\\(\\s*os\\.environ\\[(?:'|")(${INTERNAL_VARS})(?:'|")\\]\\s*\\)`
);

function findJobBlocks(content) {
  const lines = content.split('\n');
  const jobsIdx = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsIdx === -1) return [];

  const blocks = [];
  let current = null;
  for (let i = jobsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const jobHeader = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jobHeader) {
      if (current) blocks.push(current);
      current = { id: jobHeader[1], startLine: i + 1, lines: [line] };
      continue;
    }
    if (/^[A-Za-z]/.test(line)) {
      // Back to zero-indent top-level key: jobs section is over.
      if (current) blocks.push(current);
      current = null;
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push(current);

  return blocks.map((b) => ({ id: b.id, text: b.lines.join('\n'), startLine: b.startLine }));
}

function getJobName(blockText) {
  const m = blockText.match(/^ {4}name:\s*(.+)$/m);
  return m ? m[1].trim() : '';
}

function hasEnvironmentDeclaration(blockText) {
  return /^ {4}environment:/m.test(blockText);
}

function getSteps(blockText) {
  const stepsIdx = blockText.search(/^ {4}steps:\s*$/m);
  if (stepsIdx === -1) return [blockText];
  const stepsText = blockText.slice(stepsIdx);
  const lines = stepsText.split('\n');
  const steps = [];
  let current = [];
  for (const line of lines) {
    if (/^ {6}- /.test(line)) {
      if (current.length) steps.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) steps.push(current.join('\n'));
  return steps;
}

/**
 * Scans one workflow file's raw text and returns a list of human-readable
 * violation strings (empty array = clean).
 */
export function checkWorkflowContent(fileName, content) {
  const violations = [];

  if (GENERIC_TOKEN_REF.test(content)) {
    violations.push(
      `${fileName}: references secrets.CLOUDFLARE_API_TOKEN directly. Use CLOUDFLARE_WORKER_API_TOKEN or CLOUDFLARE_PAGES_API_TOKEN instead.`,
    );
  }

  if (CREATE_TOKEN_INSTRUCTION.test(content)) {
    violations.push(
      `${fileName}: instructs creating a new Cloudflare token as a fix. Diagnose the existing canonical secrets first.`,
    );
  }

  for (const match of content.matchAll(new RegExp(ACCOUNT_ID_LITERAL, 'gi'))) {
    violations.push(`${fileName}: literal Account-ID-shaped hex string ("${match[0]}") must not be hardcoded in a workflow.`);
  }

  if (SMOKE_LABELED_AS_TOKEN.test(content)) {
    violations.push(`${fileName}: describes AirTrust smoke credentials as a "token". They are login credentials, not a Cloudflare token.`);
  }

  if (SMOKE_MAPPED_TO_TOKEN_VAR.test(content)) {
    violations.push(`${fileName}: maps STAGING_SMOKE_EMAIL/STAGING_SMOKE_PASSWORD into a variable named like a token.`);
  }

  if (TOKEN_LENGTH_PRINTED.test(content)) {
    violations.push(`${fileName}: prints a token/secret length (e.g. \${#VAR}). Never print token/secret length.`);
  }

  if (TOKEN_VALUE_ECHOED.test(content)) {
    violations.push(`${fileName}: echoes/prints a Cloudflare token or smoke credential variable directly.`);
  }

  for (const job of findJobBlocks(content)) {
    const jobName = getJobName(job.text);
    const haystack = `${job.id} ${jobName}`;
    const isWorkerJob = /worker/i.test(haystack);
    const isPagesJob = /pages/i.test(haystack);

    const usesWorkerToken = WORKER_TOKEN_REF.test(job.text);
    const usesPagesToken = PAGES_TOKEN_REF.test(job.text);
    const usesSmokeEmail = SMOKE_EMAIL_REF.test(job.text);
    const usesSmokePassword = SMOKE_PASSWORD_REF.test(job.text);

    if (isWorkerJob && usesPagesToken) {
      violations.push(`${fileName}: job "${job.id}" looks like a Worker job but references CLOUDFLARE_PAGES_API_TOKEN.`);
    }
    if (isPagesJob && usesWorkerToken) {
      violations.push(`${fileName}: job "${job.id}" looks like a Pages job but references CLOUDFLARE_WORKER_API_TOKEN.`);
    }

    if (SCOPED_SECRET_REF.test(job.text) && !hasEnvironmentDeclaration(job.text)) {
      violations.push(
        `${fileName}: job "${job.id}" reads an environment-scoped secret (Worker/Pages token or staging smoke credential) but does not declare "environment:".`,
      );
    }

    if (usesSmokeEmail || usesSmokePassword) {
      const declaredEnv = job.text.match(/^ {4}environment:\s*(.+)$/m)?.[1]?.trim();
      if (declaredEnv && declaredEnv !== 'staging') {
        violations.push(
          `${fileName}: job "${job.id}" reads staging smoke credentials outside the staging environment (environment: ${declaredEnv}).`,
        );
      }
    }

    for (const step of getSteps(job.text)) {
      if (WORKER_TOKEN_REF.test(step) && PAGES_TOKEN_REF.test(step)) {
        violations.push(`${fileName}: job "${job.id}" has a step combining CLOUDFLARE_WORKER_API_TOKEN and CLOUDFLARE_PAGES_API_TOKEN.`);
      }
    }
  }

  return violations;
}

export function checkWorkflowFiles(files) {
  const violations = [];
  for (const { fileName, content } of files) {
    violations.push(...checkWorkflowContent(fileName, content));
  }
  return violations;
}
