import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./e2e/ci',
  testMatch:/lms-scorm-enrollment-browser\.spec\.ts$/,
  forbidOnly:Boolean(process.env.CI),timeout:120000,retries:0,workers:1,fullyParallel:false,
  reporter:[['list']],
  use:{baseURL:'http://127.0.0.1:8787',actionTimeout:15000,navigationTimeout:25000,trace:'off',screenshot:'off',video:'off'},
  projects:[
    {name:'chromium',use:devices['Desktop Chrome']},
    {name:'webkit-ipad',use:devices['iPad Pro 11']},
  ],
});
