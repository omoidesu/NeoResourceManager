import { nextTick, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'

type NotifyType = 'success' | 'error' | 'info' | 'warning' | 'warn' | string

type EditorDeps = {
  showModal: Ref<boolean>
  showEditModal: Ref<boolean>
  formData: Ref<any>
  editingResourceId: Ref<string>
  editInitialFormData: Ref<any | null>
  formRef: Ref<any>
  basePathFormItemRef: Ref<any>
  showDetailDrawer: Ref<boolean>
  selectedDetailResource: Ref<any>
  isDragOver: Ref<boolean>
  categoryInfo: Ref<any>
  categoryName: ComputedRef<string>
  categorySettings: ComputedRef<any>
  createEmptyFormData: () => any
  cloneFormData: (value: any) => any
  mapResourceDetailToFormData: (resource: any) => any
  syncAudioAuthorFields: (targetForm: any, names?: string[]) => void
  validateBasePathExtension: (basePath: string) => boolean
  normalizeWebsiteUrl: (input: unknown) => string
  closeVideoSubCoverCandidateModal: () => void
  fetchData: () => Promise<unknown> | unknown
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  getBasePathValidationMessage: () => string
  applyDefaultPathName: (resourcePath: string) => void
  applyAudioPathAnalysis: (resourcePath: string) => Promise<void>
  applyAudioCoverAnalysis: () => Promise<void>
  applyGamePathAnalysis: (resourcePath: string) => Promise<void>
  applyNovelFileAnalysis: (resourcePath: string) => Promise<void>
  applyMultiImageDirectoryAnalysis: (resourcePath: string) => Promise<void>
  duplicateResourceChecking: Ref<boolean>
  duplicateResourceMessage: Ref<string>
}

const WEBSITE_EXTEND_TABLE = 'website_meta'

export const useCategoryResourceEditor = (deps: EditorDeps) => {
  const canUseProvidedDetail = (resource: any) =>
    Array.isArray(resource?.stores)
    || Array.isArray(resource?.videoSubs)
    || Array.isArray(resource?.asmrSubs)

  const resetEditorSession = () => {
    deps.editingResourceId.value = ''
    deps.editInitialFormData.value = null
    deps.closeVideoSubCoverCandidateModal()
  }

  watch(deps.showModal, (visible) => {
    if (!visible) {
      resetEditorSession()
    }
  })

  watch(deps.showEditModal, (visible) => {
    if (!visible) {
      resetEditorSession()
    }
  })

  const isWebsiteSubmit = () => String(deps.categorySettings.value.extendTable ?? '').trim() === WEBSITE_EXTEND_TABLE

  const prepareEditorPayload = () => {
    deps.formData.value.categoryId = deps.categoryInfo.value.id
    deps.syncAudioAuthorFields(deps.formData.value)

    if (isWebsiteSubmit()) {
      deps.formData.value.meta.website = deps.normalizeWebsiteUrl(deps.formData.value?.meta?.website)
    }

    return deps.cloneFormData(deps.formData.value)
  }

  const validateEditorBeforeSubmit = async (actionTitle: string) => {
    try {
      await deps.formRef.value?.validate()
    } catch {
      return false
    }

    if (!deps.validateBasePathExtension(deps.formData.value.basePath)) {
      return false
    }

    if (isWebsiteSubmit() && !deps.normalizeWebsiteUrl(deps.formData.value?.meta?.website)) {
      deps.showNotifyByType('warning', actionTitle, '请填写网站地址')
      return false
    }

    return true
  }

  const handleAddResource = () => {
    deps.editingResourceId.value = ''
    deps.editInitialFormData.value = null
    deps.formData.value = deps.createEmptyFormData()
    deps.showModal.value = true
  }

  const handleCloseModal = () => {
    deps.showModal.value = false
  }

  const handleCloseEditDrawer = () => {
    deps.showEditModal.value = false
  }

  const handleResetEditForm = () => {
    deps.formData.value = deps.createEmptyFormData()
  }

  const handleRestoreDefaultEditForm = () => {
    if (!deps.editInitialFormData.value) {
      return
    }

    deps.formData.value = deps.cloneFormData(deps.editInitialFormData.value)
  }

  const handleSubmitResource = async () => {
    if (deps.duplicateResourceChecking.value) {
      deps.showNotifyByType('warning', '添加资源', '正在检查是否重复，请稍候')
      return
    }

    if (deps.duplicateResourceMessage.value) {
      deps.showNotifyByType('warning', '添加资源', deps.duplicateResourceMessage.value)
      return
    }

    if (!await validateEditorBeforeSubmit('添加资源')) {
      return
    }

    const payload = prepareEditorPayload()

    if (isWebsiteSubmit()) {
      const draft = deps.cloneFormData(deps.formData.value)
      handleCloseModal()
      await nextTick()

      void (async () => {
        const result = await window.api.service.saveResource(payload)
        const resultType = result?.type ?? 'info'
        const resultMessage = result?.message ?? '操作完成'

        deps.showNotifyByType(resultType, '添加资源', resultMessage)

        if (resultType !== 'error') {
          void deps.fetchData()
          return
        }

        deps.formData.value = draft
        deps.showModal.value = true
        await nextTick()
      })()
      return
    }

    const result = await window.api.service.saveResource(payload)
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '操作完成'

    deps.showNotifyByType(resultType, '添加资源', resultMessage)

    if (resultType !== 'error') {
      handleCloseModal()
      await nextTick()
      void deps.fetchData()
    }
  }

  const handleEditResource = (resource: any) => {
    void (async () => {
      try {
        let handledFetchFailure = false
        const detail = canUseProvidedDetail(resource)
          ? resource
          : await (async () => {
            const result = await window.api.service.getResourceDetail(String(resource?.id ?? ''))
            const resultType = result?.type ?? 'info'

            if (resultType === 'error' || resultType === 'warning') {
              handledFetchFailure = true
              deps.showNotifyByType(resultType, '修改信息', result?.message ?? '获取资源详情失败')
              return null
            }

            return result?.data
          })()
        if (!detail) {
          if (!handledFetchFailure) {
            deps.showNotifyByType('warning', '修改信息', '未获取到可编辑的资源详情')
          }
          return
        }

        const nextFormData = deps.mapResourceDetailToFormData(detail)
        deps.editingResourceId.value = String(detail.id ?? '')
        deps.formData.value = deps.cloneFormData(nextFormData)
        deps.editInitialFormData.value = deps.cloneFormData(nextFormData)
        deps.showDetailDrawer.value = false
        deps.showEditModal.value = true
      } catch (error) {
        deps.showNotifyByType('error', '修改信息', error instanceof Error ? error.message : '打开编辑抽屉失败')
      }
    })()
  }

  const handleSubmitEditResource = async () => {
    if (!deps.editingResourceId.value) {
      return
    }

    if (!await validateEditorBeforeSubmit(`修改${deps.categoryName.value}`)) {
      return
    }

    const payload = prepareEditorPayload()

    if (isWebsiteSubmit()) {
      const draft = deps.cloneFormData(deps.formData.value)
      const currentEditingResourceId = deps.editingResourceId.value
      const initialFormData = deps.editInitialFormData.value
        ? deps.cloneFormData(deps.editInitialFormData.value)
        : null
      const shouldCloseDetailDrawer =
        deps.showDetailDrawer.value && deps.selectedDetailResource.value?.id === deps.editingResourceId.value

      handleCloseEditDrawer()
      if (shouldCloseDetailDrawer) {
        deps.showDetailDrawer.value = false
        deps.selectedDetailResource.value = null
      }
      await nextTick()

      void (async () => {
        const result = await window.api.service.updateResource(currentEditingResourceId, payload)
        const resultType = result?.type ?? 'info'
        const resultMessage = result?.message ?? '操作完成'

        deps.showNotifyByType(resultType, `修改${deps.categoryName.value}`, resultMessage)

        if (resultType !== 'error') {
          void deps.fetchData()
          return
        }

        deps.editingResourceId.value = currentEditingResourceId
        deps.editInitialFormData.value = initialFormData
        deps.formData.value = draft
        deps.showEditModal.value = true
        await nextTick()
      })()
      return
    }

    const result = await window.api.service.updateResource(deps.editingResourceId.value, payload)
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '操作完成'

    deps.showNotifyByType(resultType, `修改${deps.categoryName.value}`, resultMessage)

    if (resultType !== 'error') {
      handleCloseEditDrawer()
      if (deps.showDetailDrawer.value && deps.selectedDetailResource.value?.id === deps.editingResourceId.value) {
        deps.showDetailDrawer.value = false
        deps.selectedDetailResource.value = null
      }
      await nextTick()
      void deps.fetchData()
    }
  }

  const handleDropResourceFile = (event: DragEvent) => {
    void (async () => {
      deps.isDragOver.value = false

      if (deps.categorySettings.value.resourcePathType !== 'file') {
        return
      }

      event.preventDefault()

      const droppedFile = Array.from(event.dataTransfer?.files ?? [])[0]
      const droppedPath = droppedFile
        ? String(window.electron?.webUtils?.getPathForFile(droppedFile) ?? '').trim()
        : ''

      if (!droppedPath) {
        deps.showNotifyByType('warning', '拖拽添加', '未能读取拖入文件的路径，请确认拖入的是本地文件')
        return
      }

      if (!deps.validateBasePathExtension(droppedPath)) {
        deps.showNotifyByType('warning', '拖拽添加', deps.getBasePathValidationMessage())
        return
      }

      const existsResult = await window.api.service.checkResourceExistsByPath(droppedPath)
      if (existsResult?.type === 'error') {
        deps.showNotifyByType('error', '拖拽添加', existsResult?.message ?? '检查资源是否存在失败')
        return
      }

      if (existsResult?.exists) {
        deps.showNotifyByType('info', '拖拽添加', '该资源已存在，无需重复添加')
        return
      }

      deps.editingResourceId.value = ''
      deps.editInitialFormData.value = null
      deps.formData.value = deps.createEmptyFormData()
      deps.formData.value.basePath = droppedPath
      deps.applyDefaultPathName(droppedPath)
      await deps.applyAudioPathAnalysis(droppedPath)
      await deps.applyAudioCoverAnalysis()
      await deps.applyGamePathAnalysis(droppedPath)
      await deps.applyNovelFileAnalysis(droppedPath)
      await deps.applyMultiImageDirectoryAnalysis(droppedPath)
      deps.showModal.value = true
      await nextTick()
      await deps.basePathFormItemRef.value?.validate({ trigger: 'change' })
    })()
  }

  return {
    handleAddResource,
    handleCloseModal,
    handleCloseEditDrawer,
    handleResetEditForm,
    handleRestoreDefaultEditForm,
    handleSubmitResource,
    handleEditResource,
    handleSubmitEditResource,
    handleDropResourceFile
  }
}
