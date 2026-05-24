<script setup lang="ts">
import MainLayout from "./components/MainLayout.vue";
import {onBeforeUnmount, onMounted, ref, watch} from "vue";
import {Settings} from "../../common/constants";
import { notify, setNotificationTheme } from "./utils/notification";
import { pushNotificationCenterItem, removeOngoingCenterItem, upsertOngoingCenterItem } from "./utils/notification-center";
import type { ResourceArchiveProgressMessage, WebsiteCoverProgressMessage } from "../../main/service/notification-queue.service";
import { normalizeCoverPreviewSource, normalizeWebsiteIconSource, resolveImagePreviewSource } from './shared/preview/usePreviewAssetLoader'

const appIsDark = ref(true)
const blurAllImages = ref(false)
let stopNotificationPushListener: null | (() => void) = null
let stopResourceArchiveProgressListener: null | (() => void) = null
let stopWebsiteCoverProgressListener: null | (() => void) = null
const RESOURCE_ARCHIVE_ONGOING_PREFIX = 'resource-archive:'
const WEBSITE_COVER_ONGOING_PREFIX = 'website-cover:'
const archiveCoverPreviewCache = new Map<string, string>()
const websiteFaviconPreviewCache = new Map<string, string>()
const formatArchiveProgressText = (message: ResourceArchiveProgressMessage) => {
  const progress = Math.max(0, Math.min(100, Number(message.progress ?? 0)))
  const current = Math.max(0, Number(message.current ?? 0))
  const total = Math.max(0, Number(message.total ?? 0))
  if (total > 0) {
    return `${progress}% (${current}/${total})`
  }

  return `${progress}%`
}
const resolveArchiveOverallPercent = (message: ResourceArchiveProgressMessage) => {
  const current = Math.max(1, Number(message.current ?? 1))
  const total = Math.max(1, Number(message.total ?? 1))
  const completedCount = message.done ? current : Math.max(0, current - 1)
  return Math.max(0, Math.min(100, Math.round((completedCount / total) * 100)))
}
const resolveArchiveCoverPreview = async (coverPath: string) => {
  const normalizedPath = String(coverPath ?? '').trim()
  if (!normalizedPath) {
    return ''
  }

  if (archiveCoverPreviewCache.has(normalizedPath)) {
    return String(archiveCoverPreviewCache.get(normalizedPath) ?? '')
  }

  try {
    const previewUrl = await resolveImagePreviewSource(normalizeCoverPreviewSource(normalizedPath), {
      maxWidth: 480,
      maxHeight: 320,
      fit: 'inside',
      quality: 90
    })
    const normalizedPreviewUrl = String(previewUrl ?? '').trim()
    if (normalizedPreviewUrl) {
      archiveCoverPreviewCache.set(normalizedPath, normalizedPreviewUrl)
    }
    return normalizedPreviewUrl
  } catch {
    return ''
  }
}

const resolveWebsiteFaviconPreview = async (faviconPath: string) => {
  const normalizedPath = normalizeWebsiteIconSource(String(faviconPath ?? '').trim())
  if (!normalizedPath) {
    return ''
  }

  if (websiteFaviconPreviewCache.has(normalizedPath)) {
    return String(websiteFaviconPreviewCache.get(normalizedPath) ?? '')
  }

  try {
    const previewUrl = await resolveImagePreviewSource(normalizedPath, {
      maxWidth: 64,
      maxHeight: 64,
      fit: 'cover',
      quality: 80,
      fallbackToFileUrl: true
    }, normalizeWebsiteIconSource)
    const normalizedPreviewUrl = String(previewUrl ?? '').trim()
    if (normalizedPreviewUrl) {
      websiteFaviconPreviewCache.set(normalizedPath, normalizedPreviewUrl)
    }
    return normalizedPreviewUrl
  } catch {
    return ''
  }
}

const emitRendererTiming = (message: string, meta?: Record<string, unknown>) => {
  window.api?.diagnostics?.logRenderer('info', message, meta)
}

const applyBlurImageSetting = (rawValue: unknown) => {
  const normalizedValue = String(rawValue ?? '').trim().toLowerCase()
  blurAllImages.value = ['1', 'true', 'yes', 'on'].includes(normalizedValue)
}

const handleAppSettingsChanged = (event: Event) => {
  const customEvent = event as CustomEvent<{ settings?: Record<string, string> }>
  const nextValue = customEvent.detail?.settings?.[Settings.BLUR_ALL_IMAGES.name]
  if (nextValue == null) {
    return
  }

  applyBlurImageSetting(nextValue)
}

