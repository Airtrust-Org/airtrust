import fs from 'fs';
const content = fs.readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
const INTERNAL_VARS = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_WORKER_API_TOKEN',
  'CLOUDFLARE_PAGES_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'STAGING_SMOKE_EMAIL',
  'STAGING_SMOKE_PASSWORD'
].join('|');
const TOKEN_VALUE_ECHOED = new RegExp(
  `\\b(echo|print|printf)\\b[^\\n]*\\$(\\{(${INTERNAL_VARS})\\}|(${INTERNAL_VARS})\\b)` +
  `|\\bprintenv\\b` +
  `|(?:^|\\n|;|\\||&&)\\s*env\\b(?!\\s*[:=.]|\\.)` +
  `|\\bset\\s+-x\\b` +
  `|\\bprint\\s*\\(\\s*os\\.environ\\s*\\)` +
  `|\\bprint\\s*\\(\\s*os\\.environ\\[(?:'|")(${INTERNAL_VARS})(?:'|")\\]\\s*\\)`
);
const match = content.match(TOKEN_VALUE_ECHOED);
console.log(match);
if(match) console.log(content.substring(match.index-20, match.index+50));
