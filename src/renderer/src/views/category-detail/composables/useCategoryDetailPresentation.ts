import { computed, type ComputedRef, type Ref } from 'vue'

type DetailMetaItem = {
  label: string
  value: string
  icon?: string
  full?: boolean
  copyValue?: string
  clampLines?: number
}

type NamedItem = {
  id?: string
  name?: string
  icon?: string
}

interface UseCategoryDetailPresentationOptions {
  selectedDetailResource: Ref<any>
  categoryName: ComputedRef<string>
  categorySettings: ComputedRef<any>
  categoryProfile: ComputedRef<any>
  actorFilterLabel: ComputedRef<string>
  detailIsManga: ComputedRef<boolean>
  detailIsAsmr: ComputedRef<boolean>
  detailIsAudio: ComputedRef<boolean>
  detailIsNovel: ComputedRef<boolean>
  detailIsWebsite: ComputedRef<boolean>
  isVideoCategory: ComputedRef<boolean>
  detailScreenshotPaths: Ref<string[]>
  detailGalleryImageUrls: Ref<Record<string, string>>
  detailWebsiteAddressLabel: ComputedRef<string>
  detailWebsiteIconLabel: ComputedRef<string>
  detailWebsiteIsDownloadLink: ComputedRef<boolean>
  detailWebsitePlaceholderEmoji: ComputedRef<string>
  detailWebsiteFaviconSrc: Ref<string>
  detailWebsiteUrl: ComputedRef<string>
  normalizedEngineList: ComputedRef<NamedItem[]>
  normalizedEngineOptionList: ComputedRef<NamedItem[]>
  normalizedLanguageList: ComputedRef<NamedItem[]>
  normalizeWebsiteIconSource: (value: string) => string
  formatDuration: (value: number | null | undefined) => string
  formatAsmrDuration: (value: number | null | undefined) => string
  formatAudioBitrate: (value: number | null | undefined) => string
  formatAudioSampleRate: (value: number | null | undefined) => string
  buildDisplayBasePath: (resource: any) => string
}

