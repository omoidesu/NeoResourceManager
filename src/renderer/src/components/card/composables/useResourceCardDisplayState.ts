import {computed, type ComputedRef} from 'vue'
import {BookOutline, DocumentTextOutline, ReaderOutline} from '@vicons/ionicons5'
import {getWebsitePlaceholderEmoji} from '../../../utils/website-placeholder-emoji'

export const useResourceCardDisplayState = (params: {
  resource: ComputedRef<any>
  categoryName: ComputedRef<string>
  hideTypeLine: ComputedRef<boolean>
  startText: ComputedRef<string>
}) => {
  const {resource, categoryName, hideTypeLine, startText} = params

  const resourceTags = computed(() => resource.value?.tags ?? [])
  const resourceTypes = computed(() => resource.value?.types ?? [])
  const resourceAuthors = computed(() => resource.value?.authors ?? [])
  const resourceActors = computed(() => resource.value?.actors ?? [])
  const resourceAlbum = computed(() => String(resource.value?.audioMeta?.album ?? '').trim())
  const showAlbumLine = computed(() => categoryName.value === '音乐' && Boolean(resourceAlbum.value))

  const isNovelCategory = computed(() => categoryName.value === '小说')
  const isMovieCategory = computed(() => categoryName.value === '电影')
  const isAnimeCategory = computed(() => categoryName.value === '番剧')
  const isAsmrCategory = computed(() => categoryName.value === '音声')
  const isAudioCategory = computed(() => categoryName.value === '音乐')
  const isWebsiteCategory = computed(() => categoryName.value === '网站')
  const isVideoLikeCategory = computed(() => isMovieCategory.value || isAnimeCategory.value)

  const completedLabel = computed(() => {
    if (isNovelCategory.value) {
      return '读完'
    }

    if (isVideoLikeCategory.value) {
      return '播完'
    }

    return '通关'
  })
  const completedStateLabel = computed(() => `已${completedLabel.value}`)

  const inactiveStatusIconColor = 'currentColor'
  const favoriteIconColor = computed(() => (resource.value?.ifFavorite ? '#f0a020' : inactiveStatusIconColor))
  const completedIconColor = computed(() => (resource.value?.isCompleted ? '#2080f0' : inactiveStatusIconColor))

  const displayBaseName = computed(() => {
    const fileName = String(resource.value?.fileName ?? resource.value?.filename ?? '')
    if (fileName) {
      return fileName
    }

    const basePath = String(resource.value?.basePath ?? '')
    if (!basePath) {
      return ''
    }

    const normalizedPath = basePath.replace(/\\/g, '/')
    return normalizedPath.split('/').pop() ?? normalizedPath
  })

  const websiteUrl = computed(() =>
    String(
      resource.value?.websiteMeta?.url
      ?? resource.value?.websiteMeta?.website
      ?? resource.value?.meta?.website
      ?? resource.value?.website
      ?? ''
    ).trim()
  )
  const websiteIsDownloadLink = computed(() => Boolean(
    resource.value?.websiteMeta?.isDownloadLink
    ?? resource.value?.meta?.isDownloadLink
  ))
  const cardSubtitle = computed(() => isWebsiteCategory.value ? websiteUrl.value : displayBaseName.value)
  const websitePlaceholderEmoji = computed(() =>
    getWebsitePlaceholderEmoji(resource.value?.id, websiteUrl.value, websiteIsDownloadLink.value)
  )

  const fileExtension = computed(() => {
    const fileName = displayBaseName.value
    const matched = fileName.match(/\.([^.\\/]+)$/)
    return String(matched?.[1] ?? '').trim().toLowerCase()
  })

  const showFileTypeIcon = computed(() => {
    return categoryName.value === '游戏' || categoryName.value === '软件' || (isNovelCategory.value && Boolean(fileExtension.value))
  })

  const showNovelFileIcon = computed(() => isNovelCategory.value && Boolean(fileExtension.value))
  const showNovelMarkdownIcon = computed(() => ['md', 'markdown'].includes(fileExtension.value))
  const showAsyncFileIcon = computed(() => showFileTypeIcon.value && !showNovelFileIcon.value)
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

    const rawYear = Number(resource.value?.novelMeta?.year ?? 0)
    const year = Number.isFinite(rawYear) && rawYear >= 1000 ? String(Math.trunc(rawYear)) : ''
    if (!year) {
      return ''
    }

    const publisher = String(resource.value?.novelMeta?.publisher ?? '').trim()
    return [year, publisher].filter(Boolean).join(' / ')
  })

  const videoYearInfo = computed(() => {
    if (!isVideoLikeCategory.value) {
      return ''
    }

    const rawYear = Number(resource.value?.videoMeta?.year ?? 0)
    return Number.isFinite(rawYear) && rawYear >= 1000 ? String(Math.trunc(rawYear)) : ''
  })

  const normalizeResourcePath = (value: string | null | undefined) => String(value ?? '').trim().replace(/\\/g, '/').toLowerCase()
  const getFileNameFromPath = (value: string | null | undefined) => {
    const normalizedValue = String(value ?? '').trim().replace(/\\/g, '/')
    return normalizedValue.split('/').pop() ?? normalizedValue
  }
  const stripFileExtension = (value: string) => String(value).replace(/\.[^.\\/]+$/, '')
  const compactPlaybackFileName = (value: string, maxLength = 18) => {
    const normalizedValue = stripFileExtension(getFileNameFromPath(value)).trim()
    if (!normalizedValue) {
      return ''
    }

    if (normalizedValue.length <= maxLength) {
      return normalizedValue
    }

    return `${normalizedValue.slice(0, Math.max(0, maxLength - 1))}…`
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

    const lastPlayFile = String(resource.value?.videoMeta?.lastPlayFile ?? '').trim()
    const lastPlayTime = Math.max(0, Number(resource.value?.videoMeta?.lastPlayTime ?? 0))
    if (!lastPlayFile || lastPlayTime <= 0) {
      return ''
    }

    const normalizedLastPlayFile = normalizeResourcePath(lastPlayFile)
    const fileName = getFileNameFromPath(lastPlayFile)
    const videoSubs = Array.isArray(resource.value?.videoSubs) ? resource.value.videoSubs : []
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

    const lastPlayTime = Math.max(0, Number(resource.value?.videoMeta?.lastPlayTime ?? 0))
    return lastPlayTime > 0 ? formatPlaybackTime(lastPlayTime) : ''
  })
  const asmrPlaybackProgressText = computed(() => {
    if (!isAsmrCategory.value) {
      return ''
    }

    const lastPlayFile = String(resource.value?.asmrMeta?.lastPlayFile ?? '').trim()
    const lastPlayTime = Math.max(0, Number(resource.value?.asmrMeta?.lastPlayTime ?? 0))
    if (!lastPlayFile || lastPlayTime <= 0) {
      return ''
    }

    const compactFileName = compactPlaybackFileName(lastPlayFile)
    return compactFileName
      ? `${compactFileName} · ${formatPlaybackTime(lastPlayTime)}`
      : formatPlaybackTime(lastPlayTime)
  })
  const audioPlaybackProgressText = computed(() => {
    if (!isAudioCategory.value) {
      return ''
    }

    const lastPlayTime = Math.max(0, Number(resource.value?.audioMeta?.lastPlayTime ?? 0))
    return lastPlayTime > 0 ? formatPlaybackTime(lastPlayTime) : ''
  })
  const videoCoverProgressText = computed(() =>
    animePlaybackProgressText.value
    || moviePlaybackProgressText.value
    || asmrPlaybackProgressText.value
    || audioPlaybackProgressText.value
  )
  const launchActionText = computed(() => {
    const fallback = String(startText.value ?? '').trim() || '启动'
    const hasResumeProgress = Boolean(
      videoCoverProgressText.value
      && ['音乐', '音声', '电影', '番剧'].includes(categoryName.value)
    )

    return hasResumeProgress ? '继续播放' : fallback
  })
  const showActorLine = computed(() => (hideTypeLine.value || isVideoLikeCategory.value) && resourceActors.value.length)
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
    const rating = Number(resource.value?.rating ?? -1)

    if (!Number.isFinite(rating) || rating < 0) {
      return 0
    }

    return rating
  })

  const isRunning = computed(() => Boolean(resource.value?.isRunning))

  return {
    resourceTags,
    resourceTypes,
    resourceAuthors,
    resourceActors,
    resourceAlbum,
    showAlbumLine,
    isNovelCategory,
    isMovieCategory,
    isAnimeCategory,
    isWebsiteCategory,
    isVideoLikeCategory,
    completedLabel,
    completedStateLabel,
    favoriteIconColor,
    completedIconColor,
    displayBaseName,
    websiteUrl,
    websiteIsDownloadLink,
    cardSubtitle,
    websitePlaceholderEmoji,
    fileExtension,
    showFileTypeIcon,
    showNovelFileIcon,
    showNovelMarkdownIcon,
    showAsyncFileIcon,
    novelFileIcon,
    novelFileIconTitle,
    novelPublishInfo,
    videoYearInfo,
    animePlaybackProgressText,
    moviePlaybackProgressText,
    videoCoverProgressText,
    launchActionText,
    showActorLine,
    actorLineLabel,
    fallbackExecutableIcon,
    normalizedRating,
    isRunning
  }
}
