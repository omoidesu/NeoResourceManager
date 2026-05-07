import type { ComputedRef, Ref } from 'vue'

type NotifyType = 'success' | 'error' | 'info' | 'warning' | 'warn' | string

type ConfirmDialog = (title: string, content: string) => Promise<boolean>

type Deps = {
  formData: Ref<any>
  categorySettings: ComputedRef<any>
  detailIsAsmr: ComputedRef<boolean>
  websiteTypeOptions: Ref<any[]>
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  confirmDialog: ConfirmDialog
  getFileNameWithoutExtension: (basePath: string) => string
  getResourceNameFromBasePath: (basePath: string) => string
  normalizeAudioAuthorList: (values: string[]) => string[]
  joinAudioAuthorNames: (names: string[]) => string
  syncAudioAuthorFields: (targetForm: any, names?: string[]) => void
}

export const useCategoryEditorPathAnalysis = (deps: Deps) => {
  const applyDefaultPathName = (basePath: string) => {
    if (deps.categorySettings.value.extendTable === 'audio_meta') {
      const fileStem = deps.getFileNameWithoutExtension(basePath)
      if (fileStem) {
        deps.formData.value.name = fileStem
      }
      return
    }

    if (deps.categorySettings.value.extendTable === 'single_image_meta') {
      const fileStem = deps.getFileNameWithoutExtension(basePath)
      if (fileStem) {
        deps.formData.value.name = fileStem
      }
      return
    }

    if (
      deps.categorySettings.value.extendTable === 'software_meta'
      || deps.categorySettings.value.extendTable === 'novel_meta'
      || deps.categorySettings.value.extendTable === 'video_meta'
    ) {
      const fileStem = deps.getFileNameWithoutExtension(basePath)
      if (fileStem) {
        deps.formData.value.name = fileStem
      }
      return
    }

    if (deps.categorySettings.value.extendTable === 'multi_image_meta') {
      const resourceName = deps.getResourceNameFromBasePath(basePath)
      if (resourceName) {
        deps.formData.value.name = resourceName
      }
      return
    }

    if (deps.categorySettings.value.resourcePathType !== 'file') {
      return
    }

    const resourceName = deps.getResourceNameFromBasePath(basePath)
    if (resourceName) {
      deps.formData.value.name = resourceName
    }
  }

  const applyNovelFileAnalysis = async (basePath: string) => {
    if (String(deps.categorySettings.value.extendTable ?? '').trim() !== 'novel_meta') {
      return
    }

    try {
      const result = await window.api.service.analyzeNovelFilePath(basePath)
      const analysis = result?.data ?? {}
      const coverDataUrl = String(analysis?.coverDataUrl ?? '').trim()
      const isbn = String(analysis?.isbn ?? '').trim()

      if (coverDataUrl && !String(deps.formData.value?.coverPath ?? '').trim()) {
        deps.formData.value.coverPath = coverDataUrl
      }

      deps.formData.value.meta = {
        ...(deps.formData.value.meta ?? {}),
        isbn
      }
    } catch {
      // 小说元数据只是辅助信息，读取失败不阻断添加资源。
    }
  }

  const applyGamePathAnalysis = async (basePath: string) => {
    if (!['game_meta', 'asmr_meta'].includes(String(deps.categorySettings.value.extendTable ?? '').trim())) {
      return
    }

    deps.formData.value.name = deps.getResourceNameFromBasePath(basePath)

    try {
      const analysis = await window.api.service.analyzeGamePath(basePath)
      if (!analysis) {
        return
      }

      if (analysis.name) {
        deps.formData.value.name = analysis.name
      }

      if (analysis.gameId) {
        deps.formData.value.meta.gameId = analysis.gameId
      }

      if (deps.detailIsAsmr.value && analysis.gameId) {
        deps.formData.value.meta.websiteType = String(
          deps.websiteTypeOptions.value.find((item: any) => String(item?.label ?? '').trim().toLowerCase() === 'dlsite')?.value ?? ''
        )
      } else if (analysis.websiteType) {
        deps.formData.value.meta.websiteType = analysis.websiteType
      }
    } catch (error) {
      deps.showNotifyByType('error', '分析失败', error instanceof Error ? error.message : '分析游戏路径失败')
    }
  }

  const buildAudioFetchPayload = (basePath: string, analysis?: any) => ({
    basePath: String(basePath ?? '').trim(),
    title: String(analysis?.name ?? deps.formData.value?.name ?? '').trim(),
    album: String(analysis?.album ?? deps.formData.value?.meta?.album ?? '').trim(),
    artist: String(analysis?.artist ?? deps.formData.value?.author ?? '').trim(),
    artists: deps.normalizeAudioAuthorList([
      ...(Array.isArray(analysis?.artists) ? analysis.artists : []),
      ...(Array.isArray(deps.formData.value?.authors) ? deps.formData.value.authors : []),
      String(analysis?.artist ?? deps.formData.value?.author ?? '').trim()
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
      const confirmed = await deps.confirmDialog('获取歌词', '未匹配到同名歌词文件，是否尝试自动获取歌词？')
      if (confirmed) {
        const result = await fetchAudioLyricsSilently(fetchPayload)
        if (result?.type === 'success' && result?.data?.lyricsPath) {
          deps.formData.value.meta = {
            ...(deps.formData.value.meta ?? {}),
            lyricsPath: String(result.data.lyricsPath)
          }
          deps.showNotifyByType('success', '获取歌词', result?.message ?? '已获取歌词')
        } else if (result?.message) {
          deps.showNotifyByType(result?.type ?? 'warning', '获取歌词', result.message)
        }
      }
    }

    if (!String(analysis?.embeddedCoverPath ?? '').trim()) {
      const confirmed = await deps.confirmDialog('获取专辑封面', '未检测到文件内嵌封面，是否尝试自动获取专辑封面？')
      if (confirmed) {
        const result = await fetchAudioAlbumCoverSilently(fetchPayload)
        if (result?.type === 'success' && result?.data?.coverPath) {
          deps.formData.value.coverPath = String(result.data.coverPath)
          deps.showNotifyByType('success', '获取专辑封面', result?.message ?? '已获取专辑封面')
        } else if (result?.message) {
          deps.showNotifyByType(result?.type ?? 'warning', '获取专辑封面', result.message)
        }
      }
    }
  }

  const applyAudioPathAnalysis = async (basePath: string) => {
    if (String(deps.categorySettings.value.extendTable ?? '').trim() !== 'audio_meta') {
      return
    }

    const fileStem = deps.getFileNameWithoutExtension(basePath)
    if (fileStem) {
      deps.formData.value.name = fileStem
    }

    try {
      const analysis = await window.api.service.analyzeAudioFilePath(basePath)
      if (!analysis) {
        return
      }

      if (analysis.name) {
        deps.formData.value.name = String(analysis.name)
      }

      const authorNames = deps.normalizeAudioAuthorList([
        ...(Array.isArray(analysis.artists) ? analysis.artists : []),
        String(analysis.artist ?? '').trim()
      ])
      deps.syncAudioAuthorFields(deps.formData.value, authorNames)

      deps.formData.value.meta = {
        ...(deps.formData.value.meta ?? {}),
        artist: deps.joinAudioAuthorNames(authorNames) || String(analysis.artist ?? deps.formData.value.meta?.artist ?? ''),
        album: String(analysis.album ?? deps.formData.value.meta?.album ?? ''),
        lyricsPath: String(analysis.lyricsPath ?? deps.formData.value.meta?.lyricsPath ?? ''),
        duration: Number.isFinite(Number(analysis.duration)) ? Math.max(0, Math.floor(Number(analysis.duration))) : Number(deps.formData.value.meta?.duration ?? 0)
      }
      deps.formData.value.coverPath = String(analysis.embeddedCoverPath ?? '').trim()
      await promptForMissingAudioAssets(basePath, analysis)
    } catch (error) {
      deps.showNotifyByType('error', '分析失败', error instanceof Error ? error.message : '分析音乐文件失败')
    }
  }

  const applyMultiImageDirectoryAnalysis = async (basePath: string) => {
    if (deps.categorySettings.value.extendTable !== 'multi_image_meta') {
      return
    }

    try {
      const result = await window.api.service.analyzeMultiImageDirectory(basePath)
      const directoryName = String(result?.data?.directoryName ?? '').trim()
      const coverPath = String(result?.data?.coverPath ?? '').trim()

      if (directoryName) {
        deps.formData.value.name = directoryName
      }

      if (coverPath) {
        deps.formData.value.coverPath = coverPath
      } else {
        deps.formData.value.coverPath = ''
      }
    } catch {
      deps.formData.value.coverPath = ''
    }
  }

  const applyAudioCoverAnalysis = async () => {
    if (String(deps.categorySettings.value.extendTable ?? '').trim() !== 'audio_meta') {
      return
    }
  }

  return {
    applyDefaultPathName,
    applyNovelFileAnalysis,
    applyGamePathAnalysis,
    buildAudioFetchPayload,
    fetchAudioLyricsSilently,
    fetchAudioAlbumCoverSilently,
    applyAudioPathAnalysis,
    applyMultiImageDirectoryAnalysis,
    applyAudioCoverAnalysis
  }
}
