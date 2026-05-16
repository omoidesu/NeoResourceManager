import { h, onMounted, ref, watch } from 'vue'
import type { MenuOption } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import { createLogger } from '../../../../main/util/logger'
import { preloadCategoryDetailRoute } from '../../router'

type CategoryMenuItem = {
  emoji?: string
  id: string
  name: string
}

const SYSTEM_ROUTE_KEYS = new Set(['dashboard', 'search', 'setting', 'about'])

const emitRendererTiming = (message: string, meta?: Record<string, unknown>) => {
  window.api?.diagnostics?.logRenderer('info', message, meta)
}

const renderMenuIcon = (emoji: string) => () => h('span', { class: 'app-menu-icon' }, emoji)
const renderMenuLabel = (title: string, caption: string) => () => h(
  'div',
  { class: 'app-menu-item' },
  [
    h('div', { class: 'app-menu-item__title' }, title),
    h('div', { class: 'app-menu-item__caption' }, caption)
  ]
)

const buildMenuOptions = (categoryItems: CategoryMenuItem[]): MenuOption[] => [
  {
    label: renderMenuLabel('主页', '总览与最近活动'),
    key: 'dashboard',
    icon: renderMenuIcon('🏠')
  },
  ...categoryItems.map((item) => ({
    label: renderMenuLabel(item.name, '资源分类'),
    key: item.id,
    icon: renderMenuIcon(item.emoji || '📁')
  })),
  {
    label: renderMenuLabel('资源管理', '问题整理与归档'),
    key: 'search',
    icon: renderMenuIcon('🛠️')
  },
  {
    label: renderMenuLabel('设置', '偏好与运行选项'),
    key: 'setting',
    icon: renderMenuIcon('⚙')
  },
  {
    label: renderMenuLabel('关于', '项目与版本信息'),
    key: 'about',
    icon: renderMenuIcon('✨')
  }
]

