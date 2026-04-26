<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Icon, addCollection } from '@iconify/vue'
import materialSymbolsLightIcons from '@iconify-json/material-symbols-light/icons.json'
import { NIcon } from 'naive-ui'
import { getWebsitePlaceholderEmoji } from '../../utils/website-placeholder-emoji'
import {
  CheckmarkCircleOutline,
  CreateOutline,
  FolderOpenOutline,
  HeartDislikeOutline,
  HeartOutline,
  ImageOutline,
  InformationCircleOutline,
  AlertCircleOutline,
  CheckmarkDoneOutline,
  SquareOutline,
  BookOutline,
  DocumentTextOutline,
  Play,
  ReaderOutline,
  Stop,
  TrashOutline
} from '@vicons/ionicons5'

addCollection(materialSymbolsLightIcons)

const props = defineProps<{
  resource: any
  categoryName?: string
  hideTypeLine?: boolean
  authorLabel?: string
  startText?: string
  showZoneLaunch?: boolean
  canZoneLaunch?: boolean
  showAdminLaunch?: boolean
  showMtoolLaunch?: boolean
  canMtoolLaunch?: boolean
  showCover?: boolean
  showScreenshotFolder?: boolean
  showCompletedToggle?: boolean
  showDeleteFiles?: boolean
  showModifyOrder?: boolean
  stopNeedsConfirm?: boolean
  selected?: boolean
  selectionMode?: boolean
  showDefaultAppPlay?: boolean
  defaultAppActionText?: string
  showAddToPlaylist?: boolean
}>()
const emit = defineEmits<{
  (event: 'launch', resource: any): void
  (event: 'admin-launch', resource: any): void
  (event: 'stop', resource: any): void
  (event: 'zone-launch', resource: any): void
  (event: 'mtool-launch', resource: any): void
  (event: 'show-detail', resource: any): void
  (event: 'edit', resource: any): void
  (event: 'open-folder', resource: any): void
  (event: 'default-app-play', resource: any): void
  (event: 'add-to-playlist', resource: any): void
  (event: 'open-screenshot-folder', resource: any): void
  (event: 'toggle-favorite', resource: any): void
  (event: 'toggle-completed', resource: any): void
  (event: 'toggle-select', resource: any): void
  (event: 'delete', resource: any): void
  (event: 'delete-files', resource: any): void
  (event: 'modify-order', resource: any): void
}>()

const resourceTags = computed(() => props.resource?.tags ?? [])
const resourceTypes = computed(() => props.resource?.types ?? [])
const resourceAuthors = computed(() => props.resource?.authors ?? [])
const resourceActors = computed(() => props.resource?.actors ?? [])
const resourceAlbum = computed(() => String(props.resource?.audioMeta?.album ?? '').trim())
const showAlbumLine = computed(() => String(props.categoryName ?? '').trim() === '音乐' && Boolean(resourceAlbum.value))
const coverPreviewSrc = ref('')
const fileIconSrc = ref('')
const websiteFaviconSrc = ref('')
const showContextMenu = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const showStopConfirm = ref(false)
const cardTriggerRef = ref<HTMLElement | null>(null)
const shouldLoadCoverPreview = ref(props.showCover === false)
let stopClickTimer: ReturnType<typeof setTimeout> | null = null
let coverPreviewObserver: IntersectionObserver | null = null
let coverPreviewTaskId = 0

const isNovelCategory = computed(() => String(props.categoryName ?? '').trim() === '小说')
const isMovieCategory = computed(() => String(props.categoryName ?? '').trim() === '电影')
const isAnimeCategory = computed(() => String(props.categoryName ?? '').trim() === '番剧')
const isWebsiteCategory = computed(() => String(props.categoryName ?? '').trim() === '网站')
const isVideoLikeCategory = computed(() => isMovieCategory.value || isAnimeCategory.value)
const completedLabel = computed(() => {
  if (isNovelCategory.value) {
    return '读完'
  }

  if (isMovieCategory.value) {
    return '播完'
  }

  return '通关'
})
const completedStateLabel = computed(() => `已${completedLabel.value}`)
const inactiveStatusIconColor = 'currentColor'
const favoriteIconColor = computed(() => (props.resource?.ifFavorite ? '#f0a020' : inactiveStatusIconColor))
const completedIconColor = computed(() => (props.resource?.isCompleted ? '#2080f0' : inactiveStatusIconColor))

const normalizeCoverPreviewSource = (coverPath: string) => {
  if (!coverPath) {
    return ''
  }

  if (coverPath.startsWith('//')) {
    return `https:${coverPath}`
  }

  return coverPath
}

const normalizeWebsiteIconSource = (iconPath: string) => {
  const normalizedPath = String(iconPath ?? '').trim()
  if (!normalizedPath) {
    return ''
  }

  if (normalizedPath.startsWith('//')) {
    return `https:${normalizedPath}`
  }

  return normalizedPath
}