const handleResourceArchiveProgress = async (message: ResourceArchiveProgressMessage) => {
  const ongoingId = `${RESOURCE_ARCHIVE_ONGOING_PREFIX}${String(message.taskId ?? message.resourceId ?? '')}`
  const resourceTitle = String(message.title ?? '资源归档').trim() || '资源归档'
  const operation = String(message.operation ?? 'archive') === 'restore' ? 'restore' : 'archive'
  const operationTitle = operation === 'restore' ? '资源还原' : '资源归档'
  const content = String(message.message ?? '').trim() || '正在归档资源'
  const progressText = formatArchiveProgressText(message)
  const overallPercent = resolveArchiveOverallPercent(message)
  const current = Math.max(1, Number(message.current ?? 1))
  const total = Math.max(1, Number(message.total ?? 1))
  const singleProgress = Math.max(0, Math.min(100, Number(message.progress ?? 0)))
  const summaryLine = `第${current}个，共${total}个 (${overallPercent}%)`
  const detailLine = `${content} (${singleProgress}%)`
  const detailTitle = content
  const detailProgressLabel = `${singleProgress}%`
  const coverSrc = await resolveArchiveCoverPreview(String(message.coverPath ?? ''))

  if (!message.done) {
    window.dispatchEvent(new CustomEvent('resource-archive-progress', {
      detail: message
    }))
    upsertOngoingCenterItem({
      id: ongoingId,
      title: operation === 'restore' ? '资源还原进行中' : '资源归档进行中',
      content: `${summaryLine}\n${detailLine}`,
      progress: Number(message.progress ?? 0),
      meta: {
        coverSrc,
        resourceTitle,
        summaryLine,
        detailLine,
        detailTitle,
        detailProgressLabel,
        progressText
      }
    })
    return
  }

  window.dispatchEvent(new CustomEvent('resource-archive-progress', {
    detail: message
  }))
  removeOngoingCenterItem(ongoingId)
  notify(message.success ? 'success' : 'error', operationTitle, content)
  pushNotificationCenterItem({
    type: message.success ? 'success' : 'error',
    title: operationTitle,
    content: `${resourceTitle}\n${content}`
  })
  window.dispatchEvent(new CustomEvent('resource-archive-finished', {
    detail: message
  }))
}

const handleWebsiteCoverProgress = async (message: WebsiteCoverProgressMessage) => {
  const taskId = String(message.taskId ?? '').trim()
  const ongoingId = `${WEBSITE_COVER_ONGOING_PREFIX}${taskId || 'default'}`
  const current = Math.max(0, Number(message.current ?? 0))
  const total = Math.max(0, Number(message.total ?? 0))
  const progress = Math.max(0, Math.min(100, Number(message.progress ?? 0)))
  const title = String(message.title ?? '').trim() || '网站'
  const url = String(message.url ?? '').trim()
  const content = String(message.message ?? '').trim() || '正在获取网站图标和封面'
  const iconSrc = await resolveWebsiteFaviconPreview(String(message.favicon ?? ''))
  const summaryLine = total > 0
    ? `第 ${Math.min(total, Math.max(1, current))} / ${total} 个网站 (${progress}%)`
    : `${progress}%`
  const isDone = Boolean(message.done) || (total > 0 && current >= total && progress >= 100)

  if (!isDone) {
    upsertOngoingCenterItem({
      id: ongoingId,
      title: '网站图标和封面获取中',
      content: `${summaryLine}\n${title}`,
      progress,
      meta: {
        summaryLine,
        detailLine: url || content,
        detailTitle: title,
        iconSrc,
        detailProgressLabel: `${progress}%`
      }
    })
    return
  }

  removeOngoingCenterItem(ongoingId)
  const successCount = Number(message.successCount ?? 0)
  const failedCount = Number(message.failedCount ?? 0)
  const skippedCount = Number(message.skippedCount ?? 0)
  const resultContent = total > 0
    ? `处理完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`
    : content
  const type = message.success === false ? 'warning' : 'success'
  notify(type, '网站图标和封面', resultContent)
  pushNotificationCenterItem({
    type,
    title: '网站图标和封面',
    content: resultContent
  })
}

