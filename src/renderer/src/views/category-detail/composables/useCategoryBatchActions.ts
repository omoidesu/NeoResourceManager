import { computed, type ComputedRef, type Ref } from 'vue'

type BatchLabelField = 'tags' | 'types' | 'authors' | 'actors' | 'album'
type BatchLabelMode = 'add' | 'remove'
type NotifyType = 'success' | 'error' | 'info' | 'warning'

interface UseCategoryBatchActionsOptions {
  categoryId: Ref<string>
  categoryName: ComputedRef<string>
  categoryInfo: Ref<{ id: string } | null>
  resourceList: Ref<any[]>
  selectedResourceIds: Ref<string[]>
  selectionModeManuallyEnabled: Ref<boolean>
  currentPageResourceIds: ComputedRef<string[]>
  selectedResourceCount: ComputedRef<number>
  resourceSelectionMode: ComputedRef<boolean>
  isAudioCategory: ComputedRef<boolean>
  isVideoCategory: ComputedRef<boolean>
  showBatchLabelModal: Ref<boolean>
  isBatchDeleting: Ref<boolean>
  isBatchFetchingAlbumCover: Ref<boolean>
  isBatchLabelSubmitting: Ref<boolean>
  batchLabelField: Ref<BatchLabelField>
  batchLabelMode: Ref<BatchLabelMode>
  batchLabelValues: Ref<string[]>
  batchLabelSingleValue: Ref<string>
  batchLabelInputValue: Ref<string>
  tagSelectOptions: ComputedRef<Array<{ label: string; value: string }>>
  typeSelectOptions: ComputedRef<Array<{ label: string; value: string }>>
  authorSelectOptions: ComputedRef<Array<{ label: string; value: string }>>
  actorSelectOptions: ComputedRef<Array<{ label: string; value: string }>>
  albumSelectOptions: ComputedRef<Array<{ label: string; value: string }>>
  actorLabel: ComputedRef<string>
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  confirmDialog: (title: string, content: string) => Promise<boolean>
  fetchData: () => Promise<void>
  cloneFormData: (data: any) => any
  mapResourceDetailToFormData: (detail: any) => any
  syncAudioAuthorFields: (formData: any, values?: string[]) => void
  normalizeAudioAuthorList: (values: string[]) => string[]
  normalizeSelectedValues: (values: string[]) => string[]
  joinAudioAuthorNames: (values: string[]) => string
  getResourceFilePath: (resource: any) => string
  fetchAudioAlbumCoverSilently: (payload: any) => Promise<any>
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void
    warn: (message: string, meta?: Record<string, unknown>) => void
    error: (message: string, meta?: Record<string, unknown> | unknown) => void
  }
}

