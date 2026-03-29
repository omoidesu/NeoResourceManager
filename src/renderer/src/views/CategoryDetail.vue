<script setup lang="ts">
import {computed, defineAsyncComponent, h, inject, markRaw, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch} from 'vue'
import type { ComputedRef } from 'vue'
import { useRoute } from 'vue-router'
import { CheckmarkOutline, ChevronBackOutline, ChevronForwardOutline, CloseOutline, EyeOutline, FolderOpenOutline, FunnelOutline, Play, Stop, TrashOutline } from '@vicons/ionicons5'
import { confirmDialog, notify } from '../utils/notification'
import { removeOngoingCenterItem, upsertOngoingCenterItem } from '../utils/notification-center'
import ResourceCard from '../components/card/ResourceCard.vue'
import PictureViewer from '../components/PictureViewer.vue'
import RichTextEditor from '../components/RichTextEditor.vue'
import { DictType, Settings } from '../../../common/constants'

const route = useRoute()
const injectedIsDark = inject<ComputedRef<boolean>>('appIsDark', computed(() => true))
const categoryId = computed(() => route.params.id as string)
const resourceList = ref<any[]>([]) // 资源列表数据
const resourceListRenderVersion = ref(0)
const authorList = ref<any[]>([])
const engineList = ref<any[]>([])
const websiteTypeOptions = ref<any[]>([])
const tagList = ref<any[]>([])
const typeList = ref<any[]>([])
const loading = ref(true)
const authorSearch = ref<string>('')
const tagSearch = ref<string>('')
const typeSearch = ref<string>('')
const showModal = ref(false)
const showEditModal = ref(false)
const showBatchImportLoading = ref(false)
const showBatchImportModal = ref(false)
const formData = ref<any>({ name: '', meta: {} })
const editingResourceId = ref('')
const editInitialFormData = ref<any | null>(null)
const batchImportItems = ref<any[]>([])
const isBatchImportSubmitting = ref(false)
const batchAnalyzeCurrent = ref(0)
const batchAnalyzeTotal = ref(0)
const batchAnalyzeMessage = ref('')
const batchAnalyzeRunning = ref(false)
const batchAnalyzeCancelled = ref(false)
const batchAnalyzeInBackground = ref(false)
const batchAnalyzeToastDismissed = ref(false)
const formRef = ref()
const basePathFormItemRef = ref()
const coverPreviewSrc = ref('')
const detailCoverPreviewSrc = ref('')
const detailScreenshotPreviewSrc = ref('')
const detailDescriptionContentRef = ref<HTMLElement | null>(null)
const detailDescriptionHeight = ref(400)
const showPictureViewer = ref(false)
const pictureViewerScrollMode = ref(String(Settings.PICTURE_READ_SCROLL_MODE.default ?? 'zoom'))
const tagInputValue = ref('')
const typeInputValue = ref('')
const showDetailDrawer = ref(false)
const selectedDetailResource = ref<any>(null)
const detailScreenshotPaths = ref<string[]>([])
const currentScreenshotIndex = ref(0)
const showDeleteScreenshotConfirm = ref(false)
const visibleLogCount = ref(5)
const detailRatingDraft = ref(-1)
const isDragOver = ref(false)
const detailDrawerWidth = ref(500)
const isResizingDetailDrawer = ref(false)
const detailDrawerResizeStartX = ref(0)
const detailDrawerResizeStartWidth = ref(500)
const engineIconModules = import.meta.glob('../assets/engine-icons/*', {
  eager: true,
  import: 'default'
}) as Record<string, string>
const storeIconModules = import.meta.glob('../assets/store-icons/*', {
  eager: true,
  import: 'default'
}) as Record<string, string>
const engineIconUrlByName = new Map<string, string>(
  Object.entries(engineIconModules).map(([filePath, url]) => [filePath.split('/').pop() ?? filePath, url])
)
const storeIconUrlByName = new Map<string, string>(
  Object.entries(storeIconModules).map(([filePath, url]) => [filePath.split('/').pop() ?? filePath, url])
)

const renderWebsiteOptionLabel = (icon: string, rawLabel: string) =>
  h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%'
      }
    },
    [
      /^([/.]|https?:|data:)/.test(icon)
        ? h('span', {
            style: {
              width: '18px',
              height: '18px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: '0 0 18px',
              overflow: 'hidden'
            }
          }, [
            h('img', {
              src: icon,
              alt: rawLabel,
              style: {
                width: '16px',
                height: '16px',
                maxWidth: '16px',
                maxHeight: '16px',
                objectFit: 'contain',
                display: 'block',
                flexShrink: 0
              }
            })
          ])
        : h('span', {
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '18px',
              flex: '0 0 18px'
            }
          }, icon || rawLabel),
      h('span', {
        style: {
          display: 'inline-block',
          lineHeight: '18px',
          whiteSpace: 'nowrap'
        }
      }, rawLabel)
    ]
  )

const GameForm = defineAsyncComponent(() => import('../components/modal/AddGameModal.vue'))

const MODAL_COMPONENTS: Record<string, any> = {
  'game_meta': markRaw(GameForm)
}

const categorySettings = computed(() => categoryInfo.value?.meta?.extra ?? {
  extendTable: '',
  resourcePathType: null,
  addFirst: '个'
})

const modelComponent = computed(() => {
  const extend = categorySettings.value.extendTable
  return MODAL_COMPONENTS[extend] ?? null
})

const modelComponentKey = computed(() => categorySettings.value.extendTable || 'empty-meta')

const createEmptyFormData = () => ({
  name: '',
  description: '',
  coverPath: '',
  basePath: '',
  tags: [] as string[],
  types: [] as string[],
  meta: createEmptyMeta()
})

const createEmptyMeta = () => {
  switch (categorySettings.value.extendTable) {
    case 'game_meta':
      return {
        nickname: '',
        nameZh: '',
        nameJp: '',
        nameEn: '',
        language: '',
        version: '1.0.0',
        engine: '',
        websiteType: '',
        gameId: '',
        website: '',
        additionalStores: [] as Array<{ websiteType: string; workId: string; website: string }>
      }
    default:
      return {}
  }
}

const buildDisplayBasePath = (resource: any) => {
  const basePath = String(resource?.basePath ?? '')
  const fileName = String(resource?.fileName ?? resource?.filename ?? '')

  if (!basePath) {
    return ''
  }

  if (!fileName) {
    return basePath
  }

  return `${basePath.replace(/[\\/]+$/, '')}\\${fileName}`
}

const mapResourceDetailToFormData = (resource: any) => ({
  name: resource?.title ?? '',
  description: resource?.description ?? '',
  coverPath: resource?.coverPath ?? '',
  basePath: buildDisplayBasePath(resource),
  author: Array.isArray(resource?.authors) ? String(resource.authors[0]?.name ?? '') : '',
  tags: Array.isArray(resource?.tags) ? resource.tags.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
  types: Array.isArray(resource?.types) ? resource.types.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
  meta: {
    ...createEmptyMeta(),
    ...(resource?.gameMeta ?? {}),
    ...(resource?.softwareMeta ?? {}),
    ...(resource?.videoMeta ?? {}),
    ...(resource?.asmrMeta ?? {}),
    websiteType: String(resource?.stores?.[0]?.storeId ?? ''),
    gameId: String(resource?.stores?.[0]?.workId ?? ''),
    website: String(resource?.stores?.[0]?.url ?? ''),
    additionalStores: Array.isArray(resource?.stores)
      ? resource.stores.slice(1).map((item: any) => ({
          websiteType: String(item?.storeId ?? ''),
          workId: String(item?.workId ?? ''),
          website: String(item?.url ?? '')
        }))
      : [],
  }
})

const cloneFormData = (value: any) => JSON.parse(JSON.stringify(toRaw(value ?? createEmptyFormData())))

const categoryInfo = ref<any>()
const missingFile = ref(false)
const favoriteOnly = ref(false)
const completedOnly = ref(false)
const runningOnly = ref(false)
const missingResourceCount = ref(0)
const favoriteResourceCount = ref(0)
const completedResourceCount = ref(0)
const runningResourceCount = ref(0)
const selectedAuthorList = ref<string[]>([])
const selectedEngineList = ref<string[]>([])
const selectedTagList = ref<string[]>([])
const selectedTypeList = ref<string[]>([])
const selectedResourceIds = ref<string[]>([])
const selectionModeManuallyEnabled = ref(false)
const currentPage = ref(1)
const jumpPageInput = ref<number | null>(1)
const pageSize = ref(24)
const totalResources = ref(0)
const sortBy = ref('createTime-desc')
const localeEmulatorPath = ref('')

const showBatchImportButton = computed(() => categorySettings.value.extendTable === 'game_meta')
const BATCH_IMPORT_ONGOING_ID = 'batch-import-analysis'
const batchAnalyzePercent = computed(() =>
  batchAnalyzeTotal.value > 0
    ? Math.min(100, Math.round((batchAnalyzeCurrent.value / batchAnalyzeTotal.value) * 100))
    : 0
)
const showBatchImportProgressToast = computed(() =>
  batchAnalyzeRunning.value && batchAnalyzeInBackground.value && !batchAnalyzeToastDismissed.value
)
const selectableBatchImportItems = computed(() =>
  batchImportItems.value.filter((item) => !item.exists && !item.errorMessage && item.launchFilePath)
)
const selectedBatchImportCount = computed(() =>
  batchImportItems.value.filter((item) => item.checked).length
)
const selectedResourceCount = computed(() => selectedResourceIds.value.length)
const resourceSelectionMode = computed(() => selectedResourceCount.value > 0 || selectionModeManuallyEnabled.value)

const descriptionLabel = computed(() =>
  categorySettings.value.extendTable === 'game_meta' ? '游戏简介' : `${categoryName.value}描述`
)

const descriptionPlaceholder = computed(() =>
  categorySettings.value.extendTable === 'game_meta' ? '请输入游戏简介' : `请输入${categoryName.value}描述`
)

const pageSizeOptions = [
  { label: '12 / 页', value: 12 },
  { label: '24 / 页', value: 24 },
  { label: '48 / 页', value: 48 },
  { label: '96 / 页', value: 96 }
]

const sortOptions = [
  { label: '最新添加', value: 'createTime-desc' },
  { label: '最早添加', value: 'createTime-asc' },
  { label: '标题 A-Z', value: 'title-asc' },
  { label: '标题 Z-A', value: 'title-desc' },
  { label: '最后游玩最近', value: 'lastAccessTime-desc' },
  { label: '最后游玩最早', value: 'lastAccessTime-asc' },
  { label: '游玩时长最长', value: 'totalRuntime-desc' },
  { label: '游玩时长最短', value: 'totalRuntime-asc' },
  { label: '首次游玩最近', value: 'firstAccessTime-desc' },
  { label: '首次游玩最早', value: 'firstAccessTime-asc' }
]

const normalizedAuthorList = computed(() =>
  authorList.value
    .map((author) => ({
      id: author.id ?? author.authorId ?? '',
      name: author.name ?? author.authorName ?? '',
      count: Number(author.count ?? 0)
    }))
    .filter((author) => author.id && author.name)
)

const normalizedEngineList = computed(() =>
  engineList.value
    .map((engine) => ({
      id: engine.id ?? engine.engineId ?? '',
      name: engine.name ?? engine.engineName ?? '',
      icon: resolveEngineIcon(engine.icon ?? engine.extra?.icon ?? ''),
      count: Number(engine.count ?? 0)
    }))
    .filter((engine) => engine.id && engine.name)
)

const normalizedTagList = computed(() =>
  tagList.value
    .map((tag) => ({
      id: tag.id ?? tag.tagId ?? '',
      name: tag.name ?? tag.tagName ?? '',
      count: Number(tag.count ?? 0)
    }))
    .filter((tag) => tag.id && tag.name)
)

const normalizedTypeList = computed(() =>
  typeList.value
    .map((type) => ({
      id: type.id ?? type.typeId ?? '',
      name: type.name ?? type.typeName ?? '',
      count: Number(type.count ?? 0)
    }))
    .filter((type) => type.id && type.name)
)

const normalizedAuthorSearch = computed(() => authorSearch.value.trim().toLowerCase())
const normalizedTagSearch = computed(() => tagSearch.value.trim().toLowerCase())
const normalizedTypeSearch = computed(() => typeSearch.value.trim().toLowerCase())

const filteredAuthorList = computed(() => {
  if (!normalizedAuthorSearch.value) {
    return normalizedAuthorList.value
  }

  return normalizedAuthorList.value.filter((author) =>
    String(author.name).toLowerCase().includes(normalizedAuthorSearch.value)
  )
})

const filteredEngineList = computed(() => normalizedEngineList.value)
const websiteTypeSelectOptions = computed(() =>
  websiteTypeOptions.value.map((item: any) => {
    const icon = resolveStoreIcon(String(item?.extra?.icon ?? ''))
    return {
      label: () => renderWebsiteOptionLabel(icon, String(item?.label ?? '')),
      rawLabel: String(item?.label ?? ''),
      value: item.value
    }
  })
)

const filteredTagList = computed(() => {
  if (!normalizedTagSearch.value) {
    return normalizedTagList.value
  }

  return normalizedTagList.value.filter((tag) =>
    String(tag.name).toLowerCase().includes(normalizedTagSearch.value)
  )
})

const categoryName = computed(() => {
  return categoryInfo.value?.name || '资源'
})

