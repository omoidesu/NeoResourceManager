import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import Components from "unplugin-vue-components/vite";
import {NaiveUiResolver} from "unplugin-vue-components/resolvers";

const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version?: string }
const appVersion = packageJson.version ?? '0.0.0'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    },
    server: {
      host: '127.0.0.1',
      port: 1420
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@': resolve(__dirname, 'src'),
      }
    },
    plugins: [
      vue(),
      Components({
        resolvers: [NaiveUiResolver()]
      })
    ]
  },
})