export const useMainLayoutNavigation = () => {
  const router = useRouter()
  const route = useRoute()
  const logger = createLogger('main-layout-navigation')
  const activeKey = ref('dashboard')
  const menuOptions = ref<MenuOption[]>([])
  const previousRouteName = ref('')
  const previousRouteFullPath = ref('')
  let categoryDetailPreloadStarted = false

  const preloadCategoryDetailChunk = (reason: string) => {
    const startedAt = performance.now()
    const result = preloadCategoryDetailRoute()
    if (result.status === 'cached' || result.status === 'pending' || categoryDetailPreloadStarted) {
      return
    }

    categoryDetailPreloadStarted = true
    emitRendererTiming('category route preload', {
      reason,
      status: result.status
    })

    result.promise
      .then(() => {
        emitRendererTiming('category route preload end', {
          reason,
          status: result.status,
          elapsedMs: Math.round(performance.now() - startedAt)
        })
      })
      .catch((error) => {
        categoryDetailPreloadStarted = false
        emitRendererTiming('category route preload end', {
          reason,
          status: 'error',
          elapsedMs: Math.round(performance.now() - startedAt),
          error: error instanceof Error ? error.message : String(error)
        })
      })
  }

  const handleMenuPreloadIntent = (reason: string) => {
    if (route.name === 'category') {
      return
    }

    preloadCategoryDetailChunk(reason)
  }

  const handleMenuClick = async (key: string) => {
    const normalizedKey = String(key ?? '').trim()
    const currentRouteName = String(route.name ?? '').trim()
    const currentCategoryId = String(route.params.id ?? '').trim()
    const clickedAt = performance.now()
    emitRendererTiming('menu navigation click', {
      key: normalizedKey,
      currentRouteName: currentRouteName || null,
      currentCategoryId: currentCategoryId || null,
      clickedAtMs: Math.round(clickedAt)
    })
    activeKey.value = key

    if (SYSTEM_ROUTE_KEYS.has(normalizedKey)) {
      if (currentRouteName === normalizedKey) {
        logger.debug('skip same-route system navigation', { key: normalizedKey })
        return
      }

      logger.debug('navigate to system route', { key })
      await router.push({ name: normalizedKey })
      emitRendererTiming('menu navigation settled', {
        key: normalizedKey,
        routeName: normalizedKey,
        elapsedMs: Math.round(performance.now() - clickedAt)
      })
      return
    }

    if (currentRouteName === 'category' && currentCategoryId === normalizedKey) {
      logger.debug('skip same-route category navigation', { key: normalizedKey })
      return
    }

    preloadCategoryDetailChunk('menu-click')
    logger.debug('navigate to category route', { key })
    ;(window as any).__nrmCategoryMenuClickPerf = {
      startedAt: clickedAt,
      fromName: currentRouteName || null,
      fromPath: route.fullPath,
      categoryId: normalizedKey
    }
    await router.push({
      name: 'category',
      params: {
        id: normalizedKey
      }
    })
    emitRendererTiming('menu navigation settled', {
      key: normalizedKey,
      routeName: 'category',
      categoryId: normalizedKey,
      elapsedMs: Math.round(performance.now() - clickedAt)
    })
  }

  onMounted(async () => {
    const mountedAt = performance.now()
    const bootStartedAt = Number((window as any).__nrmRendererBootPerf?.startedAt ?? mountedAt)
    emitRendererTiming('main layout bootstrap', {
      phase: 'mounted-start',
      sinceRendererStartMs: Math.round(mountedAt - bootStartedAt)
    })

    requestAnimationFrame(() => {
      emitRendererTiming('main layout bootstrap', {
        phase: 'first-frame',
        elapsedMs: Math.round(performance.now() - mountedAt),
        sinceRendererStartMs: Math.round(performance.now() - bootStartedAt)
      })
    })

    let categoryItems: CategoryMenuItem[] = []
    const categoryStartedAt = performance.now()
    emitRendererTiming('main layout bootstrap', {
      phase: 'menu-category-start',
      sinceRendererStartMs: Math.round(categoryStartedAt - bootStartedAt)
    })
    try {
      categoryItems = await window.api.db.getCategory()
    } catch (error) {
      logger.error('failed to load category menu', error)
    }
    emitRendererTiming('main layout bootstrap', {
      phase: 'menu-category-end',
      elapsedMs: Math.round(performance.now() - categoryStartedAt),
      categoryCount: categoryItems.length,
      sinceRendererStartMs: Math.round(performance.now() - bootStartedAt)
    })

    menuOptions.value = buildMenuOptions(categoryItems)
    emitRendererTiming('main layout bootstrap', {
      phase: 'menu-ready',
      elapsedMs: Math.round(performance.now() - mountedAt),
      optionCount: menuOptions.value.length,
      sinceRendererStartMs: Math.round(performance.now() - bootStartedAt)
    })
  })

  watch(
    () => [route.name, route.params.id],
    ([name]) => {
      if (typeof name !== 'string') {
        return
      }

      if (SYSTEM_ROUTE_KEYS.has(name)) {
        activeKey.value = name
        return
      }

      if (name === 'category') {
        activeKey.value = String(route.params.id ?? '')
      }
    },
    { immediate: true }
  )

  watch(
    () => route.fullPath,
    (nextPath) => {
      const lastRouteName = previousRouteName.value
      const lastRouteFullPath = previousRouteFullPath.value
      const nextName = String(route.name ?? '')

      emitRendererTiming('renderer route changed', {
        fromName: lastRouteName || null,
        fromPath: lastRouteFullPath || null,
        toName: nextName || null,
        toPath: nextPath
      })

      const isDashboardToCategory = nextName === 'category'
        && (lastRouteName === 'dashboard' || lastRouteFullPath === '/')
        && lastRouteFullPath

      if (isDashboardToCategory) {
        const routeChangedAt = performance.now()
        const menuClickPerf = ((window as any).__nrmCategoryMenuClickPerf ?? null) as null | {
          startedAt: number
          categoryId: string
          fromName?: string | null
          fromPath?: string | null
        }
        const nextCategoryId = String(route.params.id ?? '')
        const hasMatchingMenuClick = menuClickPerf?.categoryId === nextCategoryId
        const startedAt = hasMatchingMenuClick ? menuClickPerf.startedAt : routeChangedAt
        ;(window as any).__nrmCategoryRoutePerf = {
          startedAt,
          from: lastRouteFullPath,
          to: nextPath,
          categoryId: nextCategoryId
        }
        emitRendererTiming('route transition start', {
          from: lastRouteFullPath,
          to: nextPath,
          categoryId: nextCategoryId,
          startedAtMs: Math.round(startedAt),
          routeChangedAtMs: Math.round(routeChangedAt),
          clickToRouteMs: hasMatchingMenuClick ? Math.round(routeChangedAt - startedAt) : null
        })
      }

      previousRouteName.value = nextName
      previousRouteFullPath.value = nextPath
    },
    { immediate: true }
  )

  return {
    activeKey,
    handleMenuClick,
    handleMenuPreloadIntent,
    menuOptions
  }
}