const startText = computed(() => categorySettings.value.startText || '启动')
const showZoneLaunch = computed(() => categorySettings.value.extendTable === 'game_meta')
const canZoneLaunch = computed(() => Boolean(localeEmulatorPath.value.trim()))
const showScreenshotFolder = computed(() => categorySettings.value.extendTable === 'game_meta')
const showCompletedToggle = computed(() => categorySettings.value.extendTable === 'game_meta')
const showEngineFilter = computed(() => categorySettings.value.extendTable === 'game_meta')
const filterSectionsStyle = computed(() => ({
  gridTemplateRows: `repeat(${showEngineFilter.value ? 4 : 3}, minmax(0, 1fr))`
}))
const detailLogs = computed(() =>
  [...(selectedDetailResource.value?.logs ?? [])]
    .filter((logItem: any) => !logItem?.isDeleted)
    .sort((a: any, b: any) => {
      const aTime = a?.startTime ? new Date(a.startTime).getTime() : 0
      const bTime = b?.startTime ? new Date(b.startTime).getTime() : 0
      return bTime - aTime
    })
)
const visibleDetailLogs = computed(() => detailLogs.value.slice(0, visibleLogCount.value))
const hasMoreDetailLogs = computed(() => visibleLogCount.value < detailLogs.value.length)
const noMore = computed(() => detailLogs.value.length > 5 && !hasMoreDetailLogs.value)
const detailStats = computed(() => selectedDetailResource.value?.stats ?? null)
const detailDescriptionBoxStyle = computed(() => ({
  height: `${detailDescriptionHeight.value}px`
}))
const currentScreenshotPath = computed(() => detailScreenshotPaths.value[currentScreenshotIndex.value] ?? '')
const detailCanLaunch = computed(() => {
  const resource = selectedDetailResource.value
  return Boolean(resource?.basePath) && !resource?.missingStatus && !resource?.isRunning
})
const detailCanStop = computed(() => {
  return Boolean(selectedDetailResource.value?.isRunning)
})
const detailMetaItems = computed(() => {
  const resource = selectedDetailResource.value
  if (!resource) {
    return []
  }

  const pushItem = (
    items: Array<{ label: string; value: string; icon?: string }>,
    label: string,
    value: unknown,
    icon?: string
  ) => {
    const normalizedValue = String(value ?? '').trim()
    if (normalizedValue) {
      items.push({ label, value: normalizedValue, icon })
    }
  }

  const items: Array<{ label: string; value: string; icon?: string }> = []
  const extendTable = categorySettings.value.extendTable

  if (extendTable === 'game_meta') {
    pushItem(items, '昵称', resource.gameMeta?.nickname)
    pushItem(items, '中文名', resource.gameMeta?.nameZh)
    pushItem(items, '日文名', resource.gameMeta?.nameJp)
    pushItem(items, '英文名', resource.gameMeta?.nameEn)
    pushItem(items, '语言', resource.gameMeta?.language)
    pushItem(items, '版本', resource.gameMeta?.version)

    const engineId = String(resource.gameMeta?.engine ?? '').trim()
    const engineItem = normalizedEngineList.value.find((item) => item.id === engineId)
    const engineName = engineItem?.name ?? engineId
    pushItem(items, '引擎', engineName, engineItem?.icon)
  } else if (extendTable === 'software_meta') {
    pushItem(items, '版本', resource.softwareMeta?.version)
  } else if (extendTable === 'video_meta') {
    pushItem(items, '年份', resource.videoMeta?.year)
  } else if (extendTable === 'asmr_meta') {
    pushItem(items, 'CV', resource.asmrMeta?.cv)
    pushItem(items, '语言', resource.asmrMeta?.language)
  }

  return items
})
const detailStores = computed(() =>
  Array.isArray(selectedDetailResource.value?.stores)
    ? selectedDetailResource.value.stores
      .filter((item: any) => !item?.isDeleted && item?.store)
      .map((item: any) => ({
        id: String(item?.id ?? `${item?.storeId}-${item?.workId}`),
        name: String(item?.store?.name ?? ''),
        icon: resolveStoreIcon(String(item?.store?.extra?.icon ?? '')),
        url: String(item?.url ?? '')
      }))
      .filter((item: any) => item.name)
    : []
)
const ratingComment = computed(() => getRatingComment(detailRatingDraft.value))
const hasPendingRatingChange = computed(() => {
  if (!selectedDetailResource.value) {
    return false
  }

  return Number(selectedDetailResource.value.rating ?? -1) !== Number(detailRatingDraft.value)
})

const totalPages = computed(() => Math.max(1, Math.ceil(totalResources.value / pageSize.value)))

const filteredTypeList = computed(() => {
  if (!normalizedTypeSearch.value) {
    return normalizedTypeList.value
  }

  return normalizedTypeList.value.filter((type) =>
    String(type.name).toLowerCase().includes(normalizedTypeSearch.value)
  )
})

const tagSelectOptions = computed(() =>
  normalizedTagList.value
    .map((tag) => ({
      label: tag.name,
      value: tag.name
    }))
    .filter((item) => item.label && item.value)
)

const typeSelectOptions = computed(() =>
  normalizedTypeList.value
    .map((type) => ({
      label: type.name,
      value: type.name
    }))
    .filter((item) => item.label && item.value)
)

const pageStyle = computed(() => ({
  backgroundColor: injectedIsDark.value ? '#121212' : '#f7f8fa',
  color: injectedIsDark.value ? 'rgba(255, 255, 245, 0.86)' : '#1f2329'
}))

const headerStyle = computed(() => ({
  backgroundColor: injectedIsDark.value ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.72)',
  color: injectedIsDark.value ? 'rgba(255, 255, 245, 0.92)' : '#1f2329'
}))

const titleMetaStyle = computed(() => ({
  color: injectedIsDark.value ? 'rgba(235, 235, 245, 0.6)' : 'rgba(31, 35, 41, 0.62)'
}))

const footerStyle = computed(() => ({
  backgroundColor: injectedIsDark.value ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.76)',
  borderTop: injectedIsDark.value ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(15, 23, 42, 0.08)'
}))

const clampDetailDrawerWidth = (nextWidth: number) => {
  const maxWidth = Math.max(420, Math.floor(window.innerWidth * 0.9))
  return Math.min(maxWidth, Math.max(420, nextWidth))
}

const handleDetailDrawerResizeStart = (event: MouseEvent) => {
  isResizingDetailDrawer.value = true
  detailDrawerResizeStartX.value = event.clientX
  detailDrawerResizeStartWidth.value = detailDrawerWidth.value
  document.body.style.userSelect = 'none'
}

const handleDetailDrawerResizeMove = (event: MouseEvent) => {
  if (!isResizingDetailDrawer.value) {
    return
  }

  const delta = detailDrawerResizeStartX.value - event.clientX
  detailDrawerWidth.value = clampDetailDrawerWidth(detailDrawerResizeStartWidth.value + delta)
}

const handleDetailDrawerResizeEnd = () => {
  if (!isResizingDetailDrawer.value) {
    return
  }

  isResizingDetailDrawer.value = false
  document.body.style.userSelect = ''
}

const coverPreviewLabel = computed(() => {
  if (!formData.value?.coverPath) {
    return '暂未设置封面'
  }

  return formData.value.coverPath
})

const hasBasePath = computed(() => Boolean(formData.value?.basePath?.trim()))
const hasCoverPath = computed(() => Boolean(formData.value?.coverPath?.trim()))
const normalizedAllowedExtensions = computed(() =>
  (categorySettings.value.extensions ?? [])
    .map((extension: string) => extension.trim().toLowerCase())
    .filter(Boolean)
    .map((extension: string) => (extension.startsWith('.') ? extension : `.${extension}`))
)

