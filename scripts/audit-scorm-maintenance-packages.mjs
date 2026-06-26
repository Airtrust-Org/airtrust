import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const packagesRoot = path.join(workspaceRoot, 'Arquivos - EAD');

const priorityCourses = [
  { priority: 1, name: 'AW139 - Manutenção' },
  { priority: 2, name: 'PT6C-67C / PT6 - Manutenção' },
  { priority: 2, name: 'MGM - Manual Geral de Manutenção' },
  { priority: 2, name: 'HUMS-VXP' },
  { priority: 2, name: 'SGSO para Manutenção' },
  { priority: 2, name: 'Treinamento técnico Integração Manutenção' },
  { priority: 2, name: 'Inspeção IIO & APRS' },
  { priority: 3, name: 'MCQ' },
  { priority: 3, name: 'MOM' },
  { priority: 3, name: 'HUMS' },
  { priority: 3, name: 'Heliwise' },
];

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractFirstMatch(source, pattern) {
  const match = source.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function listPackageDirs(rootDir) {
  if (!existsSync(rootDir)) return [];

  return readdirSync(rootDir)
    .map((entry) => path.join(rootDir, entry))
    .filter((entryPath) => {
      try {
        return statSync(entryPath).isDirectory();
      } catch {
        return false;
      }
    })
    .filter((entryPath) => existsSync(path.join(entryPath, 'imsmanifest.xml')));
}

function collectReferencedAssets(value, assets = new Set()) {
  if (typeof value === 'string') {
    const matches = value.match(
      /(?:fit_content_assets|assets|audio|img|video)\/[^"'()\s<>]+/g,
    );
    for (const match of matches ?? []) {
      assets.add(match);
    }
    return assets;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectReferencedAssets(item, assets);
    return assets;
  }

  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectReferencedAssets(nested, assets);
  }

  return assets;
}

function detectBlankSlideCandidates(slides) {
  return slides
    .filter((slide) => {
      if (String(slide?.type ?? '').toLowerCase() === 'exit') {
        return false;
      }

      const data = slide?.data ?? {};
      const textPayload = [
        data.title,
        data.subtitle,
        data.text,
        data.prompt,
        data.additionalContent,
        data.buttonText,
      ]
        .map((value) => String(value ?? '').replace(/<[^>]+>/g, '').trim())
        .filter(Boolean);

      const mediaPayload = Array.from(
        collectReferencedAssets(slide).values(),
      );

      const listLength = Array.isArray(data.list) ? data.list.length : 0;
      const answersLength = Array.isArray(data.answers) ? data.answers.length : 0;

      return textPayload.length === 0 && mediaPayload.length === 0 && listLength === 0 && answersLength === 0;
    })
    .map((slide) => slide?.displayIndex ?? slide?.name ?? slide?.id ?? 'unknown');
}

function analyzePackage(dirPath) {
  const manifestPath = path.join(dirPath, 'imsmanifest.xml');
  const configPath = path.join(dirPath, 'config.json');
  const manifest = readFileSync(manifestPath, 'utf8');
  const configRaw = existsSync(configPath) ? readFileSync(configPath, 'utf8') : null;
  const config = configRaw ? JSON.parse(configRaw) : null;
  const scormBundleName = readdirSync(dirPath).find((entry) => /^scorm\..+\.js$/i.test(entry)) ?? null;
  const scormBundlePath = scormBundleName ? path.join(dirPath, scormBundleName) : null;
  const scormBundle = scormBundlePath ? readFileSync(scormBundlePath, 'utf8') : '';
  const jsSources = readdirSync(dirPath)
    .filter((entry) => entry.endsWith('.js'))
    .map((entry) => readFileSync(path.join(dirPath, entry), 'utf8'));
  const combinedJsSource = jsSources.join('\n');

  const title =
    extractFirstMatch(manifest, /<organization[^>]*>[\s\S]*?<title>([^<]+)<\/title>/i) ??
    extractFirstMatch(manifest, /<title>([^<]+)<\/title>/i) ??
    path.basename(dirPath);
  const launchFile = extractFirstMatch(manifest, /<resource[^>]+href="([^"]+)"/i);
  const slides = Array.isArray(config?.slides) ? config.slides : [];
  const slideCount = slides.length;
  const referencedAssets = Array.from(collectReferencedAssets(config));
  const missingAssets = referencedAssets.filter((assetPath) => !existsSync(path.join(dirPath, assetPath)));
  const blankSlideCandidates = detectBlankSlideCandidates(slides);

  const scormSignals = {
    initialize: /LMSInitialize\(""\)/.test(combinedJsSource),
    setValue: /LMSSetValue\(/.test(combinedJsSource),
    commit: /LMSCommit\(""\)/.test(combinedJsSource),
    finish: /LMSFinish\(""\)/.test(combinedJsSource),
    lessonLocation: /lesson_location/.test(combinedJsSource),
    suspendData: /suspend_data/.test(combinedJsSource),
    lessonStatus: /lesson_status/.test(combinedJsSource),
    scoreRaw: /score\.raw/.test(combinedJsSource),
    nativeAlert: /alert\(/.test(combinedJsSource),
  };

  let classification = 'PACKAGE_FIXED_READY_FOR_AIRTRUST_TEST';
  const findings = [];

  if (!launchFile || !existsSync(path.join(dirPath, launchFile))) {
    classification = 'PACKAGE_REPACKAGING_REQUIRED';
    findings.push('launch file ausente ou divergente do imsmanifest.xml');
  }

  if (!scormSignals.initialize || !scormSignals.setValue || !scormSignals.commit || !scormSignals.finish) {
    classification = 'PACKAGE_REPACKAGING_REQUIRED';
    findings.push('bundle SCORM sem evidência mínima de Initialize/SetValue/Commit/Finish');
  }

  if (!scormSignals.lessonLocation || !scormSignals.suspendData || !scormSignals.lessonStatus) {
    classification = 'PACKAGE_REPACKAGING_REQUIRED';
    findings.push('bundle SCORM sem evidência textual de location/suspend_data/status');
  }

  if (missingAssets.length > 0 || blankSlideCandidates.length > 0) {
    classification = 'PACKAGE_CONTENT_REVIEW_REQUIRED';
  }
  if (missingAssets.length > 0) {
    findings.push(`ativos referenciados e ausentes: ${missingAssets.length}`);
  }
  if (blankSlideCandidates.length > 0) {
    findings.push(`slides potencialmente vazios: ${blankSlideCandidates.join(', ')}`);
  }
  if (scormSignals.nativeAlert) {
    classification = 'PACKAGE_REPACKAGING_REQUIRED';
    findings.push('bundle contém alert() nativo');
  }

  return {
    folder: path.basename(dirPath),
    title,
    launchFile,
    slideCount,
    referencedAssets: referencedAssets.length,
    missingAssets,
    blankSlideCandidates,
    scormSignals,
    classification,
    findings,
  };
}

function buildPriorityStatus(packages) {
  const normalizedTitles = new Set(
    packages.flatMap((pkg) => [normalizeText(pkg.title), normalizeText(pkg.folder)]),
  );

  return priorityCourses.map((course) => {
    const courseKey = normalizeText(course.name);
    const matched = Array.from(normalizedTitles).some((value) => {
      if (!value) return false;
      return value.includes(courseKey) || courseKey.includes(value);
    });

    return {
      ...course,
      status: matched ? 'SOURCE_PRESENT_LOCALLY' : 'PACKAGE_BLOCKED_BY_MISSING_SOURCE',
    };
  });
}

const packages = listPackageDirs(packagesRoot).map(analyzePackage);
const priorityStatus = buildPriorityStatus(packages);

const report = {
  generatedAt: new Date().toISOString(),
  workspaceRoot,
  packagesRoot,
  packages,
  priorityStatus,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
