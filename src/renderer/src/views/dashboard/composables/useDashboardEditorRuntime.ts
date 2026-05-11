import { computed, ref, type Ref } from 'vue'
import { DictType } from '../../../../../common/constants'
import { createEmptyMetaByType } from '../../../components/meta/meta-factory'
import { resolveMetaFormComponent } from '../../../components/meta/registry'

type DashboardEditorRuntimeOptions = {
  showDetailDrawer: Ref<boolean>
  selectedDetailResource: Ref<any | null>
  notify: (type: 'info' | 'success' | 'warning' | 'error', title: string, message: string) => void
  resolveDashboardCategorySettings: (category: any) => any
  resolveCategoryProfile: (categorySettings: any) => any
  ensureDashboardCategorySource: (categoryId: string, categorySource: any) => Promise<any>
  resolveHomeResourceContext: (resourceId: string, categoryId?: string) => Promise<any>
  loadDetailCategoryAssets: (categoryId: string) => Promise<void>
  buildDisplayBasePath: (resource: any) => string
  normalizeWebsiteUrl: (value: unknown) => string
  getFileExtension: (filePath: string) => string
  getLoadHomePinnedCards: () => (() => Promise<void> | void) | undefined
  refreshCoverWallResource?: (resourceId: string) => Promise<void> | void
}

