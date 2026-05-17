<script setup lang="ts">
import {computed, defineAsyncComponent, h, inject, nextTick, onBeforeMount, onBeforeUnmount, onMounted, ref, toRaw, watch} from 'vue'
import type {ComputedRef} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {
  ChevronDownOutline,
  ChevronUpOutline,
  SearchOutline,
} from '@vicons/ionicons5'
import {createLogger} from '../../../main/util/logger'
import {confirmDialog, notify} from '../utils/notification'
import {removeOngoingCenterItem, upsertOngoingCenterItem} from '../utils/notification-center'
import ResourceCard from '../components/card/ResourceCard.vue'
import {createEmptyMetaByType} from '../components/meta/meta-factory'
import {resolveMetaFormComponent} from '../components/meta/registry'
import CategoryBatchImportPanel from './category-detail/components/CategoryBatchImportPanel.vue'
import CategoryFilterPanel from './category-detail/components/CategoryFilterPanel.vue'
import ResourceDetailDrawer from './category-detail/components/ResourceDetailDrawer.vue'
import ResourceEditorDrawer from './category-detail/components/ResourceEditorDrawer.vue'
import AudioCoverCandidateModal from './category-detail/components/AudioCoverCandidateModal.vue'
import VideoCoverCandidateModal from './category-detail/components/VideoCoverCandidateModal.vue'
import VideoSubCoverCandidateModal from './category-detail/components/VideoSubCoverCandidateModal.vue'
import {useCategoryDetailPresentation} from './category-detail/composables/useCategoryDetailPresentation'
import {useCategoryDetailFormatters} from './category-detail/composables/useCategoryDetailFormatters'
import {useCategoryDetailAudioContextMenu} from './category-detail/composables/useCategoryDetailAudioContextMenu'
import {useCategoryBatchActions} from './category-detail/composables/useCategoryBatchActions'
import {useCategoryBatchImportCategoryActions} from './category-detail/composables/useCategoryBatchImportCategoryActions'
import {useCategoryBatchImportState} from './category-detail/composables/useCategoryBatchImportState'
import {useCategoryBatchImportWorkflow} from './category-detail/composables/useCategoryBatchImportWorkflow'
import {useCategoryListPresentation} from './category-detail/composables/useCategoryListPresentation'
import {useCategoryListQueryState} from './category-detail/composables/useCategoryListQueryState'
import {useCategoryPageBootstrap} from './category-detail/composables/useCategoryPageBootstrap'
import {useCategoryPreviewAssets} from './category-detail/composables/useCategoryPreviewAssets'
import {useCategoryCapabilityActions} from './category-detail/composables/useCategoryCapabilityActions'
import {useCategoryDetailRuntime} from './category-detail/composables/useCategoryDetailRuntime'
import {useCategoryEditorPathAnalysis} from './category-detail/composables/useCategoryEditorPathAnalysis'
import {useCategoryEditorSoftwareScript} from './category-detail/composables/useCategoryEditorSoftwareScript'
import {useCategoryReaderPlayerActions} from './category-detail/composables/useCategoryReaderPlayerActions'
import {useCategoryReaderSessions} from './category-detail/composables/useCategoryReaderSessions'
import {useCategoryResourceEditor} from './category-detail/composables/useCategoryResourceEditor'
import {useCategoryEditorAssistActions} from './category-detail/composables/useCategoryEditorAssistActions'
import {useCategoryVideoOrderDialog} from './category-detail/composables/useCategoryVideoOrderDialog'
import {resolveCategoryProfile} from './category-detail/profile-registry'
import {setAudioPlayerSession, setAudioPlayerVisible, useAudioPlayerStore} from '../utils/audio-player-store'
import {getWebsitePlaceholderEmoji} from '../utils/website-placeholder-emoji'
import {Settings} from '../../../common/constants'
import {sanitizeRichHtml} from '../utils/rich-content-sanitizer'

const PictureViewer = defineAsyncComponent(() => import('../components/PictureViewer.vue'))
const ComicReader = defineAsyncComponent(() => import('../components/ComicReader.vue'))
const TextReader = defineAsyncComponent(() => import('../components/TextReader.vue'))
const PdfReader = defineAsyncComponent(() => import('../components/PdfReader.vue'))
const EpubReader = defineAsyncComponent(() => import('../components/EpubReader.vue'))
const EbookReader = defineAsyncComponent(() => import('../components/EbookReader.vue'))
const VideoPlayer = defineAsyncComponent(() => import('../components/VideoPlayer.vue'))

const route = useRoute()
const router = useRouter()
const logger = createLogger('category-detail')
const emitRendererTiming = (message: string, meta?: Record<string, unknown>) => {
  window.api?.diagnostics?.logRenderer('info', message, meta)
}
const readCategoryRoutePerf = () => ((window as any).__nrmCategoryRoutePerf ?? null) as null | {
  startedAt: number
  from: string
  to: string
  categoryId: string
  mountedLogged?: boolean
  frameLogged?: boolean
  listVisibleLogged?: boolean
}
const reportCategoryRoutePerf = (phase: 'category-mounted' | 'category-mounted-frame' | 'category-list-visible', extra?: Record<string, unknown>) => {
  const perf = readCategoryRoutePerf()
  if (!perf || String(perf.categoryId ?? '') !== String(categoryId.value ?? '')) {
    return
  }

  if (phase === 'category-mounted' && perf.mountedLogged) return
  if (phase === 'category-mounted-frame' && perf.frameLogged) return
  if (phase === 'category-list-visible' && perf.listVisibleLogged) return

  const elapsedMs = Math.round(performance.now() - Number(perf.startedAt ?? 0))
  emitRendererTiming('category route perf', {
    phase,
    elapsedMs,
    from: perf.from,
    to: perf.to,
    categoryId: perf.categoryId,
    ...extra
  })

  if (phase === 'category-mounted') perf.mountedLogged = true
  if (phase === 'category-mounted-frame') perf.frameLogged = true
  if (phase === 'category-list-visible') perf.listVisibleLogged = true
  ;(window as any).__nrmCategoryRoutePerf = perf
}
const injectedIsDark = inject<ComputedRef<boolean>>('appIsDark', computed(() => true))
const audioPlayerStore = useAudioPlayerStore()
const categoryId = computed(() => route.params.id as string)
const resourceList = ref<any[]>([]) // 资源列表数据
const authorList = ref<any[]>([])
const actorList = ref<any[]>([])
const albumList = ref<any[]>([])
const engineList = ref<any[]>([])
const engineOptionList = ref<any[]>([])
const languageOptions = ref<any[]>([])
const websiteTypeOptions = ref<any[]>([])
const tagList = ref<any[]>([])
const typeList = ref<any[]>([])
const loading = ref(true)
const keyword = ref('')
const authorSearch = ref<string>('')
const actorSearch = ref<string>('')
const albumSearch = ref<string>('')
const tagSearch = ref<string>('')
const typeSearch = ref<string>('')
const showModal = ref(false)
const showEditModal = ref(false)
const showBatchImportLoading = ref(false)
const showBatchImportModal = ref(false)
const showBatchLabelModal = ref(false)
const showAudioCoverCandidateModal = ref(false)
const showVideoCoverCandidateModal = ref(false)
const showVideoSubCoverCandidateModal = ref(false)
const showVideoOrderModal = ref(false)
const fetchResourceInfoLoading = ref(false)
const videoCoverFrameLoading = ref(false)
const formData = ref<any>({name: '', meta: {}})
const editingResourceId = ref('')
const editInitialFormData = ref<any | null>(null)
const addResourceDuplicateChecking = ref(false)
const addResourceDuplicateMessage = ref('')
const addResourceDuplicateTitle = ref('')
let addResourceDuplicateCheckToken = 0
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
const audioCoverCandidates = ref<Array<{
  label: string
  coverPath: string
  previewSrc: string
  queryText: string
  albumName: string
}>>([])
const videoCoverCandidates = ref<Array<{
  label: string
  coverPath: string
  previewSrc: string
  time: number
  group: 'fixed' | 'random'
}>>([])
const videoSubCoverCandidateItems = ref<Array<{
  fileName: string
  relativePath: string
  candidates: Array<{
    label: string
    coverPath: string
    previewSrc: string
    time: number
  }>
}>>([])
const detailDescriptionContentRef = ref<HTMLElement | null>(null)
const detailDescriptionHeight = ref(400)
const showPictureViewer = ref(false)
const showComicReader = ref(false)
const showTextReader = ref(false)
const showPdfReader = ref(false)
const showEpubReader = ref(false)
const showEbookReader = ref(false)
const pictureViewerScrollMode = ref(String(Settings.PICTURE_READ_SCROLL_MODE.default ?? 'zoom'))
const pictureViewerImagePaths = ref<string[]>([])
const pictureViewerInitialIndex = ref(0)
const pictureViewerAllowDelete = ref(true)
const pictureViewerResourceIds = ref<string[]>([])
const currentPictureViewerResourceId = ref('')
const comicReaderImagePaths = ref<string[]>([])
const comicReaderInitialIndex = ref(0)
const currentComicReaderResourceId = ref('')
const textReaderFilePath = ref('')
const textReaderTitle = ref('')
const textReaderInitialProgress = ref(0)
const currentTextReaderResourceId = ref('')
const pdfReaderFilePath = ref('')
const pdfReaderTitle = ref('')
const pdfReaderInitialProgress = ref(0)
const currentPdfReaderResourceId = ref('')
const epubReaderFilePath = ref('')
const epubReaderTitle = ref('')
const epubReaderInitialProgress = ref(0)
const currentEpubReaderResourceId = ref('')
const ebookReaderFilePath = ref('')
const ebookReaderTitle = ref('')
const ebookReaderInitialProgress = ref(0)
const currentEbookReaderResourceId = ref('')
const showVideoPlayer = ref(false)
const videoPlayerPlaylist = ref<Array<{
  path: string;
  label: string;
  resourceId?: string;
  resourceTitle?: string;
  coverSrc?: string;
  subtitlePath?: string
}>>([])
const videoPlayerInitialPath = ref('')
const videoPlayerInitialTime = ref(0)
const audioPlaybackResumeRestartThreshold = ref(Math.max(0, Math.min(100, Number(Settings.AUDIO_PLAYBACK_RESUME_RESTART_THRESHOLD.default ?? 95))))
const videoPlaybackResumeRestartThreshold = ref(Math.max(0, Math.min(100, Number(Settings.VIDEO_PLAYBACK_RESUME_RESTART_THRESHOLD.default ?? 95))))
const videoPlayerTitle = ref('')
const handleVideoPlayerPlaylistUpdate = (value: Array<{
  path: string;
  label: string;
  resourceId?: string;
  resourceTitle?: string;
  coverSrc?: string;
  subtitlePath?: string
}>) => {
  videoPlayerPlaylist.value = value.map((item) => ({...item}))
}
const normalizePlaybackResumeRestartThreshold = (value: unknown) => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return 95
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)))
}
const loadPlaybackResumeRestartThresholds = async () => {
  try {
    const [audioSetting, videoSetting] = await Promise.all([
      window.api.db.getSetting(Settings.AUDIO_PLAYBACK_RESUME_RESTART_THRESHOLD),
      window.api.db.getSetting(Settings.VIDEO_PLAYBACK_RESUME_RESTART_THRESHOLD)
    ])
    audioPlaybackResumeRestartThreshold.value = normalizePlaybackResumeRestartThreshold(
      audioSetting?.value ?? Settings.AUDIO_PLAYBACK_RESUME_RESTART_THRESHOLD.default
    )
    videoPlaybackResumeRestartThreshold.value = normalizePlaybackResumeRestartThreshold(
      videoSetting?.value ?? Settings.VIDEO_PLAYBACK_RESUME_RESTART_THRESHOLD.default
    )
  } catch {
    audioPlaybackResumeRestartThreshold.value = normalizePlaybackResumeRestartThreshold(
      Settings.AUDIO_PLAYBACK_RESUME_RESTART_THRESHOLD.default
    )
    videoPlaybackResumeRestartThreshold.value = normalizePlaybackResumeRestartThreshold(
      Settings.VIDEO_PLAYBACK_RESUME_RESTART_THRESHOLD.default
    )
  }
}
const applyVideoPlaybackProgressToResource = (resource: any, filePath: string, playbackTime: number) => {
  if (!resource || typeof resource !== 'object') {
    return resource
  }

  return {
    ...resource,
    videoMeta: {
      ...(resource.videoMeta ?? {}),
      lastPlayFile: filePath,
      lastPlayTime: playbackTime
    }
  }
}
const handleVideoPlaybackProgressPersisted = (payload: {
  resourceId: string;
  filePath: string;
  playbackTime: number
}) => {
  const resourceId = String(payload?.resourceId ?? '').trim()
  const filePath = String(payload?.filePath ?? '').trim()
  const playbackTime = Math.max(0, Number(payload?.playbackTime ?? 0))
  if (!resourceId || !filePath) {
    return
  }

  resourceList.value = resourceList.value.map((item) =>
    String(item?.id ?? '').trim() === resourceId
      ? applyVideoPlaybackProgressToResource(item, filePath, playbackTime)
      : item
  )

  if (String(selectedDetailResource.value?.id ?? '').trim() === resourceId) {
    selectedDetailResource.value = applyVideoPlaybackProgressToResource(selectedDetailResource.value, filePath, playbackTime)
  }
}
const showNotifyByType = (type: string, title: string, content: string) => {
  const normalizedType = type === 'warn' ? 'warning' : type
  notify(normalizedType as 'success' | 'error' | 'info' | 'warning', title, content)
}
const audioPlayerPlaylist = ref<Array<{
  path: string;
  label: string;
  duration?: number | null;
  resourceId?: string;
  resourceTitle?: string;
  artist?: string;
  coverSrc?: string;
  hasSubtitle?: boolean;
  subtitlePath?: string
}>>([])
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
const detailAudioTreeLoading = ref(false)
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
const videoSubCoverPreviewUrls = ref<Record<string, string>>({})
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

const assignResourceEditorFormRef = (instance: any) => {
  formRef.value = instance ?? null
}

const assignResourceEditorBasePathFormItemRef = (instance: any) => {
  basePathFormItemRef.value = instance ?? null
}

const mergeResourceSummaryIntoDetail = (detailResource: any, summaryResource: any) => {
  if (!detailResource) {
    return summaryResource
  }

  if (!summaryResource) {
    return detailResource
  }

  return {
    ...summaryResource,
    ...detailResource,
    tags: Array.isArray(detailResource.tags) && detailResource.tags.length ? detailResource.tags : summaryResource.tags,
    types: Array.isArray(detailResource.types) && detailResource.types.length ? detailResource.types : summaryResource.types,
    authors: Array.isArray(detailResource.authors) && detailResource.authors.length ? detailResource.authors : summaryResource.authors,
    actors: Array.isArray(detailResource.actors) && detailResource.actors.length ? detailResource.actors : summaryResource.actors,
    stores: Array.isArray(detailResource.stores) && detailResource.stores.length ? detailResource.stores : summaryResource.stores,
    logs: Array.isArray(detailResource.logs) && detailResource.logs.length ? detailResource.logs : summaryResource.logs,
    stats: detailResource.stats ?? summaryResource.stats,
    gameMeta: detailResource.gameMeta ?? summaryResource.gameMeta,
    softwareMeta: detailResource.softwareMeta ?? summaryResource.softwareMeta,
    singleImageMeta: detailResource.singleImageMeta ?? summaryResource.singleImageMeta,
    multiImageMeta: detailResource.multiImageMeta ?? summaryResource.multiImageMeta,
    videoMeta: detailResource.videoMeta ?? summaryResource.videoMeta,
    asmrMeta: detailResource.asmrMeta ?? summaryResource.asmrMeta,
    audioMeta: detailResource.audioMeta ?? summaryResource.audioMeta,
    novelMeta: detailResource.novelMeta ?? summaryResource.novelMeta,
    websiteMeta: detailResource.websiteMeta ?? summaryResource.websiteMeta,
    videoSubs: Array.isArray(detailResource.videoSubs) && detailResource.videoSubs.length ? detailResource.videoSubs : summaryResource.videoSubs,
    asmrSubs: Array.isArray(detailResource.asmrSubs) && detailResource.asmrSubs.length ? detailResource.asmrSubs : summaryResource.asmrSubs
  }
}