const splitManualValues = (input: string) => {
  return input
    .split(/[\s、,，]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const normalizeCoverPreviewSource = (coverPath: string) => {
  if (!coverPath) {
    return ''
  }

  if (coverPath.startsWith('//')) {
    return `https:${coverPath}`
  }

  return coverPath
}

const formatDateTime = (value: string | number | Date | null | undefined) => {
  if (!value) {
    return '暂无'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

const formatDuration = (seconds: number | null | undefined) => {
  const totalSeconds = Math.max(0, Number(seconds ?? 0))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}小时 ${minutes}分钟 ${remainSeconds}秒`
  }

  if (minutes > 0) {
    return `${minutes}分钟 ${remainSeconds}秒`
  }

  return `${remainSeconds}秒`
}

const getRatingComment = (rating: number | null | undefined) => {
  const normalizedRating = Number(rating ?? 0)

  if (normalizedRating < 0) return ''
  if (normalizedRating >= 4.6) return '夯爆了'
  if (normalizedRating >= 4.1) return '夯'
  if (normalizedRating >= 3.1) return '顶级'
  if (normalizedRating >= 2.1) return '人上人'
  if (normalizedRating >= 1.1) return 'NPC'
  if (normalizedRating >= 0.6) return '拉'
  if (normalizedRating > 0) return '拉完了'
  return '区'
}

const getRatingEmoji = (rating: number | null | undefined) => {
  const normalizedRating = Number(rating ?? 0)

  if (normalizedRating >= 4.9) return '🔥🔥'
  if (normalizedRating >= 4.5) return '🔥'
  if (normalizedRating > 4) return '👑'
  if (normalizedRating > 3) return '😎'
  if (normalizedRating > 2) return '🙂'
  if (normalizedRating >= 1.1) return '😮‍💨'
  if (normalizedRating > 0) return '🫠'
  if (normalizedRating === 0) return '👎'
  return ''
}

const normalizeSelectedValues = (values: string[]) => {
  return Array.from(new Set(values.flatMap(splitManualValues)))
}

const getFileExtension = (filePath: string) => {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const fileName = normalizedPath.split('/').pop() ?? ''
  const dotIndex = fileName.lastIndexOf('.')

  if (dotIndex <= 0) {
    return ''
  }

  return fileName.slice(dotIndex).toLowerCase()
}

const validateBasePathExtension = (basePath: string) => {
  if (!basePath || categorySettings.value.resourcePathType !== 'file') {
    return true
  }

  const allowedExtensions = normalizedAllowedExtensions.value

  if (!allowedExtensions.length) {
    return true
  }

  return allowedExtensions.includes(getFileExtension(basePath))
}

const getBasePathValidationMessage = () => {
  const allowedExtensions = normalizedAllowedExtensions.value

  if (!allowedExtensions.length) {
    return `请选择合法的${categoryName.value}文件`
  }

  return `请选择合法的${categoryName.value}文件，仅支持 ${allowedExtensions.join(', ')}`
}

const getResourceNameFromBasePath = (basePath: string) => {
  const normalizedPath = basePath.replace(/\\/g, '/')
  const pathSegments = normalizedPath.split('/').filter(Boolean)

  if (!pathSegments.length) {
    return ''
  }

  const lastSegment = pathSegments[pathSegments.length - 1]
  if (lastSegment.includes('.') && pathSegments.length > 1) {
    return pathSegments[pathSegments.length - 2]
  }

  return lastSegment
}

const applyGamePathAnalysis = async (basePath: string) => {
  if (categorySettings.value.extendTable !== 'game_meta') {
    return
  }

  formData.value.name = getResourceNameFromBasePath(basePath)

  try {
    const analysis = await window.api.service.analyzeGamePath(basePath)
    if (!analysis) {
      return
    }

    if (analysis.name) {
      formData.value.name = analysis.name
    }

    if (analysis.gameId) {
      formData.value.meta.gameId = analysis.gameId
    }

    if (analysis.websiteType) {
      formData.value.meta.websiteType = analysis.websiteType
    }
  } catch (error) {
    notify('error', '分析失败', error instanceof Error ? error.message : '分析游戏路径失败')
  }
}

const showNotifyByType = (type: string, title: string, content: string) => {
  const normalizedType = type === 'warn' ? 'warning' : type
  notify(normalizedType as 'success' | 'error' | 'info' | 'warning', title, content)
}

const enrichBatchImportItem = async (item: any) => {
  if (!item?.launchFilePath) {
    return {
      ...item,
      launchFileIcon: ''
    }
  }

  try {
    return {
      ...item,
      launchFileIcon: (await window.api.dialog.getFileIconAsDataUrl(item.launchFilePath)) ?? '',
      fetchInfoEnabled: item.fetchInfoEnabled !== false
    }
  } catch {
    return {
      ...item,
      launchFileIcon: '',
      fetchInfoEnabled: item.fetchInfoEnabled !== false
    }
  }
}

const addResourceRule = computed(() => ({
  basePath: {
    trigger: ['blur', 'change'],
    validator: (_rule: unknown, value: string) => {
      if (!value) {
        return new Error(`请选择${categoryName.value}路径`)
      }

      if (!validateBasePathExtension(value)) {
        return new Error(getBasePathValidationMessage())
      }

      return true
    }
  },
  name: {
    required: true,
    message: `请输入${categoryName.value}名`,
    trigger: 'blur'
  }
}))

const fetchData = async () => {
  if (!categoryId.value) return
  loading.value = true
  try {
    const resourceQuery = {
      authorIds: [...selectedAuthorList.value],
      engineIds: [...selectedEngineList.value],
      tagIds: [...selectedTagList.value],
      typeIds: [...selectedTypeList.value],
      missingOnly: missingFile.value,
      favoriteOnly: favoriteOnly.value,
      completedOnly: completedOnly.value,
      runningOnly: runningOnly.value,
      page: currentPage.value,
      pageSize: pageSize.value,
      sortBy: sortBy.value
    }

    // 1. 获取分类元数据
    categoryInfo.value = await window.api.db.getCategoryById(categoryId.value)
    websiteTypeOptions.value = await window.api.db.getSelectDictData(DictType.STORE_WEBSITE_TYPE)
    const localeEmulatorSetting = await window.api.db.getSetting(Settings.LOCALE_EMULATOR_PATH)
    localeEmulatorPath.value = String(localeEmulatorSetting?.value ?? '')
    // 2. 获取该分类下的资源列表（带标签）
      const resourceResponse = await window.api.db.getResourceByCategoryId(categoryId.value, resourceQuery)
      resourceList.value = resourceResponse?.items ?? []
      resourceListRenderVersion.value += 1
      selectedResourceIds.value = selectedResourceIds.value.filter((id) =>
        resourceList.value.some((item) => String(item?.id ?? '') === id)
      )
      totalResources.value = Number(resourceResponse?.total ?? 0)
      if (selectedDetailResource.value?.id) {
        const matchedDetailResource = resourceList.value.find((item) => item.id === selectedDetailResource.value.id)
        if (matchedDetailResource) {
          selectedDetailResource.value = matchedDetailResource
        }
      }
      // 3. 获取作者列表
    authorList.value = await window.api.db.getAuthorByCategoryId(categoryId.value)
    // 4. 获取引擎列表
    engineList.value = showEngineFilter.value
      ? await window.api.db.getEngineByCategoryId(categoryId.value)
      : []
    // 4. 获取统计
    missingResourceCount.value = await window.api.db.getMissingResourceCountByCategoryId(categoryId.value)
    favoriteResourceCount.value = await window.api.db.getFavoriteResourceCountByCategoryId(categoryId.value)
    completedResourceCount.value = await window.api.db.getCompletedResourceCountByCategoryId(categoryId.value)
    runningResourceCount.value = await window.api.db.getRunningResourceCountByCategoryId(categoryId.value)
    // 5. 获取标签列表
    tagList.value = await window.api.db.getTagByCategoryId(categoryId.value)
    // 6. 获取分类列表
    typeList.value = await window.api.db.getTypeByCategoryId(categoryId.value)

  } catch (error) {
    showNotifyByType('error', '加载失败', error instanceof Error ? error.message : '加载分类数据失败')
  } finally {
    loading.value = false
  }
}

const resetSelected = () => {
  missingFile.value = false
  favoriteOnly.value = false
  completedOnly.value = false
  runningOnly.value = false
  selectedAuthorList.value = []
  selectedEngineList.value = []
  selectedTagList.value = []
  selectedTypeList.value = []
  authorSearch.value = ''
  tagSearch.value = ''
  typeSearch.value = ''
}

const handleJumpPage = () => {
  const nextPage = Math.min(
    totalPages.value,
    Math.max(1, Number(jumpPageInput.value ?? currentPage.value))
  )

  jumpPageInput.value = nextPage
  currentPage.value = nextPage
}

// 监控路由 ID 变化
watch(categoryId, () => {
  currentPage.value = 1
  fetchData()
}, { immediate: true })

watch(
  [missingFile, favoriteOnly, completedOnly, runningOnly, selectedAuthorList, selectedEngineList, selectedTagList, selectedTypeList, pageSize, sortBy],
  () => {
    currentPage.value = 1
    fetchData()
  },
  { deep: true }
)

watch(currentPage, () => {
  jumpPageInput.value = currentPage.value
  fetchData()
})

watch(totalPages, (value) => {
  if (currentPage.value > value) {
    currentPage.value = value
    return
  }

  jumpPageInput.value = Math.min(value, Math.max(1, Number(jumpPageInput.value ?? currentPage.value)))
})

let stopResourceStateListener: null | (() => void) = null

onMounted(() => {
  stopResourceStateListener = window.api.service.onResourceStateChanged((message) => {
    if (message.categoryId !== categoryId.value) {
      return
    }

    void fetchData()
  })

  window.addEventListener('mousemove', handleDetailDrawerResizeMove)
  window.addEventListener('mouseup', handleDetailDrawerResizeEnd)
})

const updateDetailDescriptionHeight = async () => {
  await nextTick()

  if (!selectedDetailResource.value?.description) {
    detailDescriptionHeight.value = 400
    return
  }

  const element = detailDescriptionContentRef.value
  if (!element) {
    detailDescriptionHeight.value = 400
    return
  }

  const computedStyle = window.getComputedStyle(element)
  const lineHeight = Number.parseFloat(computedStyle.lineHeight || '24') || 24
  const nextHeight = Math.min(Math.ceil(element.scrollHeight + lineHeight), 400)
  detailDescriptionHeight.value = Math.max(Math.ceil(lineHeight * 2), nextHeight)
}

onBeforeUnmount(() => {
  stopResourceStateListener?.()
  stopResourceStateListener = null
  window.removeEventListener('mousemove', handleDetailDrawerResizeMove)
  window.removeEventListener('mouseup', handleDetailDrawerResizeEnd)
  document.body.style.userSelect = ''
})

watch(
  () => formData.value?.coverPath,
  async (coverPath) => {
    if (!coverPath) {
      coverPreviewSrc.value = ''
      return
    }

    if (
      coverPath.startsWith('screenshot://') ||
      coverPath.startsWith('auto://') ||
      coverPath.startsWith('custom://')
    ) {
      coverPreviewSrc.value = ''
      return
    }

    const normalizedCoverPath = normalizeCoverPreviewSource(coverPath)
    if (/^https?:\/\//i.test(normalizedCoverPath) || /^data:/i.test(normalizedCoverPath)) {
      coverPreviewSrc.value = normalizedCoverPath
      return
    }

    try {
      coverPreviewSrc.value = (await window.api.dialog.readImageAsDataUrl(coverPath)) ?? ''
    } catch (error) {
      showNotifyByType('error', '预览失败', error instanceof Error ? error.message : '加载封面预览失败')
      coverPreviewSrc.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => selectedDetailResource.value?.coverPath,
  async (coverPath) => {
    if (!coverPath) {
      detailCoverPreviewSrc.value = ''
      return
    }

    const normalizedCoverPath = normalizeCoverPreviewSource(coverPath)
    if (/^https?:\/\//i.test(normalizedCoverPath) || /^data:/i.test(normalizedCoverPath)) {
      detailCoverPreviewSrc.value = normalizedCoverPath
      return
    }

    try {
      detailCoverPreviewSrc.value = (await window.api.dialog.readImageAsDataUrl(coverPath)) ?? ''
    } catch {
      detailCoverPreviewSrc.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => currentScreenshotPath.value,
  async (filePath) => {
    if (!filePath) {
      detailScreenshotPreviewSrc.value = ''
      return
    }

    try {
      detailScreenshotPreviewSrc.value = (await window.api.dialog.readImageAsDataUrl(filePath)) ?? ''
    } catch {
      detailScreenshotPreviewSrc.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => selectedDetailResource.value?.rating,
  (rating) => {
    detailRatingDraft.value = Number(rating ?? -1)
  },
  { immediate: true }
)

watch(
  () => [selectedDetailResource.value?.description, detailDrawerWidth.value],
  () => {
    updateDetailDescriptionHeight()
  }
)

watch(showEditModal, (visible) => {
  if (!visible) {
    editingResourceId.value = ''
    editInitialFormData.value = null
  }
})

// --- E. 交互事件 ---
const handleAddResource = () => {
  editingResourceId.value = ''
  editInitialFormData.value = null
  formData.value = createEmptyFormData()
  showModal.value = true
}

const syncBatchImportOngoingCenter = () => {
  if (!batchAnalyzeRunning.value) {
    removeOngoingCenterItem(BATCH_IMPORT_ONGOING_ID)
    return
  }

  const currentDirectoryName = getResourceNameFromBasePath(batchAnalyzeMessage.value.split('\n')[1] || '') || (batchAnalyzeMessage.value.split('\n')[1] || '') || '正在准备分析目录'
  upsertOngoingCenterItem({
    id: BATCH_IMPORT_ONGOING_ID,
    title: '批量导入',
    content: `正在分析第 ${batchAnalyzeCurrent.value} / ${batchAnalyzeTotal.value} 个目录\n${currentDirectoryName}`,
    progress: batchAnalyzePercent.value,
    onClick: () => {
      handleReopenBatchImportProgress()
    }
  })
}

const clearBatchImportOngoingCenter = () => {
  removeOngoingCenterItem(BATCH_IMPORT_ONGOING_ID)
}

const handleBatchImportClick = () => {
  void (async () => {
    if (batchAnalyzeRunning.value) {
      showBatchImportLoading.value = true
      batchAnalyzeInBackground.value = false
      batchAnalyzeToastDismissed.value = false
      syncBatchImportOngoingCenter()
      return
    }

    try {
      const directoryPaths = await window.api.dialog.selectFolders()
      if (!directoryPaths?.length) {
        return
      }

      batchImportItems.value = []
      batchAnalyzeTotal.value = directoryPaths.length
      batchAnalyzeCurrent.value = 0
      batchAnalyzeMessage.value = '正在分析游戏启动文件，请稍候...'
      batchAnalyzeCancelled.value = false
      batchAnalyzeInBackground.value = false
      batchAnalyzeToastDismissed.value = false
      batchAnalyzeRunning.value = true
      showBatchImportLoading.value = true
      syncBatchImportOngoingCenter()

      const items: any[] = []
      for (const [index, directoryPath] of directoryPaths.entries()) {
        if (batchAnalyzeCancelled.value) {
          break
        }

        const directoryName = getResourceNameFromBasePath(directoryPath)
        batchAnalyzeCurrent.value = index + 1
        batchAnalyzeMessage.value = `正在分析第 ${index + 1} / ${directoryPaths.length} 个目录\n${directoryName || directoryPath}`
        syncBatchImportOngoingCenter()

        try {
          const analysis = await window.api.service.analyzeGameDirectory(directoryPath)
          items.push(await enrichBatchImportItem({
            ...analysis,
            checked: !analysis?.exists && !analysis?.errorMessage && !!analysis?.launchFilePath
          }))
        } catch (error) {
          items.push({
            directoryPath,
            directoryName,
            launchFilePath: '',
            launchFileName: '',
            exists: false,
            checked: false,
            errorMessage: error instanceof Error ? error.message : '分析失败'
          })
        }
      }

      batchImportItems.value = items
      if (items.length) {
        showBatchImportModal.value = true
      } else if (batchAnalyzeCancelled.value) {
        showNotifyByType('info', '批量导入', '已停止分析')
      }
    } finally {
      batchAnalyzeRunning.value = false
      batchAnalyzeInBackground.value = false
      showBatchImportLoading.value = false
      batchAnalyzeToastDismissed.value = false
      clearBatchImportOngoingCenter()
    }
  })()
}

const handleBatchImportMaskClick = () => {
  if (!batchAnalyzeRunning.value) {
    return
  }

  handleBatchImportRunInBackground()
}

const handleBatchImportRunInBackground = () => {
  if (!batchAnalyzeRunning.value) {
    return
  }

  batchAnalyzeInBackground.value = true
  batchAnalyzeToastDismissed.value = false
  showBatchImportLoading.value = false
  syncBatchImportOngoingCenter()
}

const handleReopenBatchImportProgress = () => {
  if (!batchAnalyzeRunning.value) {
    return
  }

  batchAnalyzeInBackground.value = false
  batchAnalyzeToastDismissed.value = false
  showBatchImportLoading.value = true
  syncBatchImportOngoingCenter()
}

const handleDismissBatchImportProgressToast = () => {
  batchAnalyzeToastDismissed.value = true
}

const handleStopBatchImportAnalysis = () => {
  if (!batchAnalyzeRunning.value) {
    return
  }

  batchAnalyzeCancelled.value = true
  batchAnalyzeMessage.value = '正在停止分析，请稍候...'
}

watch(
  [batchAnalyzeRunning, batchAnalyzeCurrent, batchAnalyzeTotal, batchAnalyzeMessage, batchAnalyzeInBackground],
  () => {
    if (batchAnalyzeRunning.value) {
      syncBatchImportOngoingCenter()
    } else {
      clearBatchImportOngoingCenter()
    }
  }
)

const handleCloseBatchImportModal = () => {
  if (isBatchImportSubmitting.value) {
    return
  }

  showBatchImportModal.value = false
  batchImportItems.value = []
}

const handleSelectBatchLaunchFile = (index: number) => {
  void (async () => {
    const item = batchImportItems.value[index]
    if (!item?.directoryPath) {
      return
    }

    try {
      const selectedFilePath = await window.api.dialog.selectGameLaunchFile(item.directoryPath)
      if (!selectedFilePath) {
        return
      }

      const analysis = await window.api.service.analyzeGameDirectory(item.directoryPath, selectedFilePath)
      batchImportItems.value[index] = await enrichBatchImportItem({
        ...analysis,
        checked: !analysis?.exists && !analysis?.errorMessage && !!analysis?.launchFilePath
      })
    } catch (error) {
      showNotifyByType('error', '批量导入', error instanceof Error ? error.message : '手动选择启动文件失败')
    }
  })()
}

const handleBatchImportSelectAll = () => {
  batchImportItems.value = batchImportItems.value.map((item) => ({
    ...item,
    checked: !item.exists && !item.errorMessage && !!item.launchFilePath
  }))
}

const handleBatchImportDeselectAll = () => {
  batchImportItems.value = batchImportItems.value.map((item) => ({
    ...item,
    checked: false
  }))
}

const handleBatchImportInvert = () => {
  batchImportItems.value = batchImportItems.value.map((item) => ({
    ...item,
    checked: !item.exists && !item.errorMessage && !!item.launchFilePath ? !item.checked : false
  }))
}

const canToggleBatchImportItem = (item: any) =>
  !item?.exists && !item?.errorMessage && !!item?.launchFilePath

const handleToggleBatchImportItem = (index: number) => {
  const item = batchImportItems.value[index]
  if (!canToggleBatchImportItem(item)) {
    return
  }

  batchImportItems.value[index].checked = !batchImportItems.value[index].checked
}

const handleConfirmBatchImport = () => {
  void (async () => {
    const selectedItems = batchImportItems.value
      .filter((item) => item.checked && item.launchFilePath)
      .map((item) => ({
        directoryPath: item.directoryPath,
        launchFilePath: item.launchFilePath,
        websiteType: item.websiteType,
        gameId: item.gameId,
        fetchInfoEnabled: item.fetchInfoEnabled !== false
      }))

    if (!selectedItems.length) {
      showNotifyByType('warning', '批量导入', '请至少选择一个可导入的目录')
      return
    }

    try {
      isBatchImportSubmitting.value = true
      showBatchImportLoading.value = true
      batchAnalyzeTotal.value = selectedItems.length
      batchAnalyzeCurrent.value = selectedItems.length
      batchAnalyzeMessage.value = `正在导入 ${selectedItems.length} 个游戏，请稍候...`

      const result = await window.api.service.importBatchGameDirectories(categoryId.value, selectedItems)
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '批量导入完成'
      const resultItems = Array.isArray(result?.data) ? result.data : []

      if (resultItems.length) {
        const resultMap = new Map<string, any>(
          resultItems.map((item: any) => [
            `${String(item?.directoryPath ?? '').trim()}::${String(item?.launchFilePath ?? '').trim()}`,
            item
          ])
        )

        batchImportItems.value = batchImportItems.value.map((item) => {
          const matchedResult = resultMap.get(
            `${String(item?.directoryPath ?? '').trim()}::${String(item?.launchFilePath ?? '').trim()}`
          )

          if (!matchedResult) {
            return item
          }

          return {
            ...item,
            checked: false,
            exists: matchedResult.type === 'info' ? true : item.exists,
            importResultType: String(matchedResult.type ?? 'info'),
            importResultMessage: String(matchedResult.message ?? '处理完成')
          }
        })
      }

      showNotifyByType(resultType, '批量导入', resultMessage)

      if (resultType !== 'error') {
        await fetchData()
      }
    } catch (error) {
      showNotifyByType('error', '批量导入', error instanceof Error ? error.message : '批量导入失败')
    } finally {
      isBatchImportSubmitting.value = false
      showBatchImportLoading.value = false
    }
  })()
}

const handleCloseModal = () => {
  showModal.value = false
  editingResourceId.value = ''
  editInitialFormData.value = null
}

const handleCloseEditDrawer = () => {
  showEditModal.value = false
  editingResourceId.value = ''
  editInitialFormData.value = null
}

const handleResetEditForm = () => {
  formData.value = createEmptyFormData()
}

const handleRestoreDefaultEditForm = () => {
  if (!editInitialFormData.value) {
    return
  }

  formData.value = cloneFormData(editInitialFormData.value)
}

const handleSubmitResource = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  if (!validateBasePathExtension(formData.value.basePath)) {
    return
  }

  formData.value['categoryId'] = categoryInfo.value.id
  const payload = structuredClone(toRaw(formData.value))
  const result = await window.api.service.saveResource(payload)
  const resultType = result?.type ?? 'info'
  const resultMessage = result?.message ?? '操作完成'

  showNotifyByType(resultType, '添加资源', resultMessage)

  if (resultType !== 'error') {
    handleCloseModal()
    await fetchData()
  }
}

const handleDragOver = (event: DragEvent) => {
  if (categorySettings.value.resourcePathType !== 'file') {
    return
  }

  event.preventDefault()
  isDragOver.value = true
}

const handleDragLeave = (event: DragEvent) => {
  const nextTarget = event.relatedTarget as Node | null
  const currentTarget = event.currentTarget as Node | null

  if (currentTarget && nextTarget && currentTarget.contains(nextTarget)) {
    return
  }

  isDragOver.value = false
}

const handleDropResourceFile = (event: DragEvent) => {
  void (async () => {
    isDragOver.value = false

    if (categorySettings.value.resourcePathType !== 'file') {
      return
    }

    event.preventDefault()

    const droppedFile = Array.from(event.dataTransfer?.files ?? [])[0]
    const droppedPath = droppedFile
      ? String(window.electron?.webUtils?.getPathForFile(droppedFile) ?? '').trim()
      : ''

    if (!droppedPath) {
      showNotifyByType('warning', '拖拽添加', '未能读取拖入文件的路径，请确认拖入的是本地文件')
      return
    }

    if (!validateBasePathExtension(droppedPath)) {
      showNotifyByType('warning', '拖拽添加', getBasePathValidationMessage())
      return
    }

    const existsResult = await window.api.service.checkResourceExistsByPath(droppedPath)
    if (existsResult?.type === 'error') {
      showNotifyByType('error', '拖拽添加', existsResult?.message ?? '检查资源是否存在失败')
      return
    }

    if (existsResult?.exists) {
      showNotifyByType('info', '拖拽添加', '该资源已存在，无需重复添加')
      return
    }

    editingResourceId.value = ''
    editInitialFormData.value = null
    formData.value = createEmptyFormData()
    formData.value.basePath = droppedPath
    await applyGamePathAnalysis(droppedPath)
    showModal.value = true
    await nextTick()
    await basePathFormItemRef.value?.validate({ trigger: 'change' })
  })()
}

const handleSubmitEditResource = async () => {
  if (!editingResourceId.value) {
    return
  }

  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  if (!validateBasePathExtension(formData.value.basePath)) {
    return
  }

  formData.value.categoryId = categoryInfo.value.id
  const payload = structuredClone(toRaw(formData.value))
  const result = await window.api.service.updateResource(editingResourceId.value, payload)
  const resultType = result?.type ?? 'info'
  const resultMessage = result?.message ?? '操作完成'

  showNotifyByType(resultType, `修改${categoryName.value}`, resultMessage)

  if (resultType !== 'error') {
    handleCloseEditDrawer()
    if (showDetailDrawer.value && selectedDetailResource.value?.id === editingResourceId.value) {
      showDetailDrawer.value = false
      selectedDetailResource.value = null
    }
    await fetchData()
  }
}

const handleUseScreenshotCover = async () => {
  try {
    const result = await window.api.service.captureCoverScreenshot(String(formData.value?.basePath ?? '').trim())
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '截图完成'

    if (resultType === 'error' || resultType === 'warning') {
      showNotifyByType(resultType, '封面截图', resultMessage)
      return
    }

    const screenshotFilePath = String(result?.data?.filePath ?? '').trim()
    if (!screenshotFilePath) {
      showNotifyByType('warning', '封面截图', '截图成功，但未返回图片文件')
      return
    }

    formData.value.coverPath = screenshotFilePath
    showNotifyByType('success', '封面截图', resultMessage)
  } catch (error) {
    showNotifyByType('error', '封面截图', error instanceof Error ? error.message : '使用截图作为封面失败')
  }
}

const resolveEngineIcon = (icon: string) => {
  if (!icon) {
    return ''
  }

  if (/^(?:https?:|data:|\/)/.test(icon)) {
    return icon
  }

  return engineIconUrlByName.get(icon) ?? icon
}

const resolveStoreIcon = (icon: string) => {
  if (!icon) {
    return ''
  }

  if (/^(?:https?:|data:|\/)/.test(icon)) {
    return icon
  }

  return storeIconUrlByName.get(icon) ?? icon
}

const handleUseFirstCover = () => {
  formData.value.coverPath = 'auto://first-cover'
}

const handleChooseCustomCover = async () => {
  try {
    const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
    const coverPath = await window.api.dialog.selectFile(imageExtensions)
    if (coverPath) {
      formData.value.coverPath = coverPath
    }
  } catch (error) {
    showNotifyByType('error', '选择失败', error instanceof Error ? error.message : '选择自定义封面失败')
  }
}

const handleChooseCoverFromScreenshotFolder = async () => {
  if (!editingResourceId.value) {
    showNotifyByType('warning', '选择封面', '当前资源还没有可用的截图目录')
    return
  }

  try {
    const screenshotPath = await window.api.dialog.selectScreenshotImage(editingResourceId.value)
    if (screenshotPath) {
      formData.value.coverPath = screenshotPath
    }
  } catch (error) {
    showNotifyByType('error', '选择封面', error instanceof Error ? error.message : '从截图文件夹选择封面失败')
  }
}

const handleClearCover = () => {
  formData.value.coverPath = ''
}

const handleSelectBasePath = async () => {
  try {
    let resourcePath: string
    if (categorySettings.value.resourcePathType === 'file') {
      const extensions = [...(categorySettings.value.extensions ?? [])]
      resourcePath = await window.api.dialog.selectFile(extensions)
    } else {
      resourcePath = await window.api.dialog.selectFolder()
    }
    if (resourcePath) {
      if (!validateBasePathExtension(resourcePath)) {
        formData.value.basePath = resourcePath
        await basePathFormItemRef.value?.validate({ trigger: 'change' })
        return
      }

      formData.value.basePath = resourcePath
      await basePathFormItemRef.value?.validate({ trigger: 'change' })
      await applyGamePathAnalysis(resourcePath)
    }
  } catch (error) {
    showNotifyByType('error', '选择失败', error instanceof Error ? error.message : '选择资源路径失败')
  }
}

const handleTagsChange = (values: string[]) => {
  formData.value.tags = normalizeSelectedValues(values)
}

const handleTypesChange = (values: string[]) => {
  formData.value.types = normalizeSelectedValues(values)
}

const appendInputValues = (field: 'tags' | 'types', input: string) => {
  const items = splitManualValues(input)
  if (!items.length) {
    return
  }

  formData.value[field] = normalizeSelectedValues([
    ...(formData.value[field] ?? []),
    ...items
  ])
}

const handleTagInputCommit = () => {
  appendInputValues('tags', tagInputValue.value)
  tagInputValue.value = ''
}

const handleTypeInputCommit = () => {
  appendInputValues('types', typeInputValue.value)
  typeInputValue.value = ''
}

const handleSelectInputKeydown = (event: KeyboardEvent, field: 'tags' | 'types') => {
  if (![' ', ',', '，', '、', 'Enter'].includes(event.key)) {
    return
  }

  event.preventDefault()
  const target = event.target as HTMLInputElement | null
  if (target) {
    target.value = ''
  }

  if (field === 'tags') {
    handleTagInputCommit()
    return
  }

  handleTypeInputCommit()
}

const createSelectOption = (label: string) => {
  const value = label.trim()
  return {
    label: value,
    value
  }
}

const handleTagSearch = (value: string) => {
  tagInputValue.value = value
}

const handleTypeSearch = (value: string) => {
  typeInputValue.value = value
}

const handleFetchGameInfo = async () => {
  const websiteId = String(formData.value?.meta?.websiteType ?? '').trim()
  const gameId = String(formData.value?.meta?.gameId ?? '').trim()

  const result = await window.api.service.fetchResourceInfo(websiteId, gameId)
  const resultType = result?.type ?? 'info'
  const resultMessage = result?.message ?? '获取资源信息完成'

  if (resultType === 'error' || resultType === 'warning') {
    showNotifyByType(resultType, '获取资源信息', resultMessage)
    return
  }

  const data = result?.data ?? {}
  if (data.name) {
    formData.value.name = data.name
    if (categorySettings.value.extendTable === 'game_meta' && !formData.value.meta.nameJp) {
      formData.value.meta.nameJp = data.name
    }
  }

  if (data.author) {
    formData.value.author = data.author
  }

  if (data.cover) {
    formData.value.coverPath = data.cover
  }

  if (Array.isArray(data.tag) && data.tag.length) {
    formData.value.tags = normalizeSelectedValues([
      ...(formData.value.tags ?? []),
      ...data.tag
    ])
  }

  if (Array.isArray(data.type) && data.type.length) {
    formData.value.types = normalizeSelectedValues([
      ...(formData.value.types ?? []),
      ...data.type
    ])
  }

  showNotifyByType('success', '获取资源信息', resultMessage)
}

const handleCheckGameEngine = async () => {
  const basePath = String(formData.value?.basePath ?? '').trim()

  if (!basePath) {
    showNotifyByType('warning', '检测游戏引擎', '请先选择游戏路径')
    return
  }

  const result = await window.api.service.detectGameEngine(basePath)
  const resultType = result?.type ?? 'info'
  const resultMessage = result?.message ?? '检测完成'

  if (resultType === 'error' || resultType === 'warning') {
    showNotifyByType(resultType, '检测游戏引擎', resultMessage)
    return
  }

  const engineId = String(result?.data?.engineId ?? '').trim()
  if (engineId) {
    formData.value.meta.engine = engineId
  }

  showNotifyByType('success', '检测游戏引擎', resultMessage)
}

const handleLaunchResource = async (resource: any) => {
  try {
    const result = await window.api.service.launchResource(
      String(resource?.id ?? ''),
      String(resource?.basePath ?? ''),
      String(resource?.fileName ?? resource?.filename ?? '') || undefined
    )

    if (result?.type === 'error') {
      showNotifyByType('error', '启动失败', result?.message ?? '启动资源失败')
      return
    }

    showNotifyByType('success', '启动资源', result?.message ?? `已启动${resource?.title ?? categoryName.value}`)
    await fetchData()
  } catch (error) {
    showNotifyByType('error', '启动失败', error instanceof Error ? error.message : '启动资源失败')
  }
}

const handleStopResource = async (resource: any) => {
  try {
    const result = await window.api.service.stopResource(String(resource?.id ?? ''))
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? `已停止${resource?.title ?? categoryName.value}`

    showNotifyByType(resultType, '停止资源', resultMessage)

    if (resultType !== 'error') {
      await fetchData()
    }
  } catch (error) {
    showNotifyByType('error', '停止失败', error instanceof Error ? error.message : '停止资源失败')
  }
}

const handleZoneLaunchResource = (resource: any) => {
  if (!canZoneLaunch.value) {
    showNotifyByType('warning', '转区启动', '请先在设置中配置 LE 转区工具路径')
    return
  }

  showNotifyByType('info', '转区启动', `“${resource?.title ?? categoryName.value}”转区启动功能待实现`)
}

const handleShowResourceDetail = (resource: any) => {
  void (async () => {
    try {
      const detail = await window.api.service.getResourceDetail(String(resource?.id ?? ''))
      selectedDetailResource.value = detail?.data ?? resource
    } catch {
      selectedDetailResource.value = resource
    }
    showDetailDrawer.value = true
    showPictureViewer.value = false
    visibleLogCount.value = 5
    currentScreenshotIndex.value = 0

    try {
      detailScreenshotPaths.value = await window.api.dialog.getScreenshotImages(String((selectedDetailResource.value ?? resource)?.id ?? ''))
    } catch {
      detailScreenshotPaths.value = []
    }
  })()
}

const loadPictureViewerScrollMode = async () => {
  try {
    const setting = await window.api.db.getSetting(Settings.PICTURE_READ_SCROLL_MODE)
    pictureViewerScrollMode.value = String(setting?.value ?? Settings.PICTURE_READ_SCROLL_MODE.default).trim() || String(Settings.PICTURE_READ_SCROLL_MODE.default)
  } catch {
    pictureViewerScrollMode.value = String(Settings.PICTURE_READ_SCROLL_MODE.default)
  }
}

const handleOpenPictureViewer = async (index: number = currentScreenshotIndex.value) => {
  if (!detailScreenshotPaths.value.length) {
    return
  }

  currentScreenshotIndex.value = Math.min(
    Math.max(0, index),
    Math.max(0, detailScreenshotPaths.value.length - 1)
  )
  await loadPictureViewerScrollMode()
  showPictureViewer.value = true
}

const handleLoadMoreLogs = () => {
  if (!hasMoreDetailLogs.value) {
    return
  }

  visibleLogCount.value = Math.min(detailLogs.value.length, visibleLogCount.value + 5)
}

const handleUpdateResourceRating = async () => {
  if (!selectedDetailResource.value || !hasPendingRatingChange.value) {
    return
  }

  try {
    const result = await window.api.service.updateResourceRating(
      String(selectedDetailResource.value.id ?? ''),
      Number(detailRatingDraft.value)
    )
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '评分更新完成'

    showNotifyByType(resultType, '更新评分', resultMessage)

    if (resultType === 'error') {
      return
    }

    selectedDetailResource.value.rating = Number(detailRatingDraft.value)
    const matchedResource = resourceList.value.find((item) => item.id === selectedDetailResource.value.id)
    if (matchedResource) {
      matchedResource.rating = Number(detailRatingDraft.value)
    }
  } catch (error) {
    showNotifyByType('error', '更新评分', error instanceof Error ? error.message : '更新评分失败')
  }
}

const handleRatingUpdate = (value: number) => {
  detailRatingDraft.value = Number.isFinite(Number(value)) ? Number(value) : 0
}

const handleEditResource = (resource: any) => {
  void (async () => {
    try {
      const result = await window.api.service.getResourceDetail(String(resource?.id ?? ''))
      const resultType = result?.type ?? 'info'

      if (resultType === 'error' || resultType === 'warning') {
        showNotifyByType(resultType, '修改信息', result?.message ?? '获取资源详情失败')
        return
      }

      const detail = result?.data
      if (!detail) {
        showNotifyByType('warning', '修改信息', '未获取到可编辑的资源详情')
        return
      }

      const nextFormData = mapResourceDetailToFormData(detail)
      editingResourceId.value = String(detail.id ?? '')
      formData.value = cloneFormData(nextFormData)
      editInitialFormData.value = cloneFormData(nextFormData)
      showDetailDrawer.value = false
      showEditModal.value = true
    } catch (error) {
      showNotifyByType('error', '修改信息', error instanceof Error ? error.message : '打开编辑抽屉失败')
    }
  })()
}

const handleOpenResourceFolder = async (resource: any) => {
  try {
    const message = await window.api.dialog.openPath(String(resource?.basePath ?? ''))
    if (message) {
      showNotifyByType('error', '打开文件夹', message)
      return
    }

    showNotifyByType('success', '打开文件夹', `已打开“${resource?.title ?? categoryName.value}”所在目录`)
  } catch (error) {
    showNotifyByType('error', '打开文件夹', error instanceof Error ? error.message : '打开文件夹失败')
  }
}

const handleOpenScreenshotFolder = async (resource: any) => {
  const resourceId = String(resource?.id ?? '').trim()

  try {
    const message = await window.api.dialog.openScreenshotFolder(resourceId)
    if (message) {
      showNotifyByType('error', '打开截图文件夹', message)
      return
    }

    showNotifyByType('success', '打开截图文件夹', `已打开“${resource?.title ?? categoryName.value}”截图目录`)
  } catch (error) {
    showNotifyByType('error', '打开截图文件夹', error instanceof Error ? error.message : '打开截图文件夹失败')
  }
}

const handleOpenDetailResourcePath = async () => {
  if (!selectedDetailResource.value) {
    return
  }

  await handleOpenResourceFolder(selectedDetailResource.value)
}

const handleOpenStoreWebsite = async (url: string) => {
  try {
    const message = await window.api.dialog.openExternalUrl(url)
    if (message) {
      showNotifyByType('error', '打开贩售网站', message)
    }
  } catch (error) {
    showNotifyByType('error', '打开贩售网站', error instanceof Error ? error.message : '打开贩售网站失败')
  }
}

const handleDetailLaunchAction = async () => {
  if (!selectedDetailResource.value) {
    return
  }

  if (selectedDetailResource.value.isRunning) {
    await handleStopResource(selectedDetailResource.value)
    return
  }

  await handleLaunchResource(selectedDetailResource.value)
}

const handleOpenDetailScreenshotFolder = async () => {
  if (!selectedDetailResource.value) {
    return
  }

  await handleOpenScreenshotFolder(selectedDetailResource.value)
  await refreshDetailScreenshots()
}

const handlePreviousScreenshot = () => {
  if (!detailScreenshotPaths.value.length) {
    return
  }

  currentScreenshotIndex.value = currentScreenshotIndex.value === 0
    ? detailScreenshotPaths.value.length - 1
    : currentScreenshotIndex.value - 1
}

const handleNextScreenshot = () => {
  if (!detailScreenshotPaths.value.length) {
    return
  }

  currentScreenshotIndex.value = currentScreenshotIndex.value === detailScreenshotPaths.value.length - 1
    ? 0
    : currentScreenshotIndex.value + 1
}

const handleDeleteResource = (resource: any) => {
  void (async () => {
    const resourceTitle = resource?.title ?? categoryName.value
    const confirmed = await confirmDialog(
      `删除${categoryName.value}`,
      `确认删除“${resourceTitle}”吗？`
    )

    if (!confirmed) {
      return
    }

    try {
      const result = await window.api.service.deleteResource(String(resource?.id ?? ''))
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '操作完成'

      showNotifyByType(resultType, `删除${categoryName.value}`, resultMessage)

      if (resultType !== 'error') {
        await fetchData()
      }
    } catch (error) {
      showNotifyByType('error', `删除${categoryName.value}`, error instanceof Error ? error.message : '删除失败')
    }
  })()
}

const handleToggleSelectResource = (resource: any) => {
  const resourceId = String(resource?.id ?? '').trim()
  if (!resourceId) {
    return
  }

  selectionModeManuallyEnabled.value = true

  if (selectedResourceIds.value.includes(resourceId)) {
    selectedResourceIds.value = selectedResourceIds.value.filter((id) => id !== resourceId)
    if (!selectedResourceIds.value.length) {
      selectionModeManuallyEnabled.value = false
    }
    return
  }

  selectedResourceIds.value = [...selectedResourceIds.value, resourceId]
}

const handleBatchSelectionAction = () => {
  if (!selectedResourceCount.value) {
    selectionModeManuallyEnabled.value = true
    return
  }

  handleDeleteSelectedResources()
}

const handleExitSelectionMode = () => {
  selectionModeManuallyEnabled.value = false
  selectedResourceIds.value = []
}

const handleSelectAllResources = () => {
  selectedResourceIds.value = resourceList.value
    .map((item) => String(item?.id ?? '').trim())
    .filter(Boolean)
}

const handleDeselectAllResources = () => {
  selectedResourceIds.value = []
}

const handleInvertSelectedResources = () => {
  const selectedSet = new Set(selectedResourceIds.value)
  selectedResourceIds.value = resourceList.value
    .map((item) => String(item?.id ?? '').trim())
    .filter(Boolean)
    .filter((id) => !selectedSet.has(id))
}

const handleDeleteSelectedResources = () => {
  void (async () => {
    if (!selectedResourceIds.value.length) {
      return
    }

    const confirmed = await confirmDialog(
      `批量删除${categoryName.value}`,
      `确认删除选中的 ${selectedResourceIds.value.length} 个${categoryName.value}吗？`
    )

    if (!confirmed) {
      return
    }

    let successCount = 0
    let failedCount = 0

    for (const resourceId of selectedResourceIds.value) {
      try {
        const result = await window.api.service.deleteResource(resourceId)
        if (String(result?.type ?? '') === 'error') {
          failedCount += 1
        } else {
          successCount += 1
        }
      } catch {
        failedCount += 1
      }
    }

    showNotifyByType(
      failedCount > 0 && successCount === 0 ? 'error' : 'success',
      `批量删除${categoryName.value}`,
      `已删除 ${successCount} 个，失败 ${failedCount} 个`
    )
    await fetchData()
    selectedResourceIds.value = []
    selectionModeManuallyEnabled.value = false
  })()
}

const handleToggleFavorite = async (resource: any) => {
  try {
    const nextValue = !Boolean(resource?.ifFavorite)
    const result = await window.api.service.updateResourceFavorite(String(resource?.id ?? ''), nextValue)
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '操作完成'

    showNotifyByType(resultType, nextValue ? '收藏资源' : '取消收藏', resultMessage)

    if (resultType !== 'error') {
      resource.ifFavorite = nextValue
      await fetchData()
    }
  } catch (error) {
    showNotifyByType('error', '收藏资源', error instanceof Error ? error.message : '更新收藏状态失败')
  }
}

const refreshDetailScreenshots = async (nextIndex: number = currentScreenshotIndex.value) => {
  try {
    detailScreenshotPaths.value = await window.api.dialog.getScreenshotImages(String(selectedDetailResource.value?.id ?? ''))
  } catch {
    detailScreenshotPaths.value = []
  }

  if (!detailScreenshotPaths.value.length) {
    currentScreenshotIndex.value = 0
    showPictureViewer.value = false
    return
  }

  currentScreenshotIndex.value = Math.min(
    Math.max(0, nextIndex),
    Math.max(0, detailScreenshotPaths.value.length - 1)
  )
}

const deleteScreenshotFile = async (filePath: string, nextIndex: number = currentScreenshotIndex.value) => {
  const message = await window.api.dialog.deleteImage(filePath)
  if (message) {
    showNotifyByType('error', '删除截图', message)
    return
  }

  await refreshDetailScreenshots(nextIndex)
  showNotifyByType('success', '删除截图', '截图已删除')
}

const handleDeleteCurrentScreenshot = async () => {
  const filePath = currentScreenshotPath.value
  if (!filePath) {
    return
  }

  showDeleteScreenshotConfirm.value = false
  await nextTick()
  await deleteScreenshotFile(filePath)
}

const handleDeleteViewerScreenshot = async (payload: { filePath: string; index: number }) => {
  const nextIndex = Math.max(0, payload.index - (payload.index >= detailScreenshotPaths.value.length - 1 ? 1 : 0))
  await deleteScreenshotFile(payload.filePath, nextIndex)
}

const handleToggleCompleted = async (resource: any) => {
  try {
    const nextValue = !Boolean(resource?.isCompleted)
    const result = await window.api.service.updateResourceCompleted(String(resource?.id ?? ''), nextValue)
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '操作完成'

    showNotifyByType(resultType, nextValue ? '标记通关' : '取消通关', resultMessage)

    if (resultType !== 'error') {
      resource.isCompleted = nextValue
      await fetchData()
    }
  } catch (error) {
    showNotifyByType('error', '标记通关', error instanceof Error ? error.message : '更新通关状态失败')
  }
}
</script>

<template>
  <div
    class="category-detail-root"
    :class="{ 'category-detail-root--drag-over': isDragOver }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDropResourceFile"
  >
    <n-layout has-sider embedded position="absolute" class="layout-root">
      <n-layout-sider
        bordered
        :width="240"
        showTrigger
        :native-scrollbar="false"
        content-class="filter-sider-content"
        content-style="height: 100%; overflow: hidden;"
        class="filter-sider">
        <div class="filter-panel">
          <div class="filter-top">
            <n-h3 class="filter-title">
              <n-icon :component="FunnelOutline" depth="3" /> 筛选条件
            </n-h3>
            <div class="filter-top-options">
              <n-checkbox v-model:checked="missingFile" class="filter-top-option">
                <span class="filter-top-option__label">资源失效</span>
                <n-tag type="error" :bordered="false" round size="small">{{ missingResourceCount }}</n-tag>
              </n-checkbox>
              <n-checkbox v-model:checked="favoriteOnly" class="filter-top-option">
                <span class="filter-top-option__label">已收藏</span>
                <n-tag type="success" :bordered="false" round size="small">{{ favoriteResourceCount }}</n-tag>
              </n-checkbox>
              <n-checkbox v-model:checked="completedOnly" class="filter-top-option">
                <span class="filter-top-option__label">已通关</span>
                <n-tag type="info" :bordered="false" round size="small">{{ completedResourceCount }}</n-tag>
              </n-checkbox>
              <n-checkbox v-model:checked="runningOnly" class="filter-top-option">
                <span class="filter-top-option__label">运行中</span>
                <n-tag type="success" :bordered="false" round size="small">{{ runningResourceCount }}</n-tag>
              </n-checkbox>
            </div>
          </div>

          <div class="filter-sections" :style="filterSectionsStyle">
            <div class="filter-section">
              <n-divider title-placement="left" style="margin-bottom: 5px;">
                {{ categorySettings.authorText || '作者筛选' }}
              </n-divider>
              <n-input
                v-model:value="authorSearch"
                :placeholder="`请输入${categorySettings.authorText || '作者'}名称`"
                class="author-search"
                clearable
              />
              <n-checkbox-group v-model:value="selectedAuthorList" class="filter-group">
                <n-flex vertical class="filter-list">
                  <n-checkbox v-for="author in filteredAuthorList" :key="author.id" :value="author.id">
                    {{ author.name }}
                    <n-tag type="primary" :bordered="false" round size="small">{{ author.count }}</n-tag>
                  </n-checkbox>
                </n-flex>
              </n-checkbox-group>
            </div>
            <div class="filter-section">
              <n-divider title-placement="left" style="margin-bottom: 5px;">标签筛选</n-divider>
              <n-input v-model:value="tagSearch" placeholder="请输入标签名称" class="tag-search" clearable/>
              <n-checkbox-group v-model:value="selectedTagList" class="filter-group">
                <n-flex vertical class="filter-list">
                  <n-checkbox v-for="tag in filteredTagList" :key="tag.id" :value="tag.id">{{tag.name}}
                    <n-tag type="info" :bordered="false" round size="small">{{tag.count}}</n-tag>
                  </n-checkbox>
                </n-flex>
              </n-checkbox-group>
            </div>
            <div class="filter-section">
              <n-divider title-placement="left" style="margin-bottom: 5px;">分类筛选</n-divider>
              <n-input v-model:value="typeSearch" placeholder="请输入分类名称" class="type-search" clearable/>
              <n-checkbox-group v-model:value="selectedTypeList" class="filter-group">
                <n-flex vertical class="filter-list">
                  <n-checkbox v-for="type in filteredTypeList" :key="type.id" :value="type.id">{{type.name}}
                    <n-tag type="warning" :bordered="false" round size="small">{{type.count}}</n-tag>
                  </n-checkbox>
                </n-flex>
              </n-checkbox-group>
            </div>
            <div v-if="showEngineFilter" class="filter-section">
              <n-divider title-placement="left" style="margin-bottom: 5px;">引擎筛选</n-divider>
              <n-checkbox-group v-model:value="selectedEngineList" class="filter-group">
                <n-flex vertical class="filter-list">
                  <n-checkbox v-for="engine in filteredEngineList" :key="engine.id" :value="engine.id">
                    <span v-if="engine.icon" class="filter-engine-option">
                      <img :src="engine.icon" :alt="engine.name" class="filter-engine-option__icon" />
                      <span>{{ engine.name }} </span>
                    </span>
                    <span v-else>{{ engine.name }} </span>
                    <n-tag type="success" :bordered="false" round size="small">{{ engine.count }}</n-tag>
                  </n-checkbox>
                </n-flex>
              </n-checkbox-group>
            </div>
          </div>

          <div class="filter-bottom">
            <n-button quaternary size="small" type="warning" class="reset-btn" @click="resetSelected">
              重置筛选
            </n-button>
          </div>
        </div>
      </n-layout-sider>

      <div class="detail-main" :style="pageStyle">
        <div class="detail-header" :style="headerStyle">
          <div class="detail-header__info">
            <div class="detail-header__title">{{ categoryName ?? '分类详情' }}</div>
            <div class="detail-header__subtitle" :style="titleMetaStyle">当前共 {{ totalResources }} 条资源</div>
          </div>
          <n-space class="detail-header__actions" :size="12">
            <n-button
              v-if="resourceSelectionMode"
              @click="handleExitSelectionMode"
            >
              退出多选模式
            </n-button>
            <n-button
              v-if="resourceSelectionMode"
              @click="handleSelectAllResources"
            >
              全选
            </n-button>
            <n-button
              v-if="resourceSelectionMode"
              @click="handleDeselectAllResources"
            >
              取消全选
            </n-button>
            <n-button
              v-if="resourceSelectionMode"
              @click="handleInvertSelectedResources"
            >
              反选
            </n-button>
            <n-button
              :type="resourceSelectionMode ? 'error' : 'default'"
              @click="handleBatchSelectionAction"
            >
              {{ resourceSelectionMode ? `批量删除（${selectedResourceCount}）` : '批量操作' }}
            </n-button>
            <n-button v-if="showBatchImportButton" @click="handleBatchImportClick">
              批量导入
            </n-button>
            <n-button type="primary" @click="handleAddResource">
              添加{{ categoryName ?? '资源' }}
            </n-button>
          </n-space>
        </div>

        <div class="detail-content">
          <n-scrollbar class="detail-scrollbar">
            <div class="detail-content__inner">
            <n-empty v-if="resourceList.length === 0" :description="`暂无${categoryName || ''}资源，点击按钮添加吧！`">
              <template #extra>
                <n-button type="primary" @click="handleAddResource">
                  添加第一{{categorySettings.addFirst}}{{ categoryName ?? '资源' }}
                </n-button>
              </template>
            </n-empty>

            <div v-else class="resource-grid">
              <ResourceCard
                v-for="resource in resourceList"
                :key="`${resource.id}-${resource.coverPath ?? ''}-${resourceListRenderVersion}`"
                :resource="resource"
                :category-name="categoryName"
                :author-label="categorySettings.authorText || '作者'"
                :start-text="startText"
                :show-zone-launch="showZoneLaunch"
                :can-zone-launch="canZoneLaunch"
                :show-screenshot-folder="showScreenshotFolder"
                :show-completed-toggle="showCompletedToggle"
                :selected="selectedResourceIds.includes(String(resource?.id ?? ''))"
                :selection-mode="resourceSelectionMode"
                @launch="handleLaunchResource"
                @stop="handleStopResource"
                @zone-launch="handleZoneLaunchResource"
                @show-detail="handleShowResourceDetail"
                @edit="handleEditResource"
                @open-folder="handleOpenResourceFolder"
                @open-screenshot-folder="handleOpenScreenshotFolder"
                @toggle-favorite="handleToggleFavorite"
                @toggle-completed="handleToggleCompleted"
                @toggle-select="handleToggleSelectResource"
                @delete="handleDeleteResource"
              />
            </div>
            </div>
          </n-scrollbar>
        </div>

        <div class="detail-footer" :style="footerStyle">
          <div class="detail-footer__meta" :style="titleMetaStyle">
            第 {{ currentPage }} 页，共 {{ totalPages }} 页，共 {{ totalResources }} 个{{ categoryName }}
          </div>
          <div class="detail-footer__controls">
            <n-select
              v-model:value="pageSize"
              class="detail-footer__select detail-footer__select--size"
              :options="pageSizeOptions"
            />
            <n-select
              v-model:value="sortBy"
              class="detail-footer__select detail-footer__select--sort"
              :options="sortOptions"
            />
            <n-pagination
              v-model:page="currentPage"
              :page-size="pageSize"
              :item-count="totalResources"
              :page-slot="7"
            />
            <div class="detail-footer__jump">
              <n-input-number
                v-model:value="jumpPageInput"
                :min="1"
                :max="totalPages"
                :show-button="false"
                class="detail-footer__jump-input"
                placeholder="页码"
              />
              <n-button @click="handleJumpPage">跳转</n-button>
            </div>
          </div>
        </div>
      </div>
    </n-layout>

    <n-drawer v-model:show="showDetailDrawer" placement="right" :width="detailDrawerWidth">
      <n-drawer-content :title="selectedDetailResource?.title || `${categoryName}详情`" closable>
        <div class="detail-drawer__resize-handle" @mousedown.prevent="handleDetailDrawerResizeStart" />
        <n-scrollbar style="max-height: 100%;">
            <div v-if="selectedDetailResource" class="detail-drawer">
            <div class="detail-drawer__cover">
              <img
                v-if="detailCoverPreviewSrc"
                :src="detailCoverPreviewSrc"
                :alt="selectedDetailResource.title"
                class="detail-drawer__cover-image"
              />
              <div v-else class="detail-drawer__cover-placeholder">
                暂无封面
              </div>
            </div>

            <div class="detail-drawer__section">
              <div class="detail-drawer__section-title">基本信息</div>
              <div class="detail-drawer__grid">
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">标题</span>
                  <span class="detail-drawer__value">{{ selectedDetailResource.title || '暂无' }}</span>
                </div>
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">文件名</span>
                  <span class="detail-drawer__value">{{ selectedDetailResource.fileName || '暂无' }}</span>
                </div>
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">{{ categorySettings.authorText || '作者' }}</span>
                  <span class="detail-drawer__value">{{ (selectedDetailResource.authors ?? []).map((item: any) => item.name).join('、') || '暂无' }}</span>
                </div>
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">评分</span>
                  <div class="detail-drawer__rating">
                    <div class="detail-drawer__rating-main">
                      <n-rate
                        v-model:value="detailRatingDraft"
                        allow-half
                        clearable
                        @update:value="handleRatingUpdate"
                      />
                      <n-button
                        v-if="hasPendingRatingChange"
                        type="primary"
                        ghost
                        circle
                        size="tiny"
                        class="detail-drawer__rating-submit"
                        @click="handleUpdateResourceRating"
                      >
                        <template #icon>
                          <n-icon :component="CheckmarkOutline" />
                        </template>
                      </n-button>
                    </div>
                    <span v-if="ratingComment" class="detail-drawer__rating-text">
                      {{ ratingComment }} {{ getRatingEmoji(detailRatingDraft) }}
                    </span>
                    <span v-else-if="Number(detailRatingDraft) === 0" class="detail-drawer__rating-text">
                      区 {{ getRatingEmoji(detailRatingDraft) }}
                    </span>
                  </div>
                </div>
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">分类</span>
                  <div v-if="(selectedDetailResource.types ?? []).length" class="detail-drawer__tag-list">
                    <n-tag
                      v-for="typeItem in selectedDetailResource.types"
                      :key="`${selectedDetailResource.id}-detail-type-${typeItem.id}`"
                      bordered
                      :round="false"
                      type="warning"
                      size="small"
                    >
                      {{ typeItem.name }}
                    </n-tag>
                  </div>
                  <span v-else class="detail-drawer__value">暂无</span>
                </div>
                  <div class="detail-drawer__item">
                    <span class="detail-drawer__label">标签</span>
                    <div v-if="(selectedDetailResource.tags ?? []).length" class="detail-drawer__tag-list">
                      <n-tag
                        v-for="tagItem in selectedDetailResource.tags"
                      :key="`${selectedDetailResource.id}-detail-tag-${tagItem.id}`"
                      bordered
                      :round="false"
                      type="info"
                      size="small"
                    >
                      {{ tagItem.name }}
                    </n-tag>
                    </div>
                    <span v-else class="detail-drawer__value">暂无</span>
                  </div>
                  <div class="detail-drawer__item detail-drawer__item--full">
                    <span class="detail-drawer__label">路径</span>
                    <div class="detail-drawer__path-row">
                    <span class="detail-drawer__value detail-drawer__value--path">{{ selectedDetailResource.basePath || '暂无' }}</span>
                    <n-button type="primary" ghost class="detail-drawer__path-button" @click="handleOpenDetailResourcePath">
                      <template #icon>
                        <n-icon :component="FolderOpenOutline" />
                      </template>
                    </n-button>
                  </div>
                </div>
                <div v-if="detailStores.length" class="detail-drawer__item detail-drawer__item--full">
                  <span class="detail-drawer__label">贩售网站</span>
                  <div class="detail-drawer__store-list">
                    <button
                      v-for="storeItem in detailStores"
                      :key="`${selectedDetailResource.id}-detail-store-${storeItem.id}`"
                      type="button"
                      class="detail-drawer__store-button"
                      :disabled="!storeItem.url"
                      @click="handleOpenStoreWebsite(storeItem.url)"
                    >
                      <img
                        v-if="storeItem.icon"
                        :src="storeItem.icon"
                        :alt="storeItem.name"
                        class="detail-drawer__store-icon"
                      />
                      <span v-else class="detail-drawer__store-fallback">{{ storeItem.name.slice(0, 1) }}</span>
                      <span class="detail-drawer__store-name">{{ storeItem.name }}</span>
                    </button>
                  </div>
                </div>
                <div
                  v-for="metaItem in detailMetaItems"
                  :key="`${selectedDetailResource.id}-meta-${metaItem.label}`"
                  class="detail-drawer__item"
                >
                  <span class="detail-drawer__label">{{ metaItem.label }}</span>
                  <span v-if="metaItem.icon" class="detail-drawer__value detail-drawer__meta-with-icon">
                    <img :src="metaItem.icon" :alt="metaItem.value" class="detail-drawer__meta-icon" />
                    <span>{{ metaItem.value }}</span>
                  </span>
                  <span v-else class="detail-drawer__value">{{ metaItem.value }}</span>
                </div>
              </div>
            </div>

            <div v-if="selectedDetailResource.description" class="detail-drawer__section">
              <div class="detail-drawer__section-title">描述</div>
              <div class="detail-drawer__item detail-drawer__item--full">
                <div class="detail-drawer__description-box" :style="detailDescriptionBoxStyle">
                  <n-scrollbar class="detail-drawer__description-scrollbar">
                    <div
                      ref="detailDescriptionContentRef"
                      class="detail-drawer__value detail-drawer__value--description detail-drawer__value--rich"
                      v-html="selectedDetailResource.description"
                    />
                  </n-scrollbar>
                </div>
              </div>
            </div>

            <div class="detail-drawer__section">
              <div class="detail-drawer__section-title">统计信息</div>
              <div class="detail-drawer__grid">
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">第一次启动</span>
                  <span class="detail-drawer__value">{{ formatDateTime(detailStats?.firstAccessTime) }}</span>
                </div>
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">最后一次启动</span>
                  <span class="detail-drawer__value">{{ formatDateTime(detailStats?.lastAccessTime) }}</span>
                </div>
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">启动次数</span>
                  <span class="detail-drawer__value">{{ Number(detailStats?.accessCount ?? 0) }}</span>
                </div>
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">运行总时长</span>
                  <span class="detail-drawer__value">{{ formatDuration(detailStats?.totalRuntime) }}</span>
                </div>
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">添加日期</span>
                  <span class="detail-drawer__value">{{ formatDateTime(selectedDetailResource.createTime) }}</span>
                </div>
              </div>
            </div>

            <div v-if="detailScreenshotPaths.length" class="detail-drawer__section">
              <div class="detail-drawer__section-title">游戏截图</div>
              <div class="detail-drawer__screenshot" @click="handleOpenPictureViewer()">
                <img
                  v-if="detailScreenshotPreviewSrc"
                  :src="detailScreenshotPreviewSrc"
                  :alt="selectedDetailResource.title"
                  class="detail-drawer__screenshot-image"
                />
                <div class="detail-drawer__screenshot-mask">
                  <n-icon :component="EyeOutline" size="28" />
                </div>
              </div>
              <div class="detail-drawer__screenshot-actions">
                <n-button quaternary @click="handlePreviousScreenshot">
                  <template #icon>
                    <n-icon :component="ChevronBackOutline" />
                  </template>
                </n-button>
                <div class="detail-drawer__screenshot-index">
                  {{ currentScreenshotIndex + 1 }} / {{ detailScreenshotPaths.length }}
                </div>
                <n-button quaternary @click="handleNextScreenshot">
                  <template #icon>
                    <n-icon :component="ChevronForwardOutline" />
                  </template>
                </n-button>
                <n-popconfirm
                  v-model:show="showDeleteScreenshotConfirm"
                  @positive-click="handleDeleteCurrentScreenshot"
                  positive-text="删除！"
                  negative-text="手滑了"
                  :positive-button-props="{type: 'error'}"
                >
                  <template #trigger>
                    <n-button quaternary type="error">
                      <template #icon>
                        <n-icon :component="TrashOutline" />
                      </template>
                      删除截图
                    </n-button>
                  </template>
                  确认删除当前截图吗？
                </n-popconfirm>
                <n-button quaternary @click="handleOpenDetailScreenshotFolder">
                  <template #icon>
                    <n-icon :component="FolderOpenOutline" />
                  </template>
                  打开截图文件夹
                </n-button>
              </div>
            </div>

              <div class="detail-drawer__section">
                <div class="detail-drawer__section-title">启动日志</div>
              <n-empty v-if="!detailLogs.length" description="暂无启动日志" />
              <n-infinite-scroll
                v-else
                class="detail-drawer__logs-scroll"
                :distance="8"
                @load="handleLoadMoreLogs"
              >
                <div class="detail-drawer__logs">
                  <div v-for="(logItem, index) in visibleDetailLogs" :key="`${selectedDetailResource.id}-${index}-${logItem.startTime}`" class="detail-drawer__log">
                    <div class="detail-drawer__log-row">
                      <span class="detail-drawer__log-label">开始时间</span>
                      <span class="detail-drawer__log-value">{{ formatDateTime(logItem.startTime) }}</span>
                    </div>
                    <div class="detail-drawer__log-row">
                      <span class="detail-drawer__log-label">结束时间</span>
                      <span class="detail-drawer__log-value">{{ formatDateTime(logItem.endTime) }}</span>
                    </div>
                    <div class="detail-drawer__log-row">
                      <span class="detail-drawer__log-label">运行时长</span>
                      <span class="detail-drawer__log-value">{{ formatDuration(logItem.duration) }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="hasMoreDetailLogs" class="detail-drawer__logs-more">
                  <n-button quaternary size="small" @click="handleLoadMoreLogs">展示更多</n-button>
                </div>
                <div v-if="noMore">
                  <div class="detail-drawer__logs-finish">没有更多了 🤪</div>
                </div>
                </n-infinite-scroll>
              </div>

              <n-float-button
                :type="selectedDetailResource?.isRunning ? 'error' : 'primary'"
                class="detail-drawer__launch"
                :description="selectedDetailResource?.isRunning ? '停止' : startText"
                :disabled="!detailCanLaunch && !detailCanStop"
                @click="handleDetailLaunchAction"
              >
                <n-icon>
                  <component :is="selectedDetailResource?.isRunning ? Stop : Play" />
                </n-icon>
              </n-float-button>
            </div>
          </n-scrollbar>
        <template #footer>
          <div class="detail-drawer__footer">
            <n-space justify="start">
              <n-button :disabled="!selectedDetailResource" @click="handleEditResource(selectedDetailResource)">
                编辑信息
              </n-button>
              <n-button :disabled="!selectedDetailResource" @click="handleOpenDetailResourcePath">
                打开游戏文件夹
              </n-button>
            </n-space>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-modal
      v-model:show="showBatchImportLoading"
      preset="card"
      title="批量导入"
      :mask-closable="batchAnalyzeRunning"
      :closable="false"
      :auto-focus="false"
      @mask-click="handleBatchImportMaskClick"
      :style="{ width: '520px' }"
    >
      <div class="batch-import-loading">
        <div class="batch-import-loading__progress">
          <n-progress
            type="circle"
            status="info"
            :stroke-width="10"
            :percentage="batchAnalyzePercent"
            :show-indicator="false"
            class="batch-import-loading__inner-progress"
          />
          <div class="batch-import-loading__progress-center">
            <div class="batch-import-loading__progress-text">{{ batchAnalyzePercent }}%</div>
          </div>
        </div>
        <div class="batch-import-loading__title">
          <template v-if="batchAnalyzeRunning && batchAnalyzeTotal > 0">
            <span class="batch-import-loading__title-text">正在分析第 {{ batchAnalyzeCurrent }} / {{ batchAnalyzeTotal }} 个目录</span>
            <span class="batch-import-loading__title-directory" :title="getResourceNameFromBasePath(batchAnalyzeMessage.split('\n')[1] || '') || (batchAnalyzeMessage.split('\n')[1] || '')">
              {{ getResourceNameFromBasePath(batchAnalyzeMessage.split('\n')[1] || '') || (batchAnalyzeMessage.split('\n')[1] || '') }}
            </span>
          </template>
          <template v-else>
            {{ batchAnalyzeMessage || '正在准备批量导入，请稍候...' }}
          </template>
        </div>
      </div>
      <template #footer>
        <div class="modal-footer">
          <n-space justify="end">
            <n-button type="warning" @click="handleStopBatchImportAnalysis">停止分析</n-button>
          </n-space>
        </div>
      </template>
    </n-modal>

    <div
      v-if="showBatchImportProgressToast"
      class="batch-import-toast"
      @click="handleReopenBatchImportProgress"
    >
      <n-button
        quaternary
        circle
        size="tiny"
        class="batch-import-toast__close"
        @click.stop="handleDismissBatchImportProgressToast"
      >
        <template #icon>
          <n-icon>
            <CloseOutline />
          </n-icon>
        </template>
      </n-button>
      <div class="batch-import-toast__progress">
        <n-progress
          type="circle"
          status="info"
          :stroke-width="8"
          :percentage="batchAnalyzePercent"
          :show-indicator="false"
        />
        <div class="batch-import-toast__progress-text">{{ batchAnalyzePercent }}%</div>
      </div>
      <div class="batch-import-toast__content">
        <div class="batch-import-toast__title">正在后台分析游戏目录</div>
        <div class="batch-import-toast__subtitle">
          第 {{ batchAnalyzeCurrent }} / {{ batchAnalyzeTotal }} 个目录
        </div>
        <div class="batch-import-toast__subtitle" :title="getResourceNameFromBasePath(batchAnalyzeMessage.split('\n')[1] || '') || (batchAnalyzeMessage.split('\n')[1] || '')">
          {{ getResourceNameFromBasePath(batchAnalyzeMessage.split('\n')[1] || '') || (batchAnalyzeMessage.split('\n')[1] || '') }}
        </div>
      </div>
    </div>

    <n-modal
      v-model:show="showBatchImportModal"
      preset="card"
      title="批量导入预览"
      closable
      :mask-closable="false"
      content-scrollable
      :style="{ width: '860px', height: '80vh' }"
    >
      <template #default>
        <div class="batch-import-modal">
          <div class="batch-import-modal__toolbar">
            <n-space>
              <n-button size="small" @click="handleBatchImportSelectAll">全选</n-button>
              <n-button size="small" @click="handleBatchImportDeselectAll">取消全选</n-button>
              <n-button size="small" @click="handleBatchImportInvert">反选</n-button>
            </n-space>
            <div class="batch-import-modal__summary">
              已选择 {{ selectedBatchImportCount }} / {{ selectableBatchImportItems.length }} 个可导入目录
            </div>
          </div>
          <n-scrollbar class="batch-import-modal__scrollbar">
            <div class="batch-import-modal__list">
              <div
                v-for="(item, index) in batchImportItems"
                :key="item.directoryPath"
                class="batch-import-item"
                :class="{
                  'batch-import-item--clickable': canToggleBatchImportItem(item),
                  'batch-import-item--checked': item.checked
                }"
                @click="handleToggleBatchImportItem(index)"
              >
                <div class="batch-import-item__row">
                  <n-checkbox
                    :checked="item.checked"
                    :disabled="item.exists || !!item.errorMessage || !item.launchFilePath"
                    @click.stop
                    @update:checked="(value: boolean) => { batchImportItems[index].checked = value }"
                  />
                  <div class="batch-import-item__main">
                    <div class="batch-import-item__title">{{ item.directoryName || item.directoryPath }}</div>
                    <div class="batch-import-item__path">{{ item.directoryPath }}</div>
                  </div>
                  <n-space align="center" size="small">
                    <n-tag v-if="item.exists" type="warning" size="small">已存在</n-tag>
                    <n-tag v-else-if="item.errorMessage" type="error" size="small">分析失败</n-tag>
                    <n-tag
                      v-if="item.importResultType && item.importResultMessage"
                      :type="item.importResultType === 'success' ? 'success' : item.importResultType === 'error' ? 'error' : 'warning'"
                      size="small"
                    >
                      {{ item.importResultType === 'success' ? '已导入' : item.importResultType === 'error' ? '导入失败' : '已跳过' }}
                    </n-tag>
                    <n-button size="small" @click.stop="handleSelectBatchLaunchFile(index)">
                      手动选择
                    </n-button>
                  </n-space>
                </div>
                <div class="batch-import-item__detail">
                  <div class="batch-import-item__label">启动文件</div>
                  <div v-if="item.launchFilePath" class="batch-import-item__value">
                    <img
                      v-if="item.launchFileIcon"
                      :src="item.launchFileIcon"
                      alt="启动文件图标"
                      class="batch-import-item__file-icon"
                    />
                    {{ item.launchFilePath }}
                  </div>
                  <div v-else class="batch-import-item__value batch-import-item__value--error">
                    {{ item.errorMessage || '未分析出可用启动文件，请手动选择' }}
                  </div>
                  <div v-if="showBatchImportButton" class="batch-import-item__fields">
                    <div class="batch-import-item__field">
                      <div class="batch-import-item__label">贩售网站</div>
                      <n-select
                        :value="item.websiteType"
                        :options="websiteTypeSelectOptions"
                        clearable
                        placeholder="请选择贩售网站"
                        @click.stop
                        @update:value="(value) => { batchImportItems[index].websiteType = String(value ?? '') }"
                      />
                    </div>
                    <div class="batch-import-item__field">
                      <div class="batch-import-item__label">作品 ID</div>
                      <n-input
                        :value="item.gameId"
                        placeholder="请输入作品ID"
                        @click.stop
                        @update:value="(value) => { batchImportItems[index].gameId = value }"
                      />
                    </div>
                    <div class="batch-import-item__field batch-import-item__field--checkbox">
                      <n-checkbox
                        :checked="item.fetchInfoEnabled !== false"
                        @click.stop
                        @update:checked="(value: boolean) => { batchImportItems[index].fetchInfoEnabled = value }"
                      >
                        通过插件获取作品信息
                      </n-checkbox>
                    </div>
                  </div>
                  <div
                    v-if="item.importResultMessage"
                    class="batch-import-item__result"
                    :class="{
                      'batch-import-item__result--success': item.importResultType === 'success',
                      'batch-import-item__result--error': item.importResultType === 'error'
                    }"
                  >
                    {{ item.importResultMessage }}
                  </div>
                </div>
              </div>
            </div>
          </n-scrollbar>
        </div>
      </template>
      <template #footer>
        <div class="modal-footer">
          <n-space justify="end">
            <n-button @click="handleCloseBatchImportModal">退出</n-button>
            <n-button type="primary" :loading="isBatchImportSubmitting" @click="handleConfirmBatchImport">
              确认导入
            </n-button>
          </n-space>
        </div>
      </template>
    </n-modal>

    <n-modal
      v-model:show="showEditModal"
      preset="card"
      :title="`修改${categoryName}`"
      content-scrollable
      :style="{ width: '680px', height: '80vh' }"
    >
      <template #default>
        <n-scrollbar style="max-height: 100%;">
          <div class="edit-drawer">
            <n-form ref="formRef" :model="formData" label-placement="left" label-width="100" :rules="addResourceRule">
              <n-form-item :label="`${categoryName}名`" path="name">
                <n-input v-model:value="formData.name" :placeholder="`请输入${categoryName}名`" />
              </n-form-item>
              <n-form-item
                v-if="categorySettings.resourcePathType"
                ref="basePathFormItemRef"
                :label="`${categoryName}路径`"
                path="basePath"
              >
                <div class="path-field">
                  <n-input
                    disabled
                    v-model:value="formData.basePath"
                    :placeholder="`请选择${categoryName}路径`"
                  />
                  <n-button @click="handleSelectBasePath">选择{{categorySettings.resourcePathType === 'file' ? '文件' : '目录'}}</n-button>
                </div>
              </n-form-item>
              <component
                :is="modelComponent"
                v-if="modelComponent"
                :key="`${modelComponentKey}-edit`"
                v-model:metaData="formData.meta"
                :base-path="formData.basePath"
                @check-engine="handleCheckGameEngine"
                @fetch-game-info="handleFetchGameInfo"
              />
              <n-form-item :label="descriptionLabel" path="description">
                <RichTextEditor v-model="formData.description" :placeholder="descriptionPlaceholder" />
              </n-form-item>
              <n-form-item v-if="categorySettings.authorText" :label="categorySettings.authorText" path="author">
                <n-input v-model:value="formData.author" :placeholder="`请输入${categorySettings.authorText}`"/>
              </n-form-item>
              <n-form-item :label="`${categoryName}标签`" path="tags">
                <n-select
                  :value="formData.tags"
                  multiple
                  filterable
                  tag
                  clearable
                  :options="tagSelectOptions"
                  :input-props="{
                    onKeydown: (event: KeyboardEvent) => handleSelectInputKeydown(event, 'tags'),
                    onBlur: handleTagInputCommit
                  }"
                  placeholder="可选择已有标签，也可输入新标签，按空格、顿号、英文逗号或回车批量添加"
                  :on-search="handleTagSearch"
                  :on-create="createSelectOption"
                  @update:value="handleTagsChange"
                />
              </n-form-item>
              <n-form-item :label="`${categoryName}分类`" path="types">
                <n-select
                  :value="formData.types"
                  multiple
                  filterable
                  tag
                  clearable
                  :options="typeSelectOptions"
                  :input-props="{
                    onKeydown: (event: KeyboardEvent) => handleSelectInputKeydown(event, 'types'),
                    onBlur: handleTypeInputCommit
                  }"
                  placeholder="可选择已有分类，也可输入新分类，按空格、顿号、英文逗号或回车批量添加"
                  :on-search="handleTypeSearch"
                  :on-create="createSelectOption"
                  @update:value="handleTypesChange"
                />
              </n-form-item>
              <n-form-item
                v-if="!['software_meta', 'single_image_meta', 'website_meta'].includes(categorySettings.extendTable)"
                label="封面图"
                path="cover"
              >
                <div class="cover-field">
                  <div class="cover-preview">
                    <img v-if="coverPreviewSrc" :src="coverPreviewSrc" alt="封面预览" class="cover-preview__image" />
                    <span v-else class="cover-preview__label">{{ coverPreviewLabel }}</span>
                  </div>
                  <n-space size="small" wrap>
                    <n-button size="small" @click="handleChooseCustomCover">选择自定义封面</n-button>
                    <n-button size="small" :disabled="!hasBasePath" @click="handleUseScreenshotCover">使用截图作为封面</n-button>
                    <n-button size="small" :disabled="!editingResourceId" @click="handleChooseCoverFromScreenshotFolder">从截图文件夹选择</n-button>
                    <n-button
                      v-if="categorySettings.extendTable === 'multi_image_meta'"
                      size="small"
                      :disabled="!hasBasePath"
                      @click="handleUseFirstCover"
                    >
                      选择第一张封面
                    </n-button>
                    <n-button size="small" type="error" quaternary :disabled="!hasCoverPath" @click="handleClearCover">清除封面</n-button>
                  </n-space>
                </div>
              </n-form-item>
            </n-form>
          </div>
        </n-scrollbar>
      </template>
      <template #footer>
        <div class="modal-footer">
          <n-space justify="end">
            <n-button @click="handleResetEditForm">重置</n-button>
            <n-button @click="handleRestoreDefaultEditForm">恢复默认</n-button>
            <n-button type="primary" @click="handleSubmitEditResource">确认</n-button>
          </n-space>
        </div>
      </template>
    </n-modal>

    <PictureViewer
      v-model:show="showPictureViewer"
      :image-paths="detailScreenshotPaths"
      :initial-index="currentScreenshotIndex"
      :scroll-mode="pictureViewerScrollMode"
      @delete-image="handleDeleteViewerScreenshot"
    />

    <div v-if="isDragOver && categorySettings.resourcePathType === 'file'" class="drag-overlay">
      <div class="drag-overlay__panel">
        <div class="drag-overlay__title">拖拽文件到这里添加{{ categoryName }}</div>
        <div class="drag-overlay__subtitle">
          仅支持 {{ normalizedAllowedExtensions.length ? normalizedAllowedExtensions.join(', ') : '当前分类允许的文件类型' }}
        </div>
      </div>
    </div>

    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="`添加${categoryName || ''}`"
      content-scrollable
      :style="{ width: '600px', height: '80vh' }"
    >
      <template #default>
        <n-form ref="formRef" :model="formData" label-placement="left" label-width="100" :rules="addResourceRule">
          <n-form-item :label="`${categoryName}名`" path="name">
            <n-input v-model:value="formData.name" :placeholder="`请输入${categoryName}名`" />
          </n-form-item>
          <n-form-item
            v-if="categorySettings.resourcePathType"
            ref="basePathFormItemRef"
            :label="`${categoryName}路径`"
            path="basePath"
          >
            <div class="path-field">
              <n-input
                disabled
                v-model:value="formData.basePath"
                :placeholder="`请选择${categoryName}路径`"
              />
              <n-button @click="handleSelectBasePath">选择{{categorySettings.resourcePathType === 'file' ? '文件' : '目录'}}</n-button>
            </div>
          </n-form-item>
          <component
            :is="modelComponent"
            v-if="modelComponent"
            :key="modelComponentKey"
            v-model:metaData="formData.meta"
            :base-path="formData.basePath"
            @check-engine="handleCheckGameEngine"
            @fetch-game-info="handleFetchGameInfo"
          />
          <n-form-item :label="descriptionLabel" path="description">
            <RichTextEditor v-model="formData.description" :placeholder="descriptionPlaceholder" />
          </n-form-item>
          <n-form-item v-if="categorySettings.authorText" :label="categorySettings.authorText" path="author">
            <n-input v-model:value="formData.author" :placeholder="`请输入${categorySettings.authorText}`"/>
          </n-form-item>
          <n-form-item :label="`${categoryName}标签`" path="tags">
            <n-select
              :value="formData.tags"
              multiple
              filterable
              tag
              clearable
              :options="tagSelectOptions"
              :input-props="{
                onKeydown: (event: KeyboardEvent) => handleSelectInputKeydown(event, 'tags'),
                onBlur: handleTagInputCommit
              }"
              placeholder="可选择已有标签，也可输入新标签，按空格、顿号、英文逗号或回车批量添加"
              :on-search="handleTagSearch"
              :on-create="createSelectOption"
              @update:value="handleTagsChange"
            />
          </n-form-item>
          <n-form-item :label="`${categoryName}分类`" path="types">
            <n-select
              :value="formData.types"
              multiple
              filterable
              tag
              clearable
              :options="typeSelectOptions"
              :input-props="{
                onKeydown: (event: KeyboardEvent) => handleSelectInputKeydown(event, 'types'),
                onBlur: handleTypeInputCommit
              }"
              placeholder="可选择已有分类，也可输入新分类，按空格、顿号、英文逗号或回车批量添加"
              :on-search="handleTypeSearch"
              :on-create="createSelectOption"
              @update:value="handleTypesChange"
            />
          </n-form-item>
          <n-form-item
            v-if="!['software_meta', 'single_image_meta', 'website_meta'].includes(categorySettings.extendTable)"
            label="封面图"
            path="cover"
          >
            <div class="cover-field">
              <div class="cover-preview">
                <img v-if="coverPreviewSrc" :src="coverPreviewSrc" alt="封面预览" class="cover-preview__image" />
                <span v-else class="cover-preview__label">{{ coverPreviewLabel }}</span>
              </div>
              <n-space size="small" wrap>
                <n-button size="small" @click="handleChooseCustomCover">选择自定义封面</n-button>
                <n-button size="small" :disabled="!hasBasePath" @click="handleUseScreenshotCover">使用截图作为封面</n-button>
                <n-button
                  v-if="categorySettings.extendTable === 'multi_image_meta'"
                  size="small"
                  :disabled="!hasBasePath"
                  @click="handleUseFirstCover"
                >
                  选择第一张封面
                </n-button>
                <n-button size="small" type="error" quaternary :disabled="!hasCoverPath" @click="handleClearCover">清除封面</n-button>
              </n-space>
            </div>
          </n-form-item>
        </n-form>
      </template>

      <template #footer>
        <div class="modal-footer">
          <n-button @click="handleCloseModal">取消</n-button>
          <n-button type="primary" @click="handleSubmitResource">添加</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.category-detail-root {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.category-detail-root--drag-over {
  user-select: none;
}

.layout-root {
  position: absolute;
  inset: 0;
  height: 100%;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 10, 0.28);
  backdrop-filter: blur(4px);
}

.drag-overlay__panel {
  min-width: 340px;
  max-width: 520px;
  padding: 24px 28px;
  border: 1px dashed rgba(94, 234, 212, 0.7);
  border-radius: 20px;
  background: rgba(18, 18, 18, 0.92);
  text-align: center;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.24);
}

.drag-overlay__title {
  font-size: 18px;
  font-weight: 600;
}

.drag-overlay__subtitle {
  margin-top: 8px;
  font-size: 13px;
  opacity: 0.7;
  word-break: break-word;
}

.filter-sider {
  height: 100%;
}

.filter-sider :deep(.n-scrollbar) {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.filter-sider :deep(.filter-sider-scroll-container) {
  height: 100%;
  overflow: hidden;
}

.filter-sider :deep(.filter-sider-content) {
  height: 100%;
  overflow: hidden;
}

.filter-sider :deep(.n-layout-sider-children) {
  height: 100%;
  overflow: hidden;
}

.filter-sider :deep(.n-layout-sider-scroll-container) {
  height: 100%;
  overflow: hidden;
}

.filter-panel {
  height: 100%;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding: 12px;
  min-height: 0;
  gap: 12px;
  overflow: hidden;
}

.filter-top {
  flex: none;
}

.filter-top-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}

.filter-top-option {
  min-width: 0;
}

.filter-top-option :deep(.n-checkbox-box-wrapper) {
  flex: 0 0 auto;
}

.filter-top-option :deep(.n-checkbox__label) {
  width: 100%;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.filter-top-option :deep(.n-tag) {
  margin-left: 6px;
  flex: 0 0 auto;
}

.filter-top-option__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
}

.filter-title {
  flex: none;
  margin: 0;
}

.filter-sections {
  min-height: 0;
  display: grid;
  overflow: hidden;
}

.filter-section {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.filter-group {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.filter-list {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  flex-wrap: nowrap;
}

.filter-list :deep(.n-checkbox) {
  flex: none;
}

.filter-engine-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: 1;
}

.filter-engine-option__icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  display: block;
}

.filter-section :deep(.n-checkbox__label) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.filter-section :deep(.n-tag) {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}

.filter-list::-webkit-scrollbar {
  width: 6px;
}

.filter-list::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.45);
  border-radius: 999px;
}

.filter-list::-webkit-scrollbar-track {
  background: transparent;
}

.filter-bottom {
  align-self: stretch;
}

.reset-btn {
  width: 100%;
}

.author-search, .tag-search, .type-search {
  margin-top: 5px;
  margin-bottom: 10px;
}

.detail-main {
  position: relative;
  height: 100%;
  min-width: 0;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.detail-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.16);
  box-sizing: border-box;
}

.detail-header__info {
  min-width: 0;
}

.detail-header__actions {
  flex: 0 0 auto;
}

.detail-header__title {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
}

.detail-header__subtitle {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.65;
}

.detail-content {
  position: absolute;
  top: 56px;
  right: 0;
  bottom: 64px;
  left: 0;
  overflow: hidden;
  min-height: 0;
}

.detail-scrollbar {
  height: 100%;
  max-height: 100%;
}

.detail-scrollbar :deep(.n-scrollbar-container) {
  height: 100%;
}

.detail-content__inner {
  width: 100%;
  min-height: 0;
  padding: 24px;
  box-sizing: border-box;
  overflow: hidden;
}

.batch-import-loading {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 4px 4px;
  align-items: center;
}

.batch-import-loading__title {
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  line-height: 1.7;
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.batch-import-loading__title-text {
  display: block;
}

.batch-import-loading__title-directory {
  display: block;
  width: 100%;
  max-width: 420px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.batch-import-loading__meta {
  font-size: 12px;
  opacity: 0.7;
  text-align: center;
}

.batch-import-loading__progress {
  position: relative;
  width: 128px;
  height: 128px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.batch-import-loading__progress::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 6px solid rgba(255, 255, 255, 0.08);
  border-top-color: rgba(99, 226, 183, 0.55);
  border-right-color: rgba(99, 226, 183, 0.18);
  box-sizing: border-box;
  animation: batch-import-spin 1.25s linear infinite;
}

.batch-import-loading__inner-progress {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 92px;
  height: 92px;
  transform: translate(-50%, -50%);
}

.batch-import-loading__inner-progress :deep(.n-progress) {
  width: 92px !important;
  height: 92px !important;
}

.batch-import-loading__inner-progress :deep(.n-progress-graph) {
  width: 100% !important;
  height: 100% !important;
}

.batch-import-loading__progress-center {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 92px;
  height: 92px;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.batch-import-loading__progress-text {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}

.batch-import-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 14px;
  width: 375px;
  max-width: 375px;
  padding: 14px 16px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  border-radius: 16px;
  background: rgba(32, 32, 32, 0.96);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.26);
  cursor: pointer;
}

.batch-import-toast__close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
}

.batch-import-toast__progress {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  overflow: hidden;
}

.batch-import-toast__progress::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.08);
  border-top-color: rgba(99, 226, 183, 0.95);
  border-right-color: rgba(99, 226, 183, 0.28);
  animation: batch-import-spin 1s linear infinite;
  box-sizing: border-box;
}

.batch-import-toast__progress :deep(.n-progress) {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 34px !important;
  height: 34px !important;
  transform: translate(-50%, -50%);
}

.batch-import-toast__progress :deep(.n-progress-graph) {
  width: 100% !important;
  height: 100% !important;
}

.batch-import-toast__progress-text {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 34px;
  height: 34px;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

@keyframes batch-import-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.batch-import-toast__content {
  min-width: 0;
  flex: 1;
  padding-right: 18px;
  overflow: hidden;
}

.batch-import-toast__title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.batch-import-toast__subtitle {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.72;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.batch-import-toast__subtitle:last-child {
  max-width: 240px;
}

.batch-import-modal {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
}

.batch-import-modal__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.batch-import-modal__summary {
  font-size: 12px;
  opacity: 0.72;
}

.batch-import-modal__scrollbar {
  height: 100%;
  min-height: 0;
}

.batch-import-modal__scrollbar :deep(.n-scrollbar-container) {
  height: 100%;
}

.batch-import-modal__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 8px;
}

.batch-import-item {
  padding: 14px 16px;
  border: 1px solid rgba(128, 128, 128, 0.16);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.batch-import-item--clickable {
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease, transform 0.18s ease;
}

.batch-import-item--clickable:hover {
  border-color: rgba(99, 226, 183, 0.28);
  background: rgba(99, 226, 183, 0.04);
}

.batch-import-item--checked {
  border-color: rgba(99, 226, 183, 0.45);
  background: rgba(99, 226, 183, 0.06);
}

.batch-import-item__row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.batch-import-item__main {
  flex: 1;
  min-width: 0;
}

.batch-import-item__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}

.batch-import-item__path,
.batch-import-item__value {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.74;
  word-break: break-all;
}

.batch-import-item__value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.batch-import-item__file-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex: 0 0 auto;
}

.batch-import-item__detail {
  margin-left: 34px;
  margin-top: 10px;
}

.batch-import-item__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.batch-import-item__field {
  min-width: 0;
}

.batch-import-item__field--checkbox {
  grid-column: 1 / -1;
}

.batch-import-item__label {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.78;
}

.batch-import-item__value--error {
  color: #e88080;
}

.batch-import-item__result {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.78;
  word-break: break-word;
}

.batch-import-item__result--success {
  color: #63e2b7;
}

.batch-import-item__result--error {
  color: #e88080;
}

.resource-grid {
  width: 100%;
  min-height: 100%;
  display: grid;
  grid-template-columns: repeat(6, minmax(300px, 1fr));
  gap: 16px;
  align-content: start;
  justify-content: start;
}

@media (max-width: 2500px) {
  .resource-grid {
    grid-template-columns: repeat(4, minmax(300px, 1fr));
  }
}

@media (max-width: 1900px) {
  .resource-grid {
    grid-template-columns: repeat(3, minmax(300px, 1fr));
  }
}

@media (max-width: 1580px) {
  .resource-grid {
    grid-template-columns: repeat(2, minmax(300px, 1fr));
  }
}

@media (max-width: 1260px) {
  .resource-grid {
    grid-template-columns: repeat(1, minmax(300px, 1fr));
  }
}

.detail-footer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  min-height: 64px;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  box-sizing: border-box;
  flex-wrap: wrap;
  z-index: 2;
  background: v-bind('footerStyle.backgroundColor');
  border-top: v-bind('footerStyle.borderTop');
}

.detail-footer__meta {
  flex: 0 0 auto;
  font-size: 12px;
}

.detail-footer__controls {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.detail-footer__select {
  flex: 0 1 auto;
  min-width: 0;
}

.detail-footer__select--size {
  width: 108px;
}

.detail-footer__select--sort {
  width: 140px;
}

.detail-footer__jump {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
  min-width: 0;
}

.detail-footer__jump-input {
  width: 88px;
}

.detail-footer :deep(.n-pagination) {
  flex: 0 1 auto;
  min-width: 0;
}

@media (max-width: 1320px) {
  .detail-content {
    bottom: 108px;
  }

  .detail-footer {
    min-height: 108px;
    align-items: flex-start;
  }

  .detail-footer__meta {
    width: 100%;
  }

  .detail-footer__controls {
    width: 100%;
    justify-content: flex-start;
  }
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}

.cover-field {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cover-preview {
  min-height: 108px;
  border: 1px dashed rgba(128, 128, 128, 0.32);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  background: rgba(127, 127, 127, 0.06);
  overflow: hidden;
}

.cover-preview__label {
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  opacity: 0.72;
  word-break: break-all;
}

.cover-preview__image {
  width: 100%;
  height: 100%;
  max-height: 180px;
  object-fit: contain;
  display: block;
}

.path-field {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
}

.multi-value-field {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.edit-drawer {
  padding-right: 4px;
}

.edit-drawer__footer {
  width: 100%;
}

.detail-drawer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-right: 4px;
  padding-bottom: 84px;
}

.detail-drawer__cover {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(127, 127, 127, 0.08);
}

.detail-drawer__cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.detail-drawer__cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  font-size: 14px;
}

.detail-drawer__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-drawer__section-title {
  font-size: 15px;
  font-weight: 600;
}

.detail-drawer__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.detail-drawer__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.06);
}

.detail-drawer__item--full {
  grid-column: 1 / -1;
}

.detail-drawer__label,
.detail-drawer__log-label {
  font-size: 12px;
  opacity: 0.6;
}

.detail-drawer__value,
.detail-drawer__log-value {
  font-size: 13px;
  line-height: 1.5;
}

.detail-drawer__meta-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.detail-drawer__meta-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex: 0 0 auto;
}

.detail-drawer__value--path {
  word-break: break-all;
  flex: 1;
  min-width: 0;
}

.detail-drawer__value--description {
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-drawer__description-box {
  height: 400px;
  overflow: hidden;
}

.detail-drawer__description-scrollbar {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 100%;
}

.detail-drawer__description-scrollbar :deep(.n-scrollbar) {
  height: 100%;
}

.detail-drawer__description-scrollbar :deep(.n-scrollbar-container) {
  height: 100%;
  padding-right: 6px;
}

.detail-drawer__value--rich {
  line-height: 1.7;
}

.detail-drawer__value--rich :deep(p) {
  margin: 0 0 0.75em;
}

.detail-drawer__value--rich :deep(p:last-child) {
  margin-bottom: 0;
}

.detail-drawer__value--rich :deep(ul),
.detail-drawer__value--rich :deep(ol) {
  padding-left: 1.4em;
  margin: 0.5em 0;
}

.detail-drawer__value--rich :deep(a) {
  color: #63e2b7;
}

.detail-drawer__path-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.detail-drawer__path-button {
  margin-left: auto;
  flex: 0 0 auto;
}

.detail-drawer__resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  width: 10px;
  height: 100%;
  cursor: col-resize;
  z-index: 2;
}

.detail-drawer__tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-drawer__store-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.detail-drawer__store-button {
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
}

.detail-drawer__store-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.detail-drawer__store-icon,
.detail-drawer__store-fallback {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  object-fit: contain;
}

.detail-drawer__store-fallback {
  border-radius: 6px;
  background: rgba(127, 127, 127, 0.14);
  font-size: 12px;
}

.detail-drawer__store-name {
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
}

.detail-drawer__footer {
  width: 100%;
  padding-top: 8px;
}

.detail-drawer__tag-list :deep(.n-tag) {
  border-radius: 0;
}

.detail-drawer__rating {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-drawer__rating-main {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.detail-drawer__rating-text {
  font-size: 13px;
  line-height: 1.4;
}

.detail-drawer__rating-submit {
  margin-left: auto;
  flex: 0 0 auto;
}

.detail-drawer__logs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-drawer__logs-scroll {
  max-height: 420px;
}

.detail-drawer__screenshot {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(127, 127, 127, 0.08);
  cursor: zoom-in;
}

.detail-drawer__screenshot-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.detail-drawer__screenshot-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.32);
  color: rgba(255, 255, 255, 0.94);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.detail-drawer__screenshot:hover .detail-drawer__screenshot-mask {
  opacity: 1;
}

.detail-drawer__screenshot-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-drawer__screenshot-index {
  min-width: 56px;
  font-size: 12px;
  opacity: 0.65;
  text-align: center;
}

.detail-drawer__log {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.06);
}

.detail-drawer__log-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.detail-drawer__logs-more,
.detail-drawer__logs-finish {
  display: flex;
  justify-content: center;
  padding-top: 12px;
}

.detail-drawer__logs-finish {
  font-size: 12px;
  opacity: 0.6;
}

.detail-drawer__launch {
  position: fixed !important;
  right: 12px;
  bottom: 12px;
  z-index: 2100;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
}
</style>