const splitManualValues = (input: string) =>
  String(input ?? '')
    .split(/[\s,，、\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean)

export const useCategoryBatchActions = (options: UseCategoryBatchActionsOptions) => {
  const batchLabelIsSingleValue = computed(() => options.batchLabelField.value === 'album')

  const batchLabelOptions = computed(() => {
    if (options.batchLabelField.value === 'tags') {
      return options.tagSelectOptions.value
    }

    if (options.batchLabelField.value === 'types') {
      return options.typeSelectOptions.value
    }

    if (options.batchLabelField.value === 'authors') {
      return options.authorSelectOptions.value
    }

    if (options.batchLabelField.value === 'actors') {
      return options.actorSelectOptions.value
    }

    return options.albumSelectOptions.value
  })

  const batchLabelTitle = computed(() => {
    const fieldLabel = options.batchLabelField.value === 'tags'
      ? '标签'
      : options.batchLabelField.value === 'types'
        ? '分类'
        : options.batchLabelField.value === 'authors'
          ? '歌手'
          : options.batchLabelField.value === 'actors'
            ? options.actorLabel.value
          : '专辑'
    const actionLabel = options.batchLabelMode.value === 'add' ? '添加' : '移除'
    return `批量${actionLabel}${fieldLabel}`
  })

  const batchLabelPlaceholder = computed(() => {
    if (options.batchLabelField.value === 'album') {
      return options.batchLabelMode.value === 'add'
        ? '可选择已有专辑，也可输入新的专辑名'
        : '请选择或输入需要移除的专辑名'
    }

    const fieldLabel = options.batchLabelField.value === 'tags'
      ? '标签'
      : options.batchLabelField.value === 'types'
        ? '分类'
        : options.batchLabelField.value === 'authors'
          ? '歌手'
          : options.actorLabel.value
    return `可选择已有${fieldLabel}，也可输入新${fieldLabel}，按空格、顿号、英文逗号或回车批量添加`
  })

  const buildBatchLabelResultMessage = (params: {
    field: 'tags' | 'types'
    mode: BatchLabelMode
    categoryName: string
    affectedCount: number
    valueNames: string
    fallbackMessage: string
  }) => {
    const { field, mode, categoryName, affectedCount, valueNames, fallbackMessage } = params
    const normalizedCategoryName = String(categoryName ?? '').trim() || '资源'
    const normalizedValueNames = String(valueNames ?? '').trim()

    if (!normalizedValueNames) {
      return fallbackMessage
    }

    if (field === 'tags') {
      return `已批量${mode === 'add' ? '添加' : '移除'}${affectedCount}个${normalizedCategoryName}的${normalizedValueNames}标签`
    }

    return `已批量${mode === 'add' ? '添加' : '移除'}${affectedCount}个${normalizedCategoryName}的${normalizedValueNames}分类`
  }

  const buildBatchMetadataResultMessage = (params: {
    field: 'authors' | 'actors' | 'album'
    mode: BatchLabelMode
    categoryName: string
    successCount: number
    skippedCount: number
    failedCount: number
    valueNames: string
  }) => {
    const { field, mode, categoryName, successCount, skippedCount, failedCount, valueNames } = params
    const normalizedCategoryName = String(categoryName ?? '').trim() || '资源'
    const fieldLabel = field === 'authors' ? '歌手' : field === 'actors' ? options.actorLabel.value : '专辑'
    const valueLabel = String(valueNames ?? '').trim()
    const actionLabel = mode === 'add' ? '添加' : '移除'
    const suffix = valueLabel ? `：${valueLabel}` : ''

    return `批量${actionLabel}${fieldLabel}完成，成功 ${successCount} 个，跳过 ${skippedCount} 个，失败 ${failedCount} 个${suffix}。涉及 ${normalizedCategoryName}。`
  }

  const handleExitSelectionMode = () => {
    options.selectionModeManuallyEnabled.value = false
    options.selectedResourceIds.value = []
  }

  const handleToggleSelectResource = (resource: any) => {
    const resourceId = String(resource?.id ?? '').trim()
    if (!resourceId) {
      return
    }

    options.selectionModeManuallyEnabled.value = true

    if (options.selectedResourceIds.value.includes(resourceId)) {
      options.selectedResourceIds.value = options.selectedResourceIds.value.filter((id) => id !== resourceId)
      return
    }

    options.selectedResourceIds.value = [...options.selectedResourceIds.value, resourceId]
  }

  const handleToggleSelectionMode = () => {
    if (options.resourceSelectionMode.value) {
      handleExitSelectionMode()
      return
    }

    options.selectionModeManuallyEnabled.value = true
  }

  const resetBatchLabelDialog = () => {
    options.batchLabelValues.value = []
    options.batchLabelSingleValue.value = ''
    options.batchLabelInputValue.value = ''
    options.isBatchLabelSubmitting.value = false
  }

  const openBatchLabelDialog = (field: BatchLabelField, mode: BatchLabelMode) => {
    if (!options.selectedResourceCount.value) {
      options.showNotifyByType('warning', '批量编辑', `请先选择需要批量修改的${options.categoryName.value}`)
      return
    }

    options.batchLabelField.value = field
    options.batchLabelMode.value = mode
    resetBatchLabelDialog()
    options.showBatchLabelModal.value = true
  }

  const closeBatchLabelDialog = () => {
    options.showBatchLabelModal.value = false
    resetBatchLabelDialog()
  }

  const handleBatchLabelValuesChange = (values: string[]) => {
    options.batchLabelValues.value = options.normalizeSelectedValues(values)
  }

  const handleBatchLabelSingleValueChange = (value: string | null) => {
    options.batchLabelSingleValue.value = String(value ?? '').trim()
  }

  const appendBatchLabelValues = (input: string) => {
    const items = splitManualValues(input)
    if (!items.length) {
      return
    }

    options.batchLabelValues.value = options.normalizeSelectedValues([
      ...options.batchLabelValues.value,
      ...items
    ])
  }

  const handleBatchLabelInputCommit = () => {
    appendBatchLabelValues(options.batchLabelInputValue.value)
    options.batchLabelInputValue.value = ''
  }

  const handleBatchLabelInputKeydown = (event: KeyboardEvent) => {
    if (![' ', ',', '，', '、', 'Enter'].includes(event.key)) {
      return
    }

    event.preventDefault()
    const target = event.target as HTMLInputElement | null
    if (target) {
      target.value = ''
    }

    handleBatchLabelInputCommit()
  }

  const createSelectOption = (label: string) => {
    const value = label.trim()
    return {
      label: value,
      value
    }
  }

  const handleBatchLabelSearch = (value: string) => {
    options.batchLabelInputValue.value = value
  }

  const handleSubmitBatchLabelAction = async () => {
    if (!options.selectedResourceIds.value.length) {
      options.showNotifyByType('warning', batchLabelTitle.value, `请先选择需要批量修改的${options.categoryName.value}`)
      return
    }

    const selectedBatchValues = batchLabelIsSingleValue.value
      ? (options.batchLabelSingleValue.value ? [options.batchLabelSingleValue.value] : [])
      : options.batchLabelValues.value

    if (!selectedBatchValues.length) {
      const message = options.batchLabelField.value === 'tags'
        ? '请先选择或输入标签'
        : options.batchLabelField.value === 'types'
          ? '请先选择或输入分类'
          : options.batchLabelField.value === 'authors'
            ? '请先选择或输入歌手'
            : options.batchLabelField.value === 'actors'
              ? `请先选择或输入${options.actorLabel.value}`
            : '请先选择或输入专辑'
      options.showNotifyByType('warning', batchLabelTitle.value, message)
      return
    }

    try {
      options.isBatchLabelSubmitting.value = true

      if (options.batchLabelField.value === 'tags' || options.batchLabelField.value === 'types') {
        const result = await window.api.service.batchUpdateResourceLabels(
          [...options.selectedResourceIds.value],
          options.batchLabelField.value,
          options.batchLabelMode.value,
          [...selectedBatchValues]
        )
        const resultType = result?.type ?? 'info'
        const affectedCount = Number(result?.data?.affectedIds?.length ?? 0)
        const valueNames = selectedBatchValues.join('、')
        const resultMessage = typeof result?.message === 'string' && result.message
          ? buildBatchLabelResultMessage({
              field: options.batchLabelField.value,
              mode: options.batchLabelMode.value,
              categoryName: options.categoryName.value,
              affectedCount,
              valueNames,
              fallbackMessage: result.message
            })
          : `${batchLabelTitle.value}完成`

        options.showNotifyByType(resultType, batchLabelTitle.value, resultMessage)

        if (resultType !== 'error') {
          closeBatchLabelDialog()
          await options.fetchData()
        }
        return
      }

      let successCount = 0
      let skippedCount = 0
      let failedCount = 0
      const selectedIds = [...options.selectedResourceIds.value].map((id) => String(id ?? '').trim()).filter(Boolean)
      const selectedValueSet = new Set(selectedBatchValues.map((value) => String(value ?? '').trim()).filter(Boolean))

      for (const resourceId of selectedIds) {
        try {
          const detailResult = await window.api.service.getResourceDetail(resourceId)
          const detail = detailResult?.data
          if (!detail) {
            skippedCount += 1
            continue
          }

          const detailFormData = options.cloneFormData(options.mapResourceDetailToFormData(detail))
          let changed = false

          if (options.batchLabelField.value === 'authors') {
            const currentAuthors = options.normalizeAudioAuthorList(Array.isArray(detailFormData?.authors) ? detailFormData.authors : [])
            const nextAuthors = options.batchLabelMode.value === 'add'
              ? options.normalizeAudioAuthorList([...currentAuthors, ...selectedBatchValues])
              : currentAuthors.filter((name) => !selectedValueSet.has(String(name ?? '').trim()))

            if (nextAuthors.join('\u0000') === currentAuthors.join('\u0000')) {
              skippedCount += 1
              continue
            }

            options.syncAudioAuthorFields(detailFormData, nextAuthors)
            changed = true
          } else if (options.batchLabelField.value === 'actors') {
            const currentActors = options.normalizeSelectedValues(Array.isArray(detailFormData?.actors) ? detailFormData.actors : [])
            const nextActors = options.batchLabelMode.value === 'add'
              ? options.normalizeSelectedValues([...currentActors, ...selectedBatchValues])
              : currentActors.filter((name) => !selectedValueSet.has(String(name ?? '').trim()))

            if (nextActors.join('\u0000') === currentActors.join('\u0000')) {
              skippedCount += 1
              continue
            }

            detailFormData.actors = nextActors
            changed = true
          } else if (options.batchLabelField.value === 'album') {
            const currentAlbum = String(detailFormData?.meta?.album ?? '').trim()
            const nextAlbum = options.batchLabelMode.value === 'add'
              ? String(selectedBatchValues[0] ?? '').trim()
              : (selectedValueSet.has(currentAlbum) ? '' : currentAlbum)

            if (nextAlbum === currentAlbum) {
              skippedCount += 1
              continue
            }

            detailFormData.meta = {
              ...(detailFormData.meta ?? {}),
              album: nextAlbum
            }
            changed = true
          }

          if (!changed) {
            skippedCount += 1
            continue
          }

          detailFormData.categoryId = options.categoryInfo.value?.id ?? ''
          const updatePayload = options.cloneFormData(detailFormData)
          const updateResult = await window.api.service.updateResource(resourceId, updatePayload)
          if (updateResult?.type === 'error') {
            failedCount += 1
            continue
          }

          successCount += 1
        } catch {
          failedCount += 1
        }
      }

      const message = buildBatchMetadataResultMessage({
        field: options.batchLabelField.value,
        mode: options.batchLabelMode.value,
        categoryName: options.categoryName.value,
        successCount,
        skippedCount,
        failedCount,
        valueNames: selectedBatchValues.join('、')
      })

      options.showNotifyByType(failedCount > 0 ? 'warning' : 'success', batchLabelTitle.value, message)

      if (successCount > 0) {
        closeBatchLabelDialog()
        await options.fetchData()
      }
    } catch (error) {
      options.showNotifyByType('error', batchLabelTitle.value, error instanceof Error ? error.message : `${batchLabelTitle.value}失败`)
    } finally {
      options.isBatchLabelSubmitting.value = false
    }
  }

  const handleSelectAllResources = () => {
    const selectedSet = new Set(options.selectedResourceIds.value)
    for (const resourceId of options.currentPageResourceIds.value) {
      selectedSet.add(resourceId)
    }
    options.selectedResourceIds.value = [...selectedSet]
  }

  const handleDeselectAllResources = () => {
    options.selectedResourceIds.value = []
  }

  const handleInvertSelectedResources = () => {
    const selectedSet = new Set(options.selectedResourceIds.value)
    for (const resourceId of options.currentPageResourceIds.value) {
      if (selectedSet.has(resourceId)) {
        selectedSet.delete(resourceId)
      } else {
        selectedSet.add(resourceId)
      }
    }
    options.selectedResourceIds.value = [...selectedSet]
  }

  const handleBatchFetchAlbumCover = async () => {
    if (!options.isAudioCategory.value) {
      return
    }

    if (!options.selectedResourceIds.value.length) {
      options.showNotifyByType('warning', '批量获取封面', `请先选择需要获取封面的${options.categoryName.value}`)
      return
    }

    const selectedIds = [...options.selectedResourceIds.value].map((id) => String(id ?? '').trim()).filter(Boolean)

    if (!selectedIds.length) {
      options.showNotifyByType('warning', '批量获取封面', `未找到已选中的${options.categoryName.value}`)
      return
    }

    try {
      options.isBatchFetchingAlbumCover.value = true
      options.logger.info('batch fetch album cover: start', {
        categoryId: options.categoryId.value,
        resourceIds: selectedIds,
        count: selectedIds.length
      })

      let successCount = 0
      let skippedCount = 0
      let failedCount = 0

      for (const resourceId of selectedIds) {
        let resourceName = ''
        try {
          const detailResult = await window.api.service.getResourceDetail(resourceId)
          const detail = detailResult?.data
          resourceName = String(detail?.title ?? '').trim()

          if (!detail) {
            skippedCount += 1
            options.logger.warn('batch fetch album cover: missing detail', {
              resourceId,
              resourceName
            })
            continue
          }

          const basePath = options.getResourceFilePath(detail)
          if (!basePath) {
            skippedCount += 1
            options.logger.warn('batch fetch album cover: skip invalid resource', {
              resourceId,
              resourceName,
              basePath
            })
            continue
          }

          const detailFormData = options.cloneFormData(options.mapResourceDetailToFormData(detail))
          const payload = {
            basePath,
            title: String(detail?.title ?? resourceName),
            album: String(detail?.audioMeta?.album ?? '').trim(),
            artist: options.joinAudioAuthorNames(
              Array.isArray(detailFormData?.authors) ? detailFormData.authors : []
            ) || String(detailFormData?.author ?? '').trim(),
            artists: options.normalizeAudioAuthorList([
              ...(Array.isArray(detailFormData?.authors) ? detailFormData.authors : []),
              String(detailFormData?.author ?? '').trim()
            ])
          }

          options.logger.info('batch fetch album cover: request', {
            resourceId,
            resourceName,
            payload
          })

          const coverResult = await options.fetchAudioAlbumCoverSilently(payload)
          if (coverResult?.type !== 'success' || !coverResult?.data?.coverPath) {
            skippedCount += 1
            options.logger.warn('batch fetch album cover: no cover result', {
              resourceId,
              resourceName,
              result: coverResult
            })
            continue
          }

          detailFormData.coverPath = String(coverResult.data.coverPath)
          options.syncAudioAuthorFields(detailFormData)
          detailFormData.categoryId = options.categoryInfo.value?.id ?? ''

          const updatePayload = options.cloneFormData(detailFormData)
          const updateResult = await window.api.service.updateResource(resourceId, updatePayload)
          if (updateResult?.type === 'error') {
            failedCount += 1
            options.logger.error('batch fetch album cover: update failed', {
              resourceId,
              resourceName,
              result: updateResult
            })
            continue
          }

          successCount += 1
          options.logger.info('batch fetch album cover: success', {
            resourceId,
            resourceName,
            coverPath: detailFormData.coverPath
          })
        } catch (error) {
          failedCount += 1
          options.logger.error('batch fetch album cover: unexpected failure', {
            resourceId,
            resourceName,
            error: error instanceof Error ? error.message : error
          })
        }
      }

      options.logger.info('batch fetch album cover: completed', {
        successCount,
        skippedCount,
        failedCount
      })

      if (successCount > 0) {
        await options.fetchData()
      }

      if (successCount > 0 && failedCount === 0 && skippedCount === 0) {
        options.showNotifyByType('success', '批量获取封面', `已为 ${successCount} 个${options.categoryName.value}获取专辑封面`)
        return
      }

      options.showNotifyByType(
        failedCount > 0 ? 'warning' : 'info',
        '批量获取封面',
        `批量获取封面完成：成功 ${successCount} 个，跳过 ${skippedCount} 个，失败 ${failedCount} 个`
      )
    } catch (error) {
      options.logger.error('batch fetch album cover: fatal error', error)
      options.showNotifyByType('error', '批量获取封面', error instanceof Error ? error.message : '批量获取封面失败')
    } finally {
      options.isBatchFetchingAlbumCover.value = false
    }
  }

  const handleDeleteSelectedResources = async () => {
    if (!options.selectedResourceIds.value.length) {
      return
    }

    const selectedResources = options.resourceList.value.filter((item) =>
      options.selectedResourceIds.value.includes(String(item?.id ?? ''))
    )
    const runningCount = selectedResources.filter((item) => item?.isRunning).length

    const confirmed = await options.confirmDialog(
      `批量删除${options.categoryName.value}`,
      runningCount > 0
        ? `确认删除选中的 ${options.selectedResourceIds.value.length} 个${options.categoryName.value}吗？其中 ${runningCount} 个正在运行，将在真正删除时自动跳过。`
        : `确认删除选中的 ${options.selectedResourceIds.value.length} 个${options.categoryName.value}吗？`
    )

    if (!confirmed) {
      return
    }

    try {
      options.isBatchDeleting.value = true
      const result = await window.api.service.deleteResources([...options.selectedResourceIds.value])
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '批量删除完成'

      options.showNotifyByType(resultType, `批量删除${options.categoryName.value}`, resultMessage)
      await options.fetchData()
      options.selectedResourceIds.value = []
      options.selectionModeManuallyEnabled.value = false
    } catch (error) {
      options.showNotifyByType('error', `批量删除${options.categoryName.value}`, error instanceof Error ? error.message : '批量删除失败')
    } finally {
      options.isBatchDeleting.value = false
    }
  }

  const handleBatchSelectionAction = () => {
    if (options.resourceSelectionMode.value) {
      if (!options.selectedResourceCount.value) {
        handleExitSelectionMode()
        return
      }

      void handleDeleteSelectedResources()
      return
    }

    if (!options.selectedResourceCount.value) {
      options.selectionModeManuallyEnabled.value = true
    }
  }

  return {
    batchLabelIsSingleValue,
    batchLabelOptions,
    batchLabelTitle,
    batchLabelPlaceholder,
    handleExitSelectionMode,
    handleToggleSelectResource,
    handleToggleSelectionMode,
    resetBatchLabelDialog,
    openBatchLabelDialog,
    closeBatchLabelDialog,
    handleBatchLabelValuesChange,
    handleBatchLabelSingleValueChange,
    handleBatchLabelInputCommit,
    handleBatchLabelInputKeydown,
    createSelectOption,
    handleBatchLabelSearch,
    handleSubmitBatchLabelAction,
    handleSelectAllResources,
    handleDeselectAllResources,
    handleInvertSelectedResources,
    handleBatchFetchAlbumCover,
    handleDeleteSelectedResources,
    handleBatchSelectionAction
  }
}