const normalizePathValue = (targetPath: string | null | undefined) => String(targetPath ?? '').replace(/\\/g, '/').trim()
const compareByFileName = (left: string, right: string) => String(left ?? '').localeCompare(String(right ?? ''), undefined, {
  numeric: true,
  sensitivity: 'base'
})
const getRelativeVideoPath = (basePath: string | null | undefined, filePath: string | null | undefined) => {
  const normalizedBasePath = normalizePathValue(basePath).replace(/\/+$/, '')
  const normalizedFilePath = normalizePathValue(filePath)

  if (!normalizedBasePath || !normalizedFilePath) {
    return normalizedFilePath
  }

  const normalizedBasePathLower = normalizedBasePath.toLowerCase()
  const normalizedFilePathLower = normalizedFilePath.toLowerCase()

  if (normalizedFilePathLower === normalizedBasePathLower) {
    return ''
  }

  if (!normalizedFilePathLower.startsWith(`${normalizedBasePathLower}/`)) {
    return normalizedFilePath
  }

  return normalizedFilePath.slice(normalizedBasePath.length + 1)
}

const getVideoSubCoverKey = (resource: any, relativePath: string | null | undefined) =>
  `${String(resource?.id ?? '').trim()}::${normalizePathValue(relativePath).toLowerCase()}`

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

  return hasChanged
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
  const pickFirstNonEmptyString = (...values: any[]) => {
    for (const value of values) {
      const normalized = String(value ?? '').trim()
      if (normalized) {
        return normalized
      }
    }

    return ''
  }
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
    authors: isAudioCategory.value ? authorNames : [],
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
      ...(resource?.novelMeta ?? {}),
      ...(resource?.websiteMeta ?? {}),
      pixivId: String(pixivStore?.workId ?? ''),
      websiteType: pickFirstNonEmptyString(
        primaryStore?.storeId,
        resource?.gameMeta?.websiteType,
        resource?.asmrMeta?.websiteType,
        resource?.multiImageMeta?.websiteType,
        resource?.singleImageMeta?.websiteType
      ),
      gameId: pickFirstNonEmptyString(
        primaryStore?.workId,
        resource?.gameMeta?.gameId,
        resource?.asmrMeta?.gameId,
        resource?.multiImageMeta?.gameId,
        resource?.singleImageMeta?.gameId
      ),
      website: pickFirstNonEmptyString(
        resource?.websiteMeta?.url,
        primaryStore?.url,
        resource?.gameMeta?.website,
        resource?.asmrMeta?.website,
        resource?.multiImageMeta?.website,
        resource?.singleImageMeta?.website
      ),
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
const selectedActorList = ref<string[]>([])
const selectedAlbumList = ref<string[]>([])
const selectedEngineList = ref<string[]>([])
const selectedTagList = ref<string[]>([])
const selectedTypeList = ref<string[]>([])
const selectedResourceIds = ref<string[]>([])
const selectionModeManuallyEnabled = ref(false)
const isBatchDeleting = ref(false)
const isBatchFetchingAlbumCover = ref(false)
const isBatchLabelSubmitting = ref(false)
const batchLabelField = ref<'tags' | 'types' | 'authors' | 'actors' | 'album'>('tags')
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

const categoryProfile = computed(() => resolveCategoryProfile({
  extendTable: String(categorySettings.value.extendTable ?? ''),
  resourcePathType: String(categorySettings.value.resourcePathType ?? ''),
  startText: String(categorySettings.value.startText ?? '')
}))
const showBatchImportButton = computed(() => categoryProfile.value.features.showBatchImportButton)
const getBatchImportOngoingId = (targetCategoryId: string) => `batch-import-analysis:${targetCategoryId}`
const batchProgressRunning = computed(() => batchAnalyzeRunning.value || batchImportRunning.value)
const batchProgressStage = computed(() => (batchImportRunning.value ? 'import' : 'analyze'))
const batchImportResourceLabel = computed(() => categoryProfile.value.labels.batchImportResourceLabel)
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
let selectedResourceCount: ComputedRef<number> = computed(() => 0)
let resourceSelectionMode: ComputedRef<boolean> = computed(() => false)
let currentPageResourceIds: ComputedRef<string[]> = computed(() => [])
let currentCategoryBatchInBackground: ComputedRef<boolean> = computed(() => false)
const pageSizeOptions = [
  {label: '12 / 页', value: 12},
  {label: '24 / 页', value: 24},
  {label: '48 / 页', value: 48},
  {label: '96 / 页', value: 96}
] as const
let normalizedAuthorList: ComputedRef<Array<{ id: string; name: string; count: number }>> = computed(() => [])
let normalizedActorList: ComputedRef<Array<{ id: string; name: string; count: number }>> = computed(() => [])
let normalizedEngineList: ComputedRef<Array<{
  id: string;
  name: string;
  icon?: string;
  count: number
}>> = computed(() => [])
const normalizedEngineOptionList = computed(() =>
  engineOptionList.value
    .map((option: any) => {
      const rawIcon = String(option?.extra?.icon ?? '').trim()
      const icon = !rawIcon
        ? ''
        : /^(?:https?:|data:|file:|\/|[a-zA-Z]:[\\/])/.test(rawIcon)
          ? rawIcon
          : engineIconUrlByName.get(rawIcon) ?? rawIcon

      return {
        id: String(option?.value ?? '').trim(),
        name: String(option?.label ?? '').trim(),
        icon
      }
    })
    .filter((item: any) => item.id && item.name)
)
let normalizedTagList: ComputedRef<Array<{ id: string; name: string; count: number }>> = computed(() => [])
let normalizedTypeList: ComputedRef<Array<{ id: string; name: string; count: number }>> = computed(() => [])
let normalizedAlbumList: ComputedRef<Array<{ name: string; count: number }>> = computed(() => [])
let filteredAuthorList: ComputedRef<Array<{ id: string; name: string; count: number }>> = computed(() => [])
let filteredActorList: ComputedRef<Array<{ id: string; name: string; count: number }>> = computed(() => [])
let filteredEngineList: ComputedRef<Array<{
  id: string;
  name: string;
  icon?: string;
  count: number
}>> = computed(() => [])
let filteredTagList: ComputedRef<Array<{ id: string; name: string; count: number }>> = computed(() => [])
let filteredTypeList: ComputedRef<Array<{ id: string; name: string; count: number }>> = computed(() => [])
let filteredAlbumList: ComputedRef<Array<{ name: string; count: number }>> = computed(() => [])
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
const normalizedLanguageList = computed(() =>
  languageOptions.value
    .map((item: any) => ({
      id: String(item?.value ?? item?.id ?? '').trim(),
      name: String(item?.label ?? item?.name ?? '').trim()
    }))
    .filter((item) => item.id && item.name)
)

const categoryName = computed(() => {
  return categoryInfo.value?.name || '资源'
})

const descriptionLabel = computed(() =>
  categoryProfile.value.flags.isGame ? '游戏简介' : `${categoryName.value}描述`
)
const isAudioCategory = computed(() => categoryProfile.value.flags.isAudio)
const showActorFilter = computed(() => isVideoCategory.value || detailIsAsmr.value)
const actorFilterLabel = computed(() => detailIsAsmr.value ? '声优' : '声优/演员')

const descriptionPlaceholder = computed(() =>
  categoryProfile.value.flags.isGame ? '请输入游戏简介' : `请输入${categoryName.value}描述`
)
const authorInputPlaceholder = computed(() =>
  isAudioCategory.value ? '可输入多个艺术家，按回车创建标签' : `请输入${categorySettings.value.authorText ?? '作者'}`
)

