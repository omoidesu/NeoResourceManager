import type { ComputedRef, Ref } from 'vue'
import { DictType } from '../../../../../common/constants'

type NotifyType = 'success' | 'error' | 'info' | 'warning' | 'warn' | string

type AudioCoverCandidate = {
  label: string
  coverPath: string
  previewSrc: string
  queryText: string
  albumName: string
}

type VideoCoverCandidate = {
  label: string
  coverPath: string
  previewSrc: string
  time: number
  group: 'fixed' | 'random'
}

type VideoSubCoverCandidateItem = {
  fileName: string
  relativePath: string
  candidates: Array<{
    label: string
    coverPath: string
    previewSrc: string
    time: number
  }>
}

type Deps = {
  formData: Ref<any>
  editingResourceId: Ref<string>
  fetchResourceInfoLoading: Ref<boolean>
  videoCoverFrameLoading: Ref<boolean>
  showAudioCoverCandidateModal: Ref<boolean>
  showVideoCoverCandidateModal: Ref<boolean>
  showVideoSubCoverCandidateModal: Ref<boolean>
  audioCoverCandidates: Ref<AudioCoverCandidate[]>
  videoCoverCandidates: Ref<VideoCoverCandidate[]>
  videoSubCoverCandidateItems: Ref<VideoSubCoverCandidateItem[]>
  basePathFormItemRef: Ref<any>
  showSoftwareScriptModal: Ref<boolean>
  softwareScriptDraft: Ref<string>
  softwareScriptRuntimePath: Ref<string>
  categoryName: ComputedRef<string>
  categorySettings: ComputedRef<any>
  isSoftwareCategory: ComputedRef<boolean>
  isVideoFolderCategory: ComputedRef<boolean>
  detailIsAsmr: ComputedRef<boolean>
  websiteTypeOptions: Ref<any[]>
  normalizedLanguageList: ComputedRef<Array<{ id: string; name: string }>>
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  validateBasePathExtension: (resourcePath: string) => boolean
  getBasePathValidationMessage: () => string
  applyDefaultPathName: (resourcePath: string) => void
  applyAudioPathAnalysis: (resourcePath: string) => Promise<void>
  applyAudioCoverAnalysis: () => Promise<void>
  applyGamePathAnalysis: (resourcePath: string) => Promise<void>
  applyNovelFileAnalysis: (resourcePath: string) => Promise<void>
  applyMultiImageDirectoryAnalysis: (resourcePath: string) => Promise<void>
  normalizeSelectedValues: (values: string[]) => string[]
  normalizeWebsiteUrl: (input: unknown) => string
  resolveCoverPreviewUrl: (coverPath: string) => Promise<string>
  formatAudioCoverCandidateQuery: (query: any) => string
  ensureSoftwareScriptRuntimes: () => Promise<Array<{ label: string; value: string; shellType: 'powershell' | 'cmd' }>>
  resolveSoftwareScriptShell: (basePath: string) => 'powershell' | 'cmd'
  denormalizeSoftwareScript: (command: string) => string
}

