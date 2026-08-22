// Ambient module declaration for the plain .mjs scripts under /scripts that
// some tests import directly (they run outside the Worker's TS build and
// carry no type declarations of their own). Without this, `tsc` reports
// TS7016 on every such import — a pre-existing gap on origin/main, not
// specific to any one script.
declare module '*.mjs';