export const useDashboardEditorRuntime = ({
  showDetailDrawer,
  selectedDetailResource,
  notify,
  resolveDashboardCategorySettings,
  resolveCategoryProfile,
  ensureDashboardCategorySource,
  resolveHomeResourceContext,
  loadDetailCategoryAssets,
  buildDisplayBasePath,
  normalizeWebsiteUrl,
  getFileExtension,
  getLoadHomePinnedCards,
  refreshCoverWallResource
}: DashboardEditorRuntimeOptions) => {
  const showEditResourceDrawer = ref(false)
  const editCategory = ref<any | null>(null)
  const editFormData = ref<any>({ name: '', meta: {} })
  const editingResourceId = ref('')
  const editInitialFormData = ref<any | null>(null)
  const editFormRef = ref<any>(null)
  const editBasePathFormItemRef = ref<any>(null)
  const editFetchResourceInfoLoading = ref(false)
  const editVideoCoverFrameLoading = ref(false)
  const showEditAudioCoverCandidateModal = ref(false)
  const showEditVideoCoverCandidateModal = ref(false)
  const showEditVideoSubCoverCandidateModal = ref(false)
  const showEditSoftwareScriptModal = ref(false)
  const editAuthorSelectOptions = ref<Array<{ label: string; value: string }>>([])
  const editTagSelectOptions = ref<Array<{ label: string; value: string }>>([])
  const editTypeSelectOptions = ref<Array<{ label: string; value: string }>>([])
  const editWebsiteTypeOptions = ref<any[]>([])
  const editAudioCoverCandidates = ref<any[]>([])
  const editVideoCoverCandidates = ref<any[]>([])
  const editVideoSubCoverCandidateItems = ref<any[]>([])
  const editSoftwareScriptDraft = ref('')
  const editSoftwareScriptRuntimePath = ref('')
  const editSoftwareScriptRuntimes = ref<Array<{ label: string; value: string; shellType: 'powershell' | 'cmd' }>>([])
  let editRequestId = 0

  const editCategoryName = computed(() =>
    String(editCategory.value?.name ?? selectedDetailResource.value?.categoryName ?? '').trim() || '资源'
  )
  const editCategorySettings = computed(() => {
    const category = editCategory.value ?? {}
    return resolveDashboardCategorySettings(category)
  })
  const editCategoryProfile = computed(() => resolveCategoryProfile(editCategorySettings.value))
  const editActorFilterLabel = computed(() => editCategoryProfile.value.flags.isAsmr ? '声优' : '声优/演员')
  const editIsSoftware = computed(() => editCategoryProfile.value.flags.isSoftware)
  const editIsAsmr = computed(() => editCategoryProfile.value.flags.isAsmr)
  const editIsAudio = computed(() => editCategoryProfile.value.flags.isAudio)
  const editIsNovel = computed(() => editCategoryProfile.value.flags.isNovel)
  const editIsVideoFolderCategory = computed(() => editCategoryProfile.value.flags.isVideoFolder)
  const editModelComponent = computed(() => resolveMetaFormComponent(String(editCategorySettings.value.extendTable ?? '')))
  const editModelComponentKey = computed(() => String(editCategorySettings.value.extendTable ?? '').trim() || 'empty-meta')
  const editDescriptionLabel = computed(() =>
    editCategoryProfile.value.flags.isGame ? '游戏简介' : `${editCategoryName.value}描述`
  )
  const editDescriptionPlaceholder = computed(() =>
    editCategoryProfile.value.flags.isGame ? '请输入游戏简介' : `请输入${editCategoryName.value}描述`
  )
  const editAuthorInputPlaceholder = computed(() =>
    editIsAudio.value
      ? '可输入多个艺术家，按回车创建标签'
      : `请输入${String(editCategorySettings.value.authorText ?? '作者')}`
  )
  const editHasBasePath = computed(() => Boolean(String(editFormData.value?.basePath ?? '').trim()))
  const editHasCoverPath = computed(() => Boolean(String(editFormData.value?.coverPath ?? '').trim()))
  const editNormalizedAllowedExtensions = computed(() =>
    (editCategorySettings.value.extensions ?? [])
      .map((extension: string) => String(extension ?? '').trim().toLowerCase())
      .filter(Boolean)
      .map((extension: string) => (extension.startsWith('.') ? extension : `.${extension}`))
  )
  const editSoftwareScriptShellType = computed<'powershell' | 'cmd'>(() =>
    editSoftwareScriptRuntimes.value.find((item) => item.value === editSoftwareScriptRuntimePath.value)?.shellType ?? 'powershell'
  )
  const editSoftwareScriptPlaceholder = computed(() =>
    editSoftwareScriptShellType.value === 'powershell'
      ? '例如：\nSet-Location d:/myDir\n. .\\venv\\Scripts\\Activate.ps1\npy -3.10 run.py'
      : '例如：\ncd /d d:/myDir\ncall .\\venv\\Scripts\\activate\npy -3.10 run.py'
  )

  const createEditorEmptyFormData = () => ({
    categoryId: String(editCategory.value?.id ?? selectedDetailResource.value?.categoryId ?? ''),
    name: '',
    author: '',
    authors: [] as string[],
    description: '',
    coverPath: '',
    basePath: '',
    actors: [] as string[],
    tags: [] as string[],
    types: [] as string[],
    meta: createEmptyMetaByType(String(editCategorySettings.value.extendTable ?? ''))
  })

  const cloneEditFormData = (value: any) => JSON.parse(JSON.stringify(value ?? createEditorEmptyFormData()))

  const resetEditTransientState = () => {
    showEditSoftwareScriptModal.value = false
    showEditAudioCoverCandidateModal.value = false
    showEditVideoCoverCandidateModal.value = false
    showEditVideoSubCoverCandidateModal.value = false
    editAudioCoverCandidates.value = []
    editVideoCoverCandidates.value = []
    editVideoSubCoverCandidateItems.value = []
    editSoftwareScriptDraft.value = ''
    editSoftwareScriptRuntimePath.value = ''
  }

  const resetEditState = () => {
    editCategory.value = null
    editFormData.value = { name: '', meta: {} }
    editingResourceId.value = ''
    editInitialFormData.value = null
    editFormRef.value = null
    editBasePathFormItemRef.value = null
    editFetchResourceInfoLoading.value = false
    editVideoCoverFrameLoading.value = false
    editAuthorSelectOptions.value = []
    editTagSelectOptions.value = []
    editTypeSelectOptions.value = []
    editWebsiteTypeOptions.value = []
    resetEditTransientState()
  }

  const normalizeSelectedValues = (values: string[]) =>
    Array.from(new Set(
      (values ?? [])
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    ))

  const normalizeAudioAuthorList = (values: string[]) => {
    const normalizedValues: string[] = []
    const seen = new Set<string>()

    for (const value of values ?? []) {
      const rawText = String(value ?? '').trim()
      if (!rawText) {
        continue
      }

      const splitValues = rawText
        .split(/\s*(?:\/|／|,|，|、|;|；|\||·| feat\. | ft\. | featuring | with | x | × | & | ＆ )\s*/i)
        .map((item) => item.trim())
        .filter(Boolean)

      for (const splitValue of splitValues) {
        const normalizedKey = splitValue.toLowerCase()
        if (seen.has(normalizedKey)) {
          continue
        }

        seen.add(normalizedKey)
        normalizedValues.push(splitValue)
      }
    }

    return normalizedValues
  }

  const joinAudioAuthorNames = (names: string[]) => normalizeAudioAuthorList(names).join(' / ')

  const syncEditAudioAuthorFields = (targetForm: any, names?: string[]) => {
    if (String(editCategorySettings.value.extendTable ?? '').trim() !== 'audio_meta' || !targetForm) {
      return
    }

    const normalizedNames = normalizeAudioAuthorList(
      Array.isArray(names)
        ? names
        : [
          ...(Array.isArray(targetForm.authors) ? targetForm.authors : []),
          String(targetForm.author ?? '').trim()
        ]
    )
    const displayName = joinAudioAuthorNames(normalizedNames)

    targetForm.authors = normalizedNames
    targetForm.author = displayName
    targetForm.meta = {
      ...(targetForm.meta ?? {}),
      artist: displayName
    }
  }

  const mapDetailToEditFormData = (resource: any) => {
    const pickFirstNonEmptyString = (...values: any[]) => {
      for (const value of values) {
        const normalized = String(value ?? '').trim()
        if (normalized) {
          return normalized
        }
      }

      return ''
    }

    const authorNames = Array.isArray(resource?.authors)
      ? resource.authors.map((item: any) => String(item?.name ?? '')).filter(Boolean)
      : []
    const stores = Array.isArray(resource?.stores) ? resource.stores : []
    const pixivStore = stores.find((item: any) => String(item?.store?.value ?? '').trim().toLowerCase() === 'pixiv')
    const primaryStore = stores.find((item: any) => String(item?.id ?? '') !== String(pixivStore?.id ?? '')) ?? stores[0]
    const additionalStores = stores.filter((item: any) => {
      const itemId = String(item?.id ?? '')
      const primaryStoreId = String(primaryStore?.id ?? '')
      const pixivStoreId = String(pixivStore?.id ?? '')
      return itemId && itemId !== primaryStoreId && itemId !== pixivStoreId
    })

    return {
      categoryId: String(resource?.categoryId ?? editCategory.value?.id ?? ''),
      name: resource?.title ?? '',
      description: resource?.description ?? '',
      coverPath: resource?.coverPath ?? '',
      basePath: buildDisplayBasePath(resource),
      author: joinAudioAuthorNames(authorNames) || String(resource?.audioMeta?.artist ?? ''),
      authors: editIsAudio.value ? authorNames : [],
      actors: Array.isArray(resource?.actors) ? resource.actors.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
      tags: Array.isArray(resource?.tags) ? resource.tags.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
      types: Array.isArray(resource?.types) ? resource.types.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
      meta: {
        ...createEmptyMetaByType(String(editCategorySettings.value.extendTable ?? '')),
        ...(resource?.gameMeta ?? {}),
        ...(resource?.softwareMeta ?? {}),
        ...(resource?.singleImageMeta ?? {}),
        ...(resource?.multiImageMeta ?? {}),
        ...(resource?.videoMeta ?? {}),
        ...(resource?.asmrMeta ?? {}),
        ...(resource?.audioMeta ?? {}),
        ...(resource?.novelMeta ?? {}),
        ...(resource?.websiteMeta ?? {}),
        pixivId: String(pixivStore?.workId ?? ''),
        websiteType: pickFirstNonEmptyString(
          primaryStore?.storeId,
          resource?.gameMeta?.websiteType,
          resource?.asmrMeta?.websiteType,
          resource?.multiImageMeta?.websiteType,
          resource?.singleImageMeta?.websiteType
        ),
        gameId: pickFirstNonEmptyString(
          primaryStore?.workId,
          resource?.gameMeta?.gameId,
          resource?.asmrMeta?.gameId,
          resource?.multiImageMeta?.gameId,
          resource?.singleImageMeta?.gameId
        ),
        website: pickFirstNonEmptyString(
          resource?.websiteMeta?.url,
          primaryStore?.url,
          resource?.gameMeta?.website,
          resource?.asmrMeta?.website,
          resource?.multiImageMeta?.website,
          resource?.singleImageMeta?.website
        ),
        additionalStores: additionalStores.map((item: any) => ({
          websiteType: String(item?.storeId ?? ''),
          workId: String(item?.workId ?? ''),
          website: String(item?.url ?? '')
        }))
      }
    }
  }

  const assignEditFormRef = (instance: any) => {
    editFormRef.value = instance ?? null
  }

  const assignEditBasePathFormItemRef = (instance: any) => {
    editBasePathFormItemRef.value = instance ?? null
  }

  const formRules = computed(() => ({
    basePath: {
      trigger: ['blur', 'change'],
      validator: (_rule: unknown, value: string) => {
        if (!value) {
          return new Error(`请选择${editCategoryName.value}路径`)
        }

        if (!validateBasePathExtension(value)) {
          return new Error(getBasePathValidationMessage())
        }

        return true
      }
    },
    'meta.website': {
      trigger: ['blur', 'change'],
      validator: (_rule: unknown, value: string) => {
        if (String(editCategorySettings.value.extendTable ?? '').trim() !== 'website_meta') {
          return true
        }

        if (!String(value ?? '').trim()) {
          return new Error('请输入网站地址')
        }

        if (!normalizeWebsiteUrl(value)) {
          return new Error('请输入合法的网站地址')
        }

        return true
      }
    }
  }))

  const validateBasePathExtension = (basePath: string) => {
    if (!basePath || editCategorySettings.value.resourcePathType !== 'file') {
      return true
    }

    const allowedExtensions = editNormalizedAllowedExtensions.value
    if (!allowedExtensions.length) {
      return true
    }

    return allowedExtensions.includes(getFileExtension(basePath))
  }

  const getBasePathValidationMessage = () => {
    const allowedExtensions = editNormalizedAllowedExtensions.value
    if (!allowedExtensions.length) {
      return `请选择合法的${editCategoryName.value}文件`
    }

    return `请选择合法的${editCategoryName.value}文件，仅支持 ${allowedExtensions.join(', ')}`
  }

  const loadEditFormOptions = async (categoryId: string) => {
    const normalizedCategoryId = String(categoryId ?? '').trim()
    if (!normalizedCategoryId) {
      editAuthorSelectOptions.value = []
      editTagSelectOptions.value = []
      editTypeSelectOptions.value = []
      editWebsiteTypeOptions.value = []
      return
    }

    const [authorList, tagList, typeList, gameSiteTypeDict, asmrSiteTypeDict] = await Promise.all([
      window.api.db.getAuthorByCategoryId(normalizedCategoryId),
      window.api.db.getTagByCategoryId(normalizedCategoryId),
      window.api.db.getTypeByCategoryId(normalizedCategoryId),
      window.api.db.getSelectDictData(DictType.GAME_SITE_TYPE),
      window.api.db.getSelectDictData(DictType.ASMR_SITE_TYPE)
    ])

    editAuthorSelectOptions.value = Array.isArray(authorList)
      ? authorList
        .map((item: any) => {
          const name = String(item?.name ?? '').trim()
          return name ? { label: name, value: name } : null
        })
        .filter(Boolean) as Array<{ label: string; value: string }>
      : []
    editTagSelectOptions.value = Array.isArray(tagList)
      ? tagList
        .map((item: any) => {
          const name = String(item?.name ?? '').trim()
          return name ? { label: name, value: name } : null
        })
        .filter(Boolean) as Array<{ label: string; value: string }>
      : []
    editTypeSelectOptions.value = Array.isArray(typeList)
      ? typeList
        .map((item: any) => {
          const name = String(item?.name ?? '').trim()
          return name ? { label: name, value: name } : null
        })
        .filter(Boolean) as Array<{ label: string; value: string }>
      : []
    editWebsiteTypeOptions.value = Array.from(
      new Map<string, any>(
        [...(Array.isArray(gameSiteTypeDict) ? gameSiteTypeDict : []), ...(Array.isArray(asmrSiteTypeDict) ? asmrSiteTypeDict : [])]
          .map((item: any) => [String(item?.value ?? item?.id ?? '').trim(), item] as const)
          .filter(([value]) => value)
      ).values()
    )
  }

  const openEditResource = async (resource: any) => {
    if (!resource) {
      return
    }

    const requestId = ++editRequestId
    const context = await resolveHomeResourceContext(String(resource?.id ?? ''), String(resource?.categoryId ?? ''))
    if (requestId !== editRequestId) {
      return
    }

    if (!context?.resource) {
      notify('warning', '修改信息', '未能读取可编辑的资源详情')
      return
    }

    const normalizedCategoryId = String(context.resource?.categoryId ?? resource?.categoryId ?? '').trim()
    if (normalizedCategoryId) {
      await loadDetailCategoryAssets(normalizedCategoryId)
      if (requestId !== editRequestId) {
        return
      }

      await loadEditFormOptions(normalizedCategoryId)
      if (requestId !== editRequestId) {
        return
      }
    } else {
      editAuthorSelectOptions.value = []
      editTagSelectOptions.value = []
      editTypeSelectOptions.value = []
    }

    const resolvedEditCategory = await ensureDashboardCategorySource(
      normalizedCategoryId,
      context.categorySource ?? context.categoryInfo
    )
    if (requestId !== editRequestId) {
      return
    }

    editCategory.value = resolvedEditCategory ?? context.categoryInfo
    const nextFormData = mapDetailToEditFormData(context.resource)
    editingResourceId.value = String(context.resource?.id ?? '')
    editFormData.value = cloneEditFormData(nextFormData)
    editInitialFormData.value = cloneEditFormData(nextFormData)
    showDetailDrawer.value = false
    showEditResourceDrawer.value = true
  }

  const handleEditAudioAuthorsUpdate = (value: string[]) => {
    syncEditAudioAuthorFields(editFormData.value, value)
  }

  const handleEditTagsChange = (value: string[]) => {
    editFormData.value.tags = normalizeSelectedValues(value)
  }

  const handleEditTypesChange = (value: string[]) => {
    editFormData.value.types = normalizeSelectedValues(value)
  }

  const handleEditReset = () => {
    editFormData.value = createEditorEmptyFormData()
  }

  const handleEditRestoreDefault = () => {
    if (!editInitialFormData.value) {
      return
    }

    editFormData.value = cloneEditFormData(editInitialFormData.value)
  }

  const handleEditDrawerShowUpdate = (nextShow: boolean) => {
    showEditResourceDrawer.value = nextShow
    if (!nextShow) {
      editRequestId += 1
      resetEditState()
    }
  }

  const handleEditSubmit = async () => {
    if (!editingResourceId.value) {
      return
    }

    const activeRequestId = editRequestId
    const activeResourceId = String(editingResourceId.value)
    const activeCategoryName = editCategoryName.value
    const activeCategorySettings = { ...editCategorySettings.value }
    const activeCategoryId = String(editFormData.value?.categoryId ?? editCategory.value?.id ?? '').trim()

    try {
      await editFormRef.value?.validate?.()
    } catch {
      return
    }

    if (activeRequestId !== editRequestId || editingResourceId.value !== activeResourceId) {
      return
    }

    if (!validateBasePathExtension(String(editFormData.value?.basePath ?? ''))) {
      notify('warning', `修改${activeCategoryName}`, getBasePathValidationMessage())
      return
    }

    if (
      String(activeCategorySettings.extendTable ?? '').trim() === 'website_meta'
      && !normalizeWebsiteUrl(editFormData.value?.meta?.website)
    ) {
      notify('warning', `修改${activeCategoryName}`, '请填写网站地址')
      return
    }

    const payload = cloneEditFormData(editFormData.value)
    payload.categoryId = activeCategoryId
    syncEditAudioAuthorFields(payload)
    if (String(activeCategorySettings.extendTable ?? '').trim() === 'website_meta') {
      payload.meta = {
        ...(payload.meta ?? {}),
        website: normalizeWebsiteUrl(payload?.meta?.website)
      }
    }

    const result = await window.api.service.updateResource(activeResourceId, payload)
    if (activeRequestId !== editRequestId || editingResourceId.value !== activeResourceId) {
      return
    }

    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '操作完成'
    notify(resultType as any, `修改${activeCategoryName}`, resultMessage)

    if (resultType !== 'error') {
      if (selectedDetailResource.value?.id === activeResourceId) {
        const detailResult = await window.api.service.getResourceDetail(activeResourceId)
        if (activeRequestId !== editRequestId || editingResourceId.value !== activeResourceId) {
          return
        }

        if (detailResult?.data) {
          selectedDetailResource.value = detailResult.data
        }
      }
      handleEditDrawerShowUpdate(false)
      void refreshCoverWallResource?.(activeResourceId)
      const refreshPinnedCards = getLoadHomePinnedCards()
      void refreshPinnedCards?.()
    }
  }

  return {
    showEditResourceDrawer,
    editCategory,
    editFormData,
    editingResourceId,
    editInitialFormData,
    editFormRef,
    editBasePathFormItemRef,
    editFetchResourceInfoLoading,
    editVideoCoverFrameLoading,
    showEditAudioCoverCandidateModal,
    showEditVideoCoverCandidateModal,
    showEditVideoSubCoverCandidateModal,
    showEditSoftwareScriptModal,
    editAuthorSelectOptions,
    editTagSelectOptions,
    editTypeSelectOptions,
    editWebsiteTypeOptions,
    editAudioCoverCandidates,
    editVideoCoverCandidates,
    editVideoSubCoverCandidateItems,
    editSoftwareScriptDraft,
    editSoftwareScriptRuntimePath,
    editSoftwareScriptRuntimes,
    editCategoryName,
    editCategorySettings,
    editCategoryProfile,
    editActorFilterLabel,
    editIsSoftware,
    editIsAsmr,
    editIsAudio,
    editIsNovel,
    editIsVideoFolderCategory,
    editModelComponent,
    editModelComponentKey,
    editDescriptionLabel,
    editDescriptionPlaceholder,
    editAuthorInputPlaceholder,
    editHasBasePath,
    editHasCoverPath,
    editNormalizedAllowedExtensions,
    editSoftwareScriptShellType,
    editSoftwareScriptPlaceholder,
    formRules,
    normalizeSelectedValues,
    normalizeAudioAuthorList,
    joinAudioAuthorNames,
    syncEditAudioAuthorFields,
    loadEditFormOptions,
    openEditResource,
    assignEditFormRef,
    assignEditBasePathFormItemRef,
    validateBasePathExtension,
    getBasePathValidationMessage,
    handleEditAudioAuthorsUpdate,
    handleEditTagsChange,
    handleEditTypesChange,
    handleEditReset,
    handleEditRestoreDefault,
    handleEditDrawerShowUpdate,
    handleEditSubmit,
    createEditorEmptyFormData,
    cloneEditFormData,
    mapDetailToEditFormData
  }
}
