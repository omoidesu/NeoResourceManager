import {createRouter, createWebHashHistory} from "vue-router";

const emitRouterTiming = (message: string, meta?: Record<string, unknown>) => {
  window.api?.diagnostics?.logRenderer('info', message, meta)
}

let dashboardRouteLoadPromise: Promise<typeof import('../views/dashboard/index.vue')> | null = null
let categoryDetailRoutePreloadPromise: Promise<typeof import('../views/CategoryDetail.vue')> | null = null
let categoryDetailRoutePreloaded = false

const loadDashboardView = () => {
  if (dashboardRouteLoadPromise) {
    return dashboardRouteLoadPromise
  }

  const startedAt = performance.now()
  emitRouterTiming('route component load', {
    routeName: 'dashboard',
    phase: 'start'
  })
  dashboardRouteLoadPromise = import('../views/dashboard/index.vue')
    .then((module) => {
      emitRouterTiming('route component load', {
        routeName: 'dashboard',
        phase: 'end',
        elapsedMs: Math.round(performance.now() - startedAt)
      })
      return module
    })
    .catch((error) => {
      dashboardRouteLoadPromise = null
      emitRouterTiming('route component load', {
        routeName: 'dashboard',
        phase: 'error',
        elapsedMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    })

  return dashboardRouteLoadPromise
}

const loadCategoryDetailView = () => {
  if (categoryDetailRoutePreloadPromise) {
    return categoryDetailRoutePreloadPromise
  }

  categoryDetailRoutePreloadPromise = import('../views/CategoryDetail.vue')
    .then((module) => {
      categoryDetailRoutePreloaded = true
      return module
    })
    .catch((error) => {
      categoryDetailRoutePreloadPromise = null
      throw error
    })

  return categoryDetailRoutePreloadPromise
}

export const preloadCategoryDetailRoute = () => {
  if (categoryDetailRoutePreloaded) {
    return {
      status: 'cached' as const,
      promise: Promise.resolve()
    }
  }

  if (categoryDetailRoutePreloadPromise) {
    return {
      status: 'pending' as const,
      promise: categoryDetailRoutePreloadPromise
    }
  }

  return {
    status: 'started' as const,
    promise: loadCategoryDetailView()
  }
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {path: '/', name: 'dashboard', component: loadDashboardView},
    {path: '/search', name: 'search', component: () => import('../views/search/index.vue')},
    {path: '/setting', name: 'setting', component: () => import('../views/setting/index.vue')},
    {path: '/about', name: 'about', component: () => import('../views/about/index.vue')},
    {
      path: '/category/:id',
      name: 'category',
      component: loadCategoryDetailView,
      props: true
    }
  ]
})

export default router
