import type { WebContents } from 'electron'

export type AppNotificationMessage = {
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  content: string
  createdAt: number
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

export class NotificationQueueService {
  private static instance: NotificationQueueService | null = null

  private queue: AppNotificationMessage[] = []
  private targetWebContents: WebContents | null = null
  private pushTimer: NodeJS.Timeout | null = null

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
    this.queue.push({
      type,
      title,
      content,
      createdAt: Date.now(),
    })
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

    const nextMessage = this.queue.shift()
    if (!nextMessage) {
      return
    }

    this.targetWebContents.send('service:notification-push', nextMessage)
  }
}
