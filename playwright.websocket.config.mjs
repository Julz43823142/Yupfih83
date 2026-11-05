import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/auth',
  testMatch:['online.websocket.spec.mjs'],
  workers:1,
  timeout:120000,
  use:{headless:true,viewport:{width:1280,height:900}}
});