const renderMenuIcon = (icon: any) => () => h(NIcon, null, { default: () => h(icon) })
const renderDangerLabel = (label: string) => () => h('span', {
  style: {
    color: '#ff7875',
    fontWeight: 700
  }
}, label)

const contextMenuOptions = computed(() => ([
  {
    label: props.startText || '启动',
    key: 'launch',
    disabled: !canLaunch.value,
    icon: renderMenuIcon(Play)
  },
  ...(props.showDefaultAppPlay ? [{
    label: props.defaultAppActionText || '使用默认应用打开',
    key: 'default-app-play',
    disabled: !Boolean(props.resource?.basePath) || Boolean(props.resource?.missingStatus),
    icon: renderMenuIcon(Play)
  }] : []),
  ...(props.showAddToPlaylist ? [{
    label: '加入播放列表',
    key: 'add-to-playlist',
    disabled: !Boolean(props.resource?.basePath) || Boolean(props.resource?.missingStatus),
    icon: renderMenuIcon(Play)
  }] : []),
  ...(props.showMtoolLaunch ? [{
    label: '通过 MTool 启动',
    key: 'mtool-launch',
    disabled: !props.canMtoolLaunch || !canLaunch.value,
    icon: renderMenuIcon(Play)
  }] : []),
  ...(props.showZoneLaunch ? [{
    label: '转区启动',
    key: 'zone-launch',
    disabled: !props.canZoneLaunch || !canLaunch.value,
    icon: renderMenuIcon(Play)
  }] : []),
  ...(props.showAdminLaunch ? [{
    label: '以管理员身份运行',
    key: 'admin-launch',
    disabled: !canLaunch.value,
    icon: renderMenuIcon(AlertCircleOutline)
  }] : []),
  {
    label: '详细信息',
    key: 'detail',
    icon: renderMenuIcon(InformationCircleOutline)
  },
  {
    label: '修改信息',
    key: 'edit',
    icon: renderMenuIcon(CreateOutline)
  },
  ...(props.showModifyOrder ? [{
    label: '修改顺序',
    key: 'modify-order',
    disabled: !Boolean(props.resource?.basePath) || Boolean(props.resource?.missingStatus),
    icon: renderMenuIcon(CreateOutline)
  }] : []),
  {
    label: props.selected ? '取消多选' : '多选',
    key: 'toggle-select',
    icon: renderMenuIcon(props.selected ? CheckmarkDoneOutline : SquareOutline)
  },
  {
    label: props.resource?.ifFavorite ? '取消收藏' : '收藏',
    key: 'toggle-favorite',
    disabled: !canToggleFavorite.value,
    icon: renderMenuIcon(props.resource?.ifFavorite ? HeartDislikeOutline : HeartOutline)
  },
  ...(props.showCompletedToggle ? [{
    label: props.resource?.isCompleted ? `取消${completedStateLabel.value}` : completedStateLabel.value,
    key: 'toggle-completed',
    disabled: !canToggleCompleted.value,
    icon: renderMenuIcon(CheckmarkCircleOutline)
  }] : []),
  ...(!isWebsiteCategory.value ? [{
    label: '打开文件夹',
    key: 'open-folder',
    disabled: !Boolean(props.resource?.basePath) || Boolean(props.resource?.missingStatus),
    icon: renderMenuIcon(FolderOpenOutline)
  }] : []),
  ...(props.showScreenshotFolder ? [{
    label: '打开截图文件夹',
    key: 'open-screenshot-folder',
    disabled: !Boolean(props.resource?.id),
    icon: renderMenuIcon(ImageOutline)
  }] : []),
  {
    type: 'divider',
    key: 'danger-divider'
  },
  {
    label: renderDangerLabel(`删除${props.categoryName || '资源'}`),
    key: 'delete',
    icon: renderMenuIcon(TrashOutline)
  },
  ...(!isWebsiteCategory.value ? [{
    label: renderDangerLabel('删除本地文件'),
    key: 'delete-files',
    disabled: Boolean(props.resource?.missingStatus) || !Boolean(props.resource?.basePath),
    icon: renderMenuIcon(TrashOutline)
  }] : [])
]))

const displayBaseName = computed(() => {
  const fileName = String(props.resource?.fileName ?? props.resource?.filename ?? '')
  if (fileName) {
    return fileName
  }

  const basePath = String(props.resource?.basePath ?? '')
  if (!basePath) {
    return ''
  }

  const normalizedPath = basePath.replace(/\\/g, '/')
  return normalizedPath.split('/').pop() ?? normalizedPath
})
const websiteUrl = computed(() =>
  String(
    props.resource?.websiteMeta?.url
    ?? props.resource?.websiteMeta?.website
    ?? props.resource?.meta?.website
    ?? props.resource?.website
    ?? ''
  ).trim()
)
const websiteIsDownloadLink = computed(() => Boolean(
  props.resource?.websiteMeta?.isDownloadLink
  ?? props.resource?.meta?.isDownloadLink
))
const cardSubtitle = computed(() => isWebsiteCategory.value ? websiteUrl.value : displayBaseName.value)
const websitePlaceholderEmoji = computed(() =>
  getWebsitePlaceholderEmoji(props.resource?.id, websiteUrl.value, websiteIsDownloadLink.value)
)
const showWebsiteCoverPlaceholder = computed(() =>
  isWebsiteCategory.value && !coverPreviewSrc.value && Boolean(websiteFaviconSrc.value)
)
const showWebsiteEmojiCoverPlaceholder = computed(() =>
  isWebsiteCategory.value && !coverPreviewSrc.value && !websiteFaviconSrc.value
)

