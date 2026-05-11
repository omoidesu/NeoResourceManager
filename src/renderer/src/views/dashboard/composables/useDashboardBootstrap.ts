import { ref } from 'vue'

type RendererTimingPayload = Record<string, unknown> | undefined
type EmitRendererTiming = (message: string, meta?: RendererTimingPayload) => void
type DeferredDashboardTask = {
  label: string
  delayMs: number
  task: () => Promise<void> | void
}

export function useDashboardBootstrap(options: {
  emitRendererTiming: EmitRendererTiming
  routeNameGetter: () => unknown
}) {
  const dashboardDisposed = ref(false)
  const scheduledDashboardTaskTimers: number[] = []

  const isDashboardPreviewWorkAllowed = () => !dashboardDisposed.value && options.routeNameGetter() === 'dashboard'

  const measureDashboardTask = async <T,>(
    label: string,
    task: () => Promise<T>,
    extra?: Record<string, unknown>
  ) => {
    const startedAt = performance.now()
    options.emitRendererTiming('dashboard task start', {
      label,
      ...(extra ?? {})
    })

    try {
      const result = await task()
      options.emitRendererTiming('dashboard task end', {
        label,
        elapsedMs: Math.round(performance.now() - startedAt),
        status: 'success',
        ...(extra ?? {})
      })
      return result
    } catch (error) {
      options.emitRendererTiming('dashboard task end', {
        label,
        elapsedMs: Math.round(performance.now() - startedAt),
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        ...(extra ?? {})
      })
      throw error
    }
  }

  const scheduleDashboardDeferredTask = (label: string, delayMs: number, task: () => Promise<void> | void) => {
    const timer = window.setTimeout(() => {
      const index = scheduledDashboardTaskTimers.indexOf(timer)
      if (index >= 0) {
        scheduledDashboardTaskTimers.splice(index, 1)
      }

      if (dashboardDisposed.value) {
        return
      }

      options.emitRendererTiming('dashboard deferred task start', {
        label,
        delayMs
      })

      Promise.resolve(task()).catch(() => {
        // concrete loaders handle their own errors; keep bootstrap resilient
      })
    }, delayMs)

    scheduledDashboardTaskTimers.push(timer)
  }

  const startDashboardBootstrap = (config: {
    immediateTasks?: Array<() => Promise<void> | void>
    deferredTasks?: DeferredDashboardTask[]
    afterFrame?: () => void
  }) => {
    dashboardDisposed.value = false
    options.emitRendererTiming('dashboard lifecycle', {
      phase: 'mounted'
    })

    for (const task of config.immediateTasks ?? []) {
      Promise.resolve(task()).catch(() => {
        // concrete loaders handle their own errors
      })
    }

    for (const deferredTask of config.deferredTasks ?? []) {
      scheduleDashboardDeferredTask(deferredTask.label, deferredTask.delayMs, deferredTask.task)
    }

    if (config.afterFrame) {
      requestAnimationFrame(config.afterFrame)
    }
  }

  const stopDashboardBootstrap = (config: {
    routePerf?: { from?: unknown; to?: unknown; categoryId?: unknown; startedAt?: unknown } | null
    cleanup?: () => void
  } = {}) => {
    dashboardDisposed.value = true
    options.emitRendererTiming('dashboard lifecycle', {
      phase: 'beforeUnmount',
      pendingDeferredTaskCount: scheduledDashboardTaskTimers.length
    })

    while (scheduledDashboardTaskTimers.length) {
      const timer = scheduledDashboardTaskTimers.pop()
      if (timer != null) {
        clearTimeout(timer)
      }
    }

    const routePerf = config.routePerf
    if (routePerf && String(routePerf.from ?? '').includes('/')) {
      options.emitRendererTiming('dashboard route exit', {
        to: String(routePerf.to ?? ''),
        categoryId: String(routePerf.categoryId ?? ''),
        elapsedMs: Math.round(performance.now() - Number(routePerf.startedAt ?? 0))
      })
    }

    config.cleanup?.()
  }

  return {
    dashboardDisposed,
    isDashboardPreviewWorkAllowed,
    measureDashboardTask,
    scheduleDashboardDeferredTask,
    startDashboardBootstrap,
    stopDashboardBootstrap
  }
}
