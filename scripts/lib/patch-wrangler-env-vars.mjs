import { readFileSync, writeFileSync } from 'node:fs';

const STAMP = /^[A-Za-z0-9._:-]+$/;

function sectionBounds(source, environment) {
  const header = `[env.${environment}.vars]`;
  const start = source.indexOf(header);
  if (start < 0 || source.indexOf(header, start + header.length) >= 0) throw new Error(`missing or duplicate ${header}`);
  const endMatch = /\n\[/.exec(source.slice(start + header.length));
  return [start, endMatch ? start + header.length + endMatch.index : source.length];
}

export function patchWranglerEnvVars(source, { environment, appVersion, buildTime }) {
  if (!['staging', 'production'].includes(environment)) throw new Error('unsupported environment');
  if (!STAMP.test(appVersion) || !STAMP.test(buildTime)) throw new Error('unsafe stamp');
  const [start, end] = sectionBounds(source, environment);
  const section = source.slice(start, end);
  for (const key of ['APP_VERSION', 'APP_BUILD_TIME']) {
    if ((section.match(new RegExp(`^${key}\\s*=`, 'gm')) ?? []).length > 1) throw new Error(`duplicate ${key}`);
  }
  if (!/^ENVIRONMENT\s*=\s*"(?:staging|production)"$/m.test(section)) throw new Error('malformed environment section');
  let patched = section.replace(/^APP_VERSION\s*=\s*"[^"]*"$/m, `APP_VERSION = "${appVersion}"`);
  if (patched === section) throw new Error('missing APP_VERSION');
  patched = /^APP_BUILD_TIME\s*=\s*"[^"]*"$/m.test(patched)
    ? patched.replace(/^APP_BUILD_TIME\s*=\s*"[^"]*"$/m, `APP_BUILD_TIME = "${buildTime}"`)
    : patched.replace(/^APP_VERSION.*$/m, `$&\nAPP_BUILD_TIME = "${buildTime}"`);
  const result = source.slice(0, start) + patched + source.slice(end);
  const verified = result.slice(...sectionBounds(result, environment));
  if (!verified.includes(`APP_VERSION = "${appVersion}"`) || !verified.includes(`APP_BUILD_TIME = "${buildTime}"`)) throw new Error('stamp verification failed');
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [sourcePath, outputPath, environment, appVersion, buildTime] = process.argv.slice(2);
  if (!sourcePath || !outputPath) throw new Error('usage: source output environment version buildTime');
  writeFileSync(outputPath, patchWranglerEnvVars(readFileSync(sourcePath, 'utf8'), { environment, appVersion, buildTime }));
}