const fileExtension = computed(() => {
  const fileName = displayBaseName.value
  const matched = fileName.match(/\.([^.\\/]+)$/)
  return String(matched?.[1] ?? '').trim().toLowerCase()
})

const showFileTypeIcon = computed(() => {
  const normalizedCategoryName = String(props.categoryName ?? '').trim()
  return normalizedCategoryName === '游戏' || normalizedCategoryName === '软件' || (isNovelCategory.value && Boolean(fileExtension.value))
})

const showNovelFileIcon = computed(() => isNovelCategory.value && Boolean(fileExtension.value))
const showNovelMarkdownIcon = computed(() => ['md', 'markdown'].includes(fileExtension.value))
const novelFileIcon = computed(() => {
  if (fileExtension.value === 'txt') return ReaderOutline
  if (fileExtension.value === 'pdf') return DocumentTextOutline
  return BookOutline
})
const novelFileIconTitle = computed(() => `${fileExtension.value.toUpperCase()} 文件`)

const novelPublishInfo = computed(() => {
  if (!isNovelCategory.value) {
    return ''
  }

  const rawYear = Number(props.resource?.novelMeta?.year ?? 0)
  const year = Number.isFinite(rawYear) && rawYear >= 1000 ? String(Math.trunc(rawYear)) : ''
  if (!year) {
    return ''
  }

  const publisher = String(props.resource?.novelMeta?.publisher ?? '').trim()
  return [year, publisher].filter(Boolean).join(' / ')
})

