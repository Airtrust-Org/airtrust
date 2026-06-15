import {
  parseRemoteValidationCliArgs,
  runSigvoosStagingRemoteValidation,
} from '../src/services/controle-voos/sigvoos-staging-remote-validation';

async function main() {
  const options = parseRemoteValidationCliArgs(process.argv.slice(2));
  const report = await runSigvoosStagingRemoteValidation(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error ?? 'SIGVOOS_STAGING_VALIDATION_ERROR');
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
