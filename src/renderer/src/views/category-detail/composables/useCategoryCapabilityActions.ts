import type { ComputedRef, Ref } from 'vue'

type NotifyType = 'success' | 'error' | 'info' | 'warning'

interface UseCategoryCapabilityActionsOptions {
  categoryName: ComputedRef<string>
  categorySettingsExtendTable: ComputedRef<string>
  canZoneLaunch: ComputedRef<boolean>
  canMtoolLaunch: ComputedRef<boolean>
  selectedDetailResource: Ref<any>
  currentPictureViewerResourceId: Ref<string>
  currentComicReaderResourceId: Ref<string>
  currentTextReaderResourceId: Ref<string>
  currentPdfReaderResourceId: Ref<string>
  currentEpubReaderResourceId: Ref<string>
  currentEbookReaderResourceId: Ref<string>
  showPictureViewer: Ref<boolean>
  showComicReader: Ref<boolean>
  showTextReader: Ref<boolean>
  showPdfReader: Ref<boolean>
  showEpubReader: Ref<boolean>
  showEbookReader: Ref<boolean>
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  fetchData: () => Promise<void>
  getResourceFilePath: (resource: any) => string
  getWebsiteResourceUrl: (resource: any) => string
  recordResourceAccessIfPossible: (resource: any, title: string) => Promise<void>
  hideAudioPlayer: () => void
  stopAudioPlayback: (resource: any) => Promise<void>
  onLaunchSpecialResource: (resource: any) => Promise<boolean>
}

