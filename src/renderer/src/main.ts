// import './assets/main.css'

import './styles/rich-markdown.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const rendererBootStartedAt = performance.now()
;(window as any).__nrmRendererBootPerf = {
  startedAt: rendererBootStartedAt
}
window.api?.diagnostics?.logRenderer('info', 'renderer app bootstrap', {
  phase: 'main-start'
})

const app = createApp(App);

app.use(router)
app.mount('#app')
window.api?.diagnostics?.logRenderer('info', 'renderer app bootstrap', {
  phase: 'mounted',
  elapsedMs: Math.round(performance.now() - rendererBootStartedAt)
})
