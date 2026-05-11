import { ref, type ComputedRef, type Ref } from 'vue'

type MeasureDashboardTask = <T>(
  label: string,
  task: () => Promise<T>,
  meta?: Record<string, unknown>
) => Promise<T>

type RecentFeed = {
  id: string
  title: string
  meta: string
  categoryId: string
  categoryName: string
  categoryEmoji: string
  coverUrl: string
}

export const useDashboardRecentFeeds = ({
  dashboardDisposed,
  measureDashboardTask,
  isDashboardPreviewWorkAllowed,
  toCssUrlValue,
  feedCoverOverlay,
  formatAddedTime
}: {
  dashboardDisposed: Ref<boolean>
  measureDashboardTask: MeasureDashboardTask
  isDashboardPreviewWorkAllowed: () => boolean
  toCssUrlValue: (value: unknown) => string
  feedCoverOverlay: ComputedRef<string>
  formatAddedTime: (value: unknown) => string
}) => {
  const recentFeeds = ref<RecentFeed[]>([])
  const recentFeedsLoading = ref(false)

  const loadRecentFeeds = async () => {
    recentFeedsLoading.value = true
    try {
      await measureDashboardTask('loadRecentFeeds', async () => {
        const items = await window.api.db.getRecentlyAddedResources(7, 3)
        if (!isDashboardPreviewWorkAllowed()) {
          return
        }

        const feeds: RecentFeed[] = []
        for (const item of items) {
          if (!isDashboardPreviewWorkAllowed()) {
            break
          }

          const categoryName = String(item?.categoryName ?? '').trim()
          const categoryEmoji = String(item?.categoryEmoji ?? '').trim()
          const coverPath = String(item?.coverPath ?? '').trim()
          let coverUrl = ''

          if (coverPath && isDashboardPreviewWorkAllowed()) {
            coverUrl = await window.api.dialog.getImagePreviewUrl(coverPath, {
              maxWidth: 640,
              maxHeight: 220,
              fit: 'cover',
              quality: 90
            }) ?? ''
          }

          feeds.push({
            id: String(item?.id ?? ''),
            title: String(item?.title ?? '未命名资源'),
            meta: [
              categoryEmoji || '📁',
              categoryName || '未分类',
              formatAddedTime(item?.createTime)
            ].filter(Boolean).join(' · '),
            categoryId: String(item?.categoryId ?? ''),
            categoryName,
            categoryEmoji,
            coverUrl
          })
        }

        if (isDashboardPreviewWorkAllowed()) {
          recentFeeds.value = feeds
        }
      })
    } catch {
      if (!dashboardDisposed.value) {
        recentFeeds.value = []
      }
    } finally {
      if (!dashboardDisposed.value) {
        recentFeedsLoading.value = false
      }
    }
  }

  const getRecentFeedStyle = (feed: RecentFeed) => {
    if (!feed.coverUrl) {
      return {}
    }

    return {
      backgroundImage: [
        feedCoverOverlay.value,
        toCssUrlValue(feed.coverUrl)
      ].join(', '),
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    }
  }

  return {
    recentFeeds,
    recentFeedsLoading,
    loadRecentFeeds,
    getRecentFeedStyle
  }
}
