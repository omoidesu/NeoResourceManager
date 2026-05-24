import type { WebContents } from 'electron'

export type AppNotificationMessage = {
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  content: string
  createdAt: number
  aggregateKey?: string
  aggregateCount?: number
  replaceExisting?: boolean
}

export type ResourceStateChangedMessage = {
  resourceId: string
  categoryId: string
  running: boolean
  missingStatus?: boolean
  changedAt: number
}

export type BatchImportProgressMessage = {
  categoryId: string
  stage: 'analyze' | 'import'
  current: number
  total: number
  message: string
  done?: boolean
}

export type ResourceArchiveProgressMessage = {
  taskId: string
  operation?: 'archive' | 'restore'
  archiveId?: string
  resourceId: string
  categoryId: string
  title: string
  coverPath?: string
  current: number
  total: number
  progress: number
  message: string
  done?: boolean
  success?: boolean
  archivePath?: string
}

export type WebsiteCoverProgressMessage = {
  taskId: string
  categoryId: string
  current: number
  total: number
  progress: number
  title: string
  url: string
  favicon?: string
  message: string
  done?: boolean
  success?: boolean
  successCount?: number
  failedCount?: number
  skippedCount?: number
}

export class NotificationQueueService {
  private static instance: NotificationQueueService | null = null

  private queue: AppNotificationMessage[] = []
  private targetWebContents: WebContents | null = null
  private pushTimer: NodeJS.Timeout | null = null
  private aggregateBuckets = new Map<string, {
    type: AppNotificationMessage['type']
    title: string
    count: number
    contents: string[]
    queued: boolean
    dirty: boolean
    cooldownUntil: number
  }>()

  private constructor() {}

  public static getInstance() {
    if (!NotificationQueueService.instance) {
      NotificationQueueService.instance = new NotificationQueueService()
    }

    return NotificationQueueService.instance
  }

  /**
   * 注册前端渲染进程，并启动定时推送线程。
   */
  registerRenderer(webContents: WebContents) {
    this.targetWebContents = webContents

    if (!this.pushTimer) {
      this.pushTimer = setInterval(() => {
        this.flushOne()
      }, 1000)
    }
  }

  /**
   * 向主进程消息队列压入一个通知。
   */
  enqueue(type: AppNotificationMessage['type'], title: string, content: string) {
    const key = this.getAggregateKey(type, title)
    const existingBucket = this.aggregateBuckets.get(key)
    const now = Date.now()
    const bucket = !existingBucket || (!existingBucket.queued && now >= existingBucket.cooldownUntil)
      ? {
          type,
          title,
          count: 0,
          contents: [],
          queued: false,
          dirty: false,
          cooldownUntil: 0
        }
      : existingBucket

    bucket.type = type
    bucket.title = title
    bucket.count += 1
    bucket.dirty = true
    if (content.trim()) {
      const deduped = bucket.contents.filter((item) => item !== content)
      bucket.contents = [...deduped, content].slice(-3)
    }

    this.aggregateBuckets.set(key, bucket)

    if (bucket.queued) {
      const queueItem = this.queue.find((item) => item.aggregateKey === key)
      if (queueItem) {
        queueItem.content = this.buildAggregateContent(bucket.count, bucket.contents)
        queueItem.aggregateCount = bucket.count
        bucket.dirty = false
      }
      return
    }

    if (now < bucket.cooldownUntil) {
      bucket.cooldownUntil = now + 5000
      bucket.dirty = false
      this.pushAggregateUpdate(bucket, key)
      return
    }

    this.queue.push({
      type,
      title,
      content: this.buildAggregateContent(bucket.count, bucket.contents),
      createdAt: now,
      aggregateKey: key,
      aggregateCount: bucket.count
    })
    bucket.queued = true
    bucket.dirty = false
  }

  pushResourceStateChanged(message: ResourceStateChangedMessage) {
    if (!this.targetWebContents || this.targetWebContents.isDestroyed()) {
      return
    }

    this.targetWebContents.send('service:resource-state-changed', message)
  }

  pushBatchImportProgress(message: BatchImportProgressMessage) {
    if (!this.targetWebContents || this.targetWebContents.isDestroyed()) {
      return
    }

    this.targetWebContents.send('service:batch-import-progress', message)
  }

  pushResourceArchiveProgress(message: ResourceArchiveProgressMessage) {
    if (!this.targetWebContents || this.targetWebContents.isDestroyed()) {
      return
    }

    this.targetWebContents.send('service:resource-archive-progress', message)
  }

  pushWebsiteCoverProgress(message: WebsiteCoverProgressMessage) {
    if (!this.targetWebContents || this.targetWebContents.isDestroyed()) {
      return
    }

    this.targetWebContents.send('service:website-cover-progress', message)
  }

  dispose() {
    if (this.pushTimer) {
      clearInterval(this.pushTimer)
      this.pushTimer = null
    }

    this.targetWebContents = null
    this.queue = []
  }

  private flushOne() {
    if (!this.targetWebContents || this.targetWebContents.isDestroyed()) {
      return
    }

    this.enqueueDueAggregateBuckets()

    const nextMessage = this.queue.shift()
    if (!nextMessage) {
      return
    }

    this.targetWebContents.send('service:notification-push', nextMessage)

    const bucket = this.aggregateBuckets.get(String(nextMessage.aggregateKey ?? this.getAggregateKey(nextMessage.type, nextMessage.title)))
    if (!bucket) {
      return
    }

    bucket.queued = false
    bucket.dirty = false
    bucket.cooldownUntil = Date.now() + 5000
  }

  private enqueueDueAggregateBuckets() {
    const now = Date.now()
    for (const bucket of this.aggregateBuckets.values()) {
      if (!bucket.count || !bucket.dirty || bucket.queued || now < bucket.cooldownUntil) {
        continue
      }

      const key = this.getAggregateKey(bucket.type, bucket.title)
      this.queue.push({
        type: bucket.type,
        title: bucket.title,
        content: this.buildAggregateContent(bucket.count, bucket.contents),
        createdAt: now,
        aggregateKey: key,
        aggregateCount: bucket.count
      })
      bucket.queued = true
      bucket.dirty = false
    }
  }

  private pushAggregateUpdate(
    bucket: {
      type: AppNotificationMessage['type']
      title: string
      count: number
      contents: string[]
      queued: boolean
      cooldownUntil: number
    },
    key: string
  ) {
    if (!this.targetWebContents || this.targetWebContents.isDestroyed()) {
      return
    }

    this.targetWebContents.send('service:notification-push', {
      type: bucket.type,
      title: bucket.title,
      content: this.buildAggregateContent(bucket.count, bucket.contents),
      createdAt: Date.now(),
      aggregateKey: key,
      aggregateCount: bucket.count,
      replaceExisting: true
    } satisfies AppNotificationMessage)
  }

  private getAggregateKey(type: AppNotificationMessage['type'], title: string) {
    return `${type}::${title}`
  }

  private buildAggregateContent(count: number, contents: string[]) {
    if (count <= 1) {
      return contents[0] ?? ''
    }

    const normalizedContents = contents
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)

    if (!normalizedContents.length) {
      return `累计 ${count} 条相同通知。`
    }

    if (normalizedContents.length === 1) {
      return `累计 ${count} 条相同通知。\n最新：${normalizedContents[0]}`
    }

    return `累计 ${count} 条相同通知。\n最近 ${normalizedContents.length} 条：\n${normalizedContents.map((item) => `• ${item}`).join('\n')}`
  }
}