export const useCategoryEditorAssistActions = (deps: Deps) => {
  const handleOpenSoftwareScriptModal = () => {
    void (async () => {
      if (!deps.isSoftwareCategory.value) {
        return
      }

      const runtimes = await deps.ensureSoftwareScriptRuntimes()
      const currentBasePath = String(deps.formData.value?.basePath ?? '').trim()
      const normalizedCurrentBasePath = currentBasePath.toLowerCase()
      const matchedRuntime = runtimes.find((item) => String(item.value ?? '').trim().toLowerCase() === normalizedCurrentBasePath)
      const fallbackShellType = deps.resolveSoftwareScriptShell(currentBasePath)
      const fallbackRuntime = matchedRuntime
        ?? runtimes.find((item) => item.shellType === fallbackShellType)
        ?? runtimes.find((item) => item.shellType === 'powershell')
        ?? runtimes[0]

      deps.softwareScriptRuntimePath.value = String(fallbackRuntime?.value ?? '')
      deps.softwareScriptDraft.value = deps.denormalizeSoftwareScript(String(deps.formData.value?.meta?.commandLineArgs ?? ''))
      deps.showSoftwareScriptModal.value = true
    })()
  }

  const handleFetchAlbumCover = async () => {
    deps.showNotifyByType('info', '获取专辑封面', '正在获取专辑封面，请稍候')

    try {
      const fetchAudioAlbumCover = window.api?.service?.fetchAudioAlbumCover
      if (typeof fetchAudioAlbumCover !== 'function') {
        deps.showNotifyByType('error', '获取专辑封面', '当前窗口尚未加载最新接口，请重启应用后再试')
        return
      }

      const payload = {
        basePath: String(deps.formData.value?.basePath ?? ''),
        title: String(deps.formData.value?.name ?? ''),
        album: String(deps.formData.value?.meta?.album ?? ''),
        artist: String(deps.formData.value?.author ?? ''),
        artists: Array.isArray(deps.formData.value?.authors)
          ? deps.formData.value.authors.map((item: string) => String(item ?? '')).filter(Boolean)
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
              previewSrc: await deps.resolveCoverPreviewUrl(coverPath),
              queryText: deps.formatAudioCoverCandidateQuery(candidate?.query ?? {}),
              albumName: String(candidate?.query?.album ?? '').trim()
            }
          })
        )

        const availableCandidates = resolvedCandidates.filter((candidate) => candidate.coverPath && candidate.previewSrc)

        if (availableCandidates.length) {
          deps.audioCoverCandidates.value = availableCandidates
          deps.showAudioCoverCandidateModal.value = true
        } else if (result?.data?.coverPath) {
          deps.formData.value.coverPath = String(result.data.coverPath)
        }
      }

      deps.showNotifyByType(resultType, '获取专辑封面', resultMessage)
    } catch (error) {
      deps.showNotifyByType('error', '获取专辑封面', error instanceof Error ? error.message : '获取专辑封面失败')
    }
  }

  const handleUseScreenshotCover = async () => {
    try {
      const result = await window.api.service.captureCoverScreenshot(String(deps.formData.value?.basePath ?? '').trim())
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '截图完成'

      if (resultType === 'error' || resultType === 'warning') {
        deps.showNotifyByType(resultType, '封面截图', resultMessage)
        return
      }

      const screenshotFilePath = String(result?.data?.filePath ?? '').trim()
      if (!screenshotFilePath) {
        deps.showNotifyByType('warning', '封面截图', '截图成功，但未返回图片文件')
        return
      }

      deps.formData.value.coverPath = screenshotFilePath
      deps.showNotifyByType('success', '封面截图', resultMessage)
    } catch (error) {
      deps.showNotifyByType('error', '封面截图', error instanceof Error ? error.message : '使用截图作为封面失败')
    }
  }

  const handleUseVideoRandomFrameCover = async () => {
    const basePath = String(deps.formData.value?.basePath ?? '').trim()
    if (!basePath) {
      deps.showNotifyByType('warning', '随机帧封面', deps.isVideoFolderCategory.value ? '请先选择番剧目录' : '请先选择视频文件')
      return
    }

    deps.videoCoverFrameLoading.value = true
    try {
      if (deps.isVideoFolderCategory.value) {
        const result = await window.api.service.extractVideoSubCoverFrames(basePath)
        const resultType = result?.type ?? 'info'
        const resultMessage = result?.message ?? '番剧随机帧生成完成'

        if (resultType === 'error' || resultType === 'warning') {
          deps.showNotifyByType(resultType, '随机帧封面', resultMessage)
          return
        }

        const rawItems = Array.isArray(result?.data?.items) ? result.data.items : []
        const resolvedItems = await Promise.all(rawItems.map(async (item: any) => {
          const rawCandidates = Array.isArray(item?.coverCandidates) ? item.coverCandidates : []
          const resolvedCandidates = await Promise.all(rawCandidates.map(async (candidate: any) => {
            const coverPath = String(candidate?.coverPath ?? '').trim()
            return {
              label: String(candidate?.label ?? '').trim() || '随机帧',
              coverPath,
              previewSrc: await deps.resolveCoverPreviewUrl(coverPath),
              time: Math.max(0, Number(candidate?.time ?? 0))
            }
          }))

          return {
            fileName: String(item?.fileName ?? '').trim(),
            relativePath: String(item?.relativePath ?? '').trim(),
            candidates: resolvedCandidates.filter((candidate) => candidate.coverPath && candidate.previewSrc)
          }
        }))
        const availableItems = resolvedItems.filter((item) => item.candidates.length)

        if (!availableItems.length) {
          deps.showNotifyByType('warning', '随机帧封面', '已生成番剧随机帧，但预览加载失败')
          return
        }

        deps.videoSubCoverCandidateItems.value = availableItems
        deps.showVideoSubCoverCandidateModal.value = true
        return
      }

      const result = await window.api.service.extractVideoCoverFrames(basePath)
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '随机帧生成完成'

      if (resultType === 'error' || resultType === 'warning') {
        deps.showNotifyByType(resultType, '随机帧封面', resultMessage)
        return
      }

      const rawCandidates = Array.isArray(result?.data?.coverCandidates) ? result.data.coverCandidates : []
      const resolvedCandidates = await Promise.all(rawCandidates.map(async (candidate: any) => {
        const coverPath = String(candidate?.coverPath ?? '').trim()
        return {
          label: String(candidate?.label ?? '').trim() || '随机帧',
          coverPath,
          previewSrc: await deps.resolveCoverPreviewUrl(coverPath),
          time: Math.max(0, Number(candidate?.time ?? 0)),
          group: String(candidate?.group ?? '') === 'fixed' ? 'fixed' : 'random' as const
        }
      }))
      const availableCandidates = resolvedCandidates.filter((candidate) => candidate.coverPath && candidate.previewSrc)

      if (!availableCandidates.length) {
        deps.showNotifyByType('warning', '随机帧封面', '已生成随机帧，但预览加载失败')
        return
      }

      deps.videoCoverCandidates.value = availableCandidates
      deps.showVideoCoverCandidateModal.value = true
    } catch (error) {
      deps.showNotifyByType('error', '随机帧封面', error instanceof Error ? error.message : '生成随机帧失败')
    } finally {
      deps.videoCoverFrameLoading.value = false
    }
  }

  const handleUseFirstCover = () => {
    deps.formData.value.coverPath = 'auto://first-cover'
  }

  const handleChooseCustomCover = async () => {
    try {
      const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
      const coverPath = await window.api.dialog.selectFile(imageExtensions)
      if (coverPath) {
        deps.formData.value.coverPath = coverPath
      }
    } catch (error) {
      deps.showNotifyByType('error', '选择失败', error instanceof Error ? error.message : '选择自定义封面失败')
    }
  }

  const handleFetchWebsiteCover = async () => {
    if (deps.fetchResourceInfoLoading.value) {
      return
    }

    const normalizedUrl = deps.normalizeWebsiteUrl(deps.formData.value?.meta?.website)
    if (!normalizedUrl) {
      deps.showNotifyByType('warning', '获取页面图片', '请先输入合法的网站地址')
      return
    }

    deps.fetchResourceInfoLoading.value = true
    try {
      const fetchWebsiteCover = window.api?.service?.fetchWebsiteCover
      if (typeof fetchWebsiteCover !== 'function') {
        deps.showNotifyByType('error', '获取页面图片', '当前窗口尚未加载最新接口，请重启应用后再试')
        return
      }

      const result = await fetchWebsiteCover(normalizedUrl)
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '获取页面图片完成'
      const data = result?.data ?? {}

      if (resultType !== 'error') {
        const nextWebsite = deps.normalizeWebsiteUrl(data.website ?? normalizedUrl)
        if (nextWebsite) {
          deps.formData.value.meta.website = nextWebsite
        }

        const nextCoverPath = String(data.coverPath ?? '').trim()
        if (nextCoverPath) {
          deps.formData.value.coverPath = nextCoverPath
        }
      }

      deps.showNotifyByType(resultType, '获取页面图片', resultMessage)
    } finally {
      deps.fetchResourceInfoLoading.value = false
    }
  }

  const handleChooseCoverFromScreenshotFolder = async () => {
    if (!deps.editingResourceId.value) {
      deps.showNotifyByType('warning', '选择封面', '当前资源还没有可用的截图目录')
      return
    }

    try {
      const screenshotPath = await window.api.dialog.selectScreenshotImage(deps.editingResourceId.value)
      if (screenshotPath) {
        deps.formData.value.coverPath = screenshotPath
      }
    } catch (error) {
      deps.showNotifyByType('error', '选择封面', error instanceof Error ? error.message : '从截图文件夹选择封面失败')
    }
  }

  const handleClearCover = () => {
    deps.formData.value.coverPath = ''
  }

  const handleSelectBasePath = async () => {
    try {
      let resourcePath: string
      if (deps.categorySettings.value.resourcePathType === 'file') {
        const extensions = [...(deps.categorySettings.value.extensions ?? [])]
        resourcePath = await window.api.dialog.selectFile(extensions)
      } else {
        resourcePath = await window.api.dialog.selectFolder()
      }

      if (resourcePath) {
        if (!deps.validateBasePathExtension(resourcePath)) {
          deps.formData.value.basePath = resourcePath
          await deps.basePathFormItemRef.value?.validate({ trigger: 'change' })
          return
        }

        deps.formData.value.basePath = resourcePath
        await deps.basePathFormItemRef.value?.validate({ trigger: 'change' })
        deps.applyDefaultPathName(resourcePath)
        await deps.applyAudioPathAnalysis(resourcePath)
        await deps.applyAudioCoverAnalysis()
        await deps.applyGamePathAnalysis(resourcePath)
        await deps.applyNovelFileAnalysis(resourcePath)
        await deps.applyMultiImageDirectoryAnalysis(resourcePath)
      }
    } catch (error) {
      deps.showNotifyByType('error', '选择失败', error instanceof Error ? error.message : '选择资源路径失败')
    }
  }

  const handleFetchGameInfo = async () => {
    if (deps.fetchResourceInfoLoading.value) {
      return
    }

    deps.fetchResourceInfoLoading.value = true

    try {
      const extendTable = String(deps.categorySettings.value.extendTable ?? '').trim()
      let websiteId = String(deps.formData.value?.meta?.websiteType ?? '').trim()

      if (extendTable === 'single_image_meta') {
        const imageSiteOptions = await window.api.db.getSelectDictData(DictType.IMAGE_SITE_TYPE)
        websiteId = String(
          imageSiteOptions.find((item: any) => String(item?.label ?? '').trim().toLowerCase() === 'pixiv')?.value ?? ''
        ).trim()
      } else if (extendTable === 'novel_meta') {
        const novelSiteOptions = await window.api.db.getSelectDictData(DictType.NOVEL_SITE_TYPE)
        websiteId = String(
          novelSiteOptions.find((item: any) => String(item?.label ?? '').trim() === '国家图书馆')?.value ?? ''
        ).trim()
        if (!websiteId) {
          websiteId = 'nlc-isbn'
        }
      }

      const gameId = extendTable === 'single_image_meta'
        ? String(deps.formData.value?.meta?.pixivId ?? '').trim()
        : extendTable === 'novel_meta'
          ? String(deps.formData.value?.meta?.isbn ?? '').trim()
          : String(deps.formData.value?.meta?.gameId ?? '').trim()

      const result = await window.api.service.fetchResourceInfo(websiteId, gameId)
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '获取资源信息完成'

      if (resultType === 'error' || resultType === 'warning') {
        deps.showNotifyByType(resultType, '获取资源信息', resultMessage)
        return
      }

      const data = result?.data ?? {}
      if (data.name) {
        deps.formData.value.name = data.name
        if (deps.categorySettings.value.extendTable === 'game_meta' && !deps.formData.value.meta.nameJp) {
          deps.formData.value.meta.nameJp = data.name
        }
      }

      if (data.author) {
        deps.formData.value.author = data.author
      }

      if (data.description) {
        deps.formData.value.description = data.description
      }

      if (extendTable === 'asmr_meta' && data.cv) {
        deps.formData.value.actors = deps.normalizeSelectedValues([
          ...(deps.formData.value.actors ?? []),
          ...String(data.cv).split(/[\/,、，]/)
        ])
      }

      if (extendTable === 'asmr_meta' && data.scenario) {
        deps.formData.value.meta.scenario = String(data.scenario)
      }

      if (extendTable === 'asmr_meta' && data.illust) {
        deps.formData.value.meta.illust = String(data.illust)
      }

      if (extendTable === 'multi_image_meta' && data.translator) {
        deps.formData.value.meta.translator = data.translator
      }

      if (extendTable === 'novel_meta') {
        if (data.translator) {
          deps.formData.value.meta.translator = data.translator
        }
        if (data.isbn) {
          deps.formData.value.meta.isbn = data.isbn
        }
        if (data.publisher) {
          deps.formData.value.meta.publisher = data.publisher
        }
        if (Number.isFinite(Number(data.year))) {
          deps.formData.value.meta.year = Number(data.year)
        }
      }

      if (data.cover && extendTable !== 'multi_image_meta') {
        deps.formData.value.coverPath = data.cover
      }

      if (data.website) {
        deps.formData.value.meta.website = data.website
      }

      if (extendTable === 'single_image_meta' && !String(deps.formData.value?.meta?.source ?? '').trim()) {
        deps.formData.value.meta.source = 'Pixiv'
      }

      if (Array.isArray(data.tag) && data.tag.length) {
        deps.formData.value.tags = deps.normalizeSelectedValues([
          ...(deps.formData.value.tags ?? []),
          ...data.tag
        ])
      }

      if (Array.isArray(data.type) && data.type.length) {
        deps.formData.value.types = deps.normalizeSelectedValues([
          ...(deps.formData.value.types ?? []),
          ...data.type
        ])
      }

      deps.showNotifyByType('success', '获取资源信息', resultMessage)
    } finally {
      deps.fetchResourceInfoLoading.value = false
    }
  }

  const handleFetchWebsiteInfo = async () => {
    if (deps.fetchResourceInfoLoading.value) {
      return
    }

    const normalizedUrl = deps.normalizeWebsiteUrl(deps.formData.value?.meta?.website)
    if (!normalizedUrl) {
      deps.showNotifyByType('warning', '获取网站信息', '请先输入合法的网站地址')
      return
    }

    deps.fetchResourceInfoLoading.value = true

    try {
      const result = await window.api.service.fetchWebsiteInfo(normalizedUrl)
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '获取网站信息完成'
      const data = result?.data ?? {}

      if (resultType !== 'error') {
        deps.formData.value.meta.website = String(data.website ?? normalizedUrl).trim() || normalizedUrl

        if (String(data.name ?? '').trim()) {
          deps.formData.value.name = String(data.name).trim()
        }

        deps.formData.value.meta.favicon = String(data.favicon ?? '').trim()
      }

      if (resultType === 'error' || resultType === 'warning') {
        deps.showNotifyByType(resultType, '获取网站信息', resultMessage)
        return
      }

      deps.showNotifyByType('success', '获取网站信息', resultMessage)
    } finally {
      deps.fetchResourceInfoLoading.value = false
    }
  }

  const handleCheckGameEngine = async () => {
    const basePath = String(deps.formData.value?.basePath ?? '').trim()

    if (!basePath) {
      deps.showNotifyByType('warning', '检测游戏引擎', '请先选择游戏路径')
      return
    }

    const result = await window.api.service.detectGameEngine(basePath)
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '检测完成'

    if (resultType === 'error' || resultType === 'warning') {
      deps.showNotifyByType(resultType, '检测游戏引擎', resultMessage)
      return
    }

    const engineId = String(result?.data?.engineId ?? '').trim()
    if (engineId) {
      deps.formData.value.meta.engine = engineId
    }

    deps.showNotifyByType('success', '检测游戏引擎', resultMessage)
  }

  return {
    handleOpenSoftwareScriptModal,
    handleFetchAlbumCover,
    handleUseScreenshotCover,
    handleUseVideoRandomFrameCover,
    handleUseFirstCover,
    handleChooseCustomCover,
    handleFetchWebsiteCover,
    handleChooseCoverFromScreenshotFolder,
    handleClearCover,
    handleSelectBasePath,
    handleFetchGameInfo,
    handleFetchWebsiteInfo,
    handleCheckGameEngine
  }
}
