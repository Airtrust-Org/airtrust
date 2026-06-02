console.error('ERROR: This legacy production FRMS repair script is blocked.');
console.error(
  'Use reviewed application repair tooling or scripts/run-production-db-script.sh with explicit production confirmation.',
);
process.exit(1);
