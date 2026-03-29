import { DatabaseService } from './database.service'
import { ResourceService } from './resource.service'
import { createLogger } from '../util/logger'

type TimerHandle = ReturnType<typeof setInterval>

export class ResourceRuntimeMonitorService {
  private static instance: ResourceRuntimeMonitorService | null = null
  private readonly logger = createLogger('resource-runtime-monitor')
  private timer: TimerHandle | null = null
  private isTicking = false

  public static getInstance() {
    if (!ResourceRuntimeMonitorService.instance) {
      ResourceRuntimeMonitorService.instance = new ResourceRuntimeMonitorService()
    }

    return ResourceRuntimeMonitorService.instance
  }

  start() {
    if (this.timer) {
      return
    }

    this.logger.info('runtime monitor started')
    this.timer = setInterval(() => {
      void this.tick()
    }, 1000)

    void this.tick()
  }

  dispose() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    this.isTicking = false
    this.logger.info('runtime monitor disposed')
  }

  private async tick() {
    if (this.isTicking) {
      return
    }

    this.isTicking = true

    try {
      const activeLogs = await DatabaseService.getActiveResourceLogsWithPid()

      for (const resourceLog of activeLogs) {
        if (!resourceLog.resourceId || !resourceLog.pid) {
          continue
        }

        if (this.isProcessRunning(resourceLog.pid)) {
          continue
        }

        const updated = await ResourceService.finalizeStoppedResource(resourceLog.resourceId, resourceLog, new Date())
        if (updated) {
          this.logger.info('detected resource process exited', {
            resourceId: resourceLog.resourceId,
            pid: resourceLog.pid,
          })
        }
      }
    } catch (error) {
      this.logger.error('runtime monitor tick failed', error)
    } finally {
      this.isTicking = false
    }
  }

  private isProcessRunning(pid: number) {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
}
