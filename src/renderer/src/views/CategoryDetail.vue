<script setup lang="ts">
import {computed, h, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch} from 'vue'
import type { ComputedRef } from 'vue'
import { useRoute } from 'vue-router'
import { CheckmarkOutline, ChevronBackOutline, ChevronForwardOutline, CloseOutline, EyeOutline, FolderOpenOutline, FunnelOutline, Play, SearchOutline, Stop, TrashOutline } from '@vicons/ionicons5'
import { createLogger } from '../../../main/util/logger'
import { confirmDialog, notify } from '../utils/notification'
import { removeOngoingCenterItem, upsertOngoingCenterItem } from '../utils/notification-center'
import ResourceCard from '../components/card/ResourceCard.vue'
import PictureViewer from '../components/PictureViewer.vue'
import ComicReader from '../components/ComicReader.vue'
import RichTextEditor from '../components/RichTextEditor.vue'
import { createEmptyMetaByType } from '../components/meta/meta-factory'
import { resolveMetaFormComponent } from '../components/meta/registry'
import { setAudioPlayerSession, setAudioPlayerVisible, useAudioPlayerStore } from '../utils/audio-player-store'
import { DictType, ResourceLaunchMode, ResourceLogSpecialTime, Settings } from '../../../common/constants'
import type { ResourceForm, ResourceMeta } from '../../../main/model/models'

const route = useRoute()
const logger = createLogger('category-detail')
const injectedIsDark = inject<ComputedRef<boolean>>('appIsDark', computed(() => true))
const audioPlayerStore = useAudioPlayerStore()
const categoryId = computed(() => route.params.id as string)
const resourceList = ref<any[]>([]) // 资源列表数据
const authorList = ref<any[]>([])
const albumList = ref<any[]>([])
const engineList = ref<any[]>([])
const websiteTypeOptions = ref<any[]>([])
const tagList = ref<any[]>([])
const typeList = ref<any[]>([])
const loading = ref(true)
const keyword = ref('')
const authorSearch = ref<string>('')
const albumSearch = ref<string>('')
const tagSearch = ref<string>('')
const typeSearch = ref<string>('')
const showModal = ref(false)
const showEditModal = ref(false)
const showBatchImportLoading = ref(false)
const showBatchImportModal = ref(false)
const showBatchLabelModal = ref(false)
const showAudioCoverCandidateModal = ref(false)
const fetchResourceInfoLoading = ref(false)
const formData = ref<any>({ name: '', meta: {} })
const editingResourceId = ref('')
const editInitialFormData = ref<any | null>(null)
const batchImportItems = ref<any[]>([])
const isBatchImportSubmitting = ref(false)
const batchImportFetchInfoEnabled = ref(true)
const batchAnalyzeCurrent = ref(0)
const batchAnalyzeTotal = ref(0)
const batchAnalyzeMessage = ref('')
const batchAnalyzeRunning = ref(false)
const batchImportRunning = ref(false)
const batchAnalyzeCancelled = ref(false)
const batchAnalyzeInBackground = ref(false)
const batchAnalyzeToastDismissed = ref(false)
const formRef = ref()
const basePathFormItemRef = ref()
const coverPreviewSrc = ref('')
const detailCoverPreviewSrc = ref('')
const audioCoverCandidates = ref<Array<{
  label: string
  coverPath: string
  previewSrc: string
  queryText: string
}>>([])
const detailScreenshotPreviewSrc = ref('')
const detailDescriptionContentRef = ref<HTMLElement | null>(null)
const detailDescriptionHeight = ref(400)
const showPictureViewer = ref(false)
const showComicReader = ref(false)
const pictureViewerScrollMode = ref(String(Settings.PICTURE_READ_SCROLL_MODE.default ?? 'zoom'))
const pictureViewerImagePaths = ref<string[]>([])
const pictureViewerInitialIndex = ref(0)
const pictureViewerAllowDelete = ref(true)
const comicReaderImagePaths = ref<string[]>([])
const comicReaderInitialIndex = ref(0)
const currentComicReaderResourceId = ref('')
const audioPlayerPlaylist = ref<Array<{ path: string; label: string; duration?: number | null; resourceId?: string; resourceTitle?: string; artist?: string; coverSrc?: string; hasSubtitle?: boolean; subtitlePath?: string }>>([])
const audioPlayerDisplayMode = ref<'default' | 'music'>('default')
const detailAudioContextMenuVisible = ref(false)
const detailAudioContextMenuX = ref(0)
const detailAudioContextMenuY = ref(0)
const detailAudioContextMenuTarget = ref<any | null>(null)
const tagInputValue = ref('')
const typeInputValue = ref('')
const batchLabelInputValue = ref('')
const showDetailDrawer = ref(false)
const selectedDetailResource = ref<any>(null)
const detailScreenshotPaths = ref<string[]>([])
const detailAudioTree = ref<any[]>([])
const detailGalleryImageUrls = ref<Record<string, string>>({})
const currentScreenshotIndex = ref(0)
const showDeleteScreenshotConfirm = ref(false)
const showSoftwareScriptModal = ref(false)
const softwareScriptDraft = ref('')
const softwareScriptRuntimePath = ref('')
const softwareScriptRuntimes = ref<Array<{ label: string; value: string; shellType: 'powershell' | 'cmd' }>>([])
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

type BatchImportState = {
  items: any[]
  fetchInfoEnabled: boolean
  analyzeCurrent: number
  analyzeTotal: number
  analyzeMessage: string
  analyzeRunning: boolean
  importRunning: boolean
  analyzeCancelled: boolean
  analyzeInBackground: boolean
  analyzeToastDismissed: boolean
  showLoading: boolean
  showPreview: boolean
}

const createBatchImportState = (): BatchImportState => ({
  items: [],
  fetchInfoEnabled: true,
  analyzeCurrent: 0,
  analyzeTotal: 0,
  analyzeMessage: '',
  analyzeRunning: false,
  importRunning: false,
  analyzeCancelled: false,
  analyzeInBackground: false,
  analyzeToastDismissed: false,
  showLoading: false,
  showPreview: false
})

const batchImportStateStore = reactive<Record<string, BatchImportState>>({})

const ensureBatchImportState = (targetCategoryId: string) => {
  if (!targetCategoryId) {
    return createBatchImportState()
  }

  if (!batchImportStateStore[targetCategoryId]) {
    batchImportStateStore[targetCategoryId] = createBatchImportState()
  }

  return batchImportStateStore[targetCategoryId]
}

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
      /^(?:[/.]|https?:|data:|file:|[a-zA-Z]:[\\/])/.test(icon)
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

const categorySettings = computed(() => categoryInfo.value?.meta?.extra ?? {
  extendTable: '',
  resourcePathType: null,
  addFirst: '个'
})

const modelComponent = computed(() => {
  return resolveMetaFormComponent(String(categorySettings.value.extendTable ?? ''))
})

const modelComponentKey = computed(() => categorySettings.value.extendTable || 'empty-meta')

const createEmptyFormData = () => ({
  name: '',
  author: '',
  authors: [] as string[],
  description: '',
  coverPath: '',
  basePath: '',
  actors: [] as string[],
  tags: [] as string[],
  types: [] as string[],
  meta: createEmptyMetaByType(String(categorySettings.value.extendTable ?? ''))
})

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

const normalizeAudioAuthorList = (values: string[]) => {
  const normalizedValues: string[] = []
  const seen = new Set<string>()

  for (const value of values ?? []) {
    const rawText = String(value ?? '').trim()
    if (!rawText) {
      continue
    }

    const splitValues = rawText
      .split(/\s*(?:\/|／|,|，|、|;|；|\||·| feat\. | ft\. | featuring | with | x | × | & | ＆ )\s*/i)
      .map((item) => item.trim())
      .filter(Boolean)

    for (const splitValue of splitValues) {
      const normalizedKey = splitValue.toLowerCase()
      if (seen.has(normalizedKey)) {
        continue
      }

      seen.add(normalizedKey)
      normalizedValues.push(splitValue)
    }
  }

  return normalizedValues
}

const joinAudioAuthorNames = (names: string[]) => normalizeAudioAuthorList(names).join(' / ')

const sanitizeSelectedFilterValues = (
  selectedValues: string[],
  options: any[],
  key: 'id' | 'name' = 'id'
) => {
  const availableValues = new Set(
    (options ?? [])
      .map((item) => String(item?.[key] ?? '').trim())
      .filter(Boolean)
  )

  return (selectedValues ?? []).filter((value) => availableValues.has(String(value ?? '').trim()))
}

const assignSanitizedSelectedFilterValues = (
  targetRef: { value: any[] },
  options: any[],
  key: 'id' | 'name' = 'id'
) => {
  const currentValues = Array.isArray(targetRef.value) ? targetRef.value : []
  const nextValues = sanitizeSelectedFilterValues(currentValues, options, key)
  const hasChanged = currentValues.length !== nextValues.length
    || currentValues.some((value, index) => String(value ?? '').trim() !== String(nextValues[index] ?? '').trim())

  if (hasChanged) {
    targetRef.value = nextValues
  }
}

const syncAudioAuthorFields = (targetForm: any, names?: string[]) => {
  if (String(categorySettings.value.extendTable ?? '').trim() !== 'audio_meta' || !targetForm) {
    return
  }

  const normalizedNames = normalizeAudioAuthorList(
    Array.isArray(names)
      ? names
      : [
          ...(Array.isArray(targetForm.authors) ? targetForm.authors : []),
          String(targetForm.author ?? '').trim()
        ]
  )
  const displayName = joinAudioAuthorNames(normalizedNames)

  targetForm.authors = normalizedNames
  targetForm.author = displayName
  targetForm.meta = {
    ...(targetForm.meta ?? {}),
    artist: displayName
  }
}

const mapResourceDetailToFormData = (resource: any) => {
  const authorNames = Array.isArray(resource?.authors)
    ? resource.authors.map((item: any) => String(item?.name ?? '')).filter(Boolean)
    : []
  const stores = Array.isArray(resource?.stores) ? resource.stores : []
  const pixivStore = stores.find((item: any) => String(item?.store?.value ?? '').trim().toLowerCase() === 'pixiv')
  const primaryStore = stores.find((item: any) => String(item?.id ?? '') !== String(pixivStore?.id ?? '')) ?? stores[0]
  const additionalStores = stores.filter((item: any) => {
    const itemId = String(item?.id ?? '')
    const primaryStoreId = String(primaryStore?.id ?? '')
    const pixivStoreId = String(pixivStore?.id ?? '')
    return itemId && itemId !== primaryStoreId && itemId !== pixivStoreId
  })

  return {
    name: resource?.title ?? '',
    description: resource?.description ?? '',
    coverPath: resource?.coverPath ?? '',
    basePath: buildDisplayBasePath(resource),
    author: joinAudioAuthorNames(authorNames) || String(resource?.audioMeta?.artist ?? ''),
    authors: authorNames,
    actors: Array.isArray(resource?.actors) ? resource.actors.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
    tags: Array.isArray(resource?.tags) ? resource.tags.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
    types: Array.isArray(resource?.types) ? resource.types.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
    meta: {
      ...createEmptyMetaByType(String(categorySettings.value.extendTable ?? '')),
      ...(resource?.gameMeta ?? {}),
      ...(resource?.softwareMeta ?? {}),
      ...(resource?.singleImageMeta ?? {}),
      ...(resource?.multiImageMeta ?? {}),
      ...(resource?.videoMeta ?? {}),
      ...(resource?.asmrMeta ?? {}),
      ...(resource?.audioMeta ?? {}),
      pixivId: String(pixivStore?.workId ?? ''),
      websiteType: String(primaryStore?.storeId ?? ''),
      gameId: String(primaryStore?.workId ?? ''),
      website: String(primaryStore?.url ?? ''),
      additionalStores: additionalStores.map((item: any) => ({
        websiteType: String(item?.storeId ?? ''),
        workId: String(item?.workId ?? ''),
        website: String(item?.url ?? '')
      })),
    }
  }
}

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
const selectedAlbumList = ref<string[]>([])
const selectedEngineList = ref<string[]>([])
const selectedTagList = ref<string[]>([])
const selectedTypeList = ref<string[]>([])
const selectedResourceIds = ref<string[]>([])
const selectionModeManuallyEnabled = ref(false)
const isBatchDeleting = ref(false)
const isBatchFetchingAlbumCover = ref(false)
const isBatchLabelSubmitting = ref(false)
const batchLabelField = ref<'tags' | 'types' | 'authors' | 'album'>('tags')
const batchLabelMode = ref<'add' | 'remove'>('add')
const batchLabelValues = ref<string[]>([])
const batchLabelSingleValue = ref('')
const currentPage = ref(1)
const jumpPageInput = ref<number | null>(1)
const pageSize = ref(24)
const totalResources = ref(0)
const sortBy = ref('createTime-desc')
const localeEmulatorPath = ref('')
const mtoolPath = ref('')
const suppressAutoFetch = ref(false)
let fetchDataRequestId = 0

