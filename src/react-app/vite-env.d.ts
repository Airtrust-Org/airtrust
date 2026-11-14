/// <reference types="vite/client" />

// Injetado pelo `define` do Vite (vite.config.ts); ausente em testes/dev, por isso
// config/deployment.ts protege o acesso com `typeof`.
declare const __APP_BUILD_VERSION__: string;