export const useCategoryCapabilityActions = (options: UseCategoryCapabilityActionsOptions) => {
  const clearResourceRuntimeViews = (resourceId: string) => {
    if (resourceId === String(options.currentPictureViewerResourceId.value ?? '')) {
      options.currentPictureViewerResourceId.value = ''
      options.showPictureViewer.value = false
    }

    if (resourceId === String(options.currentComicReaderResourceId.value ?? '')) {
      options.currentComicReaderResourceId.value = ''
      options.showComicReader.value = false
    }

    if (resourceId === String(options.currentTextReaderResourceId.value ?? '')) {
      options.currentTextReaderResourceId.value = ''
      options.showTextReader.value = false
    }

    if (resourceId === String(options.currentPdfReaderResourceId.value ?? '')) {
      options.currentPdfReaderResourceId.value = ''
      options.showPdfReader.value = false
    }

    if (resourceId === String(options.currentEpubReaderResourceId.value ?? '')) {
      options.currentEpubReaderResourceId.value = ''
      options.showEpubReader.value = false
    }

    if (resourceId === String(options.currentEbookReaderResourceId.value ?? '')) {
      options.currentEbookReaderResourceId.value = ''
      options.showEbookReader.value = false
    }
  }

  const handleOpenWebsiteResource = async (resource: any) => {
    const url = options.getWebsiteResourceUrl(resource)
    if (!url) {
      options.showNotifyByType('warning', '打开网站', '当前资源未填写网站地址')
      return
    }

    try {
      const message = await window.api.dialog.openExternalUrl(url)
      if (message) {
        options.showNotifyByType('error', '打开网站', message)
        return
      }

      await options.recordResourceAccessIfPossible(resource, '打开网站')
      options.showNotifyByType('success', '打开网站', `已打开“${resource?.title ?? options.categoryName.value}”`)
    } catch (error) {
      options.showNotifyByType('error', '打开网站', error instanceof Error ? error.message : '打开网站失败')
    }
  }

  const handleLaunchResource = async (resource: any) => {
    if (await options.onLaunchSpecialResource(resource)) {
      return
    }

    if (resource?.missingStatus) {
      options.showNotifyByType('warning', '启动失败', '当前资源已失效，无法启动')
      return
    }

    if (options.getWebsiteResourceUrl(resource)) {
      await handleOpenWebsiteResource(resource)
      return
    }

    try {
      const result = await window.api.service.launchResource(
        String(resource?.id ?? ''),
        String(resource?.basePath ?? ''),
        String(resource?.fileName ?? resource?.filename ?? '') || undefined
      )

      if (result?.type === 'error') {
        options.showNotifyByType('error', '启动失败', result?.message ?? '启动资源失败')
        return
      }

      options.showNotifyByType('success', '启动资源', result?.message ?? `已启动${resource?.title ?? options.categoryName.value}`)
      await options.fetchData()
    } catch (error) {
      options.showNotifyByType('error', '启动失败', error instanceof Error ? error.message : '启动资源失败')
    }
  }

  const handleStopResource = async (resource: any) => {
    try {
      if (['asmr_meta', 'audio_meta'].includes(String(options.categorySettingsExtendTable.value ?? '').trim())) {
        await options.stopAudioPlayback(resource)
        options.hideAudioPlayer()
        options.showNotifyByType('success', '停止资源', `已停止${resource?.title ?? options.categoryName.value}`)
        await options.fetchData()
        return
      }

      const result = await window.api.service.stopResource(String(resource?.id ?? ''))
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? `已停止${resource?.title ?? options.categoryName.value}`

      options.showNotifyByType(resultType, '停止资源', resultMessage)

      if (resultType !== 'error') {
        clearResourceRuntimeViews(String(resource?.id ?? ''))
        await options.fetchData()
      }
    } catch (error) {
      options.showNotifyByType('error', '停止失败', error instanceof Error ? error.message : '停止资源失败')
    }
  }

  const handleZoneLaunchResource = (resource: any) => {
    void (async () => {
      if (!options.canZoneLaunch.value) {
        options.showNotifyByType('warning', '转区启动', '请先在设置中配置 LE 转区工具路径')
        return
      }

      try {
        const result = await window.api.service.launchResourceWithLocaleEmulator(
          String(resource?.id ?? ''),
          String(resource?.basePath ?? ''),
          String(resource?.fileName ?? resource?.filename ?? '') || undefined
        )
        const resultType = result?.type ?? 'info'
        const resultMessage = result?.message ?? `已通过 LE 转区启动“${resource?.title ?? options.categoryName.value}”`

        options.showNotifyByType(resultType, '转区启动', resultMessage)

        if (resultType !== 'error') {
          await options.fetchData()
        }
      } catch (error) {
        options.showNotifyByType('error', '转区启动', error instanceof Error ? error.message : 'LE 转区启动失败')
      }
    })()
  }

  const handleMtoolLaunchResource = async (resource: any) => {
    if (!options.canMtoolLaunch.value) {
      options.showNotifyByType('warning', 'MTool 启动', '请先在设置中配置 MTool 路径')
      return
    }

    try {
      const result = await window.api.service.launchResourceWithMtool(
        String(resource?.id ?? ''),
        String(resource?.basePath ?? ''),
        String(resource?.fileName ?? resource?.filename ?? '') || undefined
      )
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? `已通过 MTool 启动“${resource?.title ?? options.categoryName.value}”`

      options.showNotifyByType(resultType, 'MTool 启动', resultMessage)

      if (resultType !== 'error') {
        await options.fetchData()
      }
    } catch (error) {
      options.showNotifyByType('error', 'MTool 启动', error instanceof Error ? error.message : '通过 MTool 启动失败')
    }
  }

  const handleOpenResourceFolder = async (resource: any) => {
    try {
      const message = await window.api.dialog.openPath(String(resource?.basePath ?? ''))
      if (message) {
        options.showNotifyByType('error', '打开文件夹', message)
        return
      }

      options.showNotifyByType('success', '打开文件夹', `已打开“${resource?.title ?? options.categoryName.value}”所在目录`)
    } catch (error) {
      options.showNotifyByType('error', '打开文件夹', error instanceof Error ? error.message : '打开文件夹失败')
    }
  }

  const handleDefaultAppPlayResource = async (resource: any) => {
    const targetPath = options.getResourceFilePath(resource)
    const normalizedPath = String(targetPath ?? '').trim()
    if (!normalizedPath) {
      options.showNotifyByType('warning', '使用默认应用打开', '当前文件路径无效')
      return
    }

    try {
      const message = await window.api.dialog.openPath(normalizedPath)
      if (message) {
        options.showNotifyByType('error', '使用默认应用打开', message)
        return
      }

      await options.recordResourceAccessIfPossible(resource, '使用默认应用打开')
      options.showNotifyByType('success', '使用默认应用打开', '已使用默认应用打开文件')
    } catch (error) {
      options.showNotifyByType('error', '使用默认应用打开', error instanceof Error ? error.message : '打开文件失败')
    }
  }

  const handleOpenScreenshotFolder = async (resource: any) => {
    const resourceId = String(resource?.id ?? '').trim()

    try {
      const message = await window.api.dialog.openScreenshotFolder(resourceId)
      if (message) {
        options.showNotifyByType('error', '打开截图文件夹', message)
        return
      }

      options.showNotifyByType('success', '打开截图文件夹', `已打开“${resource?.title ?? options.categoryName.value}”截图目录`)
    } catch (error) {
      options.showNotifyByType('error', '打开截图文件夹', error instanceof Error ? error.message : '打开截图文件夹失败')
    }
  }

  const handleOpenDetailResourcePath = async () => {
    if (!options.selectedDetailResource.value) {
      return
    }

    if (options.getWebsiteResourceUrl(options.selectedDetailResource.value)) {
      await handleOpenWebsiteResource(options.selectedDetailResource.value)
      return
    }

    await handleOpenResourceFolder(options.selectedDetailResource.value)
  }

  const handleOpenStoreWebsite = async (url: string) => {
    try {
      const message = await window.api.dialog.openExternalUrl(url)
      if (message) {
        options.showNotifyByType('error', '打开贩售网站', message)
      }
    } catch (error) {
      options.showNotifyByType('error', '打开贩售网站', error instanceof Error ? error.message : '打开贩售网站失败')
    }
  }

  const handleDetailLaunchAction = async () => {
    if (!options.selectedDetailResource.value) {
      return
    }

    if (options.selectedDetailResource.value.isRunning) {
      await handleStopResource(options.selectedDetailResource.value)
      return
    }

    await handleLaunchResource(options.selectedDetailResource.value)
  }

  return {
    handleLaunchResource,
    handleStopResource,
    handleZoneLaunchResource,
    handleMtoolLaunchResource,
    handleOpenResourceFolder,
    handleDefaultAppPlayResource,
    handleOpenScreenshotFolder,
    handleOpenDetailResourcePath,
    handleOpenStoreWebsite,
    handleOpenWebsiteResource,
    handleDetailLaunchAction
  }
}