const showBatchImportButton = computed(() => ['game_meta', 'single_image_meta', 'multi_image_meta', 'asmr_meta', 'audio_meta'].includes(String(categorySettings.value.extendTable ?? '')))
const getBatchImportOngoingId = (targetCategoryId: string) => `batch-import-analysis:${targetCategoryId}`
const batchProgressRunning = computed(() => batchAnalyzeRunning.value || batchImportRunning.value)
const batchProgressStage = computed(() => (batchImportRunning.value ? 'import' : 'analyze'))
const batchImportResourceLabel = computed(() => {
  if (detailIsManga.value) {
    return '漫画'
  }

  if (detailIsAsmr.value) {
    return '音声'
  }

  return '游戏'
})
const batchAnalyzePercent = computed(() =>
  batchAnalyzeTotal.value > 0
    ? Math.min(100, Math.round((batchAnalyzeCurrent.value / batchAnalyzeTotal.value) * 100))
    : 0
)
const batchAnalyzeDisplayIndex = computed(() => {
  if (!batchProgressRunning.value) {
    return batchAnalyzeCurrent.value
  }

  return Math.min(batchAnalyzeTotal.value, batchAnalyzeCurrent.value + 1)
})
const showBatchImportProgressToast = computed(() =>
  batchProgressRunning.value && batchAnalyzeInBackground.value && !batchAnalyzeToastDismissed.value
)
const isBatchImportItemImportable = (item: any) => {
  if (detailIsManga.value) {
    return Number(item?.imageCount ?? 0) > 0
  }

  if (detailIsAsmr.value) {
    return Number(item?.audioCount ?? 0) > 0
  }

  return !!item?.launchFilePath
}
const selectableBatchImportItems = computed(() =>
  batchImportItems.value.filter((item) => {
    const canImport = isBatchImportItemImportable(item)
    return !item.exists && !item.errorMessage && canImport
  })
)
const selectedBatchImportCount = computed(() =>
  batchImportItems.value.filter((item) => item.checked).length
)
const selectedResourceCount = computed(() => selectedResourceIds.value.length)
const resourceSelectionMode = computed(() => selectedResourceCount.value > 0 || selectionModeManuallyEnabled.value)
const currentPageResourceIds = computed(() =>
  resourceList.value
    .map((item) => String(item?.id ?? '').trim())
    .filter(Boolean)
)
const currentCategoryBatchInBackground = computed(() =>
  batchProgressRunning.value && batchAnalyzeInBackground.value
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
const normalizedAlbumSearch = computed(() => albumSearch.value.trim().toLowerCase())
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
const normalizedAlbumList = computed(() =>
  albumList.value
    .map((album) => ({
      name: String(album?.name ?? album?.albumName ?? '').trim(),
      count: Number(album?.count ?? 0)
    }))
    .filter((album) => album.name)
)
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

const filteredAlbumList = computed(() => {
  if (!normalizedAlbumSearch.value) {
    return normalizedAlbumList.value
  }

  return normalizedAlbumList.value.filter((album) =>
    String(album.name).toLowerCase().includes(normalizedAlbumSearch.value)
  )
})

const descriptionLabel = computed(() =>
  categorySettings.value.extendTable === 'game_meta' ? '游戏简介' : `${categoryName.value}描述`
)
const isAudioCategory = computed(() => categorySettings.value.extendTable === 'audio_meta')

const descriptionPlaceholder = computed(() =>
  categorySettings.value.extendTable === 'game_meta' ? '请输入游戏简介' : `请输入${categoryName.value}描述`
)
const authorInputPlaceholder = computed(() =>
  isAudioCategory.value ? '可输入多个艺术家，按回车创建标签' : `请输入${categorySettings.value.authorText ?? '作者'}`
)

const isSingleImageCategory = computed(() => categorySettings.value.extendTable === 'single_image_meta')
const startText = computed(() => {
  if (isSingleImageCategory.value) {
    return '查看'
  }

  if (categorySettings.value.extendTable === 'multi_image_meta') {
    return '阅读'
  }

  return categorySettings.value.startText || '启动'
})
const showZoneLaunch = computed(() => categorySettings.value.extendTable === 'game_meta')
const canZoneLaunch = computed(() => Boolean(localeEmulatorPath.value.trim()))
const showAdminLaunch = computed(() => categorySettings.value.extendTable === 'software_meta')
const showMtoolLaunch = computed(() => categorySettings.value.extendTable === 'game_meta')
const canMtoolLaunch = computed(() => Boolean(mtoolPath.value.trim()))
const showScreenshotFolder = computed(() => categorySettings.value.extendTable === 'game_meta')
const showCompletedToggle = computed(() => categorySettings.value.extendTable === 'game_meta')
const showCardCover = computed(() => categorySettings.value.extendTable !== 'software_meta')
const showDeleteFiles = computed(() => categorySettings.value.extendTable === 'game_meta')
const showEngineFilter = computed(() => categorySettings.value.extendTable === 'game_meta')
const isSoftwareCategory = computed(() => categorySettings.value.extendTable === 'software_meta')
const softwareScriptShellType = computed<'powershell' | 'cmd'>(() =>
  softwareScriptRuntimes.value.find((item) => item.value === softwareScriptRuntimePath.value)?.shellType ?? 'powershell'
)
const softwareScriptPlaceholder = computed(() =>
  softwareScriptShellType.value === 'powershell'
    ? '例如：\nSet-Location d:/myDir\n. .\\venv\\Scripts\\Activate.ps1\npy -3.10 run.py'
    : '例如：\ncd /d d:/myDir\ncall .\\venv\\Scripts\\activate\npy -3.10 run.py'
)
const filterSectionCount = computed(() => {
  let count = detailIsAsmr.value ? 2 : 3
  if (isAudioCategory.value) {
    count += 1
  }
  if (showEngineFilter.value) {
    count += 1
  }
  return count
})

const filterSectionsStyle = computed(() => ({
  gridTemplateRows: `repeat(${filterSectionCount.value}, minmax(0, 1fr))`
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
const detailUsesBrowseTerms = computed(() => isSingleImageCategory.value || detailIsManga.value)
const detailUsesPlayTerms = computed(() => detailIsAsmr.value || detailIsAudio.value)
const detailStatsText = computed(() => ({
  firstAccess: detailUsesBrowseTerms.value ? '第一次浏览' : (detailUsesPlayTerms.value ? '第一次播放' : '第一次启动'),
  lastAccess: detailUsesBrowseTerms.value ? '最后一次浏览' : (detailUsesPlayTerms.value ? '最后一次播放' : '最后一次启动'),
  accessCount: detailUsesBrowseTerms.value ? '浏览次数' : (detailUsesPlayTerms.value ? '播放次数' : '启动次数'),
  totalRuntime: detailUsesBrowseTerms.value ? '浏览总时长' : (detailUsesPlayTerms.value ? '播放总时长' : '运行总时长'),
}))
const detailPreviewSectionTitle = computed(() => detailIsManga.value ? '' : '游戏截图')
const detailGallerySectionTitle = computed(() => detailIsManga.value ? '图片预览' : (detailIsAsmr.value ? '音声目录' : '启动日志'))
const detailReadingProgressText = computed(() => {
  if (!detailIsManga.value) {
    return ''
  }

  const lastReadPage = Math.max(0, Number(selectedDetailResource.value?.multiImageMeta?.lastReadPage ?? 0))
  const totalPages = Math.max(0, detailScreenshotPaths.value.length)

  if (!totalPages) {
    return '0 / 0'
  }

  return `${Math.min(lastReadPage + 1, totalPages)} / ${totalPages}`
})
const detailPlaybackProgressText = computed(() => {
  if (detailIsAudio.value) {
    const lastPlayTime = Math.max(0, Number(selectedDetailResource.value?.audioMeta?.lastPlayTime ?? 0))
    return lastPlayTime > 0 ? formatDuration(lastPlayTime) : '暂无'
  }

  if (!detailIsAsmr.value) {
    return ''
  }

  const lastPlayFile = String(selectedDetailResource.value?.asmrMeta?.lastPlayFile ?? '').trim()
  if (!lastPlayFile) {
    return '暂无'
  }

  const normalizedPath = lastPlayFile.replace(/\\/g, '/')
  const fileName = normalizedPath.split('/').pop() || normalizedPath
  const lastPlayTime = Math.max(0, Number(selectedDetailResource.value?.asmrMeta?.lastPlayTime ?? 0))

  return `${fileName} ${formatDuration(lastPlayTime)}`
})
const detailGalleryItems = computed(() =>
  detailScreenshotPaths.value.map((filePath, index) => ({
    filePath,
    index,
    url: detailGalleryImageUrls.value[filePath] ?? ''
  }))
)

const collectAudioTreeImagePaths = (nodes: any[]): string[] => {
  const imagePaths: string[] = []

  const visit = (items: any[]) => {
    for (const item of items) {
      if (!item) {
        continue
      }

      if (item.kind === 'image' && item.path) {
        imagePaths.push(String(item.path))
      }

      if (Array.isArray(item.children) && item.children.length) {
        visit(item.children)
      }
    }
  }

  visit(nodes)
  return imagePaths
}

const detailAudioImagePaths = computed(() => collectAudioTreeImagePaths(detailAudioTree.value))
const collectAudioTreeTracks = (nodes: any[]): Array<{ path: string; label: string; duration?: number | null; hasSubtitle?: boolean; subtitlePath?: string }> => {
  const tracks: Array<{ path: string; label: string; duration?: number | null; hasSubtitle?: boolean; subtitlePath?: string }> = []

  const visit = (items: any[]) => {
    for (const item of items) {
      if (!item) {
        continue
      }

      if (item.kind === 'audio' && item.path) {
        tracks.push({
          path: String(item.path),
          label: String(item.label ?? ''),
          duration: Number.isFinite(Number(item.duration)) ? Number(item.duration) : null,
          hasSubtitle: Boolean(item.hasSubtitle)
        })
      }

      if (Array.isArray(item.children) && item.children.length) {
        visit(item.children)
      }
    }
  }

  visit(nodes)
  return tracks
}

const detailAudioPlaylist = computed(() => collectAudioTreeTracks(detailAudioTree.value))

const normalizeAudioPath = (filePath: string | null | undefined) => String(filePath ?? '').replace(/\\/g, '/').trim().toLowerCase()
const getAudioDirectoryPath = (filePath: string | null | undefined) => String(filePath ?? '').replace(/\\/g, '/').trim().split('/').slice(0, -1).join('/')

const getAudioPlayerCoverPreview = async (resource: any) => {
  const resourceId = String(resource?.id ?? '')
  if (resourceId && resourceId === String(selectedDetailResource.value?.id ?? '')) {
    return detailCoverPreviewSrc.value
  }

  const coverPath = normalizeCoverPreviewSource(String(resource?.coverPath ?? ''))
  if (!coverPath) {
    return ''
  }

  if (/^https?:\/\//i.test(coverPath) || /^data:/i.test(coverPath)) {
    return coverPath
  }

  try {
    return (await window.api.dialog.getImagePreviewUrl(String(resource?.coverPath ?? ''), {
      maxWidth: 960,
      maxHeight: 720,
      fit: 'inside',
      quality: 84
    })) ?? ''
  } catch {
    return ''
  }
}

const getAudioPlayerArtistText = (resource: any) => {
  const authorNames = Array.isArray(resource?.authors)
    ? resource.authors.map((item: any) => String(item?.name ?? '').trim()).filter(Boolean)
    : []

  if (authorNames.length) {
    return authorNames.join(' / ')
  }

  return String(resource?.audioMeta?.artist ?? '').trim()
}

const buildResourceQuery = (page: number, size: number) => ({
  keyword: keyword.value.trim(),
  authorIds: [...selectedAuthorList.value],
  albumNames: [...selectedAlbumList.value],
  engineIds: [...selectedEngineList.value],
  tagIds: [...selectedTagList.value],
  typeIds: [...selectedTypeList.value],
  missingOnly: missingFile.value,
  favoriteOnly: favoriteOnly.value,
  completedOnly: completedOnly.value,
  runningOnly: runningOnly.value,
  page,
  pageSize: size,
  sortBy: sortBy.value
})

const loadAllCategoryResources = async () => {
  const targetPageSize = Math.max(totalResources.value, resourceList.value.length, 1)

  try {
    const result = await window.api.db.getResourceByCategoryId(categoryId.value, buildResourceQuery(1, targetPageSize))
    if (Array.isArray(result?.items) && result.items.length) {
      return result.items
    }
  } catch {
    // fall back to the current page resources below
  }

  return resourceList.value
}

const buildMusicPlaylistTrack = (resource: any) => {
  const targetPath = getResourceFilePath(resource)
  if (!targetPath || resource?.missingStatus) {
    return null
  }

  const normalizedCoverPath = normalizeCoverPreviewSource(String(resource?.coverPath ?? ''))

  return {
    path: targetPath,
    label: String(resource?.title ?? getResourceNameFromBasePath(targetPath) ?? '当前音乐'),
    duration: Number(resource?.audioMeta?.duration ?? 0) || undefined,
    resourceId: String(resource?.id ?? ''),
    resourceTitle: String(resource?.title ?? getResourceNameFromBasePath(targetPath) ?? '当前音乐'),
    artist: getAudioPlayerArtistText(resource),
    coverSrc: /^https?:\/\//i.test(normalizedCoverPath) || /^data:/i.test(normalizedCoverPath) ? normalizedCoverPath : '',
    coverPath: normalizedCoverPath,
    hasSubtitle: Boolean(resource?.audioMeta?.lyricsPath),
    subtitlePath: String(resource?.audioMeta?.lyricsPath ?? '').trim() || undefined
  }
}

const applyAudioPlayerSession = async (resource: any, playlist: Array<{ path: string; label: string; duration?: number | null; resourceId?: string; resourceTitle?: string; artist?: string; coverSrc?: string; coverPath?: string; hasSubtitle?: boolean; subtitlePath?: string }>, initialPath: string, initialTime = 0) => {
  audioPlayerPlaylist.value = [...playlist]
  audioPlayerDisplayMode.value = String(resource?.category?.referencePath ?? resource?.extendTable ?? categorySettings.value.extendTable ?? '').trim() === 'audio_meta'
    ? 'music'
    : 'default'
  const resolvedCoverSrc = await getAudioPlayerCoverPreview(resource)
  setAudioPlayerSession({
    resourceId: String(resource?.id ?? ''),
    initialPath,
    initialTime: Math.max(0, Number(initialTime ?? 0)),
    title: String(resource?.title ?? categoryName.value ?? '音频播放器'),
    artist: getAudioPlayerArtistText(resource),
    displayMode: audioPlayerDisplayMode.value,
    coverSrc: resolvedCoverSrc,
    playlist
  })
  setAudioPlayerVisible(true)
}

const resolveResourceAudioTree = async (resource: any) => {
  const resourceId = String(resource?.id ?? '')
  const selectedId = String(selectedDetailResource.value?.id ?? '')
  if (resourceId && resourceId === selectedId && detailAudioTree.value.length) {
    return detailAudioTree.value
  }

  return await window.api.dialog.getDirectoryAudioTree(String(resource?.basePath ?? ''))
}

const openAsmrPlaybackFromLaunch = async (resource: any) => {
  try {
    const audioTree = await resolveResourceAudioTree(resource)
    const allTracks = collectAudioTreeTracks(audioTree)
    if (!allTracks.length) {
      showNotifyByType('warning', '播放音频', '当前没有可播放的音频文件')
      return
    }

    const lastPlayFile = String(resource?.asmrMeta?.lastPlayFile ?? '').trim()
    const lastPlayTime = Math.max(0, Number(resource?.asmrMeta?.lastPlayTime ?? 0))
    const normalizedLastPlayFile = normalizeAudioPath(lastPlayFile)
    const resumeTrack = normalizedLastPlayFile
      ? allTracks.find((track) => normalizeAudioPath(track.path) === normalizedLastPlayFile)
      : null

    if (!resumeTrack) {
      await applyAudioPlayerSession(resource, allTracks, String(allTracks[0]?.path ?? ''), 0)
      return
    }

    const resumeDirectory = getAudioDirectoryPath(resumeTrack.path)
    const directoryTracks = allTracks.filter((track) => getAudioDirectoryPath(track.path) === resumeDirectory)
    const playlist = directoryTracks.length ? directoryTracks : allTracks
    await applyAudioPlayerSession(resource, playlist, resumeTrack.path, lastPlayTime)
  } catch {
    showNotifyByType('error', '播放音频', '读取音声目录失败')
  }
}

const openAudioPlaybackFromLaunch = async (resource: any) => {
  const targetPath = getResourceFilePath(resource)
  if (!targetPath) {
    showNotifyByType('warning', '播放音频', '当前音乐路径无效')
    return
  }

  const allResources = await loadAllCategoryResources()
  const playlist = allResources
    .map((item: any) => buildMusicPlaylistTrack(item))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const normalizedTargetPath = normalizeAudioPath(targetPath)
  const matchedTrack = playlist.find((item) => normalizeAudioPath(item.path) === normalizedTargetPath)

  if (!playlist.length || !matchedTrack) {
    showNotifyByType('warning', '播放音频', '当前没有可播放的音乐资源')
    return
  }

  await applyAudioPlayerSession(
    resource,
    playlist,
    matchedTrack.path,
    Math.max(0, Number(resource?.audioMeta?.lastPlayTime ?? 0))
  )
}

const handleAddMusicToPlaylist = async (resource: any) => {
  if (!isAudioCategory.value) {
    return
  }

  const track = buildMusicPlaylistTrack(resource)
  if (!track) {
    showNotifyByType('warning', '加入播放列表', '当前音乐路径无效')
    return
  }

  const normalizedTrackPath = normalizeAudioPath(track.path)
  const hasActiveMusicPlaylist = audioPlayerDisplayMode.value === 'music' && audioPlayerPlaylist.value.length > 0

  if (!hasActiveMusicPlaylist) {
    await openAudioPlaybackFromLaunch(resource)
    showNotifyByType('success', '加入播放列表', `已按当前筛选条件开始播放“${resource?.title ?? '当前音乐'}”`)
    return
  }

  const exists = audioPlayerPlaylist.value.some((item) => normalizeAudioPath(item.path) === normalizedTrackPath)
  if (exists) {
    showNotifyByType('info', '加入播放列表', '该音乐已在播放列表中')
    return
  }

  const nextPlaylist = [...audioPlayerPlaylist.value, track]
  audioPlayerPlaylist.value = nextPlaylist
  setAudioPlayerSession({ playlist: nextPlaylist })
  showNotifyByType('success', '加入播放列表', `已将“${track.resourceTitle || track.label}”加入播放列表`)
}

const formatAudioBitrate = (bitrate: number | null | undefined) => {
  const normalized = Number(bitrate ?? 0)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return '未知'
  }

  return `${Math.round(normalized / 1000)} kbps`
}

const formatAudioSampleRate = (sampleRate: number | null | undefined) => {
  const normalized = Number(sampleRate ?? 0)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return '未知'
  }

  return `${normalized} Hz`
}

const formatFrameRate = (frameRate: number | null | undefined) => {
  const normalized = Number(frameRate ?? 0)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return '未知'
  }

  return `${normalized.toFixed(normalized >= 10 ? 0 : 2)} fps`
}

const formatImageResolution = (width: number | null | undefined, height: number | null | undefined) => {
  const normalizedWidth = Number(width ?? 0)
  const normalizedHeight = Number(height ?? 0)
  if (!Number.isFinite(normalizedWidth) || normalizedWidth <= 0 || !Number.isFinite(normalizedHeight) || normalizedHeight <= 0) {
    return '未知'
  }

  return `${normalizedWidth} × ${normalizedHeight}`
}

const closeDetailAudioContextMenu = () => {
  detailAudioContextMenuVisible.value = false
  detailAudioContextMenuTarget.value = null
}

const handleOpenAudioTreeContextMenu = (event: MouseEvent, option: any) => {
  if (!option || option?.isDirectory) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  detailAudioContextMenuTarget.value = option
  detailAudioContextMenuX.value = event.clientX
  detailAudioContextMenuY.value = event.clientY
  detailAudioContextMenuVisible.value = true
}

const detailAudioContextMenuOptions = computed(() => {
  const option = detailAudioContextMenuTarget.value
  if (!option || option?.isDirectory) {
    return []
  }

  if (option?.kind === 'image') {
    return [
      { label: '查看', key: 'view' },
      { label: `分辨率: ${formatImageResolution(option?.width, option?.height)}`, key: 'resolution', disabled: true }
    ]
  }

  if (option?.kind === 'video') {
    return [
      { label: '播放', key: 'play' },
      { label: '使用默认应用播放', key: 'play-default' },
      { label: `时长: ${formatAsmrDuration(option?.duration)}`, key: 'duration', disabled: true },
      { label: `分辨率: ${formatImageResolution(option?.width, option?.height)}`, key: 'resolution', disabled: true },
      { label: `比特率: ${formatAudioBitrate(option?.bitrate)}`, key: 'bitrate', disabled: true },
      { label: `帧速率: ${formatFrameRate(option?.frameRate)}`, key: 'frameRate', disabled: true },
      { label: `音频比特率: ${formatAudioBitrate(option?.audioBitrate)}`, key: 'audioBitrate', disabled: true },
      { label: `音频采样率: ${formatAudioSampleRate(option?.audioSampleRate)}`, key: 'audioSampleRate', disabled: true }
    ]
  }

  return [
    { label: '播放', key: 'play' },
    { label: '使用默认应用播放', key: 'play-default' },
    { label: `时长: ${formatAsmrDuration(option?.duration)}`, key: 'duration', disabled: true },
    { label: `比特率: ${formatAudioBitrate(option?.bitrate)}`, key: 'bitrate', disabled: true },
    { label: `采样率: ${formatAudioSampleRate(option?.sampleRate)}`, key: 'sampleRate', disabled: true }
  ]
})

const detailAudioContextMenuPosition = computed(() => {
  const menuWidth = 220
  const optionCount = detailAudioContextMenuOptions.value.length
  const menuHeight = Math.max(56, optionCount * 34 + 16)
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight
  const padding = 12

  const safeX = viewportWidth > 0
    ? Math.max(padding, Math.min(detailAudioContextMenuX.value, viewportWidth - menuWidth - padding))
    : detailAudioContextMenuX.value
  const safeY = viewportHeight > 0
    ? Math.max(padding, Math.min(detailAudioContextMenuY.value, viewportHeight - menuHeight - padding))
    : detailAudioContextMenuY.value

  return {
    x: safeX,
    y: safeY
  }
})

const handleOpenAudioTreeImage = async (imagePath: string) => {
  const normalizedPath = String(imagePath ?? '').trim()
  if (!normalizedPath) {
    return
  }

  const imagePaths = detailAudioImagePaths.value
  const initialIndex = imagePaths.findIndex((filePath) => filePath === normalizedPath)
  if (initialIndex < 0) {
    return
  }

  pictureViewerImagePaths.value = [...imagePaths]
  pictureViewerInitialIndex.value = initialIndex
  pictureViewerAllowDelete.value = false
  await loadPictureViewerScrollMode()
  showPictureViewer.value = true
}

const openAudioPlayer = async (targetPath: string) => {
  const normalizedPath = String(targetPath ?? '').trim()
  if (!normalizedPath) {
    return
  }

  const allTracks = detailAudioPlaylist.value
  if (!allTracks.length) {
    showNotifyByType('warning', '播放音频', '当前没有可播放的音频文件')
    return
  }

  const targetDirectory = getAudioDirectoryPath(normalizedPath)
  const directoryTracks = allTracks.filter((track) => getAudioDirectoryPath(track.path) === targetDirectory)
  const playlist = directoryTracks.length ? directoryTracks : allTracks

  await applyAudioPlayerSession(selectedDetailResource.value, playlist, normalizedPath, 0)
}

const handleAudioTreeActionPlaceholder = (option: any) => {
  if (!option?.path) {
    return
  }

  if (option?.kind === 'video') {
    showNotifyByType('info', '播放视频', '视频播放功能暂未实现')
    return
  }

  void openAudioPlayer(String(option.path))
}

const handleOpenPathWithDefaultApp = async (targetPath: string, title = '使用默认应用播放') => {
  const normalizedPath = String(targetPath ?? '').trim()
  if (!normalizedPath) {
    showNotifyByType('warning', title, '当前文件路径无效')
    return
  }

  try {
    const message = await window.api.dialog.openPath(normalizedPath)
    if (message) {
      showNotifyByType('error', title, message)
      return
    }

    showNotifyByType('success', title, '已使用默认应用打开文件')
  } catch (error) {
    showNotifyByType('error', title, error instanceof Error ? error.message : '打开文件失败')
  }
}

const handleSelectDetailAudioContextMenu = (key: string) => {
  const option = detailAudioContextMenuTarget.value
  closeDetailAudioContextMenu()

  if (!option || option?.isDirectory) {
    return
  }

  if (key === 'view' && option?.kind === 'image') {
    void handleOpenAudioTreeImage(String(option?.path ?? ''))
    return
  }

  if (key === 'play-default' && (option?.kind === 'audio' || option?.kind === 'video')) {
    void handleOpenPathWithDefaultApp(String(option?.path ?? ''), '使用默认应用播放')
    return
  }

  if (key === 'play' && (option?.kind === 'audio' || option?.kind === 'video')) {
    handleAudioTreeActionPlaceholder(option)
  }
}

const renderAudioTreeFileLabel = (option: any, icon: string, label: string) => h('div', {
  class: 'detail-audio-tree__file',
  onContextmenu: (event: MouseEvent) => handleOpenAudioTreeContextMenu(event, option)
}, [
  h('div', {
    class: 'detail-audio-tree__file-title'
  }, [
      h('span', null, `${icon} ${label}`),
      option?.hasSubtitle
        ? h('span', {
        class: 'detail-audio-tree__subtitle-badge',
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 auto',
          padding: '0 6px',
          borderRadius: '999px',
          background: 'rgba(99, 226, 183, 0.16)',
          color: 'rgb(125, 232, 196)',
          fontSize: '11px',
          lineHeight: '18px',
          whiteSpace: 'nowrap'
        }
      }, '字幕')
        : null
    ])
  ])

const renderAudioTreeLabel = ({ option }: { option: any }) => {
  if (option?.isDirectory) {
    return h('span', { class: 'detail-audio-tree__label' }, `📁 ${option.label}`)
  }

  if (option?.kind === 'image') {
    return renderAudioTreeFileLabel(option, '🖼', String(option?.label ?? ''))
  }

  if (option?.kind === 'video') {
    return renderAudioTreeFileLabel(option, '🎬', String(option?.label ?? ''))
  }

  return renderAudioTreeFileLabel(option, '🎵', String(option?.label ?? ''))
}

