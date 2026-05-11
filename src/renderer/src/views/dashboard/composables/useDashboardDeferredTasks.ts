import { onBeforeUnmount, onMounted } from 'vue'

type DeferredTask = {
  label: string
  delayMs: number
  task: () => Promise<void> | void
}

export function useDashboardDeferredTasks(options: {
  startDashboardBootstrap: (config: {
    immediateTasks?: Array<() => Promise<void> | void>
    deferredTasks?: DeferredTask[]
    afterFrame?: () => void
  }) => void
  stopDashboardBootstrap: (config?: {
    routePerf?: { from?: unknown; to?: unknown; categoryId?: unknown; startedAt?: unknown } | null
    cleanup?: () => void
  }) => void
  routePerfGetter: () => { from?: unknown; to?: unknown; categoryId?: unknown; startedAt?: unknown } | null
  immediateTasks: Array<() => Promise<void> | void>
  deferredTasks: DeferredTask[]
  afterFrame?: () => void
  cleanup?: () => void
}) {
  onMounted(() => {
    options.startDashboardBootstrap({
      immediateTasks: options.immediateTasks,
      deferredTasks: options.deferredTasks,
      afterFrame: options.afterFrame
    })
  })

  onBeforeUnmount(() => {
    options.stopDashboardBootstrap({
      routePerf: options.routePerfGetter(),
      cleanup: options.cleanup
    })
  })
}