onMounted(async () => {
  const mountedAt = performance.now()
  const bootStartedAt = Number((window as any).__nrmRendererBootPerf?.startedAt ?? mountedAt)
  emitRendererTiming('app settings bootstrap', {
    phase: 'mounted-start',
    sinceRendererStartMs: Math.round(mountedAt - bootStartedAt)
  })

  const notificationStartedAt = performance.now()
  stopNotificationPushListener = window.api.service.onNotificationPush((message) => {
    notify(message.type, message.title, message.content, {
      aggregateKey: message.aggregateKey,
      aggregateCount: Number(message.aggregateCount ?? 1),
      replaceExisting: Boolean(message.replaceExisting)
    })
  })
  stopResourceArchiveProgressListener = window.api.service.onResourceArchiveProgress(handleResourceArchiveProgress)
  stopWebsiteCoverProgressListener = window.api.service.onWebsiteCoverProgress(handleWebsiteCoverProgress)
  await window.api.service.startNotificationPush()
  emitRendererTiming('app settings bootstrap', {
    phase: 'notification-ready',
    elapsedMs: Math.round(performance.now() - notificationStartedAt),
    sinceRendererStartMs: Math.round(performance.now() - bootStartedAt)
  })

  const settingsStartedAt = performance.now()
  const [theme, blurSetting] = await Promise.all([
    window.api.db.getSetting(Settings.THEME_TYPE),
    window.api.db.getSetting(Settings.BLUR_ALL_IMAGES)
  ])
  emitRendererTiming('app settings bootstrap', {
    phase: 'settings-loaded',
    elapsedMs: Math.round(performance.now() - settingsStartedAt),
    sinceRendererStartMs: Math.round(performance.now() - bootStartedAt)
  })
  if (!theme || theme.value === 'dark') {
    appIsDark.value = true
  } else {
    appIsDark.value = false
  }
  applyBlurImageSetting(blurSetting?.value ?? Settings.BLUR_ALL_IMAGES.default)
  setNotificationTheme(appIsDark.value)
  window.addEventListener('app-settings-changed', handleAppSettingsChanged as EventListener)
  emitRendererTiming('app settings bootstrap', {
    phase: 'mounted-end',
    elapsedMs: Math.round(performance.now() - mountedAt),
    sinceRendererStartMs: Math.round(performance.now() - bootStartedAt)
  })
})

watch(() => appIsDark.value,
  (newVal, _) => {
    setNotificationTheme(newVal)
    window.api.db.setSetting(Settings.THEME_TYPE, newVal ? 'dark' : 'light')
  })

onBeforeUnmount(() => {
  stopNotificationPushListener?.()
  stopNotificationPushListener = null
  stopResourceArchiveProgressListener?.()
  stopResourceArchiveProgressListener = null
  stopWebsiteCoverProgressListener?.()
  stopWebsiteCoverProgressListener = null
  window.removeEventListener('app-settings-changed', handleAppSettingsChanged as EventListener)
})
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--blur-all-images': blurAllImages }">
    <MainLayout v-model:isDark="appIsDark"/>
  </div>
</template>

<style>
html, body, #app {
  height: 100vh;
  margin: 0;
  overflow: hidden;
}

.app-shell {
  height: 100%;
}

.app-shell--blur-all-images .resource-card__cover-image,
.app-shell--blur-all-images .resource-card__website-cover-icon {
  filter: blur(18px) !important;
  transition: filter 0.2s ease;
}

.app-shell--blur-all-images .cover-card__art::before {
  filter: blur(18px) saturate(0.74) brightness(0.8) !important;
  transform: scale(1.08);
  transition: filter 0.2s ease, transform 0.2s ease;
}

.app-shell--blur-all-images .next-play-hero::before,
.app-shell--blur-all-images .next-play-mini-card::before,
.app-shell--blur-all-images .queue-pinned-card::before {
  display: none !important;
}

.app-shell--blur-all-images .next-play-hero,
.app-shell--blur-all-images .next-play-mini-card,
.app-shell--blur-all-images .queue-pinned-card {
  background-image: none !important;
}

.app-shell--blur-all-images .next-play-hero {
  background: color-mix(in srgb, currentColor 26%, var(--home-solid-panel-alt, #161616)) !important;
  border: 1px solid color-mix(in srgb, currentColor 42%, transparent) !important;
}

.app-shell--blur-all-images .next-play-mini-card {
  background: color-mix(in srgb, currentColor 22%, var(--home-solid-panel-alt, #161616)) !important;
  border: 1px solid color-mix(in srgb, currentColor 38%, transparent) !important;
}

.app-shell--blur-all-images .queue-pinned-card {
  background: color-mix(in srgb, var(--home-panel-subtle, #1f2937) 78%, var(--home-solid-panel, #1b1b1b)) !important;
}
</style>