const renderAudioTreeSuffix = ({ option }: { option: any }) => {
  if (option?.isDirectory) {
    return null
  }

  if (option?.kind === 'image') {
    return h('span', {
      class: 'detail-audio-tree__action-button detail-audio-tree__action-button--play',
      role: 'button',
      tabindex: 0,
      'aria-label': '查看图片',
      onClick: (event: MouseEvent) => {
        event.stopPropagation()
        void handleOpenAudioTreeImage(String(option?.path ?? ''))
      },
      onContextmenu: (event: MouseEvent) => handleOpenAudioTreeContextMenu(event, option),
      onKeydown: (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        void handleOpenAudioTreeImage(String(option?.path ?? ''))
      }
    }, '▶')
  }

  return h('span', {
    class: 'detail-audio-tree__action-button detail-audio-tree__action-button--play',
    role: 'button',
    tabindex: 0,
    'aria-label': '播放音频',
    onClick: (event: MouseEvent) => {
      event.stopPropagation()
      handleAudioTreeActionPlaceholder(option)
    },
    onContextmenu: (event: MouseEvent) => handleOpenAudioTreeContextMenu(event, option),
    onKeydown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      handleAudioTreeActionPlaceholder(option)
    }
  }, '▶')
}
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
const detailIsSoftware = computed(() => categorySettings.value.extendTable === 'software_meta')
const detailIsManga = computed(() => categorySettings.value.extendTable === 'multi_image_meta')
const detailIsAsmr = computed(() => categorySettings.value.extendTable === 'asmr_meta')
const detailIsAudio = computed(() => categorySettings.value.extendTable === 'audio_meta')
const detailOpenFolderText = computed(() => `打开${categoryName.value || '资源'}文件夹`)
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
    pushItem(items, '命令行参数', resource.softwareMeta?.commandLineArgs)
  } else if (extendTable === 'video_meta') {
    pushItem(items, '年份', resource.videoMeta?.year)
  } else if (extendTable === 'asmr_meta') {
    pushItem(items, '脚本', resource.asmrMeta?.scenario)
    pushItem(
      items,
      '声优',
      Array.isArray(resource.actors) ? resource.actors.map((item: any) => String(item?.name ?? '')).filter(Boolean).join(' / ') : ''
    )
    pushItem(items, '画师', resource.asmrMeta?.illust)
    pushItem(items, '总时长', formatAsmrDuration(resource.asmrMeta?.duration))
    pushItem(items, '语言', resource.asmrMeta?.language)
  } else if (extendTable === 'audio_meta') {
    pushItem(
      items,
      '艺术家',
      Array.isArray(resource.authors)
        ? resource.authors.map((item: any) => String(item?.name ?? '')).filter(Boolean).join(' / ')
        : resource.audioMeta?.artist
    )
    pushItem(items, '专辑', resource.audioMeta?.album)
    pushItem(items, '比特率', formatAudioBitrate(resource.audioMeta?.bitrate))
    pushItem(items, '采样率', formatAudioSampleRate(resource.audioMeta?.sampleRate))
    pushItem(items, '歌词路径', resource.audioMeta?.lyricsPath)
    pushItem(items, '总时长', formatDuration(resource.audioMeta?.duration))
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
const detailDisplayPath = computed(() => buildDisplayBasePath(selectedDetailResource.value))
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
const authorSelectOptions = computed(() =>
  normalizedAuthorList.value
    .map((author) => ({
      label: author.name,
      value: author.name
    }))
    .filter((item) => item.label && item.value)
)
const albumSelectOptions = computed(() =>
  normalizedAlbumList.value
    .map((album) => ({
      label: album.name,
      value: album.name
    }))
    .filter((item) => item.label && item.value)
)
const batchLabelIsSingleValue = computed(() => batchLabelField.value === 'album')
const batchLabelOptions = computed(() => {
  if (batchLabelField.value === 'tags') {
    return tagSelectOptions.value
  }

  if (batchLabelField.value === 'types') {
    return typeSelectOptions.value
  }

  if (batchLabelField.value === 'authors') {
    return authorSelectOptions.value
  }

  return albumSelectOptions.value
})
const batchLabelTitle = computed(() => {
  const fieldLabel = batchLabelField.value === 'tags'
    ? '标签'
    : batchLabelField.value === 'types'
      ? '分类'
      : batchLabelField.value === 'authors'
        ? '歌手'
        : '专辑'
  const actionLabel = batchLabelMode.value === 'add' ? '添加' : '移除'
  return `批量${actionLabel}${fieldLabel}`
})
const batchLabelPlaceholder = computed(() => {
  if (batchLabelField.value === 'album') {
    return batchLabelMode.value === 'add'
      ? '可选择已有专辑，也可输入新的专辑名'
      : '请选择或输入需要移除的专辑名'
  }

  const fieldLabel = batchLabelField.value === 'tags'
    ? '标签'
    : batchLabelField.value === 'types'
      ? '分类'
      : '歌手'
  return `可选择已有${fieldLabel}，也可输入新${fieldLabel}，按空格、顿号、英文逗号或回车批量添加`
})

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

const formatAudioCoverCandidateQuery = (query: Record<string, string>) =>
  Object.entries(query ?? {})
    .map(([key, value]) => {
      const label = key === 'title' ? '歌名' : key === 'artist' ? '歌手' : key === 'album' ? '专辑' : key
      return `${label}：${String(value ?? '').trim()}`
    })
    .filter(Boolean)
    .join(' / ')

const resolveCoverPreviewUrl = async (coverPath: string) => {
  const normalizedCoverPath = normalizeCoverPreviewSource(String(coverPath ?? '').trim())
  if (!normalizedCoverPath) {
    return ''
  }

  if (/^https?:\/\//i.test(normalizedCoverPath) || /^data:/i.test(normalizedCoverPath)) {
    return normalizedCoverPath
  }

  try {
    return (await window.api.dialog.getImagePreviewUrl(normalizedCoverPath, {
      maxWidth: 480,
      maxHeight: 320,
      fit: 'cover',
      quality: 84
    })) ?? ''
  } catch {
    return ''
  }
}

const closeAudioCoverCandidateModal = () => {
  showAudioCoverCandidateModal.value = false
  audioCoverCandidates.value = []
}

const handleUseAudioCoverCandidate = (coverPath: string) => {
  formData.value.coverPath = String(coverPath ?? '').trim()
  closeAudioCoverCandidateModal()
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

const formatAsmrDuration = (seconds: number | null | undefined) => {
  const normalizedSeconds = Number(seconds ?? 0)
  if (normalizedSeconds === -1) {
    return '计算中'
  }

  return formatDuration(normalizedSeconds)
}

const isUnknownEndTime = (value: string | number | Date | null | undefined) => {
  if (!value) {
    return false
  }

  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.getTime() === new Date(ResourceLogSpecialTime.UNKNOWN_END_TIME).getTime()
}

const formatLogEndTime = (value: string | number | Date | null | undefined) => {
  if (isUnknownEndTime(value)) {
    return '未检测到结束时间'
  }

  return formatDateTime(value)
}

const formatLogDuration = (logItem: { endTime?: string | number | Date | null; duration?: number | null }) => {
  if (isUnknownEndTime(logItem?.endTime)) {
    return '未知'
  }

  return formatDuration(logItem?.duration)
}

const formatLaunchMode = (launchMode: string | null | undefined) => {
  switch (String(launchMode ?? '').trim()) {
    case ResourceLaunchMode.ADMIN:
      return '管理员启动'
    case ResourceLaunchMode.MTOOL:
      return 'MTool 启动'
    case ResourceLaunchMode.LOCALE_EMULATOR:
      return 'LE 转区启动'
    case ResourceLaunchMode.NORMAL:
    default:
      return '普通启动'
  }
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

const getFileNameWithoutExtension = (basePath: string) => {
  const normalizedPath = String(basePath ?? '').replace(/\\/g, '/')
  const fileName = normalizedPath.split('/').pop() ?? ''

  if (!fileName) {
    return ''
  }

  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0) {
    return fileName
  }

  return fileName.slice(0, dotIndex)
}


const readComicProgress = async (resourceId: string) => {
  const normalizedResourceId = String(resourceId ?? '').trim()
  if (!normalizedResourceId) {
    return 0
  }

  try {
    const result = await window.api.service.getMultiImageReadingProgress(normalizedResourceId)
    return Math.max(0, Math.floor(Number(result?.data?.lastReadPage ?? 0)))
  } catch {
    return 0
  }
}

const writeComicProgress = async (resourceId: string, pageIndex: number) => {
  const normalizedResourceId = String(resourceId ?? '').trim()
  if (!normalizedResourceId) {
    return
  }

  try {
    await window.api.service.updateMultiImageReadingProgress(
      normalizedResourceId,
      Math.max(0, Math.floor(Number(pageIndex ?? 0)))
    )
  } catch {
    // ignore progress persistence failure
  }
}

const startComicReadingSession = async (resource: any) => {
  const resourceId = String(resource?.id ?? '').trim()
  if (!resourceId) {
    return false
  }

  const result = await window.api.service.startReadingResource(resourceId)
  const resultType = result?.type ?? 'info'
  if (resultType === 'error' || resultType === 'warning') {
    showNotifyByType(resultType, '开始阅读', result?.message ?? '开始阅读失败')
    return false
  }

  return true
}

const stopComicReadingSession = async () => {
  const resourceId = String(currentComicReaderResourceId.value ?? '').trim()
  if (!resourceId) {
    return
  }

  currentComicReaderResourceId.value = ''
  const result = await window.api.service.stopResource(resourceId)
  if (result?.type === 'error') {
    showNotifyByType('error', '结束阅读', result?.message ?? '结束阅读失败')
    return
  }

  await fetchData()
}

const openComicReader = async (resource: any, pageIndex?: number | null) => {
  const resourceId = String(resource?.id ?? '').trim()
  if (!resourceId) {
    showNotifyByType('warning', '漫画阅读', '当前漫画资源无效')
    return
  }

  if (showComicReader.value && currentComicReaderResourceId.value && currentComicReaderResourceId.value !== resourceId) {
    await stopComicReadingSession()
  }

  await refreshDetailScreenshots(
    Number.isFinite(Number(pageIndex)) ? Number(pageIndex) : await readComicProgress(resourceId),
    resource
  )
  if (!detailScreenshotPaths.value.length) {
    showNotifyByType('warning', '漫画阅读', '当前漫画目录中没有可阅读的图片')
    return
  }

  const started = await startComicReadingSession(resource)
  if (!started) {
    return
  }

  const preferredIndex = Number.isFinite(Number(pageIndex)) ? Number(pageIndex) : await readComicProgress(resourceId)
  const resolvedIndex = Math.min(
    Math.max(0, Math.floor(preferredIndex)),
    Math.max(0, detailScreenshotPaths.value.length - 1)
  )

  currentScreenshotIndex.value = resolvedIndex
  currentComicReaderResourceId.value = resourceId
  comicReaderImagePaths.value = [...detailScreenshotPaths.value]
  comicReaderInitialIndex.value = resolvedIndex
  showPictureViewer.value = false
  showComicReader.value = true
  await writeComicProgress(resourceId, resolvedIndex)
  await fetchData()
}

const handleComicReaderPageChange = (index: number) => {
  currentScreenshotIndex.value = Math.max(0, Math.floor(Number(index ?? 0)))
  void writeComicProgress(currentComicReaderResourceId.value, currentScreenshotIndex.value)
}

const getFileName = (basePath: string) => {
  const normalizedPath = String(basePath ?? '').replace(/\\/g, '/')
  return normalizedPath.split('/').pop() ?? ''
}

const detectPixivIdFromFilePath = (filePath: string) => {
  const fileStem = getFileNameWithoutExtension(filePath)
  const matched = fileStem.match(/^(\d+)_p\d+$/i)
  return matched?.[1] ?? ''
}

const getResourceFilePath = (resource: any) => {
  return String(buildDisplayBasePath(resource) ?? '').trim()
}

const normalizeSoftwareScript = (script: string) => {
  return String(script ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const normalizeSoftwareScriptForShell = (script: string, shellType: 'powershell' | 'cmd') => {
  const lines = normalizeSoftwareScript(script)
  return lines.join(shellType === 'cmd' ? ' && ' : '; ')
}

const denormalizeSoftwareScript = (command: string) => {
  return String(command ?? '')
    .replace(/\s*&&\s*/g, '\n')
    .replace(/\s*;\s*/g, '\n')
    .trim()
}

const resolveSoftwareScriptShell = (basePath: string) => {
  const normalizedPath = String(basePath ?? '').replace(/\\/g, '/').toLowerCase()
  return normalizedPath.endsWith('/powershell.exe') || normalizedPath.endsWith('/pwsh.exe') ? 'powershell' : 'cmd'
}

const ensureSoftwareScriptRuntimes = async () => {
  const runtimes = await window.api.dialog.getAvailableScriptRuntimes()
  softwareScriptRuntimes.value = Array.isArray(runtimes) ? runtimes : []
  return softwareScriptRuntimes.value
}

const applyDefaultPathName = (basePath: string) => {
  if (categorySettings.value.extendTable === 'audio_meta') {
    const fileStem = getFileNameWithoutExtension(basePath)
    if (fileStem) {
      formData.value.name = fileStem
    }
    return
  }

  if (categorySettings.value.extendTable === 'single_image_meta') {
    const fileStem = getFileNameWithoutExtension(basePath)
    if (fileStem) {
      formData.value.name = fileStem
    }
    return
  }

  if (categorySettings.value.extendTable === 'software_meta') {
    const fileStem = getFileNameWithoutExtension(basePath)
    if (fileStem) {
      formData.value.name = fileStem
    }
    return
  }

  if (categorySettings.value.extendTable === 'multi_image_meta') {
    const resourceName = getResourceNameFromBasePath(basePath)
    if (resourceName) {
      formData.value.name = resourceName
    }
    return
  }

  if (categorySettings.value.resourcePathType !== 'file') {
    return
  }

  const resourceName = getResourceNameFromBasePath(basePath)
  if (resourceName) {
    formData.value.name = resourceName
  }
}

const handleOpenSoftwareScriptModal = () => {
  void (async () => {
    if (!isSoftwareCategory.value) {
      return
    }

    const runtimes = await ensureSoftwareScriptRuntimes()
    const currentBasePath = String(formData.value?.basePath ?? '').trim()
    const normalizedCurrentBasePath = currentBasePath.toLowerCase()
    const matchedRuntime = runtimes.find((item) => String(item.value ?? '').trim().toLowerCase() === normalizedCurrentBasePath)
    const fallbackShellType = resolveSoftwareScriptShell(currentBasePath)
    const fallbackRuntime = matchedRuntime
      ?? runtimes.find((item) => item.shellType === fallbackShellType)
      ?? runtimes.find((item) => item.shellType === 'powershell')
      ?? runtimes[0]

    softwareScriptRuntimePath.value = String(fallbackRuntime?.value ?? '')
    softwareScriptDraft.value = denormalizeSoftwareScript(String(formData.value?.meta?.commandLineArgs ?? ''))
    showSoftwareScriptModal.value = true
  })()
}

const handleConfirmSoftwareScript = async () => {
  const normalizedCommand = normalizeSoftwareScriptForShell(softwareScriptDraft.value, softwareScriptShellType.value)
  if (!normalizedCommand) {
    showNotifyByType('warning', '脚本执行', '请先输入至少一条命令')
    return
  }

  if (!String(softwareScriptRuntimePath.value ?? '').trim()) {
    showNotifyByType('warning', '脚本执行', '请先选择脚本运行器')
    return
  }

  formData.value.basePath = softwareScriptRuntimePath.value
  formData.value.meta = {
    ...(formData.value.meta ?? {}),
    commandLineArgs: normalizedCommand
  }

  if (!String(formData.value.name ?? '').trim() || String(formData.value.name ?? '').trim().toLowerCase() === 'cmd') {
    formData.value.name = '脚本启动'
  }

  showSoftwareScriptModal.value = false
  await nextTick()
  await basePathFormItemRef.value?.validate({ trigger: 'change' })
}

const applyGamePathAnalysis = async (basePath: string) => {
  if (!['game_meta', 'asmr_meta'].includes(String(categorySettings.value.extendTable ?? '').trim())) {
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

    if (detailIsAsmr.value && analysis.gameId) {
      formData.value.meta.websiteType = String(
        websiteTypeOptions.value.find((item: any) => String(item?.label ?? '').trim().toLowerCase() === 'dlsite')?.value ?? ''
      )
    } else if (analysis.websiteType) {
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
  if (detailIsManga.value) {
    return {
      ...item,
      launchFileIcon: '',
      fetchInfoEnabled: item.fetchInfoEnabled !== false
    }
  }

  if (detailIsAsmr.value) {
    return {
      ...item,
      launchFileIcon: '',
      fetchInfoEnabled: item.fetchInfoEnabled !== false
    }
  }

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
  const requestId = ++fetchDataRequestId
  loading.value = true
  try {
    const activeCategoryId = String(categoryId.value ?? '').trim()
    const resourceQuery = {
      keyword: keyword.value.trim(),
      authorIds: [...selectedAuthorList.value],
      albumNames: [...selectedAlbumList.value],
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
    const nextCategoryInfo = await window.api.db.getCategoryById(activeCategoryId)
    if (requestId !== fetchDataRequestId || activeCategoryId !== String(categoryId.value ?? '').trim()) {
      return
    }

    categoryInfo.value = nextCategoryInfo
    websiteTypeOptions.value = await window.api.db.getSelectDictData(
      detailIsManga.value
        ? DictType.MANGA_SITE_TYPE
        : detailIsAsmr.value
          ? DictType.ASMR_SITE_TYPE
          : DictType.GAME_SITE_TYPE
    )
    if (requestId !== fetchDataRequestId || activeCategoryId !== String(categoryId.value ?? '').trim()) {
      return
    }
    const localeEmulatorSetting = await window.api.db.getSetting(Settings.LOCALE_EMULATOR_PATH)
    localeEmulatorPath.value = String(localeEmulatorSetting?.value ?? '')
    const mtoolSetting = await window.api.db.getSetting(Settings.MTOOL_PATH)
    mtoolPath.value = String(mtoolSetting?.value ?? '')
    if (requestId !== fetchDataRequestId || activeCategoryId !== String(categoryId.value ?? '').trim()) {
      return
    }
    // 2. 获取该分类下的资源列表（带标签）
      const resourceResponse = await window.api.db.getResourceByCategoryId(activeCategoryId, resourceQuery)
      if (requestId !== fetchDataRequestId || activeCategoryId !== String(categoryId.value ?? '').trim()) {
        return
      }
      resourceList.value = resourceResponse?.items ?? []
      totalResources.value = Number(resourceResponse?.total ?? 0)
      if (selectedDetailResource.value?.id) {
        const matchedDetailResource = resourceList.value.find((item) => item.id === selectedDetailResource.value.id)
        if (matchedDetailResource) {
          selectedDetailResource.value = matchedDetailResource
        }
      }
      // 3. 获取作者列表
    authorList.value = await window.api.db.getAuthorByCategoryId(activeCategoryId)
    albumList.value = isAudioCategory.value
      ? await window.api.db.getAlbumByCategoryId(activeCategoryId)
      : []
    if (requestId !== fetchDataRequestId || activeCategoryId !== String(categoryId.value ?? '').trim()) {
      return
    }
    assignSanitizedSelectedFilterValues(selectedAuthorList, normalizedAuthorList.value, 'id')
    assignSanitizedSelectedFilterValues(selectedAlbumList, normalizedAlbumList.value, 'name')
    // 4. 获取引擎列表
    engineList.value = showEngineFilter.value
      ? await window.api.db.getEngineByCategoryId(activeCategoryId)
      : []
    if (requestId !== fetchDataRequestId || activeCategoryId !== String(categoryId.value ?? '').trim()) {
      return
    }
    assignSanitizedSelectedFilterValues(selectedEngineList, normalizedEngineList.value, 'id')
    // 4. 获取统计
    missingResourceCount.value = await window.api.db.getMissingResourceCountByCategoryId(activeCategoryId)
    favoriteResourceCount.value = await window.api.db.getFavoriteResourceCountByCategoryId(activeCategoryId)
    completedResourceCount.value = await window.api.db.getCompletedResourceCountByCategoryId(activeCategoryId)
    runningResourceCount.value = await window.api.db.getRunningResourceCountByCategoryId(activeCategoryId)
    if (requestId !== fetchDataRequestId || activeCategoryId !== String(categoryId.value ?? '').trim()) {
      return
    }
    // 5. 获取标签列表
    tagList.value = await window.api.db.getTagByCategoryId(activeCategoryId)
    assignSanitizedSelectedFilterValues(selectedTagList, normalizedTagList.value, 'id')
    // 6. 获取分类列表
    typeList.value = await window.api.db.getTypeByCategoryId(activeCategoryId)
    if (requestId !== fetchDataRequestId || activeCategoryId !== String(categoryId.value ?? '').trim()) {
      return
    }
    assignSanitizedSelectedFilterValues(selectedTypeList, normalizedTypeList.value, 'id')

  } catch (error) {
    if (requestId === fetchDataRequestId) {
      showNotifyByType('error', '加载失败', error instanceof Error ? error.message : '加载分类数据失败')
    }
  } finally {
    if (requestId === fetchDataRequestId) {
      loading.value = false
    }
  }
}

const resetSelected = () => {
  missingFile.value = false
  favoriteOnly.value = false
  completedOnly.value = false
  runningOnly.value = false
  selectedAuthorList.value = []
  selectedAlbumList.value = []
  selectedEngineList.value = []
  selectedTagList.value = []
  selectedTypeList.value = []
  authorSearch.value = ''
  albumSearch.value = ''
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
watch(categoryId, (nextCategoryId, previousCategoryId) => {
  if (previousCategoryId) {
    syncBatchImportStateFromRefs(previousCategoryId)
  }

  suppressAutoFetch.value = true
  syncBatchImportRefsFromState(String(nextCategoryId ?? ''))
  keyword.value = ''
  resetSelected()
  selectionModeManuallyEnabled.value = false
  selectedResourceIds.value = []
  resourceList.value = []
  totalResources.value = 0
  authorList.value = []
  albumList.value = []
  engineList.value = []
  tagList.value = []
  typeList.value = []
  currentPage.value = 1
  suppressAutoFetch.value = false
  fetchData()
}, { immediate: true })

watch(
  [keyword, missingFile, favoriteOnly, completedOnly, runningOnly, selectedAuthorList, selectedAlbumList, selectedEngineList, selectedTagList, selectedTypeList, pageSize, sortBy],
  () => {
    if (suppressAutoFetch.value) {
      return
    }
    currentPage.value = 1
    fetchData()
  },
  { deep: true }
)

watch(currentPage, () => {
  if (suppressAutoFetch.value) {
    jumpPageInput.value = currentPage.value
    return
  }
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
let stopBatchImportProgressListener: null | (() => void) = null

onMounted(() => {
  window.addEventListener('click', closeDetailAudioContextMenu)
  window.addEventListener('resize', closeDetailAudioContextMenu)
  stopResourceStateListener = window.api.service.onResourceStateChanged((message) => {
    if (message.categoryId !== categoryId.value) {
      return
    }

    void fetchData()
  })

  stopBatchImportProgressListener = window.api.service.onBatchImportProgress((message) => {
    const targetCategoryId = String(message.categoryId ?? '').trim()
    if (!targetCategoryId) {
      return
    }

    patchBatchImportState(targetCategoryId, {
      analyzeTotal: Number(message.total ?? 0),
      analyzeCurrent: Number(message.current ?? 0),
      analyzeMessage: String(message.message ?? ''),
      importRunning: !message.done && message.stage === 'import',
      analyzeRunning: !message.done && message.stage === 'analyze',
      showLoading: !message.done && targetCategoryId === categoryId.value
    })

    if (message.done) {
      patchBatchImportState(targetCategoryId, {
        importRunning: false,
        analyzeRunning: false,
        showLoading: false
      })
      clearBatchImportOngoingCenter(targetCategoryId)
      return
    }

    syncBatchImportOngoingCenter(targetCategoryId)
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
  window.removeEventListener('click', closeDetailAudioContextMenu)
  window.removeEventListener('resize', closeDetailAudioContextMenu)
  if (showComicReader.value) {
    void stopComicReadingSession()
  }
  stopResourceStateListener?.()
  stopResourceStateListener = null
  stopBatchImportProgressListener?.()
  stopBatchImportProgressListener = null
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
      coverPreviewSrc.value = (await window.api.dialog.getImagePreviewUrl(coverPath, {
        maxWidth: 720,
        maxHeight: 480,
        fit: 'inside',
        quality: 82
      })) ?? ''
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
      detailCoverPreviewSrc.value = (await window.api.dialog.getImagePreviewUrl(coverPath, {
        maxWidth: 960,
        maxHeight: 720,
        fit: 'inside',
        quality: 84
      })) ?? ''
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
      detailScreenshotPreviewSrc.value = (await window.api.dialog.getImagePreviewUrl(filePath, {
        maxWidth: 960,
        maxHeight: 720,
        fit: 'inside',
        quality: 84
      })) ?? ''
    } catch {
      detailScreenshotPreviewSrc.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => [...detailScreenshotPaths.value],
  async (paths) => {
    if (!paths.length) {
      detailGalleryImageUrls.value = {}
      return
    }

    const urlEntries = await Promise.all(paths.map(async (filePath) => {
      try {
        const previewUrl = await window.api.dialog.getImagePreviewUrl(filePath, {
          maxWidth: 360,
          maxHeight: 480,
          fit: 'cover',
          quality: 76
        })
        return [filePath, previewUrl ?? ''] as const
      } catch {
        return [filePath, ''] as const
      }
    }))

    detailGalleryImageUrls.value = Object.fromEntries(urlEntries.filter(([, url]) => url))
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

watch(showComicReader, (visible, previousVisible) => {
  if (visible || !previousVisible) {
    return
  }

  void stopComicReadingSession()
})

watch(
  [
    batchImportItems,
    batchImportFetchInfoEnabled,
    batchAnalyzeCurrent,
    batchAnalyzeTotal,
    batchAnalyzeMessage,
    batchAnalyzeRunning,
    batchImportRunning,
    batchAnalyzeCancelled,
    batchAnalyzeInBackground,
    batchAnalyzeToastDismissed,
    showBatchImportLoading,
    showBatchImportModal
  ],
  () => {
    if (categoryId.value) {
      syncBatchImportStateFromRefs(categoryId.value)
    }
  },
  { deep: true }
)

// --- E. 交互事件 ---
const handleAddResource = () => {
  editingResourceId.value = ''
  editInitialFormData.value = null
  formData.value = createEmptyFormData()
  showModal.value = true
}

const syncBatchImportOngoingCenter = (targetCategoryId = categoryId.value) => {
  if (!targetCategoryId) {
    return
  }

  const state = ensureBatchImportState(targetCategoryId)
  const isRunning = state.analyzeRunning || state.importRunning
  if (!isRunning) {
    clearBatchImportOngoingCenter(targetCategoryId)
    return
  }

  const [, secondLine] = String(state.analyzeMessage ?? '').split('\n')
  const currentDirectoryName = getResourceNameFromBasePath(secondLine || state.analyzeMessage || '')
    || secondLine
    || state.analyzeMessage
    || '正在准备分析目录'
  const current = Number(state.analyzeCurrent ?? 0)
  const total = Number(state.analyzeTotal ?? 0)
  const displayIndex = Math.min(total, current + 1)
  const progress = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
  const title = state.importRunning ? '批量导入进行中' : '批量导入'
  const contentPrefix = state.importRunning
    ? `正在导入第 ${displayIndex} / ${total} 个游戏`
    : `正在分析第 ${displayIndex} / ${total} 个目录`
  upsertOngoingCenterItem({
    id: getBatchImportOngoingId(targetCategoryId),
    title,
    content: `${contentPrefix}\n${currentDirectoryName}`,
    progress,
    onClick: () => {
      if (targetCategoryId === categoryId.value) {
        handleReopenBatchImportProgress()
      }
    }
  })
}

const clearBatchImportOngoingCenter = (targetCategoryId = categoryId.value) => {
  if (!targetCategoryId) {
    return
  }

  removeOngoingCenterItem(getBatchImportOngoingId(targetCategoryId))
}

const handleBatchImportClick = () => {
  void (async () => {
    const targetCategoryId = categoryId.value
    if (isSingleImageCategory.value) {
      await handleBatchImportImages()
      return
    }

    if (detailIsManga.value) {
      await handleBatchImportComics()
      return
    }

    if (detailIsAsmr.value) {
      await handleBatchImportAsmrs()
      return
    }

    if (isAudioCategory.value) {
      await handleBatchImportAudioFiles()
      return
    }

    const currentState = ensureBatchImportState(targetCategoryId)

    if (currentState.analyzeRunning || currentState.importRunning) {
      patchBatchImportState(targetCategoryId, {
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        showLoading: true
      })
      syncBatchImportOngoingCenter(targetCategoryId)
      return
    }

    try {
      const directoryPaths = await window.api.dialog.selectFolders()
      if (!directoryPaths?.length) {
        return
      }

      patchBatchImportState(targetCategoryId, {
        items: [],
        fetchInfoEnabled: true,
        analyzeTotal: directoryPaths.length,
        analyzeCurrent: 0,
        analyzeMessage: '正在分析游戏启动文件，请稍候...',
        analyzeCancelled: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        analyzeRunning: true,
        importRunning: false,
        showLoading: true,
        showPreview: false
      })
      syncBatchImportOngoingCenter(targetCategoryId)

      const items = await analyzeBatchImportDirectories(targetCategoryId, directoryPaths)

      patchBatchImportState(targetCategoryId, {
        items,
        showPreview: items.length > 0,
        showLoading: false
      })

      if (!items.length && ensureBatchImportState(targetCategoryId).analyzeCancelled) {
        showNotifyByType('info', '批量导入', '已停止分析')
      }
    } finally {
      patchBatchImportState(targetCategoryId, {
        analyzeRunning: false,
        analyzeInBackground: false,
        showLoading: false,
        analyzeToastDismissed: false
      })
      clearBatchImportOngoingCenter(targetCategoryId)
    }
  })()
}

const analyzeBatchImportComicDirectories = async (targetCategoryId: string, directoryPaths: string[]) => {
  const items: any[] = new Array(directoryPaths.length)
  let nextIndex = 0
  let completedCount = 0

  const updateAnalyzeProgress = (directoryPath?: string, index?: number) => {
    const currentDirectoryName = getResourceNameFromBasePath(directoryPath || '') || directoryPath || '正在准备分析目录'
    const currentIndex = typeof index === 'number'
      ? Math.min(directoryPaths.length, index + 1)
      : Math.min(directoryPaths.length, completedCount + 1)

    patchBatchImportState(targetCategoryId, {
      analyzeCurrent: completedCount,
      analyzeMessage: `正在分析第 ${currentIndex} / ${directoryPaths.length} 个漫画目录\n${currentDirectoryName}`
    })
    syncBatchImportOngoingCenter()
  }

  const worker = async () => {
    while (!ensureBatchImportState(targetCategoryId).analyzeCancelled) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= directoryPaths.length) {
        return
      }

      const directoryPath = directoryPaths[currentIndex]
      const directoryName = getResourceNameFromBasePath(directoryPath)
      updateAnalyzeProgress(directoryName || directoryPath, currentIndex)

      try {
        const analysisResult = await window.api.service.analyzeMultiImageDirectory(directoryPath)
        const analysisData = analysisResult?.data ?? {}
        const imageCount = Math.max(0, Number(analysisData?.imageCount ?? 0))
        items[currentIndex] = await enrichBatchImportItem({
          directoryPath: String(analysisData?.directoryPath ?? directoryPath),
          directoryName: String(analysisData?.directoryName ?? directoryName ?? ''),
          coverPath: String(analysisData?.coverPath ?? ''),
          imageCount,
          exists: Boolean(analysisData?.exists),
          existingResourceTitle: String(analysisData?.existingResourceTitle ?? ''),
          checked: !analysisData?.exists && imageCount > 0,
          errorMessage: analysisResult?.type === 'error' ? String(analysisResult?.message ?? '') : ''
        })
      } catch (error) {
        items[currentIndex] = {
          directoryPath,
          directoryName,
          coverPath: '',
          imageCount: 0,
          exists: false,
          checked: false,
          errorMessage: error instanceof Error ? error.message : '分析失败'
        }
      } finally {
        completedCount += 1
        patchBatchImportState(targetCategoryId, {
          analyzeCurrent: completedCount
        })
        syncBatchImportOngoingCenter()
      }
    }
  }

  const workerCount = Math.min(directoryPaths.length, BATCH_ANALYZE_CONCURRENCY)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return items.filter(Boolean)
}

const handleBatchImportComics = async () => {
  const targetCategoryId = categoryId.value
  const currentState = ensureBatchImportState(targetCategoryId)

  if (currentState.analyzeRunning || currentState.importRunning) {
    patchBatchImportState(targetCategoryId, {
      analyzeInBackground: false,
      analyzeToastDismissed: false,
      showLoading: true
    })
    syncBatchImportOngoingCenter(targetCategoryId)
    return
  }

  try {
    const directoryPaths = await window.api.dialog.selectFolders()
    if (!directoryPaths?.length) {
      return
    }

    patchBatchImportState(targetCategoryId, {
      items: [],
      fetchInfoEnabled: true,
      analyzeTotal: directoryPaths.length,
      analyzeCurrent: 0,
      analyzeMessage: '正在分析漫画目录，请稍候...',
      analyzeCancelled: false,
      analyzeInBackground: false,
      analyzeToastDismissed: false,
      analyzeRunning: true,
      importRunning: false,
      showLoading: true,
      showPreview: false
    })
    syncBatchImportOngoingCenter(targetCategoryId)

    const items = await analyzeBatchImportComicDirectories(targetCategoryId, directoryPaths)

    patchBatchImportState(targetCategoryId, {
      items,
      showPreview: items.length > 0,
      showLoading: false
    })

    if (!items.length && ensureBatchImportState(targetCategoryId).analyzeCancelled) {
      showNotifyByType('info', '批量导入漫画', '已停止分析')
    }
  } finally {
    patchBatchImportState(targetCategoryId, {
      analyzeRunning: false,
      analyzeInBackground: false,
      showLoading: false,
      analyzeToastDismissed: false
    })
    clearBatchImportOngoingCenter(targetCategoryId)
  }
}

const applyAudioCoverAnalysis = async () => {
  if (String(categorySettings.value.extendTable ?? '').trim() !== 'audio_meta') {
    return
  }
}

const buildAudioFetchPayload = (basePath: string, analysis?: any) => ({
  basePath: String(basePath ?? '').trim(),
  title: String(analysis?.name ?? formData.value?.name ?? '').trim(),
  album: String(analysis?.album ?? formData.value?.meta?.album ?? '').trim(),
  artist: String(analysis?.artist ?? formData.value?.author ?? '').trim(),
  artists: normalizeAudioAuthorList([
    ...(Array.isArray(analysis?.artists) ? analysis.artists : []),
    ...(Array.isArray(formData.value?.authors) ? formData.value.authors : []),
    String(analysis?.artist ?? formData.value?.author ?? '').trim()
  ])
})

const fetchAudioLyricsSilently = async (payload: any) => {
  const fetchAudioLyrics = window.api?.service?.fetchAudioLyrics
  if (typeof fetchAudioLyrics !== 'function') {
    return {
      type: 'error',
      message: '当前窗口尚未加载最新接口，请重启应用后再试'
    }
  }

  return await fetchAudioLyrics({
    basePath: String(payload?.basePath ?? ''),
    title: String(payload?.title ?? ''),
    album: String(payload?.album ?? ''),
    artist: String(payload?.artist ?? ''),
    artists: Array.isArray(payload?.artists) ? payload.artists.map((item: string) => String(item ?? '')).filter(Boolean) : []
  })
}

const fetchAudioAlbumCoverSilently = async (payload: any) => {
  const fetchAudioAlbumCover = window.api?.service?.fetchAudioAlbumCover
  if (typeof fetchAudioAlbumCover !== 'function') {
    return {
      type: 'error',
      message: '当前窗口尚未加载最新接口，请重启应用后再试'
    }
  }

  return await fetchAudioAlbumCover({
    basePath: String(payload?.basePath ?? ''),
    title: String(payload?.title ?? ''),
    album: String(payload?.album ?? ''),
    artist: String(payload?.artist ?? ''),
    artists: Array.isArray(payload?.artists) ? payload.artists.map((item: string) => String(item ?? '')).filter(Boolean) : []
  })
}

const promptForMissingAudioAssets = async (basePath: string, analysis: any) => {
  const fetchPayload = buildAudioFetchPayload(basePath, analysis)

  if (!String(analysis?.lyricsPath ?? '').trim()) {
    const confirmed = await confirmDialog('获取歌词', '未匹配到同名歌词文件，是否尝试自动获取歌词？')
    if (confirmed) {
      const result = await fetchAudioLyricsSilently(fetchPayload)
      if (result?.type === 'success' && result?.data?.lyricsPath) {
        formData.value.meta = {
          ...(formData.value.meta ?? {}),
          lyricsPath: String(result.data.lyricsPath)
        }
        showNotifyByType('success', '获取歌词', result?.message ?? '已获取歌词')
      } else if (result?.message) {
        showNotifyByType(result?.type ?? 'warning', '获取歌词', result.message)
      }
    }
  }

  if (!String(analysis?.embeddedCoverPath ?? '').trim()) {
    const confirmed = await confirmDialog('获取专辑封面', '未检测到文件内嵌封面，是否尝试自动获取专辑封面？')
    if (confirmed) {
      const result = await fetchAudioAlbumCoverSilently(fetchPayload)
      if (result?.type === 'success' && result?.data?.coverPath) {
        formData.value.coverPath = String(result.data.coverPath)
        showNotifyByType('success', '获取专辑封面', result?.message ?? '已获取专辑封面')
      } else if (result?.message) {
        showNotifyByType(result?.type ?? 'warning', '获取专辑封面', result.message)
      }
    }
  }
}

const applyAudioPathAnalysis = async (basePath: string) => {
  if (String(categorySettings.value.extendTable ?? '').trim() !== 'audio_meta') {
    return
  }

  const fileStem = getFileNameWithoutExtension(basePath)
  if (fileStem) {
    formData.value.name = fileStem
  }

  try {
    const analysis = await window.api.service.analyzeAudioFilePath(basePath)
    if (!analysis) {
      return
    }

    if (analysis.name) {
      formData.value.name = String(analysis.name)
    }

    const authorNames = normalizeAudioAuthorList([
      ...(Array.isArray(analysis.artists) ? analysis.artists : []),
      String(analysis.artist ?? '').trim()
    ])
    syncAudioAuthorFields(formData.value, authorNames)

    formData.value.meta = {
      ...(formData.value.meta ?? {}),
      artist: joinAudioAuthorNames(authorNames) || String(analysis.artist ?? formData.value.meta?.artist ?? ''),
      album: String(analysis.album ?? formData.value.meta?.album ?? ''),
      lyricsPath: String(analysis.lyricsPath ?? formData.value.meta?.lyricsPath ?? ''),
      duration: Number.isFinite(Number(analysis.duration)) ? Math.max(0, Math.floor(Number(analysis.duration))) : Number(formData.value.meta?.duration ?? 0)
    }
    formData.value.coverPath = String(analysis.embeddedCoverPath ?? '').trim()
    await promptForMissingAudioAssets(basePath, analysis)
  } catch (error) {
    notify('error', '分析失败', error instanceof Error ? error.message : '分析音乐文件失败')
  }
}

const handleAudioAuthorsChange = (value: string[]) => {
  syncAudioAuthorFields(formData.value, value)
}

const handleFetchAlbumCover = async () => {
  showNotifyByType('info', '获取专辑封面', '正在获取专辑封面，请稍候')

  try {
    const fetchAudioAlbumCover = window.api?.service?.fetchAudioAlbumCover
    if (typeof fetchAudioAlbumCover !== 'function') {
      showNotifyByType('error', '获取专辑封面', '当前窗口尚未加载最新接口，请重启应用后再试')
      return
    }

    const payload = {
      basePath: String(formData.value?.basePath ?? ''),
      title: String(formData.value?.name ?? ''),
      album: String(formData.value?.meta?.album ?? ''),
      artist: String(formData.value?.author ?? ''),
      artists: Array.isArray(formData.value?.authors)
        ? formData.value.authors.map((item: string) => String(item ?? '')).filter(Boolean)
        : []
    }

    const result = await fetchAudioAlbumCover(payload)

    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '操作完成'

    if (resultType === 'success') {
      const rawCandidates = Array.isArray(result?.data?.coverCandidates) ? result.data.coverCandidates : []
      const resolvedCandidates = await Promise.all(
        rawCandidates.map(async (candidate: any) => {
          const coverPath = String(candidate?.coverPath ?? '').trim()
          return {
            label: String(candidate?.label ?? '').trim(),
            coverPath,
            previewSrc: await resolveCoverPreviewUrl(coverPath),
            queryText: formatAudioCoverCandidateQuery(candidate?.query ?? {})
          }
        })
      )

      const availableCandidates = resolvedCandidates.filter((candidate) => candidate.coverPath && candidate.previewSrc)

      if (availableCandidates.length) {
        audioCoverCandidates.value = availableCandidates
        showAudioCoverCandidateModal.value = true
      } else if (result?.data?.coverPath) {
        formData.value.coverPath = String(result.data.coverPath)
      }
    }

    showNotifyByType(resultType, '获取专辑封面', resultMessage)
  } catch (error) {
    showNotifyByType('error', '获取专辑封面', error instanceof Error ? error.message : '获取专辑封面失败')
  }
}

const analyzeBatchImportAsmrDirectories = async (targetCategoryId: string, directoryPaths: string[]) => {
  const items: any[] = new Array(directoryPaths.length)
  let nextIndex = 0
  let completedCount = 0

  const updateAnalyzeProgress = (directoryPath?: string, index?: number) => {
    const currentDirectoryName = getResourceNameFromBasePath(directoryPath || '') || directoryPath || '正在准备分析目录'
    const currentIndex = typeof index === 'number'
      ? Math.min(directoryPaths.length, index + 1)
      : Math.min(directoryPaths.length, completedCount + 1)

    patchBatchImportState(targetCategoryId, {
      analyzeCurrent: completedCount,
      analyzeMessage: `正在分析第 ${currentIndex} / ${directoryPaths.length} 个音声目录\n${currentDirectoryName}`
    })
    syncBatchImportOngoingCenter()
  }

  const worker = async () => {
    while (!ensureBatchImportState(targetCategoryId).analyzeCancelled) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= directoryPaths.length) {
        return
      }

      const directoryPath = directoryPaths[currentIndex]
      const directoryName = getResourceNameFromBasePath(directoryPath)
      updateAnalyzeProgress(directoryName || directoryPath, currentIndex)

      try {
        const analysisResult = await window.api.service.analyzeAsmrDirectory(directoryPath)
        const analysisData = analysisResult?.data ?? {}
        const audioCount = Math.max(0, Number(analysisData?.audioCount ?? 0))
        items[currentIndex] = await enrichBatchImportItem({
          directoryPath: String(analysisData?.directoryPath ?? directoryPath),
          directoryName: String(analysisData?.directoryName ?? directoryName ?? ''),
          coverPath: String(analysisData?.coverPath ?? ''),
          audioCount,
          exists: Boolean(analysisData?.exists),
          existingResourceTitle: String(analysisData?.existingResourceTitle ?? ''),
          gameId: String(analysisData?.gameId ?? ''),
          websiteType: String(analysisData?.websiteType ?? ''),
          checked: !analysisData?.exists && audioCount > 0,
          errorMessage: analysisResult?.type === 'error' ? String(analysisResult?.message ?? '') : ''
        })
      } catch (error) {
        items[currentIndex] = {
          directoryPath,
          directoryName,
          coverPath: '',
          audioCount: 0,
          exists: false,
          checked: false,
          errorMessage: error instanceof Error ? error.message : '分析失败'
        }
      } finally {
        completedCount += 1
        patchBatchImportState(targetCategoryId, {
          analyzeCurrent: completedCount
        })
        syncBatchImportOngoingCenter()
      }
    }
  }

  const workerCount = Math.min(directoryPaths.length, BATCH_ANALYZE_CONCURRENCY)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return items.filter(Boolean)
}

const handleBatchImportAsmrs = async () => {
  const targetCategoryId = categoryId.value
  const currentState = ensureBatchImportState(targetCategoryId)

  if (currentState.analyzeRunning || currentState.importRunning) {
    patchBatchImportState(targetCategoryId, {
      analyzeInBackground: false,
      analyzeToastDismissed: false,
      showLoading: true
    })
    syncBatchImportOngoingCenter(targetCategoryId)
    return
  }

  try {
    const directoryPaths = await window.api.dialog.selectFolders()
    if (!directoryPaths?.length) {
      return
    }

    patchBatchImportState(targetCategoryId, {
      items: [],
      fetchInfoEnabled: true,
      analyzeTotal: directoryPaths.length,
      analyzeCurrent: 0,
      analyzeMessage: '正在分析音声目录，请稍候...',
      analyzeCancelled: false,
      analyzeInBackground: false,
      analyzeToastDismissed: false,
      analyzeRunning: true,
      importRunning: false,
      showLoading: true,
      showPreview: false
    })
    syncBatchImportOngoingCenter(targetCategoryId)

    const items = await analyzeBatchImportAsmrDirectories(targetCategoryId, directoryPaths)

    patchBatchImportState(targetCategoryId, {
      items,
      showPreview: items.length > 0,
      showLoading: false
    })

    if (!items.length && ensureBatchImportState(targetCategoryId).analyzeCancelled) {
      showNotifyByType('info', '批量导入音声', '已停止分析')
    }
  } finally {
    patchBatchImportState(targetCategoryId, {
      analyzeRunning: false,
      analyzeInBackground: false,
      showLoading: false,
      analyzeToastDismissed: false
    })
    clearBatchImportOngoingCenter(targetCategoryId)
  }
}

const handleBatchImportImages = async () => {
  try {
    const extensions = [...(categorySettings.value.extensions ?? [])]
    const filePaths = await window.api.dialog.selectFiles(extensions)

    if (!Array.isArray(filePaths) || !filePaths.length) {
      return
    }

    const imageSiteOptions = await window.api.db.getSelectDictData(DictType.IMAGE_SITE_TYPE)
    const pixivWebsiteId = String(
      imageSiteOptions.find((item: any) => String(item?.label ?? '').trim().toLowerCase() === 'pixiv')?.value ?? ''
    ).trim()
    const pixivMatches = filePaths
      .map((item) => detectPixivIdFromFilePath(String(item ?? '').trim()))
      .filter(Boolean)
    const shouldFetchPixivInfo = pixivMatches.length > 0
      ? await confirmDialog(
          '批量导入图片',
          `检测到 ${pixivMatches.length} 个文件名符合 Pixiv 格式，是否在导入时自动获取 Pixiv 信息？`
        )
      : false

    let successCount = 0
    let skippedCount = 0
    let failedCount = 0
    let pixivFetchedCount = 0

    for (const filePath of filePaths) {
      const normalizedPath = String(filePath ?? '').trim()
      if (!normalizedPath) {
        skippedCount += 1
        continue
      }

      if (!validateBasePathExtension(normalizedPath)) {
        skippedCount += 1
        continue
      }

      const existsResult = await window.api.service.checkResourceExistsByPath(normalizedPath)
      if (existsResult?.exists) {
        skippedCount += 1
        continue
      }

      if (existsResult?.type === 'error') {
        failedCount += 1
        continue
      }

      const pixivId = detectPixivIdFromFilePath(normalizedPath)
      const fileStem = getFileNameWithoutExtension(normalizedPath)
      const baseMeta = createEmptyMetaByType('single_image_meta') as unknown as ResourceMeta
      let fetchedPixivData: any = null

      if (shouldFetchPixivInfo && pixivId && pixivWebsiteId) {
        const fetchResult = await window.api.service.fetchResourceInfo(pixivWebsiteId, pixivId)
        if (fetchResult?.type === 'success' || fetchResult?.type === 'warning') {
          fetchedPixivData = fetchResult?.data ?? null
          if (fetchResult?.type === 'success') {
            pixivFetchedCount += 1
          }
        }
      }

      const payload: ResourceForm = {
        name: String(fetchedPixivData?.name ?? '').trim() || fileStem || getFileName(normalizedPath),
        description: '',
        coverPath: String(fetchedPixivData?.cover ?? '').trim() || normalizedPath,
        basePath: normalizedPath,
        author: String(fetchedPixivData?.author ?? '').trim(),
        actors: [],
        tags: Array.isArray(fetchedPixivData?.tag) ? fetchedPixivData.tag : [],
        types: Array.isArray(fetchedPixivData?.type) ? fetchedPixivData.type : [],
        categoryId: categoryInfo.value.id,
        meta: {
          ...baseMeta,
          pixivId,
          websiteType: pixivId ? pixivWebsiteId : '',
          gameId: pixivId,
          website: pixivId ? `https://www.pixiv.net/artworks/${pixivId}` : '',
          format: String(normalizedPath.match(/\.([^.\\/]+)$/)?.[1] ?? '').toLowerCase()
        }
      }

      const result = await window.api.service.saveResource(payload)
      if (result?.type === 'error') {
        failedCount += 1
      } else {
        successCount += 1
      }
    }

    const notifyType = failedCount > 0 && successCount === 0 ? 'error' : 'success'
    showNotifyByType(
      notifyType,
      '批量导入图片',
      `导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}${shouldFetchPixivInfo ? `，获取 Pixiv 信息 ${pixivFetchedCount}` : ''}`
    )

    if (successCount > 0) {
      await fetchData()
    }
  } catch (error) {
    showNotifyByType('error', '批量导入图片', error instanceof Error ? error.message : '批量导入图片失败')
  }
}

const buildBatchAudioResourcePayload = (filePath: string, analysis: any, coverPath: string, lyricsPath: string): ResourceForm => {
  const authorNames = normalizeAudioAuthorList([
    ...(Array.isArray(analysis?.artists) ? analysis.artists : []),
    String(analysis?.artist ?? '').trim()
  ])
  const artistDisplayName = joinAudioAuthorNames(authorNames) || String(analysis?.artist ?? '').trim()
  const fileStem = getFileNameWithoutExtension(filePath)
  const audioMetaBase = createEmptyMetaByType('audio_meta') as unknown as ResourceMeta

  return {
    name: String(analysis?.name ?? '').trim() || fileStem || getFileName(filePath),
    description: '',
    coverPath: String(coverPath ?? '').trim(),
    basePath: String(filePath ?? '').trim(),
    author: artistDisplayName,
    authors: authorNames,
    actors: [],
    tags: [],
    types: [],
    categoryId: categoryInfo.value.id,
    meta: {
      ...audioMetaBase,
      artist: artistDisplayName,
      album: String(analysis?.album ?? '').trim(),
      lyricsPath: String(lyricsPath ?? '').trim(),
      duration: Number.isFinite(Number(analysis?.duration)) ? Math.max(0, Math.floor(Number(analysis.duration))) : 0,
      bitrate: Number.isFinite(Number(analysis?.bitrate)) ? Number(analysis.bitrate) : null,
      sampleRate: Number.isFinite(Number(analysis?.sampleRate)) ? Number(analysis.sampleRate) : null
    }
  }
}

const runBatchImportAudioAssetBackfill = async (tasks: Array<{
  resourceId: string
  filePath: string
  analysis: any
  shouldFetchLyrics: boolean
  shouldFetchCover: boolean
}>) => {
  if (!tasks.length) {
    return {
      fetchedLyricsCount: 0,
      fetchedCoverCount: 0,
      failedLyricsCount: 0,
      failedCoverCount: 0
    }
  }

  let fetchedLyricsCount = 0
  let fetchedCoverCount = 0
  let failedLyricsCount = 0
  let failedCoverCount = 0

  for (const task of tasks) {
    const resourceId = String(task?.resourceId ?? '').trim()
    const filePath = String(task?.filePath ?? '').trim()
    const analysis = task?.analysis

    if (!resourceId || !filePath) {
      continue
    }

    try {
      const detailResult = await window.api.service.getResourceDetail(resourceId)
      const detail = detailResult?.data
      if (!detail) {
        logger.warn('batch import audio: backfill skipped missing detail', {
          resourceId,
          filePath
        })
        continue
      }

      const detailFormData = cloneFormData(mapResourceDetailToFormData(detail))
      let hasChanges = false

      if (task.shouldFetchLyrics && !String(detailFormData?.meta?.lyricsPath ?? '').trim()) {
        const lyricsResult = await fetchAudioLyricsSilently(buildAudioFetchPayload(filePath, analysis))
        logger.info('batch import audio: async fetch lyrics result', {
          resourceId,
          filePath,
          lyricsResult
        })
        if (lyricsResult?.type === 'success' && lyricsResult?.data?.lyricsPath) {
          detailFormData.meta = {
            ...(detailFormData.meta ?? {}),
            lyricsPath: String(lyricsResult.data.lyricsPath)
          }
          fetchedLyricsCount += 1
          hasChanges = true
        } else if (lyricsResult?.type === 'error') {
          failedLyricsCount += 1
        }
      }

      if (task.shouldFetchCover && !String(detailFormData?.coverPath ?? '').trim()) {
        const coverResult = await fetchAudioAlbumCoverSilently(buildAudioFetchPayload(filePath, analysis))
        logger.info('batch import audio: async fetch cover result', {
          resourceId,
          filePath,
          coverResult
        })
        if (coverResult?.type === 'success' && coverResult?.data?.coverPath) {
          detailFormData.coverPath = String(coverResult.data.coverPath)
          fetchedCoverCount += 1
          hasChanges = true
        } else if (coverResult?.type === 'error') {
          failedCoverCount += 1
        }
      }

      if (!hasChanges) {
        continue
      }

      syncAudioAuthorFields(detailFormData)
      detailFormData.categoryId = categoryInfo.value.id
      const updatePayload = cloneFormData(detailFormData)
      const updateResult = await window.api.service.updateResource(resourceId, updatePayload, {
        silent: true
      })
      logger.info('batch import audio: async update result', {
        resourceId,
        filePath,
        updateResult
      })
      if (updateResult?.type === 'error') {
        if (String(updatePayload?.meta?.lyricsPath ?? '').trim()) {
          failedLyricsCount += 1
        }
        if (String(updatePayload?.coverPath ?? '').trim()) {
          failedCoverCount += 1
        }
      }
    } catch (error) {
      logger.error('batch import audio: async asset backfill failed', {
        resourceId,
        filePath,
        error: error instanceof Error ? error.message : error
      })
      if (task.shouldFetchLyrics) {
        failedLyricsCount += 1
      }
      if (task.shouldFetchCover) {
        failedCoverCount += 1
      }
    }
  }

  return {
    fetchedLyricsCount,
    fetchedCoverCount,
    failedLyricsCount,
    failedCoverCount
  }
}

const handleBatchImportAudioFiles = async () => {
  try {
    const extensions = [...(categorySettings.value.extensions ?? [])]
    logger.info('batch import audio: selecting files', {
      categoryId: categoryId.value,
      extensions
    })
    const filePaths = await window.api.dialog.selectFiles(extensions)
    if (!Array.isArray(filePaths) || !filePaths.length) {
      logger.info('batch import audio: selection cancelled')
      return
    }

    logger.info('batch import audio: selected files', {
      count: filePaths.length,
      filePaths
    })

    const analyses = await Promise.all(filePaths.map(async (filePath) => ({
      filePath: String(filePath ?? '').trim(),
      analysis: await window.api.service.analyzeAudioFilePath(String(filePath ?? '').trim())
    })))

    const validItems = analyses.filter((item) => item.filePath && item.analysis)
    const invalidItems = analyses.filter((item) => !item.filePath || !item.analysis).map((item) => item.filePath)
    logger.info('batch import audio: analyses completed', {
      selectedCount: filePaths.length,
      validCount: validItems.length,
      invalidCount: invalidItems.length,
      invalidItems
    })
    const missingLyricsCount = validItems.filter((item) => !String(item.analysis?.lyricsPath ?? '').trim()).length
    const missingCoverCount = validItems.filter((item) => !String(item.analysis?.embeddedCoverPath ?? '').trim()).length

    const shouldFetchLyrics = missingLyricsCount > 0
      ? await confirmDialog('批量获取歌词', `有 ${missingLyricsCount} 首音乐未匹配到同名歌词文件，是否尝试自动获取歌词？`)
      : false
    const shouldFetchCover = missingCoverCount > 0
      ? await confirmDialog('批量获取封面', `有 ${missingCoverCount} 首音乐未检测到文件内嵌封面，是否尝试自动获取专辑封面？`)
      : false

    logger.info('batch import audio: fetch strategy decided', {
      missingLyricsCount,
      missingCoverCount,
      shouldFetchLyrics,
      shouldFetchCover
    })

    let successCount = 0
    let skippedCount = 0
    let failedCount = 0
    const backgroundAssetTasks: Array<{
      resourceId: string
      filePath: string
      analysis: any
      shouldFetchLyrics: boolean
      shouldFetchCover: boolean
    }> = []

    for (const item of validItems) {
      const filePath = item.filePath
      const analysis = item.analysis
      logger.info('batch import audio: processing item start', {
        filePath,
        title: String(analysis?.name ?? '').trim(),
        artist: String(analysis?.artist ?? '').trim(),
        album: String(analysis?.album ?? '').trim(),
        lyricsPath: String(analysis?.lyricsPath ?? '').trim(),
        embeddedCoverPath: String(analysis?.embeddedCoverPath ?? '').trim()
      })
      const existsResult = await window.api.service.checkResourceExistsByPath(filePath)
      logger.info('batch import audio: exists check result', {
        filePath,
        existsResult
      })
      if (existsResult?.exists) {
        skippedCount += 1
        logger.info('batch import audio: skipped existing resource', {
          filePath
        })
        continue
      }

      if (existsResult?.type === 'error') {
        failedCount += 1
        logger.error('batch import audio: exists check failed', {
          filePath,
          existsResult
        })
        continue
      }

      let lyricsPath = String(analysis?.lyricsPath ?? '').trim()
      let coverPath = String(analysis?.embeddedCoverPath ?? '').trim()
      const payload = buildBatchAudioResourcePayload(filePath, analysis, coverPath, lyricsPath)
      logger.info('batch import audio: save payload prepared', {
        filePath,
        payload: {
          name: payload.name,
          basePath: payload.basePath,
          author: payload.author,
          authors: payload.authors,
          coverPath: payload.coverPath,
          categoryId: payload.categoryId,
          meta: payload.meta
        }
      })
      const result = await window.api.service.saveResource(payload)
      logger.info('batch import audio: save result', {
        filePath,
        result
      })
      if (result?.type === 'error') {
        failedCount += 1
        logger.error('batch import audio: save failed', {
          filePath,
          result
        })
      } else {
        successCount += 1
        const savedResourceId = String(result?.data?.resourceId ?? '').trim()
        const needsLyricsBackfill = !lyricsPath && shouldFetchLyrics
        const needsCoverBackfill = !coverPath && shouldFetchCover
        if (savedResourceId && (needsLyricsBackfill || needsCoverBackfill)) {
          backgroundAssetTasks.push({
            resourceId: savedResourceId,
            filePath,
            analysis,
            shouldFetchLyrics: needsLyricsBackfill,
            shouldFetchCover: needsCoverBackfill
          })
          logger.info('batch import audio: queued async asset backfill', {
            resourceId: savedResourceId,
            filePath,
            needsLyricsBackfill,
            needsCoverBackfill
          })
        }
      }
    }

    logger.info('batch import audio: finished', {
      successCount,
      skippedCount,
      failedCount,
      queuedBackfillCount: backgroundAssetTasks.length
    })

    if (successCount > 0) {
      await fetchData()
    }

    const notifyType = failedCount > 0 && successCount === 0 ? 'error' : 'success'
    showNotifyByType(
      notifyType,
      '批量导入音乐',
      backgroundAssetTasks.length
        ? `导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}。歌词与封面正在后台获取。`
        : `导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`
    )

    if (backgroundAssetTasks.length) {
      void (async () => {
        const backfillResult = await runBatchImportAudioAssetBackfill(backgroundAssetTasks)
        logger.info('batch import audio: async asset backfill finished', backfillResult)
        if (backfillResult.fetchedLyricsCount > 0 || backfillResult.fetchedCoverCount > 0) {
          await fetchData()
        }
        showNotifyByType(
          backfillResult.failedLyricsCount > 0 || backfillResult.failedCoverCount > 0 ? 'warning' : 'success',
          '批量获取音乐资源',
          `后台处理完成：获取歌词 ${backfillResult.fetchedLyricsCount}，获取封面 ${backfillResult.fetchedCoverCount}${backfillResult.failedLyricsCount > 0 ? `，歌词失败 ${backfillResult.failedLyricsCount}` : ''}${backfillResult.failedCoverCount > 0 ? `，封面失败 ${backfillResult.failedCoverCount}` : ''}`
        )
      })()
    }
  } catch (error) {
    logger.error('batch import audio: fatal error', error)
    showNotifyByType('error', '批量导入音乐', error instanceof Error ? error.message : '批量导入音乐失败')
  }
}

const applyMultiImageDirectoryAnalysis = async (basePath: string) => {
  if (categorySettings.value.extendTable !== 'multi_image_meta') {
    return
  }

  try {
    const result = await window.api.service.analyzeMultiImageDirectory(basePath)
    const directoryName = String(result?.data?.directoryName ?? '').trim()
    const coverPath = String(result?.data?.coverPath ?? '').trim()

    if (directoryName) {
      formData.value.name = directoryName
    }

    if (coverPath) {
      formData.value.coverPath = coverPath
    } else {
      formData.value.coverPath = ''
    }
  } catch {
    formData.value.coverPath = ''
  }
}

const handleBatchImportMaskClick = () => {
  if (!batchProgressRunning.value) {
    return
  }

  handleBatchImportRunInBackground()
}

const handleBatchImportRunInBackground = () => {
  if (!batchProgressRunning.value) {
    return
  }

  batchAnalyzeInBackground.value = true
  batchAnalyzeToastDismissed.value = false
  showBatchImportLoading.value = false
  syncBatchImportOngoingCenter()
}

const handleReopenBatchImportProgress = () => {
  if (!batchProgressRunning.value) {
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
  if (!batchProgressRunning.value) {
    return
  }

  batchAnalyzeCancelled.value = true
  batchAnalyzeMessage.value = batchProgressStage.value === 'import' ? '正在停止导入，请稍候...' : '正在停止分析，请稍候...'
}

watch(
  [batchAnalyzeRunning, batchImportRunning, batchAnalyzeCurrent, batchAnalyzeTotal, batchAnalyzeMessage, batchAnalyzeInBackground],
  () => {
    if (batchProgressRunning.value) {
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

  resetBatchImportState(categoryId.value)
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
    checked: !item.exists && !item.errorMessage && isBatchImportItemImportable(item)
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
    checked: !item.exists && !item.errorMessage && isBatchImportItemImportable(item)
      ? !item.checked
      : false
  }))
}

const canToggleBatchImportItem = (item: any) =>
  !item?.exists && !item?.errorMessage && isBatchImportItemImportable(item)

const handleToggleBatchImportItem = (index: number) => {
  const item = batchImportItems.value[index]
  if (!canToggleBatchImportItem(item)) {
    return
  }

  batchImportItems.value[index].checked = !batchImportItems.value[index].checked
}

const handleConfirmBatchImport = () => {
  void (async () => {
    const targetCategoryId = categoryId.value
    const selectedItems = batchImportItems.value
      .filter((item) => item.checked && isBatchImportItemImportable(item))
      .map((item) => {
        if (detailIsManga.value) {
          return {
            directoryPath: item.directoryPath,
            fetchInfoEnabled: batchImportFetchInfoEnabled.value
          }
        }

        if (detailIsAsmr.value) {
          return {
            directoryPath: item.directoryPath,
            websiteType: item.websiteType,
            gameId: item.gameId,
            fetchInfoEnabled: batchImportFetchInfoEnabled.value
          }
        }

        return {
          directoryPath: item.directoryPath,
          launchFilePath: item.launchFilePath,
          websiteType: item.websiteType,
          gameId: item.gameId,
          fetchInfoEnabled: batchImportFetchInfoEnabled.value
        }
      })

    if (!selectedItems.length) {
      showNotifyByType('warning', '批量导入', '请至少选择一个可导入的目录')
      return
    }

    try {
      isBatchImportSubmitting.value = true
      patchBatchImportState(targetCategoryId, {
        importRunning: true,
        showLoading: true,
        showPreview: false,
        analyzeTotal: selectedItems.length,
        analyzeCurrent: 0,
        analyzeMessage: '正在准备导入，请稍候...',
        analyzeInBackground: false,
        analyzeToastDismissed: false
      })
      syncBatchImportOngoingCenter(targetCategoryId)

      const result = detailIsManga.value
        ? await window.api.service.importBatchMultiImageDirectories(targetCategoryId, selectedItems)
        : detailIsAsmr.value
          ? await window.api.service.importBatchAsmrDirectories(targetCategoryId, selectedItems)
          : await window.api.service.importBatchGameDirectories(targetCategoryId, selectedItems)
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '批量导入完成'
      const resultItems = Array.isArray(result?.data) ? result.data : []

      if (resultItems.length) {
        const resultMap = new Map<string, any>(
          resultItems.map((item: any) => [
            detailIsManga.value || detailIsAsmr.value
              ? String(item?.directoryPath ?? '').trim()
              : `${String(item?.directoryPath ?? '').trim()}::${String(item?.launchFilePath ?? '').trim()}`,
            item
          ])
        )

        batchImportItems.value = batchImportItems.value.map((item) => {
          const matchedResult = resultMap.get(
            detailIsManga.value || detailIsAsmr.value
              ? String(item?.directoryPath ?? '').trim()
              : `${String(item?.directoryPath ?? '').trim()}::${String(item?.launchFilePath ?? '').trim()}`
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
      patchBatchImportState(targetCategoryId, {
        importRunning: false,
        showLoading: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false
      })
      clearBatchImportOngoingCenter(targetCategoryId)
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
  syncAudioAuthorFields(formData.value)
  const payload = cloneFormData(formData.value)
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
    applyDefaultPathName(droppedPath)
    await applyAudioPathAnalysis(droppedPath)
    await applyAudioCoverAnalysis()
    await applyGamePathAnalysis(droppedPath)
    await applyMultiImageDirectoryAnalysis(droppedPath)
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
  syncAudioAuthorFields(formData.value)
  const payload = cloneFormData(formData.value)
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

  if (/^(?:https?:|data:|file:|\/|[a-zA-Z]:[\\/])/.test(icon)) {
    return icon
  }

  return engineIconUrlByName.get(icon) ?? icon
}

const resolveStoreIcon = (icon: string) => {
  if (!icon) {
    return ''
  }

  if (/^(?:https?:|data:|file:|\/|[a-zA-Z]:[\\/])/.test(icon)) {
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
      applyDefaultPathName(resourcePath)
      await applyAudioPathAnalysis(resourcePath)
        await applyAudioCoverAnalysis()
      await applyGamePathAnalysis(resourcePath)
      await applyMultiImageDirectoryAnalysis(resourcePath)
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

const appendBatchLabelValues = (input: string) => {
  const items = splitManualValues(input)
  if (!items.length) {
    return
  }

  batchLabelValues.value = normalizeSelectedValues([
    ...batchLabelValues.value,
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

const handleBatchLabelInputCommit = () => {
  appendBatchLabelValues(batchLabelInputValue.value)
  batchLabelInputValue.value = ''
}

const handleBatchLabelInputKeydown = (event: KeyboardEvent) => {
  if (![' ', ',', '，', '、', 'Enter'].includes(event.key)) {
    return
  }

  event.preventDefault()
  const target = event.target as HTMLInputElement | null
  if (target) {
    target.value = ''
  }

  handleBatchLabelInputCommit()
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

const handleBatchLabelSearch = (value: string) => {
  batchLabelInputValue.value = value
}

const handleFetchGameInfo = async () => {
  if (fetchResourceInfoLoading.value) {
    return
  }

  fetchResourceInfoLoading.value = true

  try {
    const extendTable = String(categorySettings.value.extendTable ?? '').trim()
    let websiteId = String(formData.value?.meta?.websiteType ?? '').trim()

    if (extendTable === 'single_image_meta') {
      const imageSiteOptions = await window.api.db.getSelectDictData(DictType.IMAGE_SITE_TYPE)
      websiteId = String(
        imageSiteOptions.find((item: any) => String(item?.label ?? '').trim().toLowerCase() === 'pixiv')?.value ?? ''
      ).trim()
    }

    const gameId = extendTable === 'single_image_meta'
      ? String(formData.value?.meta?.pixivId ?? '').trim()
      : String(formData.value?.meta?.gameId ?? '').trim()

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

    if (extendTable === 'asmr_meta' && data.cv) {
      formData.value.actors = normalizeSelectedValues([
        ...(formData.value.actors ?? []),
        ...String(data.cv).split(/[\/,、，]/)
      ])
    }

    if (extendTable === 'asmr_meta' && data.scenario) {
      formData.value.meta.scenario = String(data.scenario)
    }

    if (extendTable === 'asmr_meta' && data.illust) {
      formData.value.meta.illust = String(data.illust)
    }

    if (extendTable === 'multi_image_meta' && data.translator) {
      formData.value.meta.translator = data.translator
    }

    if (data.cover && extendTable !== 'multi_image_meta') {
      formData.value.coverPath = data.cover
    }

    if (data.website) {
      formData.value.meta.website = data.website
    }

    if (extendTable === 'single_image_meta' && !String(formData.value?.meta?.source ?? '').trim()) {
      formData.value.meta.source = 'Pixiv'
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
  } finally {
    fetchResourceInfoLoading.value = false
  }
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
  if (isSingleImageCategory.value) {
    await handlePreviewSingleImageResource(resource)
    return
  }

  if (detailIsManga.value) {
    await openComicReader(resource)
    return
  }

  if (detailIsAsmr.value) {
    await openAsmrPlaybackFromLaunch(resource)
    return
  }

  if (detailIsAudio.value) {
    await openAudioPlaybackFromLaunch(resource)
    return
  }

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

const handlePreviewSingleImageResource = async (resource: any) => {
  const resourceId = String(resource?.id ?? '').trim()
  const fallbackPath = getResourceFilePath(resource)

  if (!resourceId && !fallbackPath) {
    showNotifyByType('warning', '查看图片', '当前图片路径无效')
    return
  }

  try {
    const pageSize = Math.max(totalResources.value, resourceList.value.length, 1)
    const result = await window.api.db.getResourceByCategoryId(categoryId.value, {
      page: 1,
      pageSize,
      sortBy: sortBy.value,
    })
    const allResources = Array.isArray(result?.items) && result.items.length ? result.items : resourceList.value
    const imageResources = allResources.filter((item: any) => !item?.missingStatus && getResourceFilePath(item))
    const imagePaths = imageResources.map((item: any) => getResourceFilePath(item))

    if (!imagePaths.length) {
      showNotifyByType('warning', '查看图片', '当前分类下没有可预览的图片')
      return
    }

    let initialIndex = imageResources.findIndex((item: any) => String(item?.id ?? '').trim() === resourceId)
    if (initialIndex < 0 && fallbackPath) {
      initialIndex = imagePaths.findIndex((filePath) => filePath === fallbackPath)
    }

    pictureViewerImagePaths.value = imagePaths
    pictureViewerInitialIndex.value = Math.max(0, initialIndex)
    pictureViewerAllowDelete.value = false
    await loadPictureViewerScrollMode()
    showPictureViewer.value = true
  } catch (error) {
    showNotifyByType('error', '查看图片', error instanceof Error ? error.message : '打开图片预览失败')
  }
}

const handleStopResource = async (resource: any) => {
  try {
    if (['asmr_meta', 'audio_meta'].includes(String(categorySettings.value.extendTable ?? '').trim())) {
      const stopControl = audioPlayerStore.controls.value.stop
      if (stopControl) {
        await Promise.resolve(stopControl())
      } else {
        await window.api.service.stopAsmrPlayback(String(resource?.id ?? ''))
      }
      setAudioPlayerVisible(false)
      showNotifyByType('success', '停止资源', `已停止${resource?.title ?? categoryName.value}`)
      await fetchData()
      return
    }

    const result = await window.api.service.stopResource(String(resource?.id ?? ''))
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? `已停止${resource?.title ?? categoryName.value}`

    showNotifyByType(resultType, '停止资源', resultMessage)

    if (resultType !== 'error') {
      if (String(resource?.id ?? '') === String(currentComicReaderResourceId.value ?? '')) {
        currentComicReaderResourceId.value = ''
        showComicReader.value = false
      }
      await fetchData()
    }
  } catch (error) {
    showNotifyByType('error', '停止失败', error instanceof Error ? error.message : '停止资源失败')
  }
}

const handleZoneLaunchResource = (resource: any) => {
  void (async () => {
    if (!canZoneLaunch.value) {
      showNotifyByType('warning', '转区启动', '请先在设置中配置 LE 转区工具路径')
      return
    }

    try {
      const result = await window.api.service.launchResourceWithLocaleEmulator(
        String(resource?.id ?? ''),
        String(resource?.basePath ?? ''),
        String(resource?.fileName ?? resource?.filename ?? '') || undefined
      )
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? `已通过 LE 转区启动“${resource?.title ?? categoryName.value}”`

      showNotifyByType(resultType, '转区启动', resultMessage)

      if (resultType !== 'error') {
        await fetchData()
      }
    } catch (error) {
      showNotifyByType('error', '转区启动', error instanceof Error ? error.message : 'LE 转区启动失败')
    }
  })()
}

const handleMtoolLaunchResource = async (resource: any) => {
  if (!canMtoolLaunch.value) {
    showNotifyByType('warning', 'MTool 启动', '请先在设置中配置 MTool 路径')
    return
  }

  try {
    const result = await window.api.service.launchResourceWithMtool(
      String(resource?.id ?? ''),
      String(resource?.basePath ?? ''),
      String(resource?.fileName ?? resource?.filename ?? '') || undefined
    )
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? `已通过 MTool 启动“${resource?.title ?? categoryName.value}”`

    showNotifyByType(resultType, 'MTool 启动', resultMessage)

    if (resultType !== 'error') {
      await fetchData()
    }
  } catch (error) {
    showNotifyByType('error', 'MTool 启动', error instanceof Error ? error.message : '通过 MTool 启动失败')
  }
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
    closeDetailAudioContextMenu()
    showPictureViewer.value = false
    showComicReader.value = false
    visibleLogCount.value = 5
    currentScreenshotIndex.value = 0

    if (detailIsAudio.value) {
      const detailResourceId = String(selectedDetailResource.value?.id ?? '')
      const detailBasePath = getResourceFilePath(selectedDetailResource.value)
      if (detailResourceId && detailBasePath) {
        try {
          const analysis = await window.api.service.analyzeAudioFilePath(detailBasePath)
          if (analysis && detailResourceId === String(selectedDetailResource.value?.id ?? '')) {
            selectedDetailResource.value = {
              ...selectedDetailResource.value,
              audioMeta: {
                ...(selectedDetailResource.value?.audioMeta ?? {}),
                duration: analysis.duration ?? selectedDetailResource.value?.audioMeta?.duration,
                bitrate: analysis.bitrate ?? selectedDetailResource.value?.audioMeta?.bitrate ?? null,
                sampleRate: analysis.sampleRate ?? selectedDetailResource.value?.audioMeta?.sampleRate ?? null
              }
            }
          }
        } catch {
          // ignore detail audio analysis errors
        }
      }
    }

    await refreshDetailScreenshots(0)
    await refreshDetailAudioTree()
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

  if (detailIsManga.value) {
    await openComicReader(selectedDetailResource.value, currentScreenshotIndex.value)
    return
  }

  pictureViewerImagePaths.value = [...detailScreenshotPaths.value]
  pictureViewerInitialIndex.value = currentScreenshotIndex.value
  pictureViewerAllowDelete.value = !detailIsManga.value
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

const handleDefaultAppPlayResource = async (resource: any) => {
  const targetPath = getResourceFilePath(resource)
  await handleOpenPathWithDefaultApp(targetPath, '使用默认应用播放')
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

  if (detailIsManga.value) {
    await handleOpenDetailResourcePath()
    await refreshDetailScreenshots()
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
      `确认删除“${resourceTitle}”吗？\n\n这只会删除数据库记录，不会删除本地文件。\n\n此操作仍然有风险，是否继续？`
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
    return
  }

  selectedResourceIds.value = [...selectedResourceIds.value, resourceId]
}

const handleBatchSelectionAction = () => {
  if (resourceSelectionMode.value) {
    if (!selectedResourceCount.value) {
      handleExitSelectionMode()
      return
    }

    handleDeleteSelectedResources()
    return
  }

  if (!selectedResourceCount.value) {
    selectionModeManuallyEnabled.value = true
    return
  }
}

const handleDeleteResourceFiles = (resource: any) => {
  void (async () => {
    const resourceTitle = resource?.title ?? categoryName.value
    const targetDirectory = String(resource?.basePath ?? '').trim()
    const confirmed = await confirmDialog(
      `删除${categoryName.value}文件`,
      `高危操作：将会删除“${resourceTitle}”对应目录下的所有文件，并同步删除数据库记录。\n\n目标目录：${targetDirectory || '未知'}\n\n此操作不可恢复，请确认目录无误后再继续。`
    )

    if (!confirmed) {
      return
    }

    try {
      const result = await window.api.service.deleteResourceWithFiles(String(resource?.id ?? ''))
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '操作完成'

      showNotifyByType(resultType, `删除${categoryName.value}文件`, resultMessage)
      if (resultType === 'success' || resultType === 'warning') {
        await fetchData()
      }
    } catch (error) {
      showNotifyByType('error', `删除${categoryName.value}文件`, error instanceof Error ? error.message : '删除失败')
    }
  })()
}

const handleAdminLaunchResource = async (resource: any) => {
  try {
    const result = await window.api.service.launchResourceAsAdmin(
      String(resource?.id ?? ''),
      String(resource?.basePath ?? ''),
      String(resource?.fileName ?? resource?.filename ?? '') || undefined
    )
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? `已请求以管理员身份运行“${resource?.title ?? categoryName.value}”`

    showNotifyByType(resultType, '以管理员身份运行', resultMessage)

    if (resultType !== 'error') {
      await fetchData()
    }
  } catch (error) {
    showNotifyByType('error', '以管理员身份运行', error instanceof Error ? error.message : '以管理员身份运行失败')
  }
}

const handleToggleSelectionMode = () => {
  if (resourceSelectionMode.value) {
    handleExitSelectionMode()
    return
  }

  selectionModeManuallyEnabled.value = true
}

const BATCH_ANALYZE_CONCURRENCY = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 2 || 2))

function syncBatchImportRefsFromState(targetCategoryId: string) {
  const state = ensureBatchImportState(targetCategoryId)
  batchImportItems.value = Array.isArray(state.items) ? state.items : []
  batchImportFetchInfoEnabled.value = state.fetchInfoEnabled !== false
  batchAnalyzeCurrent.value = state.analyzeCurrent
  batchAnalyzeTotal.value = state.analyzeTotal
  batchAnalyzeMessage.value = state.analyzeMessage
  batchAnalyzeRunning.value = state.analyzeRunning
  batchImportRunning.value = state.importRunning
  batchAnalyzeCancelled.value = state.analyzeCancelled
  batchAnalyzeInBackground.value = state.analyzeInBackground
  batchAnalyzeToastDismissed.value = state.analyzeToastDismissed
  showBatchImportLoading.value = state.showLoading
  showBatchImportModal.value = state.showPreview
}

function syncBatchImportStateFromRefs(targetCategoryId: string) {
  if (!targetCategoryId) {
    return
  }

  batchImportStateStore[targetCategoryId] = {
    items: batchImportItems.value,
    fetchInfoEnabled: batchImportFetchInfoEnabled.value,
    analyzeCurrent: batchAnalyzeCurrent.value,
    analyzeTotal: batchAnalyzeTotal.value,
    analyzeMessage: batchAnalyzeMessage.value,
    analyzeRunning: batchAnalyzeRunning.value,
    importRunning: batchImportRunning.value,
    analyzeCancelled: batchAnalyzeCancelled.value,
    analyzeInBackground: batchAnalyzeInBackground.value,
    analyzeToastDismissed: batchAnalyzeToastDismissed.value,
    showLoading: showBatchImportLoading.value,
    showPreview: showBatchImportModal.value
  }
}

function patchBatchImportState(targetCategoryId: string, patch: Partial<BatchImportState>) {
  const currentState = ensureBatchImportState(targetCategoryId)
  batchImportStateStore[targetCategoryId] = {
    ...currentState,
    ...patch
  }

  if (targetCategoryId === categoryId.value) {
    syncBatchImportRefsFromState(targetCategoryId)
  }
}

function resetBatchImportState(targetCategoryId: string) {
  batchImportStateStore[targetCategoryId] = createBatchImportState()

  if (targetCategoryId === categoryId.value) {
    syncBatchImportRefsFromState(targetCategoryId)
  }
}

const analyzeBatchImportDirectories = async (targetCategoryId: string, directoryPaths: string[]) => {
  const items: any[] = new Array(directoryPaths.length)
  let nextIndex = 0
  let completedCount = 0

  const updateAnalyzeProgress = (directoryPath?: string, index?: number) => {
    const currentDirectoryName = getResourceNameFromBasePath(directoryPath || '') || directoryPath || '正在准备分析目录'
    const currentIndex = typeof index === 'number'
      ? Math.min(directoryPaths.length, index + 1)
      : Math.min(directoryPaths.length, completedCount + 1)

    patchBatchImportState(targetCategoryId, {
      analyzeCurrent: completedCount,
      analyzeMessage: `正在分析第 ${currentIndex} / ${directoryPaths.length} 个目录\n${currentDirectoryName}`
    })
    syncBatchImportOngoingCenter()
  }

  const worker = async () => {
    while (!ensureBatchImportState(targetCategoryId).analyzeCancelled) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= directoryPaths.length) {
        return
      }

      const directoryPath = directoryPaths[currentIndex]
      const directoryName = getResourceNameFromBasePath(directoryPath)
      updateAnalyzeProgress(directoryName || directoryPath, currentIndex)

      try {
        const analysis = await window.api.service.analyzeGameDirectory(directoryPath)
        items[currentIndex] = await enrichBatchImportItem({
          ...analysis,
          checked: !analysis?.exists && !analysis?.errorMessage && !!analysis?.launchFilePath
        })
      } catch (error) {
        items[currentIndex] = {
          directoryPath,
          directoryName,
          launchFilePath: '',
          launchFileName: '',
          exists: false,
          checked: false,
          errorMessage: error instanceof Error ? error.message : '分析失败'
        }
      } finally {
        completedCount += 1
        patchBatchImportState(targetCategoryId, {
          analyzeCurrent: completedCount
        })
        syncBatchImportOngoingCenter()
      }
    }
  }

  const workerCount = Math.min(directoryPaths.length, BATCH_ANALYZE_CONCURRENCY)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return items.filter(Boolean)
}

const getBatchProgressDirectoryName = () => {
  const [, secondLine] = String(batchAnalyzeMessage.value ?? '').split('\n')
  return getResourceNameFromBasePath(secondLine || batchAnalyzeMessage.value || '')
    || secondLine
    || batchAnalyzeMessage.value
    || '正在准备分析目录'
}

const handleExitSelectionMode = () => {
  selectionModeManuallyEnabled.value = false
  selectedResourceIds.value = []
}

const resetBatchLabelDialog = () => {
  batchLabelValues.value = []
  batchLabelSingleValue.value = ''
  batchLabelInputValue.value = ''
  isBatchLabelSubmitting.value = false
}

const openBatchLabelDialog = (field: 'tags' | 'types' | 'authors' | 'album', mode: 'add' | 'remove') => {
  if (!selectedResourceCount.value) {
    showNotifyByType('warning', '批量编辑', `请先选择需要批量修改的${categoryName.value}`)
    return
  }

  batchLabelField.value = field
  batchLabelMode.value = mode
  resetBatchLabelDialog()
  showBatchLabelModal.value = true
}

const closeBatchLabelDialog = () => {
  showBatchLabelModal.value = false
  resetBatchLabelDialog()
}

const handleBatchLabelValuesChange = (values: string[]) => {
  batchLabelValues.value = normalizeSelectedValues(values)
}

const handleBatchLabelSingleValueChange = (value: string | null) => {
  batchLabelSingleValue.value = String(value ?? '').trim()
}

const handleSubmitBatchLabelAction = async () => {
  if (!selectedResourceIds.value.length) {
    showNotifyByType('warning', batchLabelTitle.value, `请先选择需要批量修改的${categoryName.value}`)
    return
  }

  const selectedBatchValues = batchLabelIsSingleValue.value
    ? (batchLabelSingleValue.value ? [batchLabelSingleValue.value] : [])
    : batchLabelValues.value

  if (!selectedBatchValues.length) {
    const message = batchLabelField.value === 'tags'
      ? '请先选择或输入标签'
      : batchLabelField.value === 'types'
        ? '请先选择或输入分类'
        : batchLabelField.value === 'authors'
          ? '请先选择或输入歌手'
          : '请先选择或输入专辑'
    showNotifyByType('warning', batchLabelTitle.value, message)
    return
  }

  try {
    isBatchLabelSubmitting.value = true

    if (batchLabelField.value === 'tags' || batchLabelField.value === 'types') {
      const result = await window.api.service.batchUpdateResourceLabels(
        [...selectedResourceIds.value],
        batchLabelField.value,
        batchLabelMode.value,
        [...selectedBatchValues]
      )
      const resultType = result?.type ?? 'info'
      const affectedCount = Number(result?.data?.affectedIds?.length ?? 0)
      const valueNames = selectedBatchValues.join('、')
      const resultMessage = typeof result?.message === 'string' && result.message
        ? buildBatchLabelResultMessage({
            field: batchLabelField.value,
            mode: batchLabelMode.value,
            categoryName: categoryName.value,
            affectedCount,
            valueNames,
            fallbackMessage: result.message
          })
        : `${batchLabelTitle.value}完成`

      showNotifyByType(resultType, batchLabelTitle.value, resultMessage)

      if (resultType !== 'error') {
        closeBatchLabelDialog()
        await fetchData()
      }
      return
    }

    let successCount = 0
    let skippedCount = 0
    let failedCount = 0
    const selectedIds = [...selectedResourceIds.value].map((id) => String(id ?? '').trim()).filter(Boolean)
    const selectedValueSet = new Set(selectedBatchValues.map((value) => String(value ?? '').trim()).filter(Boolean))

    for (const resourceId of selectedIds) {
      try {
        const detailResult = await window.api.service.getResourceDetail(resourceId)
        const detail = detailResult?.data
        if (!detail) {
          skippedCount += 1
          continue
        }

        const detailFormData = cloneFormData(mapResourceDetailToFormData(detail))
        let changed = false

        if (batchLabelField.value === 'authors') {
          const currentAuthors = normalizeAudioAuthorList(Array.isArray(detailFormData?.authors) ? detailFormData.authors : [])
          const nextAuthors = batchLabelMode.value === 'add'
            ? normalizeAudioAuthorList([...currentAuthors, ...selectedBatchValues])
            : currentAuthors.filter((name) => !selectedValueSet.has(String(name ?? '').trim()))

          if (nextAuthors.join('\u0000') === currentAuthors.join('\u0000')) {
            skippedCount += 1
            continue
          }

          syncAudioAuthorFields(detailFormData, nextAuthors)
          changed = true
        } else if (batchLabelField.value === 'album') {
          const currentAlbum = String(detailFormData?.meta?.album ?? '').trim()
          const nextAlbum = batchLabelMode.value === 'add'
            ? String(selectedBatchValues[0] ?? '').trim()
            : (selectedValueSet.has(currentAlbum) ? '' : currentAlbum)

          if (nextAlbum === currentAlbum) {
            skippedCount += 1
            continue
          }

          detailFormData.meta = {
            ...(detailFormData.meta ?? {}),
            album: nextAlbum
          }
          changed = true
        }

        if (!changed) {
          skippedCount += 1
          continue
        }

        detailFormData.categoryId = categoryInfo.value.id
        const updatePayload = cloneFormData(detailFormData)
        const updateResult = await window.api.service.updateResource(resourceId, updatePayload)
        if (updateResult?.type === 'error') {
          failedCount += 1
          continue
        }

        successCount += 1
      } catch {
        failedCount += 1
      }
    }

    const title = batchLabelTitle.value
    const message = buildBatchMetadataResultMessage({
      field: batchLabelField.value,
      mode: batchLabelMode.value,
      categoryName: categoryName.value,
      successCount,
      skippedCount,
      failedCount,
      valueNames: selectedBatchValues.join('、')
    })

    showNotifyByType(failedCount > 0 ? 'warning' : 'success', title, message)

    if (successCount > 0) {
      closeBatchLabelDialog()
      await fetchData()
    }
  } catch (error) {
    showNotifyByType('error', batchLabelTitle.value, error instanceof Error ? error.message : `${batchLabelTitle.value}失败`)
  } finally {
    isBatchLabelSubmitting.value = false
  }
}

const buildBatchLabelResultMessage = (params: {
  field: 'tags' | 'types'
  mode: 'add' | 'remove'
  categoryName: string
  affectedCount: number
  valueNames: string
  fallbackMessage: string
}) => {
  const { field, mode, categoryName, affectedCount, valueNames, fallbackMessage } = params
  const normalizedCategoryName = String(categoryName ?? '').trim() || '资源'
  const normalizedValueNames = String(valueNames ?? '').trim()

  if (!normalizedValueNames) {
    return fallbackMessage
  }

  if (field === 'tags') {
    return `已批量${mode === 'add' ? '添加' : '移除'}${affectedCount}个${normalizedCategoryName}的${normalizedValueNames}标签`
  }

  return `已批量${mode === 'add' ? '添加' : '移除'}${affectedCount}个${normalizedCategoryName}的${normalizedValueNames}分类`
}

const buildBatchMetadataResultMessage = (params: {
  field: 'authors' | 'album'
  mode: 'add' | 'remove'
  categoryName: string
  successCount: number
  skippedCount: number
  failedCount: number
  valueNames: string
}) => {
  const { field, mode, categoryName, successCount, skippedCount, failedCount, valueNames } = params
  const normalizedCategoryName = String(categoryName ?? '').trim() || '资源'
  const fieldLabel = field === 'authors' ? '歌手' : '专辑'
  const valueLabel = String(valueNames ?? '').trim()
  const actionLabel = mode === 'add' ? '添加' : '移除'
  const suffix = valueLabel ? `：${valueLabel}` : ''

  return `批量${actionLabel}${fieldLabel}完成，成功 ${successCount} 个，跳过 ${skippedCount} 个，失败 ${failedCount} 个${suffix}。涉及 ${normalizedCategoryName}。`
}

const handleSelectAllResources = () => {
  const selectedSet = new Set(selectedResourceIds.value)
  for (const resourceId of currentPageResourceIds.value) {
    selectedSet.add(resourceId)
  }
  selectedResourceIds.value = [...selectedSet]
}

const handleDeselectAllResources = () => {
  selectedResourceIds.value = []
}

const handleInvertSelectedResources = () => {
  const selectedSet = new Set(selectedResourceIds.value)
  for (const resourceId of currentPageResourceIds.value) {
    if (selectedSet.has(resourceId)) {
      selectedSet.delete(resourceId)
    } else {
      selectedSet.add(resourceId)
    }
  }
  selectedResourceIds.value = [...selectedSet]
}

const handleBatchFetchAlbumCover = async () => {
  if (!isAudioCategory.value) {
    return
  }

  if (!selectedResourceIds.value.length) {
    showNotifyByType('warning', '批量获取封面', `请先选择需要获取封面的${categoryName.value}`)
    return
  }

  const selectedIds = [...selectedResourceIds.value].map((id) => String(id ?? '').trim()).filter(Boolean)

  if (!selectedIds.length) {
    showNotifyByType('warning', '批量获取封面', `未找到已选中的${categoryName.value}`)
    return
  }

  try {
    isBatchFetchingAlbumCover.value = true
    logger.info('batch fetch album cover: start', {
      categoryId: categoryId.value,
      resourceIds: selectedIds,
      count: selectedIds.length
    })

    let successCount = 0
    let skippedCount = 0
    let failedCount = 0

    for (const resourceId of selectedIds) {
      let resourceName = ''
      try {
        const detailResult = await window.api.service.getResourceDetail(resourceId)
        const detail = detailResult?.data
        resourceName = String(detail?.title ?? '').trim()

        if (!detail) {
          skippedCount += 1
          logger.warn('batch fetch album cover: missing detail', {
            resourceId,
            resourceName
          })
          continue
        }

        const basePath = getResourceFilePath(detail)
        if (!basePath) {
          skippedCount += 1
          logger.warn('batch fetch album cover: skip invalid resource', {
            resourceId,
            resourceName,
            basePath
          })
          continue
        }

        const detailFormData = cloneFormData(mapResourceDetailToFormData(detail))
        const payload = {
          basePath,
          title: String(detail?.title ?? resourceName),
          album: String(detail?.audioMeta?.album ?? '').trim(),
          artist: joinAudioAuthorNames(
            Array.isArray(detailFormData?.authors) ? detailFormData.authors : []
          ) || String(detailFormData?.author ?? '').trim(),
          artists: normalizeAudioAuthorList([
            ...(Array.isArray(detailFormData?.authors) ? detailFormData.authors : []),
            String(detailFormData?.author ?? '').trim()
          ])
        }

        logger.info('batch fetch album cover: request', {
          resourceId,
          resourceName,
          payload
        })

        const coverResult = await fetchAudioAlbumCoverSilently(payload)
        if (coverResult?.type !== 'success' || !coverResult?.data?.coverPath) {
          skippedCount += 1
          logger.warn('batch fetch album cover: no cover result', {
            resourceId,
            resourceName,
            result: coverResult
          })
          continue
        }

        detailFormData.coverPath = String(coverResult.data.coverPath)
        syncAudioAuthorFields(detailFormData)
        detailFormData.categoryId = categoryInfo.value.id

        const updatePayload = cloneFormData(detailFormData)
        const updateResult = await window.api.service.updateResource(resourceId, updatePayload)
        if (updateResult?.type === 'error') {
          failedCount += 1
          logger.error('batch fetch album cover: update failed', {
            resourceId,
            resourceName,
            result: updateResult
          })
          continue
        }

        successCount += 1
        logger.info('batch fetch album cover: success', {
          resourceId,
          resourceName,
          coverPath: detailFormData.coverPath
        })
      } catch (error) {
        failedCount += 1
        logger.error('batch fetch album cover: unexpected failure', {
          resourceId,
          resourceName,
          error: error instanceof Error ? error.message : error
        })
      }
    }

    logger.info('batch fetch album cover: completed', {
      successCount,
      skippedCount,
      failedCount
    })

    if (successCount > 0) {
      await fetchData()
    }

    if (successCount > 0 && failedCount === 0 && skippedCount === 0) {
      showNotifyByType('success', '批量获取封面', `已为 ${successCount} 个${categoryName.value}获取专辑封面`)
      return
    }

    showNotifyByType(
      failedCount > 0 ? 'warning' : 'info',
      '批量获取封面',
      `批量获取封面完成：成功 ${successCount} 个，跳过 ${skippedCount} 个，失败 ${failedCount} 个`
    )
  } catch (error) {
    logger.error('batch fetch album cover: fatal error', error)
    showNotifyByType('error', '批量获取封面', error instanceof Error ? error.message : '批量获取封面失败')
  } finally {
    isBatchFetchingAlbumCover.value = false
  }
}

const handleDeleteSelectedResources = () => {
  void (async () => {
    if (!selectedResourceIds.value.length) {
      return
    }

    const selectedResources = resourceList.value.filter((item) =>
      selectedResourceIds.value.includes(String(item?.id ?? ''))
    )
    const runningCount = selectedResources.filter((item) => item?.isRunning).length

    const confirmed = await confirmDialog(
      `批量删除${categoryName.value}`,
      runningCount > 0
        ? `确认删除选中的 ${selectedResourceIds.value.length} 个${categoryName.value}吗？其中 ${runningCount} 个正在运行，将在真正删除时自动跳过。`
        : `确认删除选中的 ${selectedResourceIds.value.length} 个${categoryName.value}吗？`
    )

    if (!confirmed) {
      return
    }

    try {
      isBatchDeleting.value = true
      const result = await window.api.service.deleteResources([...selectedResourceIds.value])
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '批量删除完成'

      showNotifyByType(resultType, `批量删除${categoryName.value}`, resultMessage)
      await fetchData()
      selectedResourceIds.value = []
      selectionModeManuallyEnabled.value = false
    } catch (error) {
      showNotifyByType('error', `批量删除${categoryName.value}`, error instanceof Error ? error.message : '批量删除失败')
    } finally {
      isBatchDeleting.value = false
    }
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

const refreshDetailScreenshots = async (
  nextIndex: number = currentScreenshotIndex.value,
  targetResource: any = selectedDetailResource.value
) => {
  try {
    if (detailIsManga.value) {
      detailScreenshotPaths.value = await window.api.dialog.getDirectoryImages(String(targetResource?.basePath ?? ''))
    } else {
      detailScreenshotPaths.value = await window.api.dialog.getScreenshotImages(String(targetResource?.id ?? ''))
    }
  } catch {
    detailScreenshotPaths.value = []
  }

  if (!detailScreenshotPaths.value.length) {
    currentScreenshotIndex.value = 0
    showPictureViewer.value = false
    showComicReader.value = false
    return
  }

  currentScreenshotIndex.value = Math.min(
    Math.max(0, nextIndex),
    Math.max(0, detailScreenshotPaths.value.length - 1)
  )
}

const refreshDetailAudioTree = async (targetResource: any = selectedDetailResource.value) => {
  if (!detailIsAsmr.value) {
    detailAudioTree.value = []
    return
  }

  try {
    detailAudioTree.value = await window.api.dialog.getDirectoryAudioTree(String(targetResource?.basePath ?? ''))
  } catch {
    detailAudioTree.value = []
  }
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
            <div v-if="isAudioCategory" class="filter-section">
              <n-divider title-placement="left" style="margin-bottom: 5px;">专辑筛选</n-divider>
              <n-input
                v-model:value="albumSearch"
                placeholder="请输入专辑名称"
                class="album-search"
                clearable
              />
              <n-checkbox-group v-model:value="selectedAlbumList" class="filter-group">
                <n-flex vertical class="filter-list">
                  <n-checkbox v-for="album in filteredAlbumList" :key="album.name" :value="album.name">
                    {{ album.name }}
                    <n-tag type="success" :bordered="false" round size="small">{{ album.count }}</n-tag>
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
            <div v-if="!detailIsAsmr" class="filter-section">
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
          <div class="detail-header__search">
            <n-input
              v-model:value="keyword"
              clearable
              placeholder="按名称搜索"
            >
              <template #prefix>
                <n-icon :component="SearchOutline" />
              </template>
            </n-input>
          </div>
          <div class="detail-header__actions">
            <n-space :size="12">
              <n-button
                :type="resourceSelectionMode ? 'warning' : 'default'"
                @click="handleToggleSelectionMode"
              >
                {{ resourceSelectionMode ? '退出多选' : '多选模式' }}
              </n-button>
              <n-button v-if="showBatchImportButton" @click="handleBatchImportClick">
                批量导入
              </n-button>
              <n-button type="primary" :disabled="currentCategoryBatchInBackground" @click="handleAddResource">
                添加{{ categoryName ?? '资源' }}
              </n-button>
            </n-space>
          </div>
        </div>

        <div
          v-if="resourceSelectionMode"
          class="detail-selection-bar"
          :style="headerStyle"
        >
          <div class="detail-selection-bar__meta" :style="titleMetaStyle">
            已选择 {{ selectedResourceCount }} 个{{ categoryName ?? '资源' }}
          </div>
          <n-space class="detail-selection-bar__actions" :size="12">
            <n-button @click="handleSelectAllResources">
              全选
            </n-button>
            <n-button @click="handleDeselectAllResources">
              取消全选
            </n-button>
            <n-button @click="handleInvertSelectedResources">
              反选
            </n-button>
            <n-button @click="openBatchLabelDialog('tags', 'add')">
              添加标签
            </n-button>
            <n-button @click="openBatchLabelDialog('tags', 'remove')">
              移除标签
            </n-button>
            <n-button @click="openBatchLabelDialog('types', 'add')">
              添加分类
            </n-button>
            <n-button @click="openBatchLabelDialog('types', 'remove')">
              移除分类
            </n-button>
            <n-button v-if="isAudioCategory" @click="openBatchLabelDialog('authors', 'add')">
              添加歌手
            </n-button>
            <n-button v-if="isAudioCategory" @click="openBatchLabelDialog('authors', 'remove')">
              删除歌手
            </n-button>
            <n-button v-if="isAudioCategory" @click="openBatchLabelDialog('album', 'add')">
              添加专辑
            </n-button>
            <n-button v-if="isAudioCategory" @click="openBatchLabelDialog('album', 'remove')">
              删除专辑
            </n-button>
            <n-button
              v-if="isAudioCategory"
              :loading="isBatchFetchingAlbumCover"
              @click="handleBatchFetchAlbumCover"
            >
              获取封面
            </n-button>
            <n-button
              type="error"
              :loading="isBatchDeleting"
              @click="handleBatchSelectionAction"
            >
              {{ `批量删除（${selectedResourceCount}）` }}
            </n-button>
          </n-space>
        </div>

        <div class="detail-content">
          <n-scrollbar class="detail-scrollbar">
            <div class="detail-content__inner">
            <n-empty v-if="resourceList.length === 0" :description="`暂无${categoryName || ''}资源，点击按钮添加吧！`">
              <template #extra>
                <n-button type="primary" :disabled="currentCategoryBatchInBackground" @click="handleAddResource">
                  添加第一{{categorySettings.addFirst}}{{ categoryName ?? '资源' }}
                </n-button>
              </template>
            </n-empty>

            <div v-else class="resource-grid">
              <ResourceCard
                v-for="resource in resourceList"
                :key="`${resource.id}-${resource.coverPath ?? ''}`"
                :resource="resource"
                :category-name="categoryName"
                :hide-type-line="detailIsAsmr"
                :author-label="categorySettings.authorText || '作者'"
                :start-text="startText"
                :show-mtool-launch="showMtoolLaunch"
                :can-mtool-launch="canMtoolLaunch"
                :show-zone-launch="showZoneLaunch"
                :can-zone-launch="canZoneLaunch"
                :show-admin-launch="showAdminLaunch"
                :show-cover="showCardCover"
                :show-screenshot-folder="showScreenshotFolder"
                :show-completed-toggle="showCompletedToggle"
                :show-delete-files="showDeleteFiles"
                :stop-needs-confirm="categorySettings.extendTable === 'game_meta'"
                :selected="selectedResourceIds.includes(String(resource?.id ?? ''))"
                :selection-mode="resourceSelectionMode"
                :show-default-app-play="isAudioCategory"
                :show-add-to-playlist="isAudioCategory"
                @launch="handleLaunchResource"
                @admin-launch="handleAdminLaunchResource"
                @mtool-launch="handleMtoolLaunchResource"
                @stop="handleStopResource"
                @zone-launch="handleZoneLaunchResource"
                @show-detail="handleShowResourceDetail"
                @edit="handleEditResource"
                @open-folder="handleOpenResourceFolder"
                @default-app-play="handleDefaultAppPlayResource"
                @add-to-playlist="handleAddMusicToPlaylist"
                @open-screenshot-folder="handleOpenScreenshotFolder"
                @toggle-favorite="handleToggleFavorite"
                @toggle-completed="handleToggleCompleted"
                @toggle-select="handleToggleSelectResource"
                @delete="handleDeleteResource"
                @delete-files="handleDeleteResourceFiles"
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
            <div v-if="selectedDetailResource" class="detail-drawer" :class="{ 'detail-drawer--software': detailIsSoftware }">
            <div v-if="!detailIsSoftware" class="detail-drawer__cover">
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
                <div v-if="detailIsManga" class="detail-drawer__item">
                  <span class="detail-drawer__label">汉化者</span>
                  <span class="detail-drawer__value">{{ selectedDetailResource.multiImageMeta?.translator || '暂无' }}</span>
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
                <div v-if="!detailIsAsmr" class="detail-drawer__item">
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
                  <div class="detail-drawer__item" :class="{ 'detail-drawer__item--full': detailIsAsmr }">
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
                    <span class="detail-drawer__value detail-drawer__value--path">{{ detailDisplayPath || '暂无' }}</span>
                    <n-button type="primary" ghost class="detail-drawer__path-button" @click="handleOpenDetailResourcePath">
                      <template #icon>
                        <n-icon :component="FolderOpenOutline" />
                      </template>
                    </n-button>
                  </div>
                </div>
                <div v-if="!detailIsSoftware && !detailIsManga && detailStores.length" class="detail-drawer__item detail-drawer__item--full">
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
                  :class="{ 'detail-drawer__item--full': detailIsSoftware }"
                >
                  <span class="detail-drawer__label">{{ metaItem.label }}</span>
                  <span
                    v-if="metaItem.icon"
                    class="detail-drawer__value detail-drawer__meta-with-icon"
                    :class="{ 'detail-drawer__value--multiline': detailIsSoftware }"
                  >
                    <img :src="metaItem.icon" :alt="metaItem.value" class="detail-drawer__meta-icon" />
                    <span>{{ metaItem.value }}</span>
                  </span>
                  <span
                    v-else
                    class="detail-drawer__value"
                    :class="{ 'detail-drawer__value--multiline': detailIsSoftware }"
                  >
                    {{ metaItem.value }}
                  </span>
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
                  <span class="detail-drawer__label">{{ detailStatsText.firstAccess }}</span>
                  <span class="detail-drawer__value">{{ formatDateTime(detailStats?.firstAccessTime) }}</span>
                </div>
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">{{ detailStatsText.lastAccess }}</span>
                  <span class="detail-drawer__value">{{ formatDateTime(detailStats?.lastAccessTime) }}</span>
                </div>
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">{{ detailStatsText.accessCount }}</span>
                  <span class="detail-drawer__value">{{ Number(detailStats?.accessCount ?? 0) }}</span>
                </div>
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">{{ detailStatsText.totalRuntime }}</span>
                  <span class="detail-drawer__value">{{ formatDuration(detailStats?.totalRuntime) }}</span>
                </div>
                <div class="detail-drawer__item">
                  <span class="detail-drawer__label">添加日期</span>
                  <span class="detail-drawer__value">{{ formatDateTime(selectedDetailResource.createTime) }}</span>
                </div>
                  <div v-if="detailIsManga" class="detail-drawer__item">
                    <span class="detail-drawer__label">阅读进度</span>
                    <span class="detail-drawer__value">{{ detailReadingProgressText }}</span>
                  </div>
                  <div v-if="detailIsAsmr || detailIsAudio" class="detail-drawer__item">
                    <span class="detail-drawer__label">播放进度</span>
                    <span class="detail-drawer__value">{{ detailPlaybackProgressText }}</span>
                  </div>
                </div>
              </div>

            <div v-if="!detailIsSoftware && !detailIsManga && detailScreenshotPaths.length" class="detail-drawer__section">
              <div class="detail-drawer__section-title">{{ detailPreviewSectionTitle }}</div>
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
                  v-if="!detailIsManga"
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
                  {{ detailIsManga ? '打开漫画文件夹' : '打开截图文件夹' }}
                </n-button>
              </div>
            </div>

              <div v-if="detailIsManga && detailGalleryItems.length" class="detail-drawer__section">
                <div class="detail-drawer__section-title">{{ detailGallerySectionTitle }}</div>
                <div class="detail-drawer__gallery">
                  <button
                    v-for="galleryItem in detailGalleryItems"
                    :key="`${selectedDetailResource.id}-gallery-${galleryItem.index}`"
                    type="button"
                    class="detail-drawer__gallery-item"
                    @click="handleOpenPictureViewer(galleryItem.index)"
                  >
                    <img
                      v-if="galleryItem.url"
                      :src="galleryItem.url"
                      :alt="`${selectedDetailResource.title}-${galleryItem.index + 1}`"
                      class="detail-drawer__gallery-image"
                      loading="lazy"
                    />
                    <div v-else class="detail-drawer__gallery-placeholder">加载中</div>
                    <div class="detail-drawer__gallery-index">{{ galleryItem.index + 1 }}</div>
                  </button>
                </div>
              </div>

              <div v-else-if="detailIsAsmr" class="detail-drawer__section">
                <div class="detail-drawer__section-title">{{ detailGallerySectionTitle }}</div>
                <n-empty v-if="!detailAudioTree.length" description="暂无音频文件" />
                <template v-else>
                  <n-tree
                    block-line
                    expand-on-click
                    :data="detailAudioTree"
                    :render-label="renderAudioTreeLabel"
                    :render-suffix="renderAudioTreeSuffix"
                    class="detail-audio-tree"
                  />
                  <n-dropdown
                    trigger="manual"
                    :show="detailAudioContextMenuVisible"
                    :x="detailAudioContextMenuPosition.x"
                    :y="detailAudioContextMenuPosition.y"
                    placement="bottom-start"
                    :options="detailAudioContextMenuOptions"
                    :on-clickoutside="closeDetailAudioContextMenu"
                    @select="handleSelectDetailAudioContextMenu"
                  />
                </template>
              </div>

              <div v-else-if="!isSingleImageCategory && !detailIsManga && !detailIsAudio" class="detail-drawer__section">
                <div class="detail-drawer__section-title">{{ detailGallerySectionTitle }}</div>
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
                        <span class="detail-drawer__log-label">启动方式</span>
                        <span class="detail-drawer__log-value">{{ formatLaunchMode(logItem.launchMode) }}</span>
                      </div>
                      <div class="detail-drawer__log-row">
                        <span class="detail-drawer__log-label">开始时间</span>
                        <span class="detail-drawer__log-value">{{ formatDateTime(logItem.startTime) }}</span>
                      </div>
                      <div class="detail-drawer__log-row">
                        <span class="detail-drawer__log-label">结束时间</span>
                        <span class="detail-drawer__log-value">{{ formatLogEndTime(logItem.endTime) }}</span>
                      </div>
                      <div class="detail-drawer__log-row">
                        <span class="detail-drawer__log-label">运行时长</span>
                        <span class="detail-drawer__log-value">{{ formatLogDuration(logItem) }}</span>
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
                {{ detailOpenFolderText }}
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
      :mask-closable="batchProgressRunning"
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
          <template v-if="batchProgressRunning && batchAnalyzeTotal > 0">
            <span class="batch-import-loading__title-text">
              {{ batchProgressStage === 'import'
                ? `正在导入第 ${batchAnalyzeDisplayIndex} / ${batchAnalyzeTotal} 个${batchImportResourceLabel}`
                : `正在分析第 ${batchAnalyzeDisplayIndex} / ${batchAnalyzeTotal} 个目录` }}
            </span>
            <span class="batch-import-loading__title-directory" :title="getBatchProgressDirectoryName()">
              {{ getBatchProgressDirectoryName() }}
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
            <n-button type="warning" @click="batchProgressStage === 'import' ? handleBatchImportRunInBackground() : handleStopBatchImportAnalysis()">
              {{ batchProgressStage === 'import' ? '后台运行' : '停止分析' }}
            </n-button>
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
        <div class="batch-import-toast__title">{{ batchProgressStage === 'import' ? `正在后台导入${batchImportResourceLabel}` : `正在后台分析${batchImportResourceLabel}目录` }}</div>
        <div class="batch-import-toast__subtitle">
          {{ batchProgressStage === 'import'
            ? `第 ${batchAnalyzeDisplayIndex} / ${batchAnalyzeTotal} 个${batchImportResourceLabel}`
            : `第 ${batchAnalyzeDisplayIndex} / ${batchAnalyzeTotal} 个目录` }}
        </div>
        <div class="batch-import-toast__subtitle" :title="getBatchProgressDirectoryName()">
          {{ getBatchProgressDirectoryName() }}
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
                    :disabled="item.exists || !!item.errorMessage || !isBatchImportItemImportable(item)"
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
                    <n-button v-if="!detailIsManga && !detailIsAsmr" size="small" @click.stop="handleSelectBatchLaunchFile(index)">
                      手动选择
                    </n-button>
                  </n-space>
                </div>
                <div class="batch-import-item__detail">
                  <div class="batch-import-item__label">{{ detailIsManga ? '漫画图片' : (detailIsAsmr ? '音频文件' : '启动文件') }}</div>
                  <div v-if="detailIsManga" class="batch-import-item__value">
                    {{ item.imageCount ? `共 ${item.imageCount} 张图片` : '目录中未找到可用图片' }}
                  </div>
                  <div v-else-if="detailIsAsmr" class="batch-import-item__value">
                    {{ item.audioCount ? `共 ${item.audioCount} 个音频文件` : '目录中未找到可用音频文件' }}
                  </div>
                  <div v-else-if="item.launchFilePath" class="batch-import-item__value">
                    <img
                      v-if="item.launchFileIcon"
                      :src="item.launchFileIcon"
                      alt="启动文件图标"
                      class="batch-import-item__file-icon"
                    />
                    {{ item.launchFilePath }}
                  </div>
                  <div v-else class="batch-import-item__value batch-import-item__value--error">
                    {{ item.errorMessage || (detailIsAsmr ? '目录中未找到可用音频文件' : '未分析出可用启动文件，请手动选择') }}
                  </div>
                  <div v-if="showBatchImportButton && !detailIsManga" class="batch-import-item__fields">
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
          <div class="modal-footer__split">
            <n-checkbox v-model:checked="batchImportFetchInfoEnabled">
              通过插件获取作品信息
            </n-checkbox>
            <n-space justify="end">
              <n-button @click="handleCloseBatchImportModal">退出</n-button>
              <n-button type="primary" :loading="isBatchImportSubmitting" @click="handleConfirmBatchImport">
                确认导入
              </n-button>
            </n-space>
          </div>
        </div>
      </template>
    </n-modal>

    <n-modal
      v-model:show="showBatchLabelModal"
      preset="card"
      :title="batchLabelTitle"
      :style="{ width: '560px' }"
      @after-leave="resetBatchLabelDialog"
    >
      <n-space vertical :size="16">
        <n-alert type="info" :show-icon="false">
          当前已选择 {{ selectedResourceCount }} 个{{ categoryName ?? '资源' }}
        </n-alert>
        <n-form-item
          :label="batchLabelField === 'tags'
            ? `${categoryName}标签`
            : batchLabelField === 'types'
              ? `${categoryName}分类`
              : batchLabelField === 'authors'
                ? `${categoryName}歌手`
                : `${categoryName}专辑`"
        >
          <n-select
            v-if="!batchLabelIsSingleValue"
            :value="batchLabelValues"
            multiple
            filterable
            tag
            clearable
            :options="batchLabelOptions"
            :input-props="{
              onKeydown: handleBatchLabelInputKeydown,
              onBlur: handleBatchLabelInputCommit
            }"
            :placeholder="batchLabelPlaceholder"
            :on-search="handleBatchLabelSearch"
            :on-create="createSelectOption"
            @update:value="handleBatchLabelValuesChange"
          />
          <n-select
            v-else
            :value="batchLabelSingleValue"
            filterable
            tag
            clearable
            :options="batchLabelOptions"
            :placeholder="batchLabelPlaceholder"
            :on-search="handleBatchLabelSearch"
            :on-create="createSelectOption"
            @update:value="handleBatchLabelSingleValueChange"
          />
        </n-form-item>
        <div class="batch-label-modal__footer">
          <n-space justify="end">
            <n-button @click="closeBatchLabelDialog">
              取消
            </n-button>
            <n-button type="primary" :loading="isBatchLabelSubmitting" @click="handleSubmitBatchLabelAction">
              确认
            </n-button>
          </n-space>
        </div>
      </n-space>
    </n-modal>

    <n-modal
      v-model:show="showAudioCoverCandidateModal"
      preset="card"
      title="选择专辑封面"
      :style="{ width: '820px' }"
      @after-leave="closeAudioCoverCandidateModal"
    >
      <n-space vertical :size="16">
        <n-alert type="info" :show-icon="false">
          已按“歌名 + 歌手 / 歌名 + 专辑 / 歌手 + 专辑”查找到可用封面，请选择要使用的那一张。
        </n-alert>
        <div class="audio-cover-candidate-list">
          <button
            v-for="candidate in audioCoverCandidates"
            :key="`${candidate.label}-${candidate.coverPath}`"
            type="button"
            class="audio-cover-candidate"
            @click="handleUseAudioCoverCandidate(candidate.coverPath)"
          >
            <div class="audio-cover-candidate__preview">
              <img :src="candidate.previewSrc" :alt="candidate.label" class="audio-cover-candidate__image" />
            </div>
            <div class="audio-cover-candidate__body">
              <div class="audio-cover-candidate__title">{{ candidate.label }}</div>
              <div class="audio-cover-candidate__query">{{ candidate.queryText }}</div>
            </div>
          </button>
        </div>
        <div class="batch-label-modal__footer">
          <n-space justify="end">
            <n-button @click="closeAudioCoverCandidateModal">
              取消
            </n-button>
          </n-space>
        </div>
      </n-space>
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
                  <div class="path-field__actions">
                    <n-button v-if="isSoftwareCategory" @click="handleOpenSoftwareScriptModal">脚本</n-button>
                    <n-button @click="handleSelectBasePath">选择{{categorySettings.resourcePathType === 'file' ? '文件' : '目录'}}</n-button>
                  </div>
                </div>
              </n-form-item>
              <component
                :is="modelComponent"
                v-if="modelComponent"
                :key="`${modelComponentKey}-edit`"
                v-model:metaData="formData.meta"
                :actors="formData.actors"
                :base-path="formData.basePath"
                :title="formData.name"
                :fetch-info-loading="fetchResourceInfoLoading"
                @update:actors="(value: string[]) => { formData.actors = value }"
                @check-engine="handleCheckGameEngine"
                @fetch-game-info="handleFetchGameInfo"
              />
              <n-form-item v-if="categorySettings.authorText" :label="categorySettings.authorText" path="author">
                <n-select
                  v-if="isAudioCategory"
                  :value="formData.authors"
                  multiple
                  filterable
                  tag
                  clearable
                  :options="authorSelectOptions"
                  :placeholder="authorInputPlaceholder"
                  :on-create="createSelectOption"
                  @update:value="handleAudioAuthorsChange"
                />
                <n-input v-else v-model:value="formData.author" :placeholder="authorInputPlaceholder"/>
              </n-form-item>
              <n-form-item :label="descriptionLabel" path="description">
                <RichTextEditor v-model="formData.description" :placeholder="descriptionPlaceholder" />
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
              <n-form-item v-if="!detailIsAsmr" :label="`${categoryName}分类`" path="types">
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
                    <n-button
                      v-if="categorySettings.extendTable === 'audio_meta'"
                      size="small"
                      @click="handleFetchAlbumCover"
                    >
                      获取专辑封面
                    </n-button>
                    <n-button
                      v-if="!['multi_image_meta', 'asmr_meta', 'audio_meta'].includes(categorySettings.extendTable)"
                      size="small"
                      :disabled="!hasBasePath"
                      @click="handleUseScreenshotCover"
                    >
                      使用截图作为封面
                    </n-button>
                    <n-button
                      v-if="categorySettings.extendTable !== 'audio_meta'"
                      size="small"
                      :disabled="!editingResourceId"
                      @click="handleChooseCoverFromScreenshotFolder"
                    >
                      从截图文件夹选择
                    </n-button>
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

    <n-modal
      v-model:show="showSoftwareScriptModal"
      preset="card"
      title="编写脚本"
      :style="{ width: '680px' }"
    >
      <n-space vertical :size="16">
        <n-alert type="info" :show-icon="false">
          选择脚本解释器后，每一行都会按顺序执行，保存时会自动转换成一条命令。
        </n-alert>
        <n-form-item label="脚本运行器">
          <n-select
            v-model:value="softwareScriptRuntimePath"
            :options="softwareScriptRuntimes"
            label-field="label"
            value-field="value"
            placeholder="请选择 CMD 或 PowerShell"
          />
        </n-form-item>
        <n-input
          v-model:value="softwareScriptDraft"
          type="textarea"
          :rows="10"
          :placeholder="softwareScriptPlaceholder"
        />
        <div class="batch-label-modal__footer">
          <n-space justify="end">
            <n-button @click="showSoftwareScriptModal = false">取消</n-button>
            <n-button type="primary" @click="handleConfirmSoftwareScript">保存脚本</n-button>
          </n-space>
        </div>
      </n-space>
    </n-modal>

    <PictureViewer
      v-model:show="showPictureViewer"
      :image-paths="pictureViewerImagePaths"
      :initial-index="pictureViewerInitialIndex"
      :scroll-mode="pictureViewerScrollMode"
      :allow-delete="pictureViewerAllowDelete"
      @delete-image="handleDeleteViewerScreenshot"
    />

    <ComicReader
      v-model:show="showComicReader"
      :image-paths="comicReaderImagePaths"
      :initial-index="comicReaderInitialIndex"
      @page-change="handleComicReaderPageChange"
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
              <div class="path-field__actions">
                <n-button v-if="isSoftwareCategory" @click="handleOpenSoftwareScriptModal">脚本</n-button>
                <n-button @click="handleSelectBasePath">选择{{categorySettings.resourcePathType === 'file' ? '文件' : '目录'}}</n-button>
              </div>
            </div>
          </n-form-item>
          <component
            :is="modelComponent"
            v-if="modelComponent"
            :key="modelComponentKey"
            v-model:metaData="formData.meta"
            :actors="formData.actors"
            :base-path="formData.basePath"
            :title="formData.name"
            :fetch-info-loading="fetchResourceInfoLoading"
            @update:actors="(value: string[]) => { formData.actors = value }"
            @check-engine="handleCheckGameEngine"
            @fetch-game-info="handleFetchGameInfo"
          />
          <n-form-item v-if="categorySettings.authorText" :label="categorySettings.authorText" path="author">
            <n-select
              v-if="isAudioCategory"
              :value="formData.authors"
              multiple
              filterable
              tag
              clearable
              :options="authorSelectOptions"
              :placeholder="authorInputPlaceholder"
              :on-create="createSelectOption"
              @update:value="handleAudioAuthorsChange"
            />
            <n-input v-else v-model:value="formData.author" :placeholder="authorInputPlaceholder"/>
          </n-form-item>
          <n-form-item :label="descriptionLabel" path="description">
            <RichTextEditor v-model="formData.description" :placeholder="descriptionPlaceholder" />
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
          <n-form-item v-if="!detailIsAsmr" :label="`${categoryName}分类`" path="types">
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
                    <n-button
                      v-if="categorySettings.extendTable === 'audio_meta'"
                      size="small"
                      @click="handleFetchAlbumCover"
                    >
                      获取专辑封面
                    </n-button>
                    <n-button
                      v-if="!['multi_image_meta', 'asmr_meta', 'audio_meta'].includes(categorySettings.extendTable)"
                      size="small"
                    :disabled="!hasBasePath"
                    @click="handleUseScreenshotCover"
                >
                  使用截图作为封面
                </n-button>
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

.audio-cover-candidate-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.audio-cover-candidate {
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  text-align: left;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
}

.audio-cover-candidate:hover {
  transform: translateY(-2px);
  border-color: rgba(99, 226, 183, 0.34);
  background: rgba(99, 226, 183, 0.06);
}

.audio-cover-candidate__preview {
  aspect-ratio: 1;
  background: rgba(255, 255, 255, 0.04);
}

.audio-cover-candidate__image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.audio-cover-candidate__body {
  padding: 12px;
}

.audio-cover-candidate__title {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.audio-cover-candidate__query {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.72;
  word-break: break-word;
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

.author-search, .album-search, .tag-search, .type-search {
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
  justify-content: flex-start;
  gap: 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.16);
  box-sizing: border-box;
}

.detail-header__info {
  flex: 0 1 auto;
  min-width: 0;
}

.detail-header__search {
  flex: 0 0 260px;
  min-width: 200px;
}

.detail-header__actions {
  flex: 0 0 auto;
  margin-left: auto;
  display: flex;
  justify-content: flex-end;
}

.detail-header__actions :deep(.n-space) {
  justify-content: flex-end;
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

.detail-selection-bar {
  position: absolute;
  top: 56px;
  left: 0;
  right: 0;
  min-height: 52px;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.16);
  box-sizing: border-box;
}

.detail-selection-bar__meta {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
}

.detail-selection-bar__actions {
  flex: 0 0 auto;
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

.detail-selection-bar + .detail-content {
  top: 108px;
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
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 8px;
  background: rgb(36, 36, 36);
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

@media (max-width: 1180px) {
  .detail-header {
    height: auto;
    min-height: 104px;
    padding: 10px 20px;
    align-items: flex-start;
    flex-wrap: wrap;
    row-gap: 12px;
  }

  .detail-header__info {
    flex: 1 1 0;
    min-width: 0;
  }

  .detail-header__search {
    flex: 0 1 260px;
    min-width: 220px;
  }

  .detail-header__actions {
    flex: 1 1 100%;
    width: 100%;
    margin-left: 0;
    flex-wrap: wrap;
  }

  .detail-header__actions :deep(.n-space) {
    width: 100%;
    justify-content: flex-end;
  }

  .detail-content {
    top: 104px;
  }

  .detail-selection-bar {
    top: 104px;
    min-height: 116px;
    align-items: flex-start;
    flex-wrap: wrap;
    row-gap: 12px;
  }

  .detail-selection-bar__meta {
    width: 100%;
  }

  .detail-selection-bar__actions {
    width: 100%;
  }

  .detail-selection-bar__actions :deep(.n-space) {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .detail-selection-bar + .detail-content {
    top: 232px;
  }
}

@media (max-width: 820px) {
  .detail-selection-bar {
    min-height: 168px;
  }

  .detail-selection-bar + .detail-content {
    top: 284px;
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

.modal-footer__split {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
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

.path-field__actions {
  display: flex;
  align-items: center;
  gap: 8px;
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

.detail-drawer__value--multiline {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
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

.detail-drawer__gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.detail-audio-tree {
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.06);
  padding: 10px 12px;
}

.detail-audio-tree__label {
  display: block;
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  white-space: normal;
}

.detail-audio-tree__file {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.detail-audio-tree__file-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  white-space: normal;
}

.detail-audio-tree__subtitle-badge {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(99, 226, 183, 0.16);
  color: rgb(125, 232, 196);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}

.detail-audio-tree__file-subtitle {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.46);
}

.detail-audio-tree__action-button {
  appearance: none;
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0;
  line-height: 1;
  opacity: 1;
  user-select: none;
  border: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease, opacity 0.2s ease;
}

.detail-audio-tree__action-button--play {
  background: rgb(99, 226, 183);
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(99, 226, 183, 0.24);
}

.detail-audio-tree__action-button:hover {
  background: rgb(125, 232, 196);
  transform: translateY(-1px) scale(1.06);
  box-shadow: 0 6px 14px rgba(99, 226, 183, 0.34);
}

.detail-audio-tree__action-button:active {
  transform: scale(0.95);
  box-shadow: 0 2px 8px rgba(99, 226, 183, 0.24);
}

.detail-audio-tree__action-icon {
  width: 11px;
  height: 11px;
}

.detail-audio-tree :deep(.n-tree-node-content) {
  width: 100%;
}

.detail-audio-tree :deep(.n-tree-node-content__text) {
  min-width: 0;
  flex: 1 1 auto;
  white-space: normal;
}

.detail-audio-tree :deep(.n-tree-node-wrapper) {
  width: 100%;
}

.detail-audio-tree :deep(.n-tree-node-switcher--hide) {
  width: 0 !important;
  min-width: 0 !important;
  margin-right: 0 !important;
  padding: 0 !important;
  overflow: hidden;
}

.detail-audio-tree :deep(.n-tree-node-content__suffix) {
  flex: 0 0 auto;
  margin-left: 12px;
  display: inline-flex;
  align-items: flex-start;
}

.detail-drawer__gallery-item {
  position: relative;
  padding: 0;
  border: none;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(127, 127, 127, 0.08);
  cursor: pointer;
  aspect-ratio: 3 / 4;
}

.detail-drawer__gallery-image,
.detail-drawer__gallery-placeholder {
  width: 100%;
  height: 100%;
  display: block;
}

.detail-drawer__gallery-image {
  object-fit: cover;
}

.detail-drawer__gallery-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  opacity: 0.7;
}

.detail-drawer__gallery-index {
  position: absolute;
  right: 8px;
  bottom: 8px;
  min-width: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.68);
  color: #fff;
  font-size: 12px;
  line-height: 1.4;
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