const videoYearInfo = computed(() => {
  if (!isVideoLikeCategory.value) {
    return ''
  }

  const rawYear = Number(props.resource?.videoMeta?.year ?? 0)
  return Number.isFinite(rawYear) && rawYear >= 1000 ? String(Math.trunc(rawYear)) : ''
})
const normalizeResourcePath = (value: string | null | undefined) => String(value ?? '').trim().replace(/\\/g, '/').toLowerCase()
const getFileNameFromPath = (value: string | null | undefined) => {
  const normalizedValue = String(value ?? '').trim().replace(/\\/g, '/')
  return normalizedValue.split('/').pop() ?? normalizedValue
}
const formatPlaybackTime = (value: number | null | undefined) => {
  const totalSeconds = Math.max(0, Math.floor(Number(value ?? 0)))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const minuteSegment = String(minutes).padStart(hours > 0 ? 2 : 1, '0')
  const secondSegment = String(seconds).padStart(2, '0')
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${minuteSegment}:${secondSegment}`
    : `${minuteSegment}:${secondSegment}`
}
const inferEpisodeOrderFromName = (fileName: string) => {
  const normalizedName = String(fileName ?? '').trim()
  if (!normalizedName) {
    return null
  }

  const patterns = [
    /(?:^|[^a-z])ep(?:isode)?\s*0*([0-9]{1,3})(?:[^0-9]|$)/i,
    /第\s*0*([0-9]{1,3})\s*[话話集回]/,
    /(?:^|[^0-9])0*([0-9]{1,3})(?:v[0-9]+)?(?:[^0-9]|$)/
  ]

  for (const pattern of patterns) {
    const matched = normalizedName.match(pattern)
    if (!matched) {
      continue
    }

    const order = Number(matched[1])
    if (Number.isFinite(order) && order > 0) {
      return order
    }
  }

  return null
}
const animePlaybackProgressText = computed(() => {
  if (!isAnimeCategory.value) {
    return ''
  }

  const lastPlayFile = String(props.resource?.videoMeta?.lastPlayFile ?? '').trim()
  const lastPlayTime = Math.max(0, Number(props.resource?.videoMeta?.lastPlayTime ?? 0))
  if (!lastPlayFile || lastPlayTime <= 0) {
    return ''
  }

  const normalizedLastPlayFile = normalizeResourcePath(lastPlayFile)
  const fileName = getFileNameFromPath(lastPlayFile)
  const videoSubs = Array.isArray(props.resource?.videoSubs) ? props.resource.videoSubs : []
  const matchedVideoSub = videoSubs.find((item: any) => {
    const relativePath = normalizeResourcePath(String(item?.relativePath ?? ''))
    const subFileName = normalizeResourcePath(String(item?.fileName ?? ''))
    return relativePath === normalizedLastPlayFile || subFileName === normalizeResourcePath(fileName)
  })
  const matchedOrder = Number(matchedVideoSub?.sortOrder ?? -1)
  const episodeOrder = Number.isFinite(matchedOrder) && matchedOrder >= 0
    ? matchedOrder + 1
    : inferEpisodeOrderFromName(fileName)
  const episodeLabel = episodeOrder
    ? `第${String(episodeOrder).padStart(2, '0')}集`
    : fileName

  return `${episodeLabel} / ${formatPlaybackTime(lastPlayTime)}`
})
const moviePlaybackProgressText = computed(() => {
  if (!isMovieCategory.value) {
    return ''
  }

  const lastPlayTime = Math.max(0, Number(props.resource?.videoMeta?.lastPlayTime ?? 0))
  return lastPlayTime > 0 ? formatPlaybackTime(lastPlayTime) : ''
})
const videoCoverProgressText = computed(() => animePlaybackProgressText.value || moviePlaybackProgressText.value)
const showActorLine = computed(() => (props.hideTypeLine || isVideoLikeCategory.value) && resourceActors.value.length)
const actorLineLabel = computed(() => (isVideoLikeCategory.value ? '声优/演员' : '声优'))

const fallbackExecutableIcon = computed(() => {
  const fileName = displayBaseName.value.toLowerCase()

  if (fileName.endsWith('.exe')) return '🧩'
  if (fileName.endsWith('.html') || fileName.endsWith('.htm')) return '🌐'
  if (fileName.endsWith('.swf')) return '⚡'
  if (fileName.endsWith('.apk')) return '📱'
  if (fileName.endsWith('.bat') || fileName.endsWith('.cmd')) return '⚙'

  return '📄'
})

const normalizedRating = computed(() => {
  const rating = Number(props.resource?.rating ?? -1)

  if (!Number.isFinite(rating) || rating < 0) {
    return 0
  }

  return rating
})

const isRunning = computed(() => Boolean(props.resource?.isRunning))

const launchButtonStyle = computed(() => {
  if (isRunning.value) {
    return {
      '--n-color': '#d03050',
      '--n-color-hover': '#de576d',
      '--n-color-pressed': '#ab1f3f',
      '--n-text-color': '#ffffff',
      '--n-icon-color': '#ffffff'
    }
  }

  return undefined
})

const canLaunch = computed(() => {
  if (props.selectionMode) {
    return false
  }

  if (isWebsiteCategory.value) {
    return Boolean(props.resource?.websiteMeta?.url || props.resource?.websiteMeta?.website || props.resource?.meta?.website || props.resource?.website)
  }

  return Boolean(props.resource?.basePath) && !props.resource?.missingStatus && !isRunning.value
})

const canStop = computed(() => {
  return !props.selectionMode && Boolean(props.resource?.isRunning)
})
const stopNeedsConfirm = computed(() => Boolean(props.stopNeedsConfirm))
const canToggleFavorite = computed(() => !props.selectionMode)
const canToggleCompleted = computed(() => !props.selectionMode)

const handleLaunch = () => {
  if (!canLaunch.value) {
    return
  }

  emit('launch', props.resource)
}

const handleStop = () => {
  if (!canStop.value) {
    return
  }

  emit('stop', props.resource)
}

const clearStopClickTimer = () => {
  if (stopClickTimer) {
    clearTimeout(stopClickTimer)
    stopClickTimer = null
  }
}

const handleStopButtonClick = () => {
  if (!canStop.value) {
    return
  }

  if (!stopNeedsConfirm.value) {
    handleStop()
    return
  }

  clearStopClickTimer()
  stopClickTimer = setTimeout(() => {
    showStopConfirm.value = true
    stopClickTimer = null
  }, 220)
}

const handleStopButtonDoubleClick = () => {
  if (!canStop.value) {
    return
  }

  clearStopClickTimer()
  showStopConfirm.value = false
  handleStop()
}

const handleConfirmStop = () => {
  showStopConfirm.value = false
  handleStop()
}

const handleToggleFavorite = () => {
  if (!canToggleFavorite.value) {
    return
  }

  emit('toggle-favorite', props.resource)
}

const handleToggleCompleted = () => {
  if (!canToggleCompleted.value) {
    return
  }

  emit('toggle-completed', props.resource)
}

const handleShowDetail = () => {
  if (props.selectionMode) {
    emit('toggle-select', props.resource)
    return
  }

  emit('show-detail', props.resource)
}

const handleContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  showContextMenu.value = false
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  requestAnimationFrame(() => {
    showContextMenu.value = true
  })
}

const handleSelectMenu = (key: string) => {
  showContextMenu.value = false

  if (key === 'launch') {
    handleLaunch()
    return
  }

  if (key === 'zone-launch') {
    emit('zone-launch', props.resource)
    return
  }

  if (key === 'admin-launch') {
    emit('admin-launch', props.resource)
    return
  }

  if (key === 'mtool-launch') {
    emit('mtool-launch', props.resource)
    return
  }

  if (key === 'detail') {
    emit('show-detail', props.resource)
    return
  }

  if (key === 'edit') {
    emit('edit', props.resource)
    return
  }

  if (key === 'open-folder') {
    emit('open-folder', props.resource)
    return
  }

  if (key === 'modify-order') {
    emit('modify-order', props.resource)
    return
  }

  if (key === 'default-app-play') {
    emit('default-app-play', props.resource)
    return
  }

  if (key === 'add-to-playlist') {
    emit('add-to-playlist', props.resource)
    return
  }

  if (key === 'open-screenshot-folder') {
    emit('open-screenshot-folder', props.resource)
    return
  }

  if (key === 'toggle-favorite') {
    handleToggleFavorite()
    return
  }

  if (key === 'toggle-select') {
    emit('toggle-select', props.resource)
    return
  }

  if (key === 'toggle-completed') {
    handleToggleCompleted()
    return
  }

  if (key === 'delete') {
    emit('delete', props.resource)
    return
  }

  if (key === 'delete-files') {
    emit('delete-files', props.resource)
  }
}

watch(
  () => [props.resource?.coverPath, shouldLoadCoverPreview.value, props.showCover] as const,
  async ([coverPath, shouldLoadCover, showCover]) => {
    const taskId = ++coverPreviewTaskId
    if (showCover === false) {
      coverPreviewSrc.value = ''
      return
    }

    if (!shouldLoadCover) {
      coverPreviewSrc.value = ''
      return
    }

    if (!coverPath) {
      coverPreviewSrc.value = ''
      return
    }

    const normalizedCoverPath = normalizeCoverPreviewSource(coverPath)
    if (/^https?:\/\//i.test(normalizedCoverPath) || /^data:/i.test(normalizedCoverPath)) {
      coverPreviewSrc.value = normalizedCoverPath
      return
    }

    try {
      const previewUrl = await window.api.dialog.getImagePreviewUrl(coverPath, {
        maxWidth: 520,
        maxHeight: 340,
        fit: 'cover',
        quality: 78
      })
      if (taskId !== coverPreviewTaskId) {
        return
      }
      coverPreviewSrc.value = previewUrl ?? ''
    } catch {
      if (taskId !== coverPreviewTaskId) {
        return
      }
      coverPreviewSrc.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => [props.resource?.basePath, props.resource?.fileName ?? props.resource?.filename ?? '', showNovelFileIcon.value],
  async ([basePath, fileName]) => {
    if (!showFileTypeIcon.value || showNovelFileIcon.value || !basePath) {
      fileIconSrc.value = ''
      return
    }

    try {
      fileIconSrc.value = (await window.api.dialog.getFileIconAsDataUrl(String(basePath), String(fileName ?? ''))) ?? ''
    } catch {
      fileIconSrc.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => [isWebsiteCategory.value, props.resource?.websiteMeta?.favicon] as const,
  async ([isWebsite, favicon]) => {
    if (!isWebsite || !favicon) {
      websiteFaviconSrc.value = ''
      return
    }

    const normalizedFavicon = normalizeWebsiteIconSource(String(favicon))
    if (!normalizedFavicon) {
      websiteFaviconSrc.value = ''
      return
    }

    if (/^https?:\/\//i.test(normalizedFavicon) || /^data:/i.test(normalizedFavicon)) {
      websiteFaviconSrc.value = normalizedFavicon
      return
    }

    try {
      websiteFaviconSrc.value = (await window.api.dialog.getImagePreviewUrl(normalizedFavicon, {
        maxWidth: 64,
        maxHeight: 64,
        fit: 'cover',
        quality: 80
      })) ?? ''
    } catch {
      websiteFaviconSrc.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => props.resource?.isRunning,
  (isRunningNow) => {
    if (!isRunningNow) {
      clearStopClickTimer()
      showStopConfirm.value = false
    }
  }
)

onBeforeUnmount(() => {
  clearStopClickTimer()
  coverPreviewTaskId += 1
  coverPreviewObserver?.disconnect()
  coverPreviewObserver = null
})

onMounted(() => {
  if (props.showCover === false) {
    shouldLoadCoverPreview.value = false
    return
  }

  if (typeof IntersectionObserver === 'undefined') {
    shouldLoadCoverPreview.value = true
    return
  }

  const target = cardTriggerRef.value
  if (!target) {
    shouldLoadCoverPreview.value = true
    return
  }

  coverPreviewObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      shouldLoadCoverPreview.value = true
      coverPreviewObserver?.disconnect()
      coverPreviewObserver = null
    }
  }, {
    root: null,
    rootMargin: '240px 0px',
    threshold: 0.01
  })

  coverPreviewObserver.observe(target)
})
</script>

<template>
  <div class="resource-card-shell">
    <n-dropdown
      trigger="manual"
      :show="showContextMenu"
      :x="contextMenuX"
      :y="contextMenuY"
      :options="contextMenuOptions"
      placement="bottom-start"
      @select="handleSelectMenu"
      @clickoutside="showContextMenu = false"
    >
      <div class="resource-card-dropdown-anchor" />
    </n-dropdown>

      <div ref="cardTriggerRef" class="resource-card-trigger" @contextmenu="handleContextMenu" @click="handleShowDetail">
      <n-card
        size="small"
        class="resource-card"
        :class="{
          'resource-card--selected': selected,
          'resource-card--compact': showCover === false
        }"
        embedded
      >
          <div class="resource-card__content" :class="{ 'resource-card__content--no-cover': showCover === false }">
            <div v-if="showCover !== false" class="resource-card__cover">
              <img
                v-if="coverPreviewSrc"
                :src="coverPreviewSrc"
              :alt="resource.title"
              class="resource-card__cover-image"
              draggable="false"
              />
              <div
                v-else
                class="resource-card__cover-placeholder"
                :class="{ 'resource-card__cover-placeholder--website': showWebsiteCoverPlaceholder || showWebsiteEmojiCoverPlaceholder }"
              >
                <div v-if="showWebsiteCoverPlaceholder" class="resource-card__website-cover">
                  <div class="resource-card__website-cover-glow" />
                  <div class="resource-card__website-cover-badge">
                    <img
                      :src="websiteFaviconSrc"
                      :alt="resource.title"
                      class="resource-card__website-cover-icon"
                      draggable="false"
                    />
                  </div>
                </div>
                <div v-else-if="showWebsiteEmojiCoverPlaceholder" class="resource-card__website-cover">
                  <div class="resource-card__website-cover-glow" />
                  <div class="resource-card__website-cover-badge resource-card__website-cover-badge--emoji">
                    <span class="resource-card__website-cover-emoji">{{ websitePlaceholderEmoji }}</span>
                  </div>
                </div>
                <template v-else>
                {{ categoryName || '资源' }}
                </template>
              </div>
              <div v-if="videoCoverProgressText" class="resource-card__cover-progress">
                {{ videoCoverProgressText }}
              </div>
            </div>

          <div class="resource-card__header">
            <div class="resource-card__heading">
              <div class="resource-card__title-row">
                <span v-if="showFileTypeIcon" class="resource-card__title-icon">
                  <Icon
                    v-if="showNovelMarkdownIcon"
                    icon="material-symbols-light:markdown-outline-rounded"
                    :title="novelFileIconTitle"
                    class="resource-card__title-icon-svg"
                  />
                  <n-icon v-else-if="showNovelFileIcon" :component="novelFileIcon" :title="novelFileIconTitle" />
                  <img
                    v-else-if="fileIconSrc"
                    :src="fileIconSrc"
                    :alt="displayBaseName || resource.title"
                    class="resource-card__title-icon-image"
                    draggable="false"
                  />
                  <span v-else>{{ fallbackExecutableIcon }}</span>
                </span>
                <span v-else-if="isWebsiteCategory && websiteFaviconSrc" class="resource-card__title-icon">
                  <img
                    :src="websiteFaviconSrc"
                    :alt="resource.title"
                    class="resource-card__title-icon-image resource-card__title-icon-image--favicon"
                    draggable="false"
                  />
                </span>
                <span v-else-if="isWebsiteCategory" class="resource-card__title-icon resource-card__title-icon--emoji">
                  {{ websitePlaceholderEmoji }}
                </span>
                <div class="resource-card__title" :class="{ 'resource-card__title--website': isWebsiteCategory }">{{ resource.title }}</div>
                <span
                  v-if="isWebsiteCategory && websiteIsDownloadLink"
                  class="resource-card__download-badge"
                  title="下载链接"
                >
                  下载
                </span>
              </div>
              <div
                v-if="cardSubtitle"
                class="resource-card__subtitle resource-card__subtitle--file"
                :title="isWebsiteCategory ? cardSubtitle : resource.basePath"
              >
                {{ cardSubtitle }}
              </div>
            </div>
            <div class="resource-card__status">
              <n-popover v-if="resource.missingStatus" trigger="hover">
                <template #trigger>
                  <n-icon
                    size="18"
                    class="resource-card__status-icon"
                    color="#d03050"
                  >
                    <AlertCircleOutline />
                  </n-icon>
                </template>
                资源失效
              </n-popover>
              <n-popover trigger="hover">
                <template #trigger>
                  <n-icon
                    size="18"
                    :class="[
                      'resource-card__status-icon',
                      'resource-card__status-icon--interactive',
                      { 'resource-card__status-icon--disabled': !canToggleFavorite }
                    ]"
                    :color="favoriteIconColor"
                    @click.stop="handleToggleFavorite"
                  >
                    <HeartOutline />
                  </n-icon>
                </template>
                {{ resource.ifFavorite ? '取消收藏' : '收藏' }}
              </n-popover>
              <n-popover v-if="showCompletedToggle" trigger="hover">
                <template #trigger>
                  <n-icon
                    size="18"
                    :class="[
                      'resource-card__status-icon',
                      'resource-card__status-icon--interactive',
                      { 'resource-card__status-icon--disabled': !canToggleCompleted }
                    ]"
                    :color="completedIconColor"
                    @click.stop="handleToggleCompleted"
                  >
                    <CheckmarkCircleOutline />
                  </n-icon>
                </template>
                {{ resource.isCompleted ? `取消${completedLabel}` : `标记${completedLabel}` }}
              </n-popover>
            </div>
          </div>

          <div class="resource-card__meta">
            <div v-if="resourceAuthors.length" class="resource-card__meta-line">
              <span class="resource-card__meta-label">{{ authorLabel || '作者' }}</span>
              <n-space size="small">
                <n-tag
                  v-for="author in resourceAuthors"
                  :key="`${resource.id}-${author.id}`"
                  size="small"
                  :bordered="false"
                  round
                  type="primary"
                >
                  {{ author.name }}
                </n-tag>
              </n-space>
            </div>

            <div v-if="novelPublishInfo" class="resource-card__meta-line">
              <span class="resource-card__meta-label">出版</span>
              <span class="resource-card__meta-text" :title="novelPublishInfo">{{ novelPublishInfo }}</span>
            </div>

            <div v-if="showActorLine" class="resource-card__meta-line resource-card__meta-line--single">
              <span class="resource-card__meta-label">{{ actorLineLabel }}</span>
              <n-space size="small">
                <n-tag
                  v-for="actor in resourceActors"
                  :key="`${resource.id}-${actor.id ?? actor.name}`"
                  size="small"
                  :bordered="false"
                  round
                  type="success"
                >
                  {{ actor.name }}
                </n-tag>
              </n-space>
            </div>

            <div v-if="videoYearInfo" class="resource-card__meta-line">
              <span class="resource-card__meta-label">年份</span>
              <span class="resource-card__meta-text" :title="videoYearInfo">{{ videoYearInfo }}</span>
            </div>

            <div v-if="showAlbumLine" class="resource-card__meta-line">
              <span class="resource-card__meta-label">专辑</span>
              <n-space size="small">
                <n-tag
                  size="small"
                  :bordered="false"
                  round
                  type="success"
                  :title="resourceAlbum"
                >
                  {{ resourceAlbum }}
                </n-tag>
              </n-space>
            </div>

            <div v-if="!hideTypeLine && resourceTypes.length" class="resource-card__meta-line resource-card__meta-line--single">
              <span class="resource-card__meta-label">分类</span>
              <n-space size="small">
                <n-tag
                  v-for="type in resourceTypes"
                  :key="`${resource.id}-${type.id}`"
                  size="small"
                  :bordered="false"
                  round
                  type="warning"
                >
                  {{ type.name }}
                </n-tag>
              </n-space>
            </div>

            <div v-if="resourceTags.length" class="resource-card__meta-line resource-card__meta-line--single">
              <span class="resource-card__meta-label">标签</span>
              <n-space size="small">
                <n-tag
                  v-for="tag in resourceTags.slice(0, 5)"
                  :key="`${resource.id}-${tag.id}`"
                  size="small"
                  :bordered="false"
                  round
                  type="info"
                >
                  {{ tag.name }}
                </n-tag>
                <n-tag v-if="resourceTags.length > 5" size="small" :bordered="false" round>
                  +{{ resourceTags.length - 5 }}
                </n-tag>
              </n-space>
            </div>
          </div>

        </div>
      </n-card>

      <div class="resource-card__bottom-overlay">
        <div class="resource-card__rating-chip">
          <n-rate
            :value="normalizedRating"
            readonly
            allow-half
            size="small"
          />
        </div>

        <n-popconfirm
          v-if="isRunning && stopNeedsConfirm"
          trigger="manual"
          :show="showStopConfirm"
          positive-text="直接关闭"
          negative-text="继续运行"
          @positive-click="handleConfirmStop"
          @negative-click="showStopConfirm = false"
          @clickoutside="showStopConfirm = false"
        >
          <template #trigger>
            <n-float-button
              type="error"
              class="resource-card__launch"
              description="停止"
              :disabled="!canStop"
              :style="launchButtonStyle"
              @click.stop="handleStopButtonClick"
              @dblclick.stop.prevent="handleStopButtonDoubleClick"
            >
              <n-icon>
                <Stop />
              </n-icon>
            </n-float-button>
          </template>
          游戏是否已经保存？
        </n-popconfirm>

        <n-float-button
          v-else-if="isRunning"
          type="error"
          class="resource-card__launch"
          description="停止"
          :disabled="!canStop"
          :style="launchButtonStyle"
          @click.stop="handleStop"
        >
          <n-icon>
            <Stop />
          </n-icon>
        </n-float-button>

        <n-float-button
          v-else
          type="primary"
          class="resource-card__launch"
          description="启动"
          :disabled="!canLaunch"
          @click.stop="handleLaunch()"
        >
          <n-icon>
            <Play />
          </n-icon>
        </n-float-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resource-card-shell {
  width: 100%;
  min-width: 0;
}

.resource-card-dropdown-anchor {
  position: fixed;
  width: 0;
  height: 0;
  pointer-events: none;
}

.resource-card-trigger {
  width: 100%;
  min-width: 0;
  position: relative;
  cursor: pointer;
}

.resource-card {
  width: 100%;
  height: 450px;
  cursor: pointer;
  position: relative;
  border-radius: 15px;
  overflow: hidden;
}

.resource-card--compact {
  height: 250px;
}

.resource-card--selected {
  box-shadow: inset 0 0 0 2px rgba(99, 226, 183, 0.9);
}

.resource-card__content {
  height: 100%;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  row-gap: 12px;
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
}

.resource-card__content--no-cover {
  grid-template-rows: auto minmax(0, 1fr);
  row-gap: 14px;
  padding-top: 6px;
}

.resource-card__cover {
  position: relative;
  width: 100%;
  height: 176px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(127, 127, 127, 0.08);
}

.resource-card__cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  -webkit-user-drag: none;
  user-select: none;
}

.resource-card__cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  opacity: 0.55;
  letter-spacing: 0.04em;
}

.resource-card__cover-placeholder--website {
  opacity: 1;
  color: inherit;
  background:
    radial-gradient(circle at 24% 22%, color-mix(in srgb, currentColor 10%, transparent), transparent 36%),
    radial-gradient(circle at 78% 18%, color-mix(in srgb, currentColor 8%, transparent), transparent 32%),
    linear-gradient(135deg,
      color-mix(in srgb, currentColor 5%, transparent),
      color-mix(in srgb, currentColor 2%, transparent)
    );
}

.resource-card__website-cover {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.resource-card__website-cover-glow {
  position: absolute;
  width: 120px;
  height: 120px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  filter: blur(30px);
  opacity: 0.9;
}

.resource-card__website-cover-badge {
  position: relative;
  z-index: 1;
  width: 72px;
  height: 72px;
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, currentColor 6%, rgba(255, 255, 255, 0.82));
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  box-shadow:
    0 18px 44px color-mix(in srgb, currentColor 14%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.resource-card__website-cover-badge--emoji {
  background: color-mix(in srgb, currentColor 8%, rgba(255, 255, 255, 0.76));
}

.resource-card__website-cover-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  object-fit: cover;
  display: block;
  -webkit-user-drag: none;
  user-select: none;
}

.resource-card__website-cover-emoji {
  font-size: 34px;
  line-height: 1;
}

.resource-card__cover-progress {
  position: absolute;
  right: 10px;
  bottom: 10px;
  max-width: calc(100% - 20px);
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: rgba(255, 255, 255, 0.96);
  font-size: 11px;
  line-height: 1.4;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.resource-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.resource-card__heading {
  flex: 1;
  min-width: 0;
}

.resource-card__status {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
}

.resource-card__status-icon {
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.resource-card__status-icon--disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.resource-card__status-icon--interactive {
  cursor: pointer;
}

.resource-card__status-icon--interactive:hover {
  transform: scale(1.08);
}

.resource-card__title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.resource-card__title-icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
}

.resource-card__title-icon--emoji {
  font-size: 17px;
}

.resource-card__title-icon-image {
  width: 18px;
  height: 18px;
  object-fit: contain;
  display: block;
  -webkit-user-drag: none;
  user-select: none;
}

.resource-card__title-icon-image--favicon {
  border-radius: 4px;
}

.resource-card__title-icon-svg {
  width: 18px;
  height: 18px;
  color: currentColor;
  opacity: 0.72;
  display: block;
}

.resource-card__title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.resource-card__title--website {
  min-height: calc(1.35em * 2);
}

.resource-card__download-badge {
  flex: 0 0 auto;
  align-self: flex-start;
  margin-top: 1px;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.4;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #8a5a00;
  background: rgba(240, 173, 78, 0.22);
  border: 1px solid rgba(240, 173, 78, 0.34);
}

.resource-card__subtitle {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.7;
  word-break: break-word;
}

.resource-card__subtitle--file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card__meta-line {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.resource-card__meta {
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.resource-card__meta-line > * {
  min-width: 0;
}

.resource-card__meta-label {
  font-size: 12px;
  opacity: 0.6;
  line-height: 24px;
  white-space: nowrap;
}

.resource-card__meta-text {
  min-width: 0;
  align-self: center;
  font-size: 12px;
  line-height: 1.5;
  color: currentColor;
  opacity: 0.82;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card__meta-line :deep(.n-space) {
  flex-wrap: wrap;
  min-width: 0;
  max-height: 54px;
  overflow: hidden;
}

.resource-card__meta-line--single :deep(.n-space) {
  flex-wrap: nowrap;
  max-height: 24px;
}

.resource-card__meta-line--single :deep(.n-tag) {
  flex: 0 0 auto;
}

.resource-card__bottom-overlay {
  position: absolute;
  left: 16px;
  right: 20px;
  bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 2;
}

.resource-card__rating-chip {
  font-size: 11px;
  line-height: 1;
  opacity: 0.56;
  pointer-events: none;
}

.resource-card__launch {
  position: static !important;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
}
</style>