const isSingleImageCategory = computed(() => categoryProfile.value.flags.isSingleImage)
const isNovelCategory = computed(() => categoryProfile.value.flags.isNovel)
const startText = computed(() => categoryProfile.value.labels.startText)
const showZoneLaunch = computed(() => categoryProfile.value.features.showZoneLaunch)
const canZoneLaunch = computed(() => Boolean(localeEmulatorPath.value.trim()))
const showAdminLaunch = computed(() => categoryProfile.value.features.showAdminLaunch)
const showMtoolLaunch = computed(() => categoryProfile.value.features.showMtoolLaunch)
const canMtoolLaunch = computed(() => Boolean(mtoolPath.value.trim()))
const showScreenshotFolder = computed(() => categoryProfile.value.features.showScreenshotFolder)
const isVideoCategory = computed(() => categoryProfile.value.flags.isVideo)
const isWebsiteCategory = computed(() => categoryProfile.value.flags.isWebsite)
const isVideoFolderCategory = computed(() => categoryProfile.value.flags.isVideoFolder)
const showCompletedToggle = computed(() => categoryProfile.value.features.showCompletedToggle)
const completedActionLabel = computed(() => categoryProfile.value.labels.completedActionLabel)
const completedStateLabel = computed(() => `已${completedActionLabel.value}`)
const showCompletedFilter = computed(() =>
  categorySettings.value.showCompletedFilter === true
  || categoryProfile.value.features.showCompletedToggle
)
const effectiveCompletedOnly = computed(() => showCompletedFilter.value && completedOnly.value)
let buildResourceQuery!: (page: number, size: number) => {
  keyword: string
  authorIds: string[]
  actorNames: string[]
  albumNames: string[]
  engineIds: string[]
  tagIds: string[]
  typeIds: string[]
  missingOnly: boolean
  favoriteOnly: boolean
  completedOnly: boolean
  runningOnly: boolean
  page: number
  pageSize: number
  sortBy: string
}
let resetSelected!: () => void
let resetCategoryListState!: () => void
const listQueryState = useCategoryListQueryState({
  keyword,
  missingFile,
  favoriteOnly,
  completedOnly,
  runningOnly,
  effectiveCompletedOnly,
  selectedAuthorList,
  selectedActorList,
  selectedAlbumList,
  selectedEngineList,
  selectedTagList,
  selectedTypeList,
  authorSearch,
  actorSearch,
  albumSearch,
  tagSearch,
  typeSearch,
  selectionModeManuallyEnabled,
  selectedResourceIds,
  resourceList,
  totalResources,
  authorList,
  actorList,
  albumList,
  engineList,
  languageOptions,
  websiteTypeOptions,
  tagList,
  typeList,
  currentPage,
  sortBy,
  pageSize
})
buildResourceQuery = listQueryState.buildResourceQuery
resetSelected = listQueryState.resetSelected
resetCategoryListState = listQueryState.resetCategoryListState
const showCardCover = computed(() => categoryProfile.value.features.showCardCover)
const showDeleteFiles = computed(() => categoryProfile.value.features.showDeleteFiles)
const showEngineFilter = computed(() => categoryProfile.value.features.showEngineFilter)
const showAuthorFilter = computed(() => categoryProfile.value.features.showAuthorFilter)
const showMissingFilter = computed(() => categoryProfile.value.features.showMissingFilter)
const showRunningFilter = computed(() => categoryProfile.value.features.showRunningFilter)
const isSoftwareCategory = computed(() => categoryProfile.value.flags.isSoftware)
const showCardDefaultAppOpen = computed(() => categoryProfile.value.features.showCardDefaultAppOpen)
let filterSectionsStyle: ComputedRef<{ gridTemplateRows: string }> = computed(() => ({gridTemplateRows: ''}))
const softwareScriptShellType = computed<'powershell' | 'cmd'>(() =>
  softwareScriptRuntimes.value.find((item) => item.value === softwareScriptRuntimePath.value)?.shellType ?? 'powershell'
)
const softwareScriptPlaceholder = computed(() =>
  softwareScriptShellType.value === 'powershell'
    ? '例如：\nSet-Location d:/myDir\n. .\\venv\\Scripts\\Activate.ps1\npy -3.10 run.py'
    : '例如：\ncd /d d:/myDir\ncall .\\venv\\Scripts\\activate\npy -3.10 run.py'
)
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
const selectedDetailDescriptionHtml = computed(() => sanitizeRichHtml(String(selectedDetailResource.value?.description ?? '')))
const sortActionTerms = computed(() => {
  if (isWebsiteCategory.value) {
    return {
      latest: '访问',
      first: '访问',
      runtime: '访问'
    }
  }

  if (detailUsesBrowseTerms.value) {
    return {
      latest: '浏览',
      first: '浏览',
      runtime: '浏览'
    }
  }

  if (detailUsesPlayTerms.value) {
    return {
      latest: '播放',
      first: '播放',
      runtime: '播放'
    }
  }

  return {
    latest: '启动',
    first: '启动',
    runtime: '运行'
  }
})
const sortOptions = computed(() => [
  {label: '最新添加', value: 'createTime-desc'},
  {label: '最早添加', value: 'createTime-asc'},
  {label: '名称 A-Z', value: 'title-asc'},
  {label: '名称 Z-A', value: 'title-desc'},
  {label: `最后${sortActionTerms.value.latest}最近`, value: 'lastAccessTime-desc'},
  {label: `最后${sortActionTerms.value.latest}最早`, value: 'lastAccessTime-asc'},
  {label: `${sortActionTerms.value.runtime}时长最长`, value: 'totalRuntime-desc'},
  {label: `${sortActionTerms.value.runtime}时长最短`, value: 'totalRuntime-asc'},
  {label: `首次${sortActionTerms.value.first}最近`, value: 'firstAccessTime-desc'},
  {label: `首次${sortActionTerms.value.first}最早`, value: 'firstAccessTime-asc'}
])
let detailUsesBrowseTerms!: ComputedRef<boolean>
let detailUsesPlayTerms!: ComputedRef<boolean>
let detailStatsText!: ComputedRef<{
  firstAccess: string
  lastAccess: string
  accessCount: string
  totalRuntime: string
}>
let detailShowTotalRuntime!: ComputedRef<boolean>
let detailPreviewSectionTitle!: ComputedRef<string>
let detailGallerySectionTitle!: ComputedRef<string>
let detailDirectorySectionTitle!: ComputedRef<string>
let detailDirectoryEmptyText!: ComputedRef<string>
let detailEmptyLogDescription!: ComputedRef<string>
let detailLogModeLabel!: ComputedRef<string>
let detailLogDurationLabel!: ComputedRef<string>
let detailShowLogs!: ComputedRef<boolean>
let hasDetailDescription!: ComputedRef<boolean>
let detailReadingProgressText!: ComputedRef<string>
let detailPlaybackProgressText!: ComputedRef<string>
let detailGalleryItems!: ComputedRef<Array<{ filePath: string; index: number; url: string }>>
let detailMetaItems!: ComputedRef<Array<{
  label: string;
  value: string;
  icon?: string;
  full?: boolean;
  copyValue?: string;
  clampLines?: number
}>>
let detailDisplayPath!: ComputedRef<string>

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
const collectAudioTreeTracks = (nodes: any[]): Array<{
  path: string;
  label: string;
  duration?: number | null;
  hasSubtitle?: boolean;
  subtitlePath?: string
}> => {
  const tracks: Array<{
    path: string;
    label: string;
    duration?: number | null;
    hasSubtitle?: boolean;
    subtitlePath?: string
  }> = []

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

const collectAudioTreeVideoTracks = (
  nodes: any[],
  resource: any = selectedDetailResource.value
): Array<{
  path: string;
  label: string;
  resourceId?: string;
  resourceTitle?: string;
  coverSrc?: string;
  subtitlePath?: string
}> => {
  const tracks: Array<{
    path: string;
    label: string;
    resourceId?: string;
    resourceTitle?: string;
    coverSrc?: string;
    subtitlePath?: string
  }> = []
  const resourceTitle = String(resource?.title ?? selectedDetailResource.value?.title ?? categoryName.value ?? '视频播放')
  const resourceId = String(resource?.id ?? selectedDetailResource.value?.id ?? '').trim()

  const visit = (items: any[]) => {
    for (const item of items) {
      if (!item) {
        continue
      }

      if (item.kind === 'video' && item.path) {
        tracks.push({
          path: String(item.path),
          label: String(item.label ?? getResourceNameFromBasePath(String(item.path)) ?? '当前视频'),
          resourceId,
          resourceTitle,
          coverSrc: String(item.coverPreviewSrc ?? ''),
          subtitlePath: String(item.subtitlePath ?? '').trim() || undefined
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

const getDetailMediaSubItems = (items: any[]) =>
  (Array.isArray(items) ? items : [])
    .map((item: any) => ({
      id: String(item?.id ?? ''),
      fileName: String(item?.fileName ?? '').trim(),
      relativePath: normalizePathValue(String(item?.relativePath ?? '')),
      kind: String(item?.kind ?? 'video').trim(),
      coverPath: String(item?.coverPath ?? '').trim(),
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : Number.MAX_SAFE_INTEGER,
      isVisible: item?.isVisible !== false,
      hasSubtitle: item?.hasSubtitle === true,
      duration: item?.duration ?? null,
      bitrate: item?.bitrate ?? null,
      sampleRate: item?.sampleRate ?? null,
      frameRate: item?.frameRate ?? null,
      audioBitrate: item?.audioBitrate ?? null,
      audioSampleRate: item?.audioSampleRate ?? null,
      width: item?.width ?? null,
      height: item?.height ?? null
    }))
    .filter((item) => item.relativePath)
    .sort((left, right) => {
      const sortCompare = left.sortOrder - right.sortOrder
      if (sortCompare !== 0) {
        return sortCompare
      }

      return compareByFileName(left.fileName || left.relativePath, right.fileName || right.relativePath)
    })

const getDetailVideoSubItems = (resource: any) => getDetailMediaSubItems(resource?.videoSubs)
const getDetailAsmrSubItems = (resource: any) => getDetailMediaSubItems(resource?.asmrSubs)

const applyStoredDetailAudioTreeMetadata = (nodes: any[], resource: any): any[] => {
  const subItems = isVideoFolderCategory.value
    ? getDetailVideoSubItems(resource)
    : getDetailAsmrSubItems(resource)
  if (!subItems.length) {
    return nodes
  }

  const metadataMap = new Map(subItems.map((item) => [item.relativePath.toLowerCase(), item] as const))
  const basePath = String(resource?.basePath ?? '')
  const visit = (entries: any[]): any[] =>
    entries.map((entry) => {
      if (!entry) {
        return entry
      }

      if (Array.isArray(entry.children) && entry.children.length) {
        return {
          ...entry,
          children: visit(entry.children)
        }
      }

      if (!entry.path) {
        return {...entry}
      }

      const metadata = metadataMap.get(getRelativeVideoPath(basePath, String(entry.path)).toLowerCase())
      if (!metadata) {
        return {...entry}
      }

      return {
        ...entry,
        hasSubtitle: metadata.hasSubtitle ?? entry.hasSubtitle ?? false,
        duration: metadata.duration ?? entry.duration ?? null,
        bitrate: metadata.bitrate ?? entry.bitrate ?? null,
        sampleRate: metadata.sampleRate ?? entry.sampleRate ?? null,
        frameRate: metadata.frameRate ?? entry.frameRate ?? null,
        audioBitrate: metadata.audioBitrate ?? entry.audioBitrate ?? null,
        audioSampleRate: metadata.audioSampleRate ?? entry.audioSampleRate ?? null,
        width: metadata.width ?? entry.width ?? null,
        height: metadata.height ?? entry.height ?? null,
        __metadataResolved: true
      }
    })

  return visit(Array.isArray(nodes) ? nodes : [])
}

const getVideoSubCoverPreviewSrc = (resource: any, relativePath: string | null | undefined) =>
  videoSubCoverPreviewUrls.value[getVideoSubCoverKey(resource, relativePath)] ?? ''

const refreshVideoSubCoverPreviewUrls = async (resource: any) => {
  const resourceId = String(resource?.id ?? '').trim()
  if (!resourceId) {
    return
  }

  const videoSubItems = getDetailVideoSubItems(resource)
  if (!videoSubItems.length) {
    return
  }

  const nextMap = {...videoSubCoverPreviewUrls.value}
  const pendingItems = videoSubItems.filter((item) => {
    const coverPath = String(item.coverPath ?? '').trim()
    const cacheKey = getVideoSubCoverKey(resource, item.relativePath)
    if (!coverPath) {
      nextMap[cacheKey] = ''
      return false
    }

    return !String(nextMap[cacheKey] ?? '').trim()
  })

  if (!pendingItems.length) {
    videoSubCoverPreviewUrls.value = nextMap
    return
  }

  const updates = await Promise.all(pendingItems.map(async (item) => {
    const coverPath = String(item.coverPath ?? '').trim()
    try {
      return {
        key: getVideoSubCoverKey(resource, item.relativePath),
        value: await resolveVideoSubCoverPreviewUrl(coverPath)
      }
    } catch {
      return {
        key: getVideoSubCoverKey(resource, item.relativePath),
        value: ''
      }
    }
  }))

  for (const item of updates) {
    nextMap[item.key] = item.value
  }
  videoSubCoverPreviewUrls.value = nextMap
}

const scheduleVideoSubCoverPreviewRefresh = (resource: any) => {
  requestAnimationFrame(() => {
    void refreshVideoSubCoverPreviewUrls(resource)
  })
}

const applyDetailAudioTreePresentation = (
  targetResource: any = selectedDetailResource.value,
  shouldApply: () => boolean = () => true
) => {
  if (!shouldApply()) {
    return
  }

  detailAudioTree.value = reorderVideoTreeBySubItems(
    applyStoredDetailAudioTreeMetadata(detailAudioTree.value, targetResource),
    targetResource
  )
}

const sortVideoTracksBySubItems = <T extends { path: string; label?: string }>(tracks: T[], resource: any) => {
  const videoSubItems = getDetailVideoSubItems(resource)
  if (!videoSubItems.length) {
    return [...tracks]
  }

  const basePath = String(resource?.basePath ?? '')
  const orderMap = new Map<string, number>(videoSubItems.map((item, index) => [item.relativePath.toLowerCase(), index]))
  const visibleMap = new Map<string, boolean>(videoSubItems.map((item) => [item.relativePath.toLowerCase(), item.isVisible]))

  return [...tracks]
    .filter((track) => {
      const relativePath = getRelativeVideoPath(basePath, track.path).toLowerCase()
      return visibleMap.get(relativePath) !== false
    })
    .sort((left, right) => {
      const leftRelativePath = getRelativeVideoPath(basePath, left.path).toLowerCase()
      const rightRelativePath = getRelativeVideoPath(basePath, right.path).toLowerCase()
      const leftIndex = orderMap.get(leftRelativePath)
      const rightIndex = orderMap.get(rightRelativePath)

      if (leftIndex != null && rightIndex != null && leftIndex !== rightIndex) {
        return leftIndex - rightIndex
      }

      if (leftIndex != null || rightIndex != null) {
        return leftIndex != null ? -1 : 1
      }

      const labelCompare = compareByFileName(String(left.label ?? ''), String(right.label ?? ''))
      if (labelCompare !== 0) {
        return labelCompare
      }

      return compareByFileName(leftRelativePath, rightRelativePath)
    })
}

const reorderVideoTreeBySubItems = (nodes: any[], resource: any): any[] => {
  const videoSubItems = getDetailVideoSubItems(resource)
  if (!isVideoFolderCategory.value || !videoSubItems.length) {
    return nodes
  }

  const basePath = String(resource?.basePath ?? '')
  const orderMap = new Map<string, number>(videoSubItems.map((item, index) => [item.relativePath.toLowerCase(), index]))
  const visibleMap = new Map<string, boolean>(videoSubItems.map((item) => [item.relativePath.toLowerCase(), item.isVisible]))
  const visibleOrderMap = new Map<string, number>(
    videoSubItems
      .filter((item) => item.isVisible !== false)
      .map((item, index) => [item.relativePath.toLowerCase(), index])
  )
  const coverPathMap = new Map(videoSubItems.map((item) => [item.relativePath.toLowerCase(), item.coverPath ?? '']))
  const metadataMap = new Map(videoSubItems.map((item) => [item.relativePath.toLowerCase(), item] as const))

  const visit = (entries: any[]): any[] =>
    entries
      .map((entry) => {
        if (!entry) {
          return null
        }

        if (entry.kind === 'video' && entry.path) {
          const relativePath = getRelativeVideoPath(basePath, String(entry.path)).toLowerCase()
          if (visibleMap.get(relativePath) === false) {
            return null
          }
          const orderIndex = visibleOrderMap.get(relativePath)
          const metadata = metadataMap.get(relativePath)

          return {
            ...entry,
            coverPath: coverPathMap.get(relativePath) ?? '',
            coverPreviewSrc: getVideoSubCoverPreviewSrc(resource, relativePath),
            sortOrderLabel: orderIndex != null ? orderIndex + 1 : '',
            hasSubtitle: metadata?.hasSubtitle ?? entry.hasSubtitle ?? false,
            duration: metadata?.duration ?? entry.duration ?? null,
            bitrate: metadata?.bitrate ?? entry.bitrate ?? null,
            sampleRate: metadata?.sampleRate ?? entry.sampleRate ?? null,
            frameRate: metadata?.frameRate ?? entry.frameRate ?? null,
            audioBitrate: metadata?.audioBitrate ?? entry.audioBitrate ?? null,
            audioSampleRate: metadata?.audioSampleRate ?? entry.audioSampleRate ?? null,
            width: metadata?.width ?? entry.width ?? null,
            height: metadata?.height ?? entry.height ?? null,
            __metadataResolved: true
          }
        }

        if (Array.isArray(entry.children) && entry.children.length) {
          const nextChildren = visit(entry.children)
          if (!nextChildren.length && entry.isDirectory) {
            return null
          }

          return {
            ...entry,
            children: nextChildren
          }
        }

        return {...entry}
      })
      .filter((entry): entry is any => Boolean(entry))
      .sort((left, right) => {
        const resolveOrderIndex = (entry: any): number | null => {
          if (entry?.isDirectory) {
            const childIndexes = Array.isArray(entry.children)
              ? entry.children
                .map((child: any) => resolveOrderIndex(child))
                .filter((value: number | null): value is number => value != null)
              : []
            return childIndexes.length ? Math.min(...childIndexes) : null
          }

          if (entry?.kind === 'video' && entry?.path) {
            const relativePath = getRelativeVideoPath(basePath, String(entry.path)).toLowerCase()
            return orderMap.get(relativePath) ?? null
          }

          return null
        }

        if (Boolean(left?.isDirectory) !== Boolean(right?.isDirectory)) {
          return left?.isDirectory ? -1 : 1
        }

        const leftIndex = resolveOrderIndex(left)
        const rightIndex = resolveOrderIndex(right)
        if (leftIndex != null && rightIndex != null && leftIndex !== rightIndex) {
          return leftIndex - rightIndex
        }

        if (leftIndex != null || rightIndex != null) {
          return leftIndex != null ? -1 : 1
        }

        return compareByFileName(String(left?.label ?? ''), String(right?.label ?? ''))
      })

  return visit(nodes)
}

const detailAudioVideoPlaylist = computed(() => sortVideoTracksBySubItems(
  collectAudioTreeVideoTracks(detailAudioTree.value, selectedDetailResource.value),
  selectedDetailResource.value
))

const normalizeAudioPath = (filePath: string | null | undefined) => String(filePath ?? '').replace(/\\/g, '/').trim().toLowerCase()
const getAudioDirectoryPath = (filePath: string | null | undefined) => String(filePath ?? '').replace(/\\/g, '/').trim().split('/').slice(0, -1).join('/')

const getAudioPlayerCoverPreview = async (resource: any) => {
  const resourceId = String(resource?.id ?? '')
  if (resourceId && resourceId === String(selectedDetailResource.value?.id ?? '')) {
    return detailCoverPreviewSrc.value
  }

  return await resolveAudioPlayerCoverPreviewUrl(String(resource?.coverPath ?? ''))
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

const applyAudioPlayerSession = async (resource: any, playlist: Array<{
  path: string;
  label: string;
  duration?: number | null;
  resourceId?: string;
  resourceTitle?: string;
  artist?: string;
  coverSrc?: string;
  coverPath?: string;
  hasSubtitle?: boolean;
  subtitlePath?: string
}>, initialPath: string, initialTime = 0) => {
  await loadPlaybackResumeRestartThresholds()
  audioPlayerPlaylist.value = [...playlist]
  audioPlayerDisplayMode.value = String(resource?.category?.referencePath ?? resource?.extendTable ?? categorySettings.value.extendTable ?? '').trim() === 'audio_meta'
    ? 'music'
    : 'default'
  const resolvedCoverSrc = await getAudioPlayerCoverPreview(resource)
  setAudioPlayerSession({
    resourceId: String(resource?.id ?? ''),
    initialPath,
    initialTime: Math.max(0, Number(initialTime ?? 0)),
    sessionVersion: Number(audioPlayerStore.sessionVersion.value ?? 0) + 1,
    audioResumeRestartThreshold: audioPlaybackResumeRestartThreshold.value,
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

  const directoryTree = await window.api.dialog.getDirectoryAudioTree(
    String(resource?.basePath ?? ''),
    {includeMetadata: false}
  )
  return reorderVideoTreeBySubItems(applyStoredDetailAudioTreeMetadata(directoryTree, resource), resource)
}

const getVideoPlayerCoverPreview = async (resource: any) => {
  const resourceId = String(resource?.id ?? '')
  if (resourceId && resourceId === String(selectedDetailResource.value?.id ?? '')) {
    return detailCoverPreviewSrc.value
  }

  return await resolveVideoPlayerCoverPreviewUrl(String(resource?.coverPath ?? ''))
}

const buildVideoPlaylistTrack = async (resource: any) => {
  const targetPath = getResourceFilePath(resource)
  if (!targetPath || resource?.missingStatus) {
    return null
  }

  return {
    path: targetPath,
    label: String(resource?.title ?? getResourceNameFromBasePath(targetPath) ?? '当前视频'),
    resourceId: String(resource?.id ?? ''),
    resourceTitle: String(resource?.title ?? getResourceNameFromBasePath(targetPath) ?? '当前视频'),
    coverSrc: await getVideoPlayerCoverPreview(resource)
  }
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
    await readerPlayerActions.openAudioPlaybackFromLaunch(resource)
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
  setAudioPlayerSession({playlist: nextPlaylist})
  showNotifyByType('success', '加入播放列表', `已将“${track.resourceTitle || track.label}”加入播放列表`)
}

const recordResourceAccessIfPossible = async (resource: any, title: string) => {
  const resourceId = String(resource?.id ?? '').trim()
  if (!resourceId) {
    return
  }

  const result = await window.api.service.recordResourceAccess(resourceId)
  if (result?.type === 'error') {
    showNotifyByType('error', title, result?.message ?? '记录访问日志失败')
    return
  }

  await fetchData()
}

const renderAudioTreeFileLabel = (option: any, icon: string, label: string) => h('div', {
  class: 'detail-audio-tree__file',
  onContextmenu: (event: MouseEvent) => handleOpenAudioTreeContextMenu(event, option)
}, [
  option?.kind === 'video'
    ? h('div', {
      class: 'detail-audio-tree__video-cover-shell'
    }, [
      option?.coverPreviewSrc
        ? h('img', {
          src: String(option.coverPreviewSrc),
          alt: '',
          class: 'detail-audio-tree__video-cover'
        })
        : h('div', {
          class: 'detail-audio-tree__video-cover detail-audio-tree__video-cover--empty'
        }),
      h('span', {
        class: 'detail-audio-tree__video-cover-index'
      }, String(option?.sortOrderLabel ?? ''))
    ])
    : null,
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

const renderAudioTreeLabel = ({option}: { option: any }) => {
  if (option?.isDirectory) {
    return h('span', {class: 'detail-audio-tree__label'}, `📁 ${option.label}`)
  }

  if (option?.kind === 'image') {
    return renderAudioTreeFileLabel(option, '🖼', String(option?.label ?? ''))
  }

  if (option?.kind === 'video') {
    return renderAudioTreeFileLabel(option, '🎬', String(option?.label ?? ''))
  }

  return renderAudioTreeFileLabel(option, '🎵', String(option?.label ?? ''))
}

const renderAudioTreeSuffix = ({option}: { option: any }) => {
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
    'aria-label': option?.kind === 'video' ? '播放视频' : '播放音频',
    onClick: (event: MouseEvent) => {
      event.stopPropagation()
      handleAudioTreePlay(option)
    },
    onContextmenu: (event: MouseEvent) => handleOpenAudioTreeContextMenu(event, option),
    onKeydown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      handleAudioTreePlay(option)
    }
  }, '▶')
}
const detailDescriptionBoxStyle = computed(() => ({
  height: `${detailDescriptionHeight.value}px`
}))
const currentScreenshotPath = computed(() => detailScreenshotPaths.value[currentScreenshotIndex.value] ?? '')
const normalizeWebsiteUrl = (value: unknown) => {
  const normalizedValue = String(value ?? '').trim()
  if (!normalizedValue) {
    return ''
  }

  const valueWithScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedValue)
    ? normalizedValue
    : `https://${normalizedValue}`

  try {
    const parsedUrl = new URL(valueWithScheme)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return ''
    }

    return parsedUrl.toString()
  } catch {
    return ''
  }
}
const getWebsiteResourceUrl = (resource: any) =>
  normalizeWebsiteUrl(resource?.websiteMeta?.url ?? resource?.meta?.website ?? resource?.website ?? '')
const detailCanLaunch = computed(() => {
  const resource = selectedDetailResource.value
  if (resource?.missingStatus) {
    return false
  }
  if (categoryProfile.value.flags.isWebsite) {
    return Boolean(getWebsiteResourceUrl(resource))
  }

  return Boolean(resource?.basePath) && !resource?.missingStatus && !resource?.isRunning
})
const detailCanStop = computed(() => {
  return Boolean(selectedDetailResource.value?.isRunning)
})
const detailIsSoftware = computed(() => categoryProfile.value.flags.isSoftware)
const detailIsManga = computed(() => categoryProfile.value.flags.isManga)
const detailIsAsmr = computed(() => categoryProfile.value.flags.isAsmr)
const detailIsAudio = computed(() => categoryProfile.value.flags.isAudio)
const detailIsNovel = computed(() => categoryProfile.value.flags.isNovel)
const detailIsVideo = computed(() => categoryProfile.value.flags.isVideo)
const detailIsWebsite = computed(() => categoryProfile.value.flags.isWebsite)
const {
  coverPreviewSrc,
  detailCoverPreviewSrc,
  detailScreenshotPreviewSrc,
  detailWebsiteFaviconSrc,
  detailGalleryImageUrls,
  normalizeCoverPreviewSource,
  normalizeWebsiteIconSource,
  resolveCoverPreviewUrl,
  resolveVideoSubCoverPreviewUrl,
  resolveAudioPlayerCoverPreviewUrl,
  resolveVideoPlayerCoverPreviewUrl
} = useCategoryPreviewAssets({
  formCoverPath: computed(() => String(formData.value?.coverPath ?? '')),
  detailCoverPath: computed(() => String(selectedDetailResource.value?.coverPath ?? '')),
  currentScreenshotPath: computed(() => String(currentScreenshotPath.value ?? '')),
  detailIsWebsite,
  detailWebsiteFaviconPath: computed(() => String(selectedDetailResource.value?.websiteMeta?.favicon ?? '')),
  detailScreenshotPaths,
  onFormCoverPreviewError: (message) => {
    showNotifyByType('error', '预览失败', message)
  }
})
const detailWebsiteUrl = computed(() => getWebsiteResourceUrl(selectedDetailResource.value))
const detailWebsiteIsDownloadLink = computed(() => Boolean(
  selectedDetailResource.value?.websiteMeta?.isDownloadLink
  ?? selectedDetailResource.value?.meta?.isDownloadLink
))
const detailWebsiteAddressLabel = computed(() => detailWebsiteIsDownloadLink.value ? '下载地址' : '网站地址')
const detailWebsiteIconLabel = computed(() => detailWebsiteIsDownloadLink.value ? '链接图标' : '站点图标')
const detailOpenFolderText = computed(() => detailIsWebsite.value ? `打开${categoryName.value || '资源'}` : `打开${categoryName.value || '资源'}文件夹`)
const detailWebsitePlaceholderEmoji = computed(() =>
  getWebsitePlaceholderEmoji(
    selectedDetailResource.value?.id,
    detailWebsiteUrl.value,
    detailWebsiteIsDownloadLink.value
  )
)
const detailWebsiteCoverPlaceholderText = computed(() => detailWebsiteIsDownloadLink.value ? '下载链接' : '网站封面')
const handleCopyText = async (text: string, label = '内容') => {
  const normalizedText = String(text ?? '')
  if (!normalizedText.trim()) {
    return
  }

  try {
    const message = await window.api.dialog.copyTextToClipboard(normalizedText)
    if (message) {
      showNotifyByType('error', `复制${label}`, message)
      return
    }

    showNotifyByType('success', `复制${label}`, `${label}已复制到剪贴板`)
  } catch (error) {
    showNotifyByType('error', `复制${label}`, error instanceof Error ? error.message : `复制${label}失败`)
  }
}
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
let totalPages: ComputedRef<number> = computed(() => 1)
let handleJumpPage: () => void = () => {
}
let handleShowResourceDetail: (resource: any) => void = () => {
}
let fetchData: () => Promise<void> = async () => {
}

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
const actorSelectOptions = computed(() =>
  normalizedActorList.value
    .map((actor) => ({
      label: actor.name,
      value: actor.name
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
  const values = input
    .split(/[\s、,，]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const mergedValues: string[] = []
  for (const value of values) {
    if (/^(?:\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】)$/.test(value) && mergedValues.length) {
      mergedValues[mergedValues.length - 1] = `${mergedValues[mergedValues.length - 1]} ${value}`.trim()
      continue
    }

    mergedValues.push(value)
  }

  return mergedValues
}

const formatAudioCoverCandidateQuery = (query: Record<string, string>) =>
  Object.entries(query ?? {})
    .map(([key, value]) => {
      const label = key === 'title' ? '歌名' : key === 'artist' ? '歌手' : key === 'album' ? '专辑' : key
      return `${label}：${String(value ?? '').trim()}`
    })
    .filter(Boolean)
    .join(' / ')

const closeAudioCoverCandidateModal = () => {
  showAudioCoverCandidateModal.value = false
  audioCoverCandidates.value = []
}

const handleUseAudioCoverCandidate = (candidate: {
  coverPath?: string
  albumName?: string
}) => {
  formData.value.coverPath = String(candidate?.coverPath ?? '').trim()
  const albumName = String(candidate?.albumName ?? '').trim()
  if (albumName) {
    formData.value.meta = {
      ...(formData.value.meta ?? {}),
      album: albumName
    }
  }
  closeAudioCoverCandidateModal()
}

const closeVideoCoverCandidateModal = () => {
  showVideoCoverCandidateModal.value = false
  videoCoverCandidates.value = []
}

const handleUseVideoCoverCandidate = (coverPath: string) => {
  formData.value.coverPath = String(coverPath ?? '').trim()
  closeVideoCoverCandidateModal()
}

const closeVideoSubCoverCandidateModal = () => {
  showVideoSubCoverCandidateModal.value = false
  videoSubCoverCandidateItems.value = []
}

const handleUseVideoSubCoverCandidate = (coverPath: string) => {
  formData.value.coverPath = String(coverPath ?? '').trim()
  closeVideoSubCoverCandidateModal()
}

const {
  formatVideoFrameTime,
  formatDateTime,
  formatDuration,
  formatAsmrDuration,
  formatLogEndTime,
  formatLogDuration,
  formatLaunchMode,
  getRatingEmoji,
  formatAudioBitrate,
  formatAudioSampleRate,
  formatFrameRate,
  formatImageResolution
} = useCategoryDetailFormatters()

const fixedVideoCoverCandidates = computed(() =>
  videoCoverCandidates.value.filter((candidate) => candidate.group === 'fixed')
)

const randomVideoCoverCandidates = computed(() =>
  videoCoverCandidates.value.filter((candidate) => candidate.group === 'random')
)

;({
  detailUsesBrowseTerms,
  detailUsesPlayTerms,
  detailStatsText,
  detailShowTotalRuntime,
  detailPreviewSectionTitle,
  detailGallerySectionTitle,
  detailDirectorySectionTitle,
  detailDirectoryEmptyText,
  detailEmptyLogDescription,
  detailLogModeLabel,
  detailLogDurationLabel,
  detailShowLogs,
  hasDetailDescription,
  detailReadingProgressText,
  detailPlaybackProgressText,
  detailGalleryItems,
  detailMetaItems,
  detailDisplayPath
} = useCategoryDetailPresentation({
  selectedDetailResource,
  categoryName,
  categorySettings,
  categoryProfile,
  actorFilterLabel,
  detailIsManga,
  detailIsAsmr,
  detailIsAudio,
  detailIsNovel,
  detailIsWebsite,
  isVideoCategory,
  detailScreenshotPaths,
  detailGalleryImageUrls,
  detailWebsiteAddressLabel,
  detailWebsiteIconLabel,
  detailWebsiteIsDownloadLink,
  detailWebsitePlaceholderEmoji,
  detailWebsiteFaviconSrc,
  detailWebsiteUrl,
  normalizedEngineList,
  normalizedEngineOptionList,
  normalizedLanguageList,
  normalizeWebsiteIconSource,
  formatDuration,
  formatAsmrDuration,
  formatAudioBitrate,
  formatAudioSampleRate,
  buildDisplayBasePath
}))

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

const resetAddResourceDuplicateState = () => {
  addResourceDuplicateCheckToken += 1
  addResourceDuplicateChecking.value = false
  addResourceDuplicateMessage.value = ''
  addResourceDuplicateTitle.value = ''
}

const syncAddResourceDuplicateState = async (basePathInput: string) => {
  const basePath = String(basePathInput ?? '').trim()
  const commandLineArgs = String(formData.value?.meta?.commandLineArgs ?? '').trim()
  const isSoftwareDuplicateCheck = String(categorySettings.value.extendTable ?? '').trim() === 'software_meta'
  const requestToken = ++addResourceDuplicateCheckToken

  if (!showModal.value || showEditModal.value || editingResourceId.value) {
    resetAddResourceDuplicateState()
    return
  }

  if (!basePath || !validateBasePathExtension(basePath)) {
    addResourceDuplicateChecking.value = false
    addResourceDuplicateMessage.value = ''
    addResourceDuplicateTitle.value = ''
    return
  }

  addResourceDuplicateChecking.value = true
  addResourceDuplicateMessage.value = ''
  addResourceDuplicateTitle.value = ''

  try {
    const result = await window.api.service.checkResourceExistsByPath(basePath)
    if (requestToken !== addResourceDuplicateCheckToken) {
      return
    }

    if (result?.type === 'error') {
      addResourceDuplicateChecking.value = false
      addResourceDuplicateMessage.value = ''
      addResourceDuplicateTitle.value = ''
      return
    }

    const existingResource = result?.data ?? null
    const existingCommandLineArgs = String(existingResource?.softwareMeta?.commandLineArgs ?? '').trim()
    const isDuplicate = result?.exists && (
      !isSoftwareDuplicateCheck
      || existingCommandLineArgs === commandLineArgs
    )
    addResourceDuplicateChecking.value = false
    addResourceDuplicateTitle.value = String(existingResource?.title ?? '').trim()
    addResourceDuplicateMessage.value = isDuplicate
      ? `该资源已存在${addResourceDuplicateTitle.value ? `：${addResourceDuplicateTitle.value}` : ''}`
      : ''
    await nextTick()
    await basePathFormItemRef.value?.validate?.({ trigger: 'change' })
  } catch {
    if (requestToken !== addResourceDuplicateCheckToken) {
      return
    }

    addResourceDuplicateChecking.value = false
    addResourceDuplicateMessage.value = ''
    addResourceDuplicateTitle.value = ''
    await nextTick()
    await basePathFormItemRef.value?.validate?.({ trigger: 'change' })
  }
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

const batchImportState = useCategoryBatchImportState({
  categoryId,
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
  showBatchImportModal,
  batchProgressRunning,
  batchProgressStage,
  batchImportResourceLabel,
  getBatchImportOngoingId,
  getResourceNameFromBasePath,
  upsertOngoingCenterItem,
  removeOngoingCenterItem
})
const ensureBatchImportState = batchImportState.ensureBatchImportState
const syncBatchImportRefsFromState = batchImportState.syncBatchImportRefsFromState
const syncBatchImportStateFromRefs = batchImportState.syncBatchImportStateFromRefs
const patchBatchImportState = batchImportState.patchBatchImportState
const syncBatchImportOngoingCenter = (targetCategoryId = categoryId.value) =>
  batchImportState.syncBatchImportOngoingCenter(targetCategoryId, handleReopenBatchImportProgress)
const clearBatchImportOngoingCenter = batchImportState.clearBatchImportOngoingCenter
const handleBatchImportRunInBackground = () =>
  batchImportState.handleBatchImportRunInBackground(syncBatchImportOngoingCenter)
const handleReopenBatchImportProgress = () =>
  batchImportState.handleReopenBatchImportProgress(syncBatchImportOngoingCenter)
const handleDismissBatchImportProgressToast = batchImportState.handleDismissBatchImportProgressToast
const handleStopBatchImportAnalysis = batchImportState.handleStopBatchImportAnalysis
const handleCloseBatchImportModal = () =>
  batchImportState.handleCloseBatchImportModal(isBatchImportSubmitting.value)

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

const readerSessions = useCategoryReaderSessions({
  categoryId,
  completedResourceCount,
  resourceList,
  currentScreenshotIndex,
  pictureViewerResourceIds,
  currentPictureViewerResourceId,
  currentComicReaderResourceId,
  currentTextReaderResourceId,
  currentPdfReaderResourceId,
  currentEpubReaderResourceId,
  currentEbookReaderResourceId,
  textReaderInitialProgress,
  pdfReaderInitialProgress,
  epubReaderInitialProgress,
  ebookReaderInitialProgress,
  showEbookReader,
  showNotifyByType,
  fetchData: async () => {
    await fetchData()
  }
})

const {
  readComicProgress,
  writeComicProgress,
  startComicReadingSession,
  stopPictureViewingSession,
  handlePictureViewerIndexChange,
  stopComicReadingSession,
  handleComicReaderPageChange,
  readNovelProgress,
  stopTextReadingSession,
  stopPdfReadingSession,
  stopEpubReadingSession,
  stopEbookReadingSession,
  startNovelReaderSession,
  handleTextReaderProgressChange,
  handlePdfReaderProgressChange,
  handleEpubReaderProgressChange,
  handleEbookReaderProgressChange,
  handleEbookReaderShowUpdate
} = readerSessions

const editorPathAnalysis = useCategoryEditorPathAnalysis({
  formData,
  categorySettings,
  detailIsAsmr,
  websiteTypeOptions,
  showNotifyByType,
  confirmDialog,
  getFileNameWithoutExtension,
  getResourceNameFromBasePath,
  normalizeAudioAuthorList,
  joinAudioAuthorNames,
  syncAudioAuthorFields
})

const {
  applyDefaultPathName,
  applyNovelFileAnalysis,
  applyGamePathAnalysis,
  buildAudioFetchPayload,
  fetchAudioLyricsSilently,
  fetchAudioAlbumCoverSilently,
  applyAudioPathAnalysis,
  applyMultiImageDirectoryAnalysis,
  applyAudioCoverAnalysis
} = editorPathAnalysis

const editorSoftwareScript = useCategoryEditorSoftwareScript({
  formData,
  basePathFormItemRef,
  showSoftwareScriptModal,
  softwareScriptDraft,
  softwareScriptRuntimePath,
  softwareScriptRuntimes,
  softwareScriptShellType,
  showNotifyByType
})

const {
  ensureSoftwareScriptRuntimes,
  resolveSoftwareScriptShell,
  denormalizeSoftwareScript,
  handleConfirmSoftwareScript
} = editorSoftwareScript

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

      if (showModal.value && !editingResourceId.value && addResourceDuplicateMessage.value) {
        return new Error(addResourceDuplicateMessage.value)
      }

      return true
    }
  },
  'meta.website': {
    trigger: ['blur', 'change'],
    validator: (_rule: unknown, value: string) => {
      if (String(categorySettings.value.extendTable ?? '').trim() !== 'website_meta') {
        return true
      }

      if (!String(value ?? '').trim()) {
        return new Error('请输入网站地址')
      }

      if (!normalizeWebsiteUrl(value)) {
        return new Error('请输入合法的网站地址')
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

onMounted(() => {
  void loadPlaybackResumeRestartThresholds()
  window.addEventListener('click', closeDetailAudioContextMenu)
  window.addEventListener('resize', closeDetailAudioContextMenu)
  window.addEventListener('mousemove', handleDetailDrawerResizeMove)
  window.addEventListener('mouseup', handleDetailDrawerResizeEnd)
  reportCategoryRoutePerf('category-mounted')
  void nextTick(() => {
    requestAnimationFrame(() => {
      reportCategoryRoutePerf('category-mounted-frame')
    })
  })
})

onBeforeMount(() => {
  const perf = readCategoryRoutePerf()
  if (!perf || String(perf.categoryId ?? '') !== String(categoryId.value ?? '')) {
    return
  }

  emitRendererTiming('category route perf', {
    phase: 'category-before-mount',
    elapsedMs: Math.round(performance.now() - Number(perf.startedAt ?? 0)),
    from: perf.from,
    to: perf.to,
    categoryId: perf.categoryId
  })
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
  if (showTextReader.value) {
    void stopTextReadingSession()
  }
  if (showPdfReader.value) {
    void stopPdfReadingSession()
  }
  if (showEpubReader.value) {
    void stopEpubReadingSession()
  }
  window.removeEventListener('mousemove', handleDetailDrawerResizeMove)
  window.removeEventListener('mouseup', handleDetailDrawerResizeEnd)
  document.body.style.userSelect = ''
})

watch(
  () => [loading.value, resourceList.value.length] as const,
  ([isLoading, count]) => {
    if (isLoading) {
      return
    }

    void nextTick(() => {
      requestAnimationFrame(() => {
        reportCategoryRoutePerf('category-list-visible', {
          itemCount: count
        })
      })
    })
  },
  { flush: 'post' }
)

watch(
  () => selectedDetailResource.value?.rating,
  (rating) => {
    detailRatingDraft.value = Number(rating ?? -1)
  },
  {immediate: true}
)

watch(
  () => [selectedDetailResource.value?.description, detailDrawerWidth.value],
  () => {
    updateDetailDescriptionHeight()
  }
)

watch(showPictureViewer, (visible, previousVisible) => {
  if (visible || !previousVisible || !currentPictureViewerResourceId.value) {
    return
  }

  void stopPictureViewingSession()
})

watch(showComicReader, (visible, previousVisible) => {
  if (visible || !previousVisible) {
    return
  }

  void stopComicReadingSession()
})

watch(
  () => [
    showModal.value,
    showEditModal.value,
    editingResourceId.value,
    String(formData.value?.basePath ?? '').trim(),
    String(formData.value?.meta?.commandLineArgs ?? '').trim(),
    String(categorySettings.value.extendTable ?? '').trim()
  ] as const,
  ([isAddVisible, isEditVisible, editingId, basePath]) => {
    if (!isAddVisible || isEditVisible || editingId) {
      resetAddResourceDuplicateState()
      return
    }

    void syncAddResourceDuplicateState(basePath)
  },
  { immediate: true }
)

watch(showTextReader, (visible, previousVisible) => {
  if (visible || !previousVisible) {
    return
  }

  textReaderFilePath.value = ''
  textReaderTitle.value = ''
  textReaderInitialProgress.value = 0
  void stopTextReadingSession()
})

watch(showPdfReader, (visible, previousVisible) => {
  if (visible || !previousVisible) {
    return
  }

  pdfReaderFilePath.value = ''
  pdfReaderTitle.value = ''
  pdfReaderInitialProgress.value = 0
  void stopPdfReadingSession()
})

watch(showEpubReader, (visible, previousVisible) => {
  if (visible || !previousVisible) {
    return
  }

  epubReaderFilePath.value = ''
  epubReaderTitle.value = ''
  epubReaderInitialProgress.value = 0
  void stopEpubReadingSession()
})

// --- E. 交互事件 ---

const handleAudioAuthorsChange = (value: string[]) => {
  syncAudioAuthorFields(formData.value, value)
}

const BATCH_ANALYZE_CONCURRENCY = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 2 || 2))

const resourceEditor = useCategoryResourceEditor({
  showModal,
  showEditModal,
  formData,
  editingResourceId,
  editInitialFormData,
  formRef,
  basePathFormItemRef,
  showDetailDrawer,
  selectedDetailResource,
  isDragOver,
  categoryInfo,
  categoryName,
  categorySettings,
  createEmptyFormData,
  cloneFormData,
  mapResourceDetailToFormData,
  syncAudioAuthorFields,
  validateBasePathExtension,
  normalizeWebsiteUrl,
  closeVideoSubCoverCandidateModal,
  fetchData: async () => {
    await fetchData()
  },
  showNotifyByType,
  getBasePathValidationMessage,
  applyDefaultPathName,
  applyAudioPathAnalysis,
  applyAudioCoverAnalysis,
  applyGamePathAnalysis,
  applyNovelFileAnalysis,
  applyMultiImageDirectoryAnalysis,
  duplicateResourceChecking: addResourceDuplicateChecking,
  duplicateResourceMessage: addResourceDuplicateMessage
})
const handleAddResource = resourceEditor.handleAddResource
const handleCloseModal = resourceEditor.handleCloseModal
const handleResetEditForm = resourceEditor.handleResetEditForm
const handleRestoreDefaultEditForm = resourceEditor.handleRestoreDefaultEditForm
const handleSubmitResource = resourceEditor.handleSubmitResource
const handleEditResource = resourceEditor.handleEditResource
const handleSubmitEditResource = resourceEditor.handleSubmitEditResource
const handleDropResourceFile = resourceEditor.handleDropResourceFile

const batchImportCategoryActions = useCategoryBatchImportCategoryActions({
  categoryId,
  categoryInfo,
  categorySettings,
  detailIsManga,
  detailIsAsmr,
  ensureBatchImportState,
  patchBatchImportState,
  syncBatchImportOngoingCenter,
  clearBatchImportOngoingCenter,
  showNotifyByType,
  confirmDialog,
  getResourceNameFromBasePath,
  getFileName,
  getFileNameWithoutExtension,
  validateBasePathExtension,
  detectPixivIdFromFilePath,
  normalizeAudioAuthorList,
  joinAudioAuthorNames,
  fetchData: async () => {
    await fetchData()
  },
  cloneFormData,
  mapResourceDetailToFormData,
  syncAudioAuthorFields,
  buildAudioFetchPayload,
  fetchAudioLyricsSilently,
  fetchAudioAlbumCoverSilently,
  logger,
  BATCH_ANALYZE_CONCURRENCY
})
const handleBatchImportImages = batchImportCategoryActions.handleBatchImportImages
const handleBatchImportComics = batchImportCategoryActions.handleBatchImportComics
const handleBatchImportAsmrs = batchImportCategoryActions.handleBatchImportAsmrs
const handleBatchImportAudioFiles = batchImportCategoryActions.handleBatchImportAudioFiles
const handleBatchImportNovelFiles = batchImportCategoryActions.handleBatchImportNovelFiles
const handleBatchImportVideoFiles = batchImportCategoryActions.handleBatchImportVideoFiles
const handleBatchImportAnimeDirectories = batchImportCategoryActions.handleBatchImportAnimeDirectories

const batchImportWorkflow = useCategoryBatchImportWorkflow({
  categoryId,
  currentPage,
  resourceList,
  totalResources,
  categorySettings,
  detailIsManga,
  detailIsAsmr,
  isSingleImageCategory,
  isAudioCategory,
  isNovelCategory,
  isVideoCategory,
  isVideoFolderCategory,
  batchImportItems,
  batchImportFetchInfoEnabled,
  isBatchImportSubmitting,
  batchProgressRunning,
  ensureBatchImportState,
  patchBatchImportState,
  syncBatchImportOngoingCenter,
  clearBatchImportOngoingCenter,
  handleBatchImportRunInBackground,
  getResourceNameFromBasePath,
  isBatchImportItemImportable,
  showNotifyByType,
  fetchData: async () => {
    await fetchData()
  },
  resetCategoryListState,
  logger,
  handleBatchImportImages,
  handleBatchImportComics,
  handleBatchImportAsmrs,
  handleBatchImportAudioFiles,
  handleBatchImportNovelFiles,
  handleBatchImportVideoFiles,
  handleBatchImportAnimeDirectories,
  BATCH_ANALYZE_CONCURRENCY
})
const handleBatchImportClick = batchImportWorkflow.handleBatchImportClick
const handleBatchImportMaskClick = batchImportWorkflow.handleBatchImportMaskClick
const handleSelectBatchLaunchFile = batchImportWorkflow.handleSelectBatchLaunchFile
const handleBatchImportSelectAll = batchImportWorkflow.handleBatchImportSelectAll
const handleBatchImportDeselectAll = batchImportWorkflow.handleBatchImportDeselectAll
const handleBatchImportInvert = batchImportWorkflow.handleBatchImportInvert
const canToggleBatchImportItem = batchImportWorkflow.canToggleBatchImportItem
const handleToggleBatchImportItem = batchImportWorkflow.handleToggleBatchImportItem
const handleConfirmBatchImport = batchImportWorkflow.handleConfirmBatchImport
const handleBatchImportLoadingShowUpdate = (value: boolean) => {
  showBatchImportLoading.value = value
}
const handleBatchImportPreviewShowUpdate = (value: boolean) => {
  showBatchImportModal.value = value
}
const handleBatchImportFetchInfoEnabledUpdate = (value: boolean) => {
  batchImportFetchInfoEnabled.value = Boolean(value)
}
const handleBatchImportItemCheckedChange = (index: number, value: boolean) => {
  if (!batchImportItems.value[index]) {
    return
  }

  batchImportItems.value[index].checked = value
}
const handleBatchImportItemWebsiteTypeChange = (index: number, value: string) => {
  if (!batchImportItems.value[index]) {
    return
  }

  batchImportItems.value[index].websiteType = String(value ?? '')
}
const handleBatchImportItemGameIdChange = (index: number, value: string) => {
  if (!batchImportItems.value[index]) {
    return
  }

  batchImportItems.value[index].gameId = value
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
const listPresentation = useCategoryListPresentation({
  batchProgressRunning,
  batchAnalyzeInBackground,
  selectedResourceIds,
  selectionModeManuallyEnabled,
  resourceList,
  authorList,
  actorList,
  albumList,
  engineList,
  tagList,
  typeList,
  authorSearch,
  actorSearch,
  albumSearch,
  tagSearch,
  typeSearch,
  detailIsAsmr,
  showAuthorFilter,
  showActorFilter,
  isAudioCategory,
  showEngineFilter,
  totalResources,
  pageSize,
  currentPage,
  jumpPageInput,
  resolveEngineIcon
})
selectedResourceCount = listPresentation.selectedResourceCount
resourceSelectionMode = listPresentation.resourceSelectionMode
currentPageResourceIds = listPresentation.currentPageResourceIds
currentCategoryBatchInBackground = listPresentation.currentCategoryBatchInBackground
normalizedAuthorList = listPresentation.normalizedAuthorList
normalizedActorList = listPresentation.normalizedActorList
normalizedEngineList = listPresentation.normalizedEngineList
normalizedTagList = listPresentation.normalizedTagList
normalizedTypeList = listPresentation.normalizedTypeList
normalizedAlbumList = listPresentation.normalizedAlbumList
filteredAuthorList = listPresentation.filteredAuthorList
filteredActorList = listPresentation.filteredActorList
filteredEngineList = listPresentation.filteredEngineList
filteredTagList = listPresentation.filteredTagList
filteredTypeList = listPresentation.filteredTypeList
filteredAlbumList = listPresentation.filteredAlbumList
filterSectionsStyle = listPresentation.filterSectionsStyle
totalPages = listPresentation.totalPages
handleJumpPage = listPresentation.handleJumpPage

const pageBootstrap = useCategoryPageBootstrap({
  route,
  categoryId,
  keyword,
  currentPage,
  pageSize,
  sortBy,
  totalPages,
  jumpPageInput,
  loading,
  suppressAutoFetch,
  resourceList,
  totalResources,
  categoryInfo,
  languageOptions,
  websiteTypeOptions,
  localeEmulatorPath,
  mtoolPath,
  authorList,
  actorList,
  albumList,
  engineList,
  engineOptionList,
  missingResourceCount,
  favoriteResourceCount,
  completedResourceCount,
  runningResourceCount,
  tagList,
  typeList,
  selectedDetailResource,
  showCompletedFilter,
  isWebsiteCategory,
  showVideoPlayer,
  detailIsManga,
  detailIsAsmr,
  showActorFilter,
  isAudioCategory,
  categorySettings,
  showEngineFilter,
  normalizedAuthorList,
  normalizedActorList,
  normalizedAlbumList,
  normalizedEngineList,
  normalizedTagList,
  normalizedTypeList,
  selectedAuthorList,
  selectedActorList,
  selectedAlbumList,
  selectedEngineList,
  selectedTagList,
  selectedTypeList,
  missingFile,
  favoriteOnly,
  completedOnly,
  runningOnly,
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
  showBatchImportModal,
  buildResourceQuery,
  resetSelected,
  resetCategoryListState,
  mergeResourceSummaryIntoDetail,
  assignSanitizedSelectedFilterValues,
  showNotifyByType,
  handleShowResourceDetail: (resource) => handleShowResourceDetail(resource),
  syncBatchImportRefsFromState,
  syncBatchImportStateFromRefs,
  ensureBatchImportState,
  patchBatchImportState,
  syncBatchImportOngoingCenter,
  clearBatchImportOngoingCenter,
  logger,
  emitRendererTiming
})
fetchData = pageBootstrap.fetchData

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

const handleTagSearch = (value: string) => {
  tagInputValue.value = value
}

const handleTypeSearch = (value: string) => {
  typeInputValue.value = value
}

const editorAssistActions = useCategoryEditorAssistActions({
  formData,
  editingResourceId,
  fetchResourceInfoLoading,
  videoCoverFrameLoading,
  showAudioCoverCandidateModal,
  showVideoCoverCandidateModal,
  showVideoSubCoverCandidateModal,
  audioCoverCandidates,
  videoCoverCandidates,
  videoSubCoverCandidateItems,
  basePathFormItemRef,
  showSoftwareScriptModal,
  softwareScriptDraft,
  softwareScriptRuntimePath,
  categoryName,
  categorySettings,
  isSoftwareCategory,
  isVideoFolderCategory,
  detailIsAsmr,
  websiteTypeOptions,
  normalizedLanguageList,
  showNotifyByType,
  validateBasePathExtension,
  getBasePathValidationMessage,
  applyDefaultPathName,
  applyAudioPathAnalysis,
  applyAudioCoverAnalysis,
  applyGamePathAnalysis,
  applyNovelFileAnalysis,
  applyMultiImageDirectoryAnalysis,
  normalizeSelectedValues,
  normalizeWebsiteUrl,
  resolveCoverPreviewUrl,
  formatAudioCoverCandidateQuery,
  ensureSoftwareScriptRuntimes,
  resolveSoftwareScriptShell,
  denormalizeSoftwareScript,
  isEditorActive: () => Boolean(showModal.value || showEditModal.value)
})
const handleOpenSoftwareScriptModal = editorAssistActions.handleOpenSoftwareScriptModal
const handleFetchAlbumCover = editorAssistActions.handleFetchAlbumCover
const handleUseScreenshotCover = editorAssistActions.handleUseScreenshotCover
const handleUseVideoRandomFrameCover = editorAssistActions.handleUseVideoRandomFrameCover
const handleUseFirstCover = editorAssistActions.handleUseFirstCover
const handleChooseCustomCover = editorAssistActions.handleChooseCustomCover
const handleFetchWebsiteCover = editorAssistActions.handleFetchWebsiteCover
const handleChooseCoverFromScreenshotFolder = editorAssistActions.handleChooseCoverFromScreenshotFolder
const handleClearCover = editorAssistActions.handleClearCover
const handleSelectBasePath = editorAssistActions.handleSelectBasePath
const handleFetchGameInfo = editorAssistActions.handleFetchGameInfo
const handleFetchWebsiteInfo = editorAssistActions.handleFetchWebsiteInfo
const handleCheckGameEngine = editorAssistActions.handleCheckGameEngine

const loadPictureViewerScrollMode = async () => {
  try {
    const setting = await window.api.db.getSetting(Settings.PICTURE_READ_SCROLL_MODE)
    pictureViewerScrollMode.value = String(setting?.value ?? Settings.PICTURE_READ_SCROLL_MODE.default).trim() || String(Settings.PICTURE_READ_SCROLL_MODE.default)
  } catch {
    pictureViewerScrollMode.value = String(Settings.PICTURE_READ_SCROLL_MODE.default)
  }
}

let readerPlayerActions!: ReturnType<typeof useCategoryReaderPlayerActions>

const capabilityActions = useCategoryCapabilityActions({
  categoryName,
  categorySettingsExtendTable: computed(() => String(categorySettings.value.extendTable ?? '').trim()),
  canZoneLaunch,
  canMtoolLaunch,
  selectedDetailResource,
  currentPictureViewerResourceId,
  currentComicReaderResourceId,
  currentTextReaderResourceId,
  currentPdfReaderResourceId,
  currentEpubReaderResourceId,
  currentEbookReaderResourceId,
  showPictureViewer,
  showComicReader,
  showTextReader,
  showPdfReader,
  showEpubReader,
  showEbookReader,
  showNotifyByType,
  fetchData,
  getResourceFilePath,
  getWebsiteResourceUrl,
  recordResourceAccessIfPossible,
  hideAudioPlayer: () => setAudioPlayerVisible(false),
  stopAudioPlayback: async (resource) => {
    const stopControl = audioPlayerStore.controls.value.stop
    if (stopControl) {
      await Promise.resolve(stopControl())
      return
    }

    await window.api.service.stopAsmrPlayback(String(resource?.id ?? ''))
  },
  onLaunchSpecialResource: async (resource) => await readerPlayerActions.onLaunchSpecialResource(resource)
})

const handleLaunchResource = capabilityActions.handleLaunchResource
const handleStopResource = capabilityActions.handleStopResource
const handleZoneLaunchResource = capabilityActions.handleZoneLaunchResource
const handleMtoolLaunchResource = capabilityActions.handleMtoolLaunchResource

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

const handleOpenResourceFolder = capabilityActions.handleOpenResourceFolder
const handleDefaultAppPlayResource = capabilityActions.handleDefaultAppPlayResource
const handleOpenScreenshotFolder = capabilityActions.handleOpenScreenshotFolder
const handleOpenDetailResourcePath = capabilityActions.handleOpenDetailResourcePath
const handleOpenStoreWebsite = capabilityActions.handleOpenStoreWebsite
const handleDetailLaunchAction = capabilityActions.handleDetailLaunchAction
let handledAutoLaunchRouteKey = ''

const getRouteQueryText = (value: unknown) => {
  const rawValue = Array.isArray(value) ? value[0] : value
  return String(rawValue ?? '').trim()
}

watch(
  () => [
    getRouteQueryText(route.query.autoLaunch),
    getRouteQueryText(route.query.openDetail),
    getRouteQueryText(route.query.resourceId),
    String(selectedDetailResource.value?.id ?? '').trim(),
    showDetailDrawer.value
  ] as const,
  async ([autoLaunch, openDetail, routeResourceId, selectedResourceId, drawerVisible]) => {
    if (autoLaunch !== '1' || openDetail !== '1' || !drawerVisible || !routeResourceId || routeResourceId !== selectedResourceId) {
      return
    }

    const autoLaunchKey = `${String(categoryId.value ?? '').trim()}:${routeResourceId}:${autoLaunch}`
    if (!autoLaunchKey || autoLaunchKey === handledAutoLaunchRouteKey) {
      return
    }

    handledAutoLaunchRouteKey = autoLaunchKey

    try {
      await nextTick()
      await handleDetailLaunchAction()
    } finally {
      const nextQuery = { ...route.query }
      delete nextQuery.autoLaunch
      void router.replace({
        name: 'category',
        params: { id: categoryId.value },
        query: nextQuery
      })
    }
  }
)

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

const getBatchProgressDirectoryName = () => {
  const [, secondLine] = String(batchAnalyzeMessage.value ?? '').split('\n')
  return getResourceNameFromBasePath(secondLine || batchAnalyzeMessage.value || '')
    || secondLine
    || batchAnalyzeMessage.value
    || '正在准备分析目录'
}
watch(
  [batchAnalyzeRunning, batchImportRunning, batchAnalyzeInBackground],
  () => {
    if (batchProgressRunning.value) {
      syncBatchImportOngoingCenter()
    } else {
      clearBatchImportOngoingCenter()
    }
  }
)

const batchActions = useCategoryBatchActions({
  categoryId,
  categoryName,
  categoryInfo,
  resourceList,
  selectedResourceIds,
  selectionModeManuallyEnabled,
  currentPageResourceIds,
  selectedResourceCount,
  resourceSelectionMode,
  isAudioCategory,
  isVideoCategory,
  showBatchLabelModal,
  isBatchDeleting,
  isBatchFetchingAlbumCover,
  isBatchLabelSubmitting,
  batchLabelField,
  batchLabelMode,
  batchLabelValues,
  batchLabelSingleValue,
  batchLabelInputValue,
  tagSelectOptions,
  typeSelectOptions,
  authorSelectOptions,
  actorSelectOptions,
  albumSelectOptions,
  actorLabel: actorFilterLabel,
  showNotifyByType,
  confirmDialog,
  fetchData,
  cloneFormData,
  mapResourceDetailToFormData,
  syncAudioAuthorFields,
  normalizeAudioAuthorList,
  normalizeSelectedValues,
  joinAudioAuthorNames,
  getResourceFilePath,
  fetchAudioAlbumCoverSilently,
  logger
})
const batchLabelIsSingleValue = batchActions.batchLabelIsSingleValue
const batchLabelOptions = batchActions.batchLabelOptions
const batchLabelTitle = batchActions.batchLabelTitle
const batchLabelPlaceholder = batchActions.batchLabelPlaceholder
const handleToggleSelectResource = batchActions.handleToggleSelectResource
const handleToggleSelectionMode = batchActions.handleToggleSelectionMode
const resetBatchLabelDialog = batchActions.resetBatchLabelDialog
const openBatchLabelDialog = batchActions.openBatchLabelDialog
const closeBatchLabelDialog = batchActions.closeBatchLabelDialog
const handleBatchLabelValuesChange = batchActions.handleBatchLabelValuesChange
const handleBatchLabelSingleValueChange = batchActions.handleBatchLabelSingleValueChange
const handleBatchLabelInputCommit = batchActions.handleBatchLabelInputCommit
const handleBatchLabelInputKeydown = batchActions.handleBatchLabelInputKeydown
const createSelectOption = batchActions.createSelectOption
const handleBatchLabelSearch = batchActions.handleBatchLabelSearch
const handleSubmitBatchLabelAction = batchActions.handleSubmitBatchLabelAction
const handleSelectAllResources = batchActions.handleSelectAllResources
const handleDeselectAllResources = batchActions.handleDeselectAllResources
const handleInvertSelectedResources = batchActions.handleInvertSelectedResources
const handleBatchFetchAlbumCover = batchActions.handleBatchFetchAlbumCover
const handleBatchSelectionAction = batchActions.handleBatchSelectionAction

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
  targetResource: any = selectedDetailResource.value,
  shouldApply: () => boolean = () => true
) => {
  let nextScreenshotPaths: string[] = []
  try {
    if (detailIsManga.value) {
      nextScreenshotPaths = await window.api.dialog.getDirectoryImages(String(targetResource?.basePath ?? ''))
    } else {
      nextScreenshotPaths = await window.api.dialog.getScreenshotImages(String(targetResource?.id ?? ''))
    }
  } catch {
    nextScreenshotPaths = []
  }

  if (!shouldApply()) {
    return
  }

  detailScreenshotPaths.value = nextScreenshotPaths

  if (!nextScreenshotPaths.length) {
    currentScreenshotIndex.value = 0
    showPictureViewer.value = false
    showComicReader.value = false
    return
  }

  currentScreenshotIndex.value = Math.min(
    Math.max(0, nextIndex),
    Math.max(0, nextScreenshotPaths.length - 1)
  )
}

const refreshDetailAudioTree = async (
  targetResource: any = selectedDetailResource.value,
  shouldApply: () => boolean = () => true
) => {
  if (!detailIsAsmr.value && !isVideoFolderCategory.value) {
    detailAudioTreeLoading.value = false
    detailAudioTree.value = []
    return
  }

  detailAudioTreeLoading.value = true
  let nextAudioTree: any[] = []
  try {
    const directoryTree = await window.api.dialog.getDirectoryAudioTree(
      String(targetResource?.basePath ?? ''),
      {includeMetadata: false}
    )
    nextAudioTree = reorderVideoTreeBySubItems(
      applyStoredDetailAudioTreeMetadata(directoryTree, targetResource),
      targetResource
    )
  } catch {
    nextAudioTree = []
  }

  if (!shouldApply()) {
    return
  }

  detailAudioTree.value = nextAudioTree
  detailAudioTreeLoading.value = false
}

readerPlayerActions = useCategoryReaderPlayerActions({
  categoryId,
  categoryName,
  selectedDetailResource,
  resourceList,
  totalResources,
  sortBy,
  detailScreenshotPaths,
  detailAudioPlaylist,
  detailAudioVideoPlaylist,
  detailAudioImagePaths,
  pictureViewerImagePaths,
  pictureViewerResourceIds,
  pictureViewerInitialIndex,
  pictureViewerAllowDelete,
  comicReaderImagePaths,
  comicReaderInitialIndex,
  currentScreenshotIndex,
  currentPictureViewerResourceId,
  currentComicReaderResourceId,
  currentTextReaderResourceId,
  currentPdfReaderResourceId,
  currentEpubReaderResourceId,
  currentEbookReaderResourceId,
  textReaderInitialProgress,
  pdfReaderInitialProgress,
  epubReaderInitialProgress,
  ebookReaderInitialProgress,
  textReaderFilePath,
  pdfReaderFilePath,
  epubReaderFilePath,
  ebookReaderFilePath,
  textReaderTitle,
  pdfReaderTitle,
  epubReaderTitle,
  ebookReaderTitle,
  showPictureViewer,
  showComicReader,
  showTextReader,
  showPdfReader,
  showEpubReader,
  showEbookReader,
  showVideoPlayer,
  videoPlayerPlaylist,
  videoPlayerInitialPath,
  videoPlayerInitialTime,
  videoPlayerTitle,
  isSingleImageCategory,
  detailIsManga,
  detailIsAsmr,
  detailIsAudio,
  detailIsVideo,
  detailIsNovel,
  isVideoFolderCategory,
  showNotifyByType,
  getResourceFilePath,
  getFileNameWithoutExtension,
  getAudioDirectoryPath,
  normalizeAudioPath,
  loadPictureViewerScrollMode,
  fetchData,
  applyAudioPlayerSession,
  loadPlaybackResumeRestartThresholds,
  loadAllCategoryResources,
  buildMusicPlaylistTrack,
  buildVideoPlaylistTrack,
  resolveResourceAudioTree,
  collectAudioTreeTracks,
  collectAudioTreeVideoTracks,
  sortVideoTracksBySubItems,
  refreshVideoSubCoverPreviewUrls,
  readComicProgress,
  writeComicProgress,
  refreshDetailScreenshots,
  startComicReadingSession,
  stopComicReadingSession,
  readNovelProgress,
  startNovelReaderSession,
  stopTextReadingSession,
  stopPdfReadingSession,
  stopEpubReadingSession,
  stopEbookReadingSession
})
const handleOpenAudioTreeImage = readerPlayerActions.handleOpenAudioTreeImage
const handleAudioTreePlay = readerPlayerActions.handleAudioTreePlay
const {
  closeDetailAudioContextMenu,
  handleOpenAudioTreeContextMenu,
  detailAudioContextMenuOptions,
  detailAudioContextMenuPosition,
  handleSelectDetailAudioContextMenu
} = useCategoryDetailAudioContextMenu({
  detailAudioContextMenuVisible,
  detailAudioContextMenuX,
  detailAudioContextMenuY,
  detailAudioContextMenuTarget,
  formatAsmrDuration,
  formatAudioBitrate,
  formatAudioSampleRate,
  formatFrameRate,
  formatImageResolution,
  handleOpenAudioTreeImage,
  handleAudioTreePlay,
  showNotifyByType
})
const handleOpenPictureViewer = readerPlayerActions.handleOpenPictureViewer
const handleDetailDrawerOpenPictureViewer = async (target?: number | string) => {
  if (typeof target === 'number' || target === undefined) {
    await handleOpenPictureViewer(target)
  }
}

const handleToggleTop = async (resource: any) => {
  try {
    const nextValue = !Boolean(resource?.ifTop)
    const result = await window.api.service.updateResourceTop(String(resource?.id ?? ''), nextValue)
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '操作完成'

    showNotifyByType(resultType, nextValue ? '置顶资源' : '取消置顶', resultMessage)

    if (resultType !== 'error') {
      resource.ifTop = nextValue
      await fetchData()
    }
  } catch (error) {
    showNotifyByType('error', '置顶资源', error instanceof Error ? error.message : '更新置顶状态失败')
  }
}

const handleToggleHomePin = async (resource: any) => {
  try {
    const nextValue = !Boolean(resource?.homePinnedAt)
    const result = await window.api.service.updateResourceHomePin(String(resource?.id ?? ''), nextValue)
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '操作完成'

    showNotifyByType(resultType, nextValue ? '添加至快速启动' : '取消快速启动', resultMessage)

    if (resultType !== 'error') {
      resource.homePinnedAt = nextValue ? Date.now() : null
      await fetchData()
    }
  } catch (error) {
    showNotifyByType('error', '快速启动', error instanceof Error ? error.message : '更新快速启动状态失败')
  }
}

const clearDetailDerivedState = () => {
  detailScreenshotPaths.value = []
  detailAudioTree.value = []
  detailAudioTreeLoading.value = detailIsAsmr.value || isVideoFolderCategory.value
}

const detailRuntime = useCategoryDetailRuntime({
  selectedDetailResource,
  showDetailDrawer,
  showPictureViewer,
  showComicReader,
  showTextReader,
  showPdfReader,
  showEpubReader,
  showEbookReader,
  visibleLogCount,
  currentScreenshotIndex,
  detailIsAudio,
  getResourceFilePath,
  closeDetailAudioContextMenu,
  clearDetailDerivedState,
  refreshVideoSubCoverPreviewUrls,
  applyDetailAudioTreePresentation,
  refreshDetailScreenshots,
  refreshDetailAudioTree
})

handleShowResourceDetail = detailRuntime.handleShowResourceDetail

const videoOrderDialog = useCategoryVideoOrderDialog({
  showVideoOrderModal,
  showDetailDrawer,
  selectedDetailResource,
  fetchData: async () => {
    await fetchData()
  },
  getDetailVideoSubItems,
  scheduleVideoSubCoverPreviewRefresh,
  refreshVideoSubCoverPreviewUrls,
  refreshDetailAudioTree,
  showNotifyByType,
  compareByFileName
})

const {
  videoOrderResource,
  videoOrderItems,
  isVideoOrderSubmitting,
  videoOrderDragIndex,
  videoOrderDragOverIndex,
  resetVideoOrderDialog,
  handleResetVideoOrderItems,
  isVideoOrderItemChanged,
  moveVideoOrderItem,
  handleVideoOrderDragStart,
  handleVideoOrderDragEnter,
  handleVideoOrderDrop,
  handleVideoOrderDragEnd,
  handleOpenVideoOrderDialog,
  handleSubmitVideoOrder
} = videoOrderDialog

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

    showNotifyByType(
      resultType,
      nextValue ? `标记${completedActionLabel.value}` : `取消${completedActionLabel.value}`,
      resultMessage
    )

    if (resultType !== 'error') {
      resource.isCompleted = nextValue
      await fetchData()
    }
  } catch (error) {
    showNotifyByType(
      'error',
      `标记${completedActionLabel.value}`,
      error instanceof Error ? error.message : `更新${completedActionLabel.value}状态失败`
    )
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
      <CategoryFilterPanel
        :show-missing-filter="showMissingFilter"
        :missing-file="missingFile"
        :missing-resource-count="missingResourceCount"
        :favorite-only="favoriteOnly"
        :favorite-resource-count="favoriteResourceCount"
        :show-completed-filter="showCompletedFilter"
        :completed-only="completedOnly"
        :completed-state-label="completedStateLabel"
        :completed-resource-count="completedResourceCount"
        :show-running-filter="showRunningFilter"
        :running-only="runningOnly"
        :running-resource-count="runningResourceCount"
        :filter-sections-style="filterSectionsStyle"
        :show-author-filter="showAuthorFilter"
        :category-settings="categorySettings"
        :author-search="authorSearch"
        :filtered-author-list="filteredAuthorList"
        :selected-author-list="selectedAuthorList"
        :show-actor-filter="showActorFilter"
        :actor-filter-label="actorFilterLabel"
        :actor-search="actorSearch"
        :filtered-actor-list="filteredActorList"
        :selected-actor-list="selectedActorList"
        :is-audio-category="isAudioCategory"
        :album-search="albumSearch"
        :filtered-album-list="filteredAlbumList"
        :selected-album-list="selectedAlbumList"
        :tag-search="tagSearch"
        :filtered-tag-list="filteredTagList"
        :selected-tag-list="selectedTagList"
        :detail-is-asmr="detailIsAsmr"
        :type-search="typeSearch"
        :filtered-type-list="filteredTypeList"
        :selected-type-list="selectedTypeList"
        :show-engine-filter="showEngineFilter"
        :filtered-engine-list="filteredEngineList"
        :selected-engine-list="selectedEngineList"
        @update:missing-file="missingFile = $event"
        @update:favorite-only="favoriteOnly = $event"
        @update:completed-only="completedOnly = $event"
        @update:running-only="runningOnly = $event"
        @update:author-search="authorSearch = $event"
        @update:selected-author-list="selectedAuthorList = $event"
        @update:actor-search="actorSearch = $event"
        @update:selected-actor-list="selectedActorList = $event"
        @update:album-search="albumSearch = $event"
        @update:selected-album-list="selectedAlbumList = $event"
        @update:tag-search="tagSearch = $event"
        @update:selected-tag-list="selectedTagList = $event"
        @update:type-search="typeSearch = $event"
        @update:selected-type-list="selectedTypeList = $event"
        @update:selected-engine-list="selectedEngineList = $event"
        @reset-selected="resetSelected"
      />

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
                <n-icon :component="SearchOutline"/>
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
            <n-button v-if="isVideoCategory" @click="openBatchLabelDialog('actors', 'add')">
              添加{{ actorFilterLabel }}
            </n-button>
            <n-button v-if="isVideoCategory" @click="openBatchLabelDialog('actors', 'remove')">
              删除{{ actorFilterLabel }}
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
          <AppScrollbar class="detail-scrollbar">
            <div class="detail-content__inner">
              <n-empty v-if="resourceList.length === 0" :description="`暂无${categoryName || ''}资源，点击按钮添加吧！`">
                <template #extra>
                  <n-button type="primary" :disabled="currentCategoryBatchInBackground" @click="handleAddResource">
                    添加第一{{ categorySettings.addFirst }}{{ categoryName ?? '资源' }}
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
                  :show-modify-order="isVideoFolderCategory"
                  :stop-needs-confirm="categorySettings.extendTable === 'game_meta'"
                  :selected="selectedResourceIds.includes(String(resource?.id ?? ''))"
                  :selection-mode="resourceSelectionMode"
                  :show-default-app-play="showCardDefaultAppOpen"
                  default-app-action-text="使用默认应用打开"
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
                  @toggle-top="handleToggleTop"
                  @toggle-home-pin="handleToggleHomePin"
                  @toggle-select="handleToggleSelectResource"
                  @delete="handleDeleteResource"
                  @delete-files="handleDeleteResourceFiles"
                  @modify-order="handleOpenVideoOrderDialog"
                />
              </div>
            </div>
          </AppScrollbar>
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

    <ResourceDetailDrawer
      :show="showDetailDrawer"
      :width="detailDrawerWidth"
      :selected-detail-resource="selectedDetailResource"
      :category-name="categoryName"
      :category-settings="categorySettings"
      :detail-is-website="detailIsWebsite"
      :detail-is-software="detailIsSoftware"
      :detail-is-manga="detailIsManga"
      :detail-is-asmr="detailIsAsmr"
      :detail-is-audio="detailIsAudio"
      :detail-is-novel="detailIsNovel"
      :is-video-category="isVideoCategory"
      :is-video-folder-category="isVideoFolderCategory"
      :detail-website-favicon-src="detailWebsiteFaviconSrc"
      :detail-website-placeholder-emoji="detailWebsitePlaceholderEmoji"
      :detail-website-cover-placeholder-text="detailWebsiteCoverPlaceholderText"
      :detail-cover-preview-src="detailCoverPreviewSrc"
      :detail-rating-draft="detailRatingDraft"
      :has-pending-rating-change="hasPendingRatingChange"
      :rating-comment="ratingComment"
      :get-rating-emoji="getRatingEmoji"
      :detail-stores="detailStores"
      :detail-meta-items="detailMetaItems"
      :detail-display-path="detailDisplayPath"
      :has-detail-description="hasDetailDescription"
      :detail-description-box-style="detailDescriptionBoxStyle"
      :detail-stats="detailStats"
      :detail-stats-text="detailStatsText"
      :detail-show-total-runtime="detailShowTotalRuntime"
      :detail-reading-progress-text="detailReadingProgressText"
      :detail-playback-progress-text="detailPlaybackProgressText"
      :detail-preview-section-title="detailPreviewSectionTitle"
      :detail-screenshot-paths="detailScreenshotPaths"
      :detail-screenshot-preview-src="detailScreenshotPreviewSrc"
      :current-screenshot-index="currentScreenshotIndex"
      :show-delete-screenshot-confirm="showDeleteScreenshotConfirm"
      :detail-gallery-items="detailGalleryItems"
      :detail-gallery-section-title="detailGallerySectionTitle"
      :detail-directory-section-title="detailDirectorySectionTitle"
      :detail-audio-tree-loading="detailAudioTreeLoading"
      :detail-audio-tree="detailAudioTree"
      :detail-directory-empty-text="detailDirectoryEmptyText"
      :detail-audio-context-menu-visible="detailAudioContextMenuVisible"
      :detail-audio-context-menu-position="detailAudioContextMenuPosition"
      :detail-audio-context-menu-options="detailAudioContextMenuOptions"
      :detail-show-logs="detailShowLogs"
      :detail-logs="detailLogs"
      :detail-empty-log-description="detailEmptyLogDescription"
      :visible-detail-logs="visibleDetailLogs"
      :has-more-detail-logs="hasMoreDetailLogs"
      :no-more="noMore"
      :detail-log-mode-label="detailLogModeLabel"
      :detail-log-duration-label="detailLogDurationLabel"
      :start-text="startText"
      :detail-can-launch="detailCanLaunch"
      :detail-can-stop="detailCanStop"
      :detail-open-folder-text="detailOpenFolderText"
      :handle-detail-drawer-resize-start="handleDetailDrawerResizeStart"
      :handle-rating-update="handleRatingUpdate"
      :handle-submit-rating="handleUpdateResourceRating"
      :handle-copy-text="handleCopyText"
      :handle-open-detail-resource-path="handleOpenDetailResourcePath"
      :handle-open-store-website="handleOpenStoreWebsite"
      :handle-open-picture-viewer="handleDetailDrawerOpenPictureViewer"
      :handle-previous-screenshot="handlePreviousScreenshot"
      :handle-next-screenshot="handleNextScreenshot"
      :handle-delete-current-screenshot="handleDeleteCurrentScreenshot"
      :handle-open-detail-screenshot-folder="handleOpenDetailScreenshotFolder"
      :render-audio-tree-label="renderAudioTreeLabel"
      :render-audio-tree-suffix="renderAudioTreeSuffix"
      :close-detail-audio-context-menu="closeDetailAudioContextMenu"
      :handle-select-detail-audio-context-menu="handleSelectDetailAudioContextMenu"
      :handle-audio-tree-play="handleAudioTreePlay"
      :handle-open-audio-tree-context-menu="handleOpenAudioTreeContextMenu"
      :handle-load-more-logs="handleLoadMoreLogs"
      :format-date-time="formatDateTime"
      :format-duration="formatDuration"
      :format-launch-mode="formatLaunchMode"
      :format-log-end-time="formatLogEndTime"
      :format-log-duration="formatLogDuration"
      :handle-detail-launch-action="handleDetailLaunchAction"
      :handle-edit-resource="handleEditResource"
      :handle-open-video-order-dialog="handleOpenVideoOrderDialog"
      @update:show="showDetailDrawer = $event"
      @update:show-delete-screenshot-confirm="showDeleteScreenshotConfirm = $event"
    >
      <template #description-content>
        <div
          ref="detailDescriptionContentRef"
          class="detail-drawer__value detail-drawer__value--description detail-drawer__value--rich rich-markdown-content"
          v-html="selectedDetailDescriptionHtml"
        />
      </template>
    </ResourceDetailDrawer>

    <CategoryBatchImportPanel
      :show-loading="showBatchImportLoading"
      :show-progress-toast="showBatchImportProgressToast"
      :show-preview="showBatchImportModal"
      :batch-progress-running="batchProgressRunning"
      :batch-progress-stage="batchProgressStage"
      :batch-analyze-percent="batchAnalyzePercent"
      :batch-analyze-total="batchAnalyzeTotal"
      :batch-analyze-display-index="batchAnalyzeDisplayIndex"
      :batch-import-resource-label="batchImportResourceLabel"
      :batch-analyze-message="batchAnalyzeMessage"
      :current-directory-name="getBatchProgressDirectoryName()"
      :selected-batch-import-count="selectedBatchImportCount"
      :selectable-batch-import-count="selectableBatchImportItems.length"
      :batch-import-items="batchImportItems"
      :is-batch-import-submitting="isBatchImportSubmitting"
      :batch-import-fetch-info-enabled="batchImportFetchInfoEnabled"
      :detail-is-manga="detailIsManga"
      :detail-is-asmr="detailIsAsmr"
      :show-batch-import-button="showBatchImportButton"
      :website-type-select-options="websiteTypeSelectOptions"
      :can-toggle-batch-import-item="canToggleBatchImportItem"
      :is-batch-import-item-importable="isBatchImportItemImportable"
      :on-update-show-loading="handleBatchImportLoadingShowUpdate"
      :on-update-show-preview="handleBatchImportPreviewShowUpdate"
      :on-after-leave-preview="handleCloseBatchImportModal"
      :on-mask-click="handleBatchImportMaskClick"
      :on-run-in-background="handleBatchImportRunInBackground"
      :on-stop-analysis="handleStopBatchImportAnalysis"
      :on-reopen-progress="handleReopenBatchImportProgress"
      :on-dismiss-progress-toast="handleDismissBatchImportProgressToast"
      :on-select-all="handleBatchImportSelectAll"
      :on-deselect-all="handleBatchImportDeselectAll"
      :on-invert="handleBatchImportInvert"
      :on-toggle-item="handleToggleBatchImportItem"
      :on-set-item-checked="handleBatchImportItemCheckedChange"
      :on-set-item-website-type="handleBatchImportItemWebsiteTypeChange"
      :on-set-item-game-id="handleBatchImportItemGameIdChange"
      :on-select-launch-file="handleSelectBatchLaunchFile"
      :on-confirm-import="handleConfirmBatchImport"
      :on-close-preview="handleCloseBatchImportModal"
      :on-update-fetch-info-enabled="handleBatchImportFetchInfoEnabledUpdate"
    />

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
                : batchLabelField === 'actors'
                  ? `${categoryName}${actorFilterLabel}`
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

    <AudioCoverCandidateModal
      :show="showAudioCoverCandidateModal"
      :candidates="audioCoverCandidates"
      @update:show="showAudioCoverCandidateModal = $event"
      @select="handleUseAudioCoverCandidate"
      @after-leave="closeAudioCoverCandidateModal"
    />

    <VideoCoverCandidateModal
      :show="showVideoCoverCandidateModal"
      :fixed-candidates="fixedVideoCoverCandidates"
      :random-candidates="randomVideoCoverCandidates"
      :format-time="formatVideoFrameTime"
      @update:show="showVideoCoverCandidateModal = $event"
      @select="handleUseVideoCoverCandidate"
      @after-leave="closeVideoCoverCandidateModal"
    />

    <VideoSubCoverCandidateModal
      :show="showVideoSubCoverCandidateModal"
      :items="videoSubCoverCandidateItems"
      :format-time="formatVideoFrameTime"
      @update:show="showVideoSubCoverCandidateModal = $event"
      @select="handleUseVideoSubCoverCandidate"
      @after-leave="closeVideoSubCoverCandidateModal"
    />

    <n-modal
      v-model:show="showVideoOrderModal"
      preset="card"
      title="修改番剧顺序"
      :style="{ width: '760px', maxWidth: '92vw' }"
      @after-leave="resetVideoOrderDialog"
    >
      <n-space vertical :size="16">
        <n-alert type="info" :show-icon="false">
          可调整番剧目录中视频文件的展示顺序，并控制是否在详情中显示。新扫描到的视频文件默认按文件名排序。
        </n-alert>
        <div class="video-order-modal__toolbar">
          <div class="video-order-modal__summary">
            共 {{ videoOrderItems.length }} 个视频文件
          </div>
          <n-button size="small" @click="handleResetVideoOrderItems">
            按文件名排序
          </n-button>
        </div>
        <AppScrollbar class="video-order-modal__scrollbar">
          <div class="video-order-modal__list">
            <div
              v-for="(item, index) in videoOrderItems"
              :key="item.id || item.relativePath"
              class="video-order-item"
              :class="{
                'video-order-item--changed': isVideoOrderItemChanged(item, index),
                'video-order-item--dragging': videoOrderDragIndex === index,
                'video-order-item--drag-over': videoOrderDragOverIndex === index && videoOrderDragIndex !== index
              }"
              draggable="true"
              @dragstart="handleVideoOrderDragStart(index, $event)"
              @dragenter.prevent="handleVideoOrderDragEnter(index)"
              @dragover.prevent
              @drop.prevent="handleVideoOrderDrop(index)"
              @dragend="handleVideoOrderDragEnd"
            >
              <div class="video-order-item__change-marker"
                   :class="{ 'video-order-item__change-marker--active': isVideoOrderItemChanged(item, index) }"/>
              <div class="video-order-item__index" :title="'拖动调整顺序'">{{ index + 1 }}</div>
              <img
                v-if="getVideoSubCoverPreviewSrc(videoOrderResource, item.relativePath)"
                :src="getVideoSubCoverPreviewSrc(videoOrderResource, item.relativePath)"
                alt=""
                class="video-order-item__cover"
                draggable="false"
              />
              <div v-else class="video-order-item__cover video-order-item__cover--empty">VIDEO</div>
              <div class="video-order-item__main">
                <div class="video-order-item__title">{{ item.fileName || item.relativePath }}</div>
              </div>
              <n-checkbox
                :checked="item.isVisible"
                @update:checked="(value: boolean) => { videoOrderItems[index].isVisible = value }"
              >
                显示
              </n-checkbox>
              <div class="video-order-item__actions">
                <n-button quaternary circle size="small" :disabled="index === 0"
                          @click="moveVideoOrderItem(index, index - 1)">
                  <template #icon>
                    <n-icon :component="ChevronUpOutline"/>
                  </template>
                </n-button>
                <n-button
                  quaternary
                  circle
                  size="small"
                  :disabled="index === videoOrderItems.length - 1"
                  @click="moveVideoOrderItem(index, index + 1)"
                >
                  <template #icon>
                    <n-icon :component="ChevronDownOutline"/>
                  </template>
                </n-button>
                <span class="video-order-item__drag-hint">拖动排序</span>
              </div>
            </div>
          </div>
        </AppScrollbar>
        <div class="batch-label-modal__footer">
          <n-space justify="end">
            <n-button @click="showVideoOrderModal = false">取消</n-button>
            <n-button type="primary" :loading="isVideoOrderSubmitting" @click="handleSubmitVideoOrder">
              保存
            </n-button>
          </n-space>
        </div>
      </n-space>
    </n-modal>

    <ResourceEditorDrawer
      :show="showEditModal"
      mode="edit"
      :category-name="categoryName"
      :category-settings="categorySettings"
      :form-data="formData"
      :form-rules="addResourceRule"
      :set-form-ref="assignResourceEditorFormRef"
      :set-base-path-form-item-ref="assignResourceEditorBasePathFormItemRef"
      :is-novel-category="isNovelCategory"
      :is-audio-category="isAudioCategory"
      :is-software-category="isSoftwareCategory"
      :detail-is-asmr="detailIsAsmr"
      :actor-filter-label="actorFilterLabel"
      :author-input-placeholder="authorInputPlaceholder"
      :description-label="descriptionLabel"
      :description-placeholder="descriptionPlaceholder"
      :model-component="modelComponent"
      :model-component-key="modelComponentKey"
      :fetch-resource-info-loading="fetchResourceInfoLoading"
      :author-select-options="authorSelectOptions"
      :tag-select-options="tagSelectOptions"
      :type-select-options="typeSelectOptions"
      :create-select-option="createSelectOption"
      :cover-preview-src="coverPreviewSrc"
      :cover-preview-label="coverPreviewLabel"
      :video-cover-frame-loading="videoCoverFrameLoading"
      :has-base-path="hasBasePath"
      :has-cover-path="hasCoverPath"
      :editing-resource-id="editingResourceId"
      @update:show="showEditModal = $event"
      @open-software-script="handleOpenSoftwareScriptModal"
      @select-base-path="handleSelectBasePath"
      @update:actors="(value: string[]) => { formData.actors = value }"
      @check-engine="handleCheckGameEngine"
      @fetch-game-info="handleFetchGameInfo"
      @fetch-website-info="handleFetchWebsiteInfo"
      @update:audio-authors="handleAudioAuthorsChange"
      @tags-change="handleTagsChange"
      @tag-search="handleTagSearch"
      @tag-input-keydown="(event: KeyboardEvent) => handleSelectInputKeydown(event, 'tags')"
      @tag-input-blur="handleTagInputCommit"
      @types-change="handleTypesChange"
      @type-search="handleTypeSearch"
      @type-input-keydown="(event: KeyboardEvent) => handleSelectInputKeydown(event, 'types')"
      @type-input-blur="handleTypeInputCommit"
      @choose-custom-cover="handleChooseCustomCover"
      @fetch-website-cover="handleFetchWebsiteCover"
      @fetch-album-cover="handleFetchAlbumCover"
      @use-video-random-frame-cover="handleUseVideoRandomFrameCover"
      @use-screenshot-cover="handleUseScreenshotCover"
      @choose-cover-from-screenshot-folder="handleChooseCoverFromScreenshotFolder"
      @use-first-cover="handleUseFirstCover"
      @clear-cover="handleClearCover"
      @reset-edit="handleResetEditForm"
      @restore-default-edit="handleRestoreDefaultEditForm"
      @submit-edit="handleSubmitEditResource"
    />

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
      @index-change="handlePictureViewerIndexChange"
      @delete-image="handleDeleteViewerScreenshot"
    />

    <ComicReader
      v-model:show="showComicReader"
      :image-paths="comicReaderImagePaths"
      :initial-index="comicReaderInitialIndex"
      @page-change="handleComicReaderPageChange"
    />
    <TextReader
      v-model:show="showTextReader"
      :file-path="textReaderFilePath"
      :title="textReaderTitle"
      :initial-progress="textReaderInitialProgress"
      @progress-change="handleTextReaderProgressChange"
    />
    <PdfReader
      v-model:show="showPdfReader"
      :file-path="pdfReaderFilePath"
      :title="pdfReaderTitle"
      :initial-progress="pdfReaderInitialProgress"
      @progress-change="handlePdfReaderProgressChange"
    />
    <EpubReader
      v-model:show="showEpubReader"
      :file-path="epubReaderFilePath"
      :title="epubReaderTitle"
      :initial-progress="epubReaderInitialProgress"
      @progress-change="handleEpubReaderProgressChange"
    />
    <EbookReader
      :show="showEbookReader"
      :file-path="ebookReaderFilePath"
      :title="ebookReaderTitle"
      :initial-progress="ebookReaderInitialProgress"
      @update:show="handleEbookReaderShowUpdate"
      @progress-change="handleEbookReaderProgressChange"
    />
    <VideoPlayer
      v-model:show="showVideoPlayer"
      :playlist="videoPlayerPlaylist"
      :initial-path="videoPlayerInitialPath"
      :initial-time="videoPlayerInitialTime"
      :resume-restart-threshold="videoPlaybackResumeRestartThreshold"
      :title="videoPlayerTitle"
      @update:playlist="handleVideoPlayerPlaylistUpdate"
      @progress-persisted="handleVideoPlaybackProgressPersisted"
    />
    <div v-if="isDragOver && categorySettings.resourcePathType === 'file'" class="drag-overlay">
      <div class="drag-overlay__panel">
        <div class="drag-overlay__title">拖拽文件到这里添加{{ categoryName }}</div>
        <div class="drag-overlay__subtitle">
          仅支持 {{
            normalizedAllowedExtensions.length ? normalizedAllowedExtensions.join(', ') : '当前分类允许的文件类型'
          }}
        </div>
      </div>
    </div>

    <ResourceEditorDrawer
      :show="showModal"
      mode="add"
      :category-name="categoryName"
      :category-settings="categorySettings"
      :form-data="formData"
      :form-rules="addResourceRule"
      :set-form-ref="assignResourceEditorFormRef"
      :set-base-path-form-item-ref="assignResourceEditorBasePathFormItemRef"
      :is-novel-category="isNovelCategory"
      :is-audio-category="isAudioCategory"
      :is-software-category="isSoftwareCategory"
      :detail-is-asmr="detailIsAsmr"
      :actor-filter-label="actorFilterLabel"
      :author-input-placeholder="authorInputPlaceholder"
      :description-label="descriptionLabel"
      :description-placeholder="descriptionPlaceholder"
      :model-component="modelComponent"
      :model-component-key="modelComponentKey"
      :fetch-resource-info-loading="fetchResourceInfoLoading"
      :author-select-options="authorSelectOptions"
      :tag-select-options="tagSelectOptions"
      :type-select-options="typeSelectOptions"
      :create-select-option="createSelectOption"
      :cover-preview-src="coverPreviewSrc"
      :cover-preview-label="coverPreviewLabel"
      :video-cover-frame-loading="videoCoverFrameLoading"
      :has-base-path="hasBasePath"
      :has-cover-path="hasCoverPath"
      :editing-resource-id="editingResourceId"
      :duplicate-resource-checking="addResourceDuplicateChecking"
      :duplicate-resource-message="addResourceDuplicateMessage"
      :duplicate-resource-title="addResourceDuplicateTitle"
      @update:show="showModal = $event"
      @open-software-script="handleOpenSoftwareScriptModal"
      @select-base-path="handleSelectBasePath"
      @update:actors="(value: string[]) => { formData.actors = value }"
      @check-engine="handleCheckGameEngine"
      @fetch-game-info="handleFetchGameInfo"
      @fetch-website-info="handleFetchWebsiteInfo"
      @update:audio-authors="handleAudioAuthorsChange"
      @tags-change="handleTagsChange"
      @tag-search="handleTagSearch"
      @tag-input-keydown="(event: KeyboardEvent) => handleSelectInputKeydown(event, 'tags')"
      @tag-input-blur="handleTagInputCommit"
      @types-change="handleTypesChange"
      @type-search="handleTypeSearch"
      @type-input-keydown="(event: KeyboardEvent) => handleSelectInputKeydown(event, 'types')"
      @type-input-blur="handleTypeInputCommit"
      @choose-custom-cover="handleChooseCustomCover"
      @fetch-website-cover="handleFetchWebsiteCover"
      @fetch-album-cover="handleFetchAlbumCover"
      @use-video-random-frame-cover="handleUseVideoRandomFrameCover"
      @use-screenshot-cover="handleUseScreenshotCover"
      @choose-cover-from-screenshot-folder="handleChooseCoverFromScreenshotFolder"
      @use-first-cover="handleUseFirstCover"
      @clear-cover="handleClearCover"
      @close="handleCloseModal"
      @submit-add="handleSubmitResource"
    />
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

.detail-content__inner {
  width: 100%;
  min-height: 0;
  padding: 24px;
  box-sizing: border-box;
  overflow: hidden;
}

.video-order-modal__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.video-order-modal__summary {
  font-size: 13px;
  opacity: 0.72;
}

.video-order-modal__scrollbar {
  max-height: 56vh;
}

.video-order-modal__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.video-order-item {
  display: grid;
  grid-template-columns: 4px auto 72px minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.06);
  cursor: grab;
  user-select: none;
  transition: transform 0.18s ease, background-color 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
  border: 1px solid transparent;
}

.video-order-item--changed {
  border-color: rgba(99, 226, 183, 0.16);
}

.video-order-item:active {
  cursor: grabbing;
}

.video-order-item--dragging {
  opacity: 0.45;
}

.video-order-item--drag-over {
  border-color: rgba(99, 226, 183, 0.34);
  background: rgba(99, 226, 183, 0.08);
  transform: translateY(-1px);
}

.video-order-item__index {
  width: 28px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  opacity: 0.7;
}

.video-order-item__change-marker {
  align-self: stretch;
  border-radius: 999px;
  background: transparent;
  transition: background-color 0.18s ease;
}

.video-order-item__change-marker--active {
  background: rgb(99, 226, 183);
}

.video-order-item__main {
  min-width: 0;
}

.video-order-item__cover {
  width: 72px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.06);
}

.video-order-item__cover--empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(216, 221, 229, 0.42);
  font-size: 10px;
}

.video-order-item__title {
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.video-order-item__path {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.58;
  word-break: break-all;
}

.video-order-item__actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-self: end;
}

.video-order-item__drag-hint {
  font-size: 12px;
  opacity: 0.6;
  white-space: nowrap;
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

.detail-drawer__cover-placeholder--website {
  opacity: 1;
}

.detail-drawer__website-cover {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: rgba(255, 255, 255, 0.92);
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.09), transparent 56%),
  linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
}

.detail-drawer__website-cover-glow {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 180px;
  height: 180px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.12), transparent 70%);
  pointer-events: none;
}

.detail-drawer__website-cover-badge {
  position: relative;
  z-index: 1;
  width: 72px;
  height: 72px;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22);
}

.detail-drawer__website-cover-icon {
  width: 34px;
  height: 34px;
  object-fit: contain;
}

.detail-drawer__website-cover-emoji {
  font-size: 30px;
  line-height: 1;
}

.detail-drawer__website-cover-text {
  position: relative;
  z-index: 1;
  font-size: 13px;
  letter-spacing: 0.04em;
  opacity: 0.72;
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

.detail-drawer__header-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.detail-drawer__header-icon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  object-fit: cover;
  flex: 0 0 auto;
}

.detail-drawer__header-icon--emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
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

.detail-drawer__value--clamp-3 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
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
  box-sizing: border-box;
  padding-right: 6px;
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
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.detail-audio-tree__file-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  white-space: normal;
}

.detail-audio-tree__video-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  display: block;
  flex: 0 0 auto;
}

.detail-audio-tree__video-cover--empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(216, 221, 229, 0.42);
  font-size: 10px;
}

.detail-audio-tree__video-cover-shell {
  position: relative;
  width: 150px;
  height: 60px;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 10px;
}

.detail-audio-tree__video-cover-index {
  position: absolute;
  top: 50%;
  left: 50%;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(16, 24, 40, 0.64);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
}

.detail-directory-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 72px;
  padding: 8px 2px;
  color: rgba(255, 255, 255, 0.68);
}

.detail-directory-loading__indicator {
  width: 18px;
  height: 18px;
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