export const useCategoryDetailPresentation = (options: UseCategoryDetailPresentationOptions) => {
  const resolveLanguageName = (languageId: unknown) => {
    const normalizedId = String(languageId ?? '').trim()
    if (!normalizedId) {
      return ''
    }

    const matchedLanguage = options.normalizedLanguageList.value.find((item) => item.id === normalizedId)
    return matchedLanguage?.name ?? normalizedId
  }

  const resolveEngineItem = (engineValue: unknown) => {
    const normalizedValue = String(engineValue ?? '').trim()
    if (!normalizedValue) {
      return null
    }

    return options.normalizedEngineList.value.find((item) => item.id === normalizedValue)
      ?? options.normalizedEngineOptionList.value.find((item) => item.id === normalizedValue)
      ?? options.normalizedEngineOptionList.value.find((item) => item.name === normalizedValue)
      ?? null
  }

  const detailUsesWebsiteTerms = computed(() => options.categoryProfile.value.features.usesWebsiteTerms)
  const detailUsesBrowseTerms = computed(() => options.categoryProfile.value.features.usesBrowseTerms)
  const detailUsesPlayTerms = computed(() => options.categoryProfile.value.features.usesPlayTerms)
  const detailShowTotalRuntime = computed(() => options.categoryProfile.value.features.showDetailTotalRuntime)
  const detailShowLogs = computed(() => options.categoryProfile.value.features.showDetailLogs)

  const detailStatsText = computed(() => ({
    firstAccess: detailUsesWebsiteTerms.value ? '第一次访问' : (detailUsesBrowseTerms.value ? '第一次浏览' : (detailUsesPlayTerms.value ? '第一次播放' : '第一次启动')),
    lastAccess: detailUsesWebsiteTerms.value ? '最后一次访问' : (detailUsesBrowseTerms.value ? '最后一次浏览' : (detailUsesPlayTerms.value ? '最后一次播放' : '最后一次启动')),
    accessCount: detailUsesWebsiteTerms.value ? '访问次数' : (detailUsesBrowseTerms.value ? '浏览次数' : (detailUsesPlayTerms.value ? '播放次数' : '启动次数')),
    totalRuntime: detailUsesBrowseTerms.value ? '浏览总时长' : (detailUsesPlayTerms.value ? '播放总时长' : '运行总时长'),
  }))

  const detailPreviewSectionTitle = computed(() => {
    if (options.detailIsManga.value) return ''
    if (String(options.categoryName.value ?? '').trim() === '电影') return '截图'
    return '游戏截图'
  })

  const detailGallerySectionTitle = computed(() => {
    if (options.detailIsManga.value) return '图片预览'
    if (options.detailIsAsmr.value) return '音声目录'
    if (options.isVideoCategory.value) return '播放日志'
    return '启动日志'
  })

  const detailDirectorySectionTitle = computed(() => options.detailIsAsmr.value ? detailGallerySectionTitle.value : '番剧目录')
  const detailDirectoryEmptyText = computed(() => options.detailIsAsmr.value ? '暂无音频文件' : '暂无目录内容')
  const detailEmptyLogDescription = computed(() => options.isVideoCategory.value ? '暂无播放日志' : '暂无启动日志')
  const detailLogModeLabel = computed(() => options.isVideoCategory.value ? '播放方式' : '启动方式')
  const detailLogDurationLabel = computed(() => options.isVideoCategory.value ? '播放时长' : '运行时长')

  const hasDetailDescription = computed(() => {
    const rawDescription = String(options.selectedDetailResource.value?.description ?? '').trim()
    if (!rawDescription) {
      return false
    }

    const plainText = rawDescription
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<\/?p[^>]*>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .trim()

    return Boolean(plainText)
  })

  const detailReadingProgressText = computed(() => {
    if (options.detailIsNovel.value) {
      const lastReadPercent = Math.max(0, Math.min(1, Number(options.selectedDetailResource.value?.novelMeta?.lastReadPercent ?? 0)))
      return `${Math.round(lastReadPercent * 100)}%`
    }

    if (!options.detailIsManga.value) {
      return ''
    }

    const lastReadPage = Math.max(0, Number(options.selectedDetailResource.value?.multiImageMeta?.lastReadPage ?? 0))
    const totalPages = Math.max(0, options.detailScreenshotPaths.value.length)

    if (!totalPages) {
      return '0 / 0'
    }

    return `${Math.min(lastReadPage + 1, totalPages)} / ${totalPages}`
  })

  const detailPlaybackProgressText = computed(() => {
    if (options.detailIsAudio.value) {
      const lastPlayTime = Math.max(0, Number(options.selectedDetailResource.value?.audioMeta?.lastPlayTime ?? 0))
      return lastPlayTime > 0 ? options.formatDuration(lastPlayTime) : '暂无'
    }

    if (options.isVideoCategory.value) {
      const lastPlayTime = Math.max(0, Number(options.selectedDetailResource.value?.videoMeta?.lastPlayTime ?? 0))
      return lastPlayTime > 0 ? options.formatDuration(lastPlayTime) : '暂无'
    }

    if (!options.detailIsAsmr.value) {
      return ''
    }

    const lastPlayFile = String(options.selectedDetailResource.value?.asmrMeta?.lastPlayFile ?? '').trim()
    if (!lastPlayFile) {
      return '暂无'
    }

    const normalizedPath = lastPlayFile.replace(/\\/g, '/')
    const fileName = normalizedPath.split('/').pop() || normalizedPath
    const lastPlayTime = Math.max(0, Number(options.selectedDetailResource.value?.asmrMeta?.lastPlayTime ?? 0))

    return `${fileName} ${options.formatDuration(lastPlayTime)}`
  })

  const detailGalleryItems = computed(() =>
    options.detailScreenshotPaths.value.map((filePath, index) => ({
      filePath,
      index,
      url: options.detailGalleryImageUrls.value[filePath] ?? ''
    }))
  )

  const detailMetaItems = computed<DetailMetaItem[]>(() => {
    const resource = options.selectedDetailResource.value
    if (!resource) {
      return []
    }

    const pushItem = (
      items: DetailMetaItem[],
      label: string,
      value: unknown,
      icon?: string,
      full = false,
      copyValue?: string,
      clampLines?: number
    ) => {
      const normalizedValue = String(value ?? '').trim()
      if (normalizedValue) {
        items.push({
          label,
          value: normalizedValue,
          icon,
          full,
          copyValue: String(copyValue ?? '').trim() || undefined,
          clampLines: Number(clampLines) > 0 ? Number(clampLines) : undefined
        })
      }
    }

    const items: DetailMetaItem[] = []
    const extendTable = options.categorySettings.value.extendTable

    if (extendTable === 'game_meta') {
      pushItem(items, '昵称', resource.gameMeta?.nickname)
      pushItem(items, '中文名', resource.gameMeta?.nameZh)
      pushItem(items, '日文名', resource.gameMeta?.nameJp)
      pushItem(items, '英文名', resource.gameMeta?.nameEn)
      pushItem(items, '语言', resolveLanguageName(resource.gameMeta?.language))
      pushItem(items, '版本', resource.gameMeta?.version)

      const engineId = String(resource.gameMeta?.engine ?? '').trim()
      const engineItem = resolveEngineItem(engineId)
      const engineName = engineItem?.name ?? engineId
      pushItem(items, '引擎', engineName, engineItem?.icon)
    } else if (extendTable === 'software_meta') {
      pushItem(items, '版本', resource.softwareMeta?.version)
      pushItem(items, '命令行参数', resource.softwareMeta?.commandLineArgs)
    } else if (extendTable === 'video_meta') {
      pushItem(
        items,
        options.actorFilterLabel.value,
        Array.isArray(resource.actors) ? resource.actors.map((item: any) => String(item?.name ?? '')).filter(Boolean).join(' / ') : ''
      )
      pushItem(items, '年份', resource.videoMeta?.year)
    } else if (extendTable === 'asmr_meta') {
      pushItem(items, '脚本', resource.asmrMeta?.scenario)
      pushItem(
        items,
        '声优',
        Array.isArray(resource.actors) ? resource.actors.map((item: any) => String(item?.name ?? '')).filter(Boolean).join(' / ') : ''
      )
      pushItem(items, '画师', resource.asmrMeta?.illust)
      pushItem(items, '总时长', options.formatAsmrDuration(resource.asmrMeta?.duration))
      pushItem(items, '语言', resolveLanguageName(resource.asmrMeta?.language))
    } else if (extendTable === 'audio_meta') {
      pushItem(
        items,
        '艺术家',
        Array.isArray(resource.authors)
          ? resource.authors.map((item: any) => String(item?.name ?? '')).filter(Boolean).join(' / ')
          : resource.audioMeta?.artist
      )
      pushItem(items, '专辑', resource.audioMeta?.album)
      pushItem(items, '比特率', options.formatAudioBitrate(resource.audioMeta?.bitrate))
      pushItem(items, '采样率', options.formatAudioSampleRate(resource.audioMeta?.sampleRate))
      pushItem(items, '歌词路径', resource.audioMeta?.lyricsPath)
      pushItem(items, '总时长', options.formatDuration(resource.audioMeta?.duration))
    } else if (extendTable === 'novel_meta') {
      pushItem(items, '译者', resource.novelMeta?.translator)
      pushItem(items, 'ISBN', resource.novelMeta?.isbn)
      pushItem(items, '发行年', Number(resource.novelMeta?.year) > 0 ? resource.novelMeta?.year : '')
      pushItem(items, '出版社', resource.novelMeta?.publisher)
    } else if (extendTable === 'website_meta') {
      pushItem(
        items,
        options.detailWebsiteAddressLabel.value,
        options.detailWebsiteUrl.value,
        undefined,
        true,
        options.detailWebsiteUrl.value,
        options.detailWebsiteIsDownloadLink.value ? 3 : undefined
      )
      if (options.detailWebsiteIsDownloadLink.value) {
        pushItem(items, '链接类型', '下载链接')
      } else {
        pushItem(
          items,
          options.detailWebsiteIconLabel.value,
          options.detailWebsiteFaviconSrc.value ? '已获取' : options.detailWebsitePlaceholderEmoji.value,
          options.detailWebsiteFaviconSrc.value || options.normalizeWebsiteIconSource(String(resource.websiteMeta?.favicon ?? ''))
        )
      }
    }

    return items
  })

  const detailDisplayPath = computed(() => options.buildDisplayBasePath(options.selectedDetailResource.value))

  return {
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
  }
}
