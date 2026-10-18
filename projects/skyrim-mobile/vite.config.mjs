import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
export default defineConfig({
 base:'./',
 build:{rollupOptions:{input:{valley:resolve(here,'index.html'),moon:resolve(here,'moon.html')}}}
});
