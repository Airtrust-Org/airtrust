import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const STAMP = /^[A-Za-z0-9._:-]+$/;

function sectionBounds(source, environment) {
  const header = `[env.${environment}.vars]`;
  const matches = [...source.matchAll(new RegExp(`^\\[env\\.${environment}\\.vars\\]\\s*$`, 'gm'))];
  if (matches.length !== 1) throw new Error(`missing or duplicate ${header}`);
  const start = matches[0].index;
  const endMatch = /\n\[/.exec(source.slice(start + header.length));
  return [start, endMatch ? start + header.length + endMatch.index : source.length];
}

function patchOneKey(section, key, value) {
  if ((section.match(new RegExp(`^${key}\\s*=`, 'gm')) ?? []).length > 1) {
    throw new Error(`duplicate ${key}`);
  }
  const existing = new RegExp(`^${key}\\s*=\\s*"[^"]*"$`, 'm');
  if (existing.test(section)) {
    return section.replace(existing, `${key} = "${value}"`);
  }
  // Append right after APP_BUILD_TIME (or APP_VERSION if BUILD_TIME absent)
  // so provenance stamps stay grouped, matching how this section already
  // documents itself in wrangler.toml.
  if (/^APP_BUILD_TIME\s*=\s*"[^"]*"$/m.test(section)) {
    return section.replace(/^APP_BUILD_TIME.*$/m, `$&\n${key} = "${value}"`);
  }
  return section.replace(/^APP_VERSION.*$/m, `$&\n${key} = "${value}"`);
}

/**
 * extraVars: optional additional {KEY: value} stamps applied the same way as
 * APP_VERSION/APP_BUILD_TIME (provenance chain fields such as
 * AIRTRUST_SOURCE_SHA, AIRTRUST_WORKER_BUNDLE_SHA256, etc). Every value must
 * pass the same STAMP safety check as appVersion/buildTime.
 */
export function patchWranglerEnvVars(source, { environment, appVersion, buildTime, extraVars = {} }) {
  if (!['staging', 'production'].includes(environment)) throw new Error('unsupported environment');
  if (!STAMP.test(appVersion) || !STAMP.test(buildTime)) throw new Error('unsafe stamp');
  for (const [key, value] of Object.entries(extraVars)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`unsafe extraVars key: ${key}`);
    if (!STAMP.test(value)) throw new Error(`unsafe stamp for ${key}`);
  }
  const [start, end] = sectionBounds(source, environment);
  const section = source.slice(start, end);
  for (const key of ['APP_VERSION', 'APP_BUILD_TIME']) {
    if ((section.match(new RegExp(`^${key}\\s*=`, 'gm')) ?? []).length > 1) throw new Error(`duplicate ${key}`);
  }
  if (!new RegExp(`^ENVIRONMENT\\s*=\\s*"${environment}"$`, 'm').test(section)) throw new Error('malformed environment section');
  // Checked via .test() on the ORIGINAL regex, not by comparing the string
  // before/after replace(): an idempotent re-stamp (same appVersion applied
  // twice, as happens when this script is called twice in the same deploy
  // to add the manifest hash afterward) would otherwise produce byte-identical
  // output and be mistaken for "no APP_VERSION line found".
  if (!/^APP_VERSION\s*=\s*"[^"]*"$/m.test(section)) throw new Error('missing APP_VERSION');
  let patched = section.replace(/^APP_VERSION\s*=\s*"[^"]*"$/m, `APP_VERSION = "${appVersion}"`);
  patched = /^APP_BUILD_TIME\s*=\s*"[^"]*"$/m.test(patched)
    ? patched.replace(/^APP_BUILD_TIME\s*=\s*"[^"]*"$/m, `APP_BUILD_TIME = "${buildTime}"`)
    : patched.replace(/^APP_VERSION.*$/m, `$&\nAPP_BUILD_TIME = "${buildTime}"`);
  for (const [key, value] of Object.entries(extraVars)) {
    patched = patchOneKey(patched, key, value);
  }
  const result = source.slice(0, start) + patched + source.slice(end);
  const verified = result.slice(...sectionBounds(result, environment));
  if (!verified.includes(`APP_VERSION = "${appVersion}"`) || !verified.includes(`APP_BUILD_TIME = "${buildTime}"`)) {
    throw new Error('stamp verification failed');
  }
  for (const [key, value] of Object.entries(extraVars)) {
    if (!verified.includes(`${key} = "${value}"`)) throw new Error(`stamp verification failed for ${key}`);
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [sourcePath, outputPath, environment, appVersion, buildTime, extraVarsJson] = process.argv.slice(2);
  if (!sourcePath || !outputPath) throw new Error('usage: source output environment version buildTime [extraVarsJson]');
  const extraVars = extraVarsJson ? JSON.parse(extraVarsJson) : {};
  writeFileSync(
    outputPath,
    patchWranglerEnvVars(readFileSync(sourcePath, 'utf8'), { environment, appVersion, buildTime, extraVars }),
  );
}
