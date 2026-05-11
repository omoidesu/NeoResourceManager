import { computed, type ComputedRef, type Ref } from 'vue'
import { useCategoryEditorAssistActions } from '../../category-detail/composables/useCategoryEditorAssistActions'
import { useCategoryEditorPathAnalysis } from '../../category-detail/composables/useCategoryEditorPathAnalysis'
import { useCategoryEditorSoftwareScript } from '../../category-detail/composables/useCategoryEditorSoftwareScript'

type NotifyType = 'success' | 'error' | 'info' | 'warning' | 'warn' | string

type DashboardEditorAssistRuntimeOptions = {
  formData: Ref<any>
  editingResourceId: Ref<string>
  fetchResourceInfoLoading: Ref<boolean>
  videoCoverFrameLoading: Ref<boolean>
  showAudioCoverCandidateModal: Ref<boolean>
  showVideoCoverCandidateModal: Ref<boolean>
  showVideoSubCoverCandidateModal: Ref<boolean>
  audioCoverCandidates: Ref<any[]>
  videoCoverCandidates: Ref<any[]>
  videoSubCoverCandidateItems: Ref<any[]>
  basePathFormItemRef: Ref<any>
  showSoftwareScriptModal: Ref<boolean>
  softwareScriptDraft: Ref<string>
  softwareScriptRuntimePath: Ref<string>
  softwareScriptRuntimes: Ref<Array<{ label: string; value: string; shellType: 'powershell' | 'cmd' }>>
  softwareScriptShellType: ComputedRef<'powershell' | 'cmd'>
  categoryName: ComputedRef<string>
  categorySettings: ComputedRef<any>
  isSoftwareCategory: ComputedRef<boolean>
  isVideoFolderCategory: ComputedRef<boolean>
  detailIsAsmr: ComputedRef<boolean>
  websiteTypeOptions: Ref<any[]>
  normalizedLanguageList: ComputedRef<Array<{ id: string; name: string }>>
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  confirmDialog: (...args: any[]) => any
  getFileNameWithoutExtension: (filePath: string) => string
  getResourceNameFromBasePath: (resourcePath: string) => string
  normalizeAudioAuthorList: (values: string[]) => string[]
  joinAudioAuthorNames: (names: string[]) => string
  syncAudioAuthorFields: (targetForm: any, names?: string[]) => void
  normalizeSelectedValues: (values: string[]) => string[]
  normalizeWebsiteUrl: (input: unknown) => string
  validateBasePathExtension: (resourcePath: string) => boolean
  getBasePathValidationMessage: () => string
  resolveCoverPreviewUrl: (coverPath: string) => Promise<string>
  isEditorActive: () => boolean
}

const formatAudioCoverCandidateQuery = (query: Record<string, string>) =>
  [
    query?.title ? `歌名：${query.title}` : '',
    query?.artist ? `歌手：${query.artist}` : '',
    query?.album ? `专辑：${query.album}` : ''
  ]
    .filter(Boolean)
    .join(' / ')

export const useDashboardEditorAssistRuntime = (options: DashboardEditorAssistRuntimeOptions) => {
  const softwareScript = useCategoryEditorSoftwareScript({
    formData: options.formData,
    basePathFormItemRef: options.basePathFormItemRef,
    showSoftwareScriptModal: options.showSoftwareScriptModal,
    softwareScriptDraft: options.softwareScriptDraft,
    softwareScriptRuntimePath: options.softwareScriptRuntimePath,
    softwareScriptRuntimes: options.softwareScriptRuntimes,
    softwareScriptShellType: options.softwareScriptShellType,
    showNotifyByType: options.showNotifyByType
  })

  const {
    ensureSoftwareScriptRuntimes,
    resolveSoftwareScriptShell,
    denormalizeSoftwareScript,
    handleConfirmSoftwareScript
  } = softwareScript

  const pathAnalysis = useCategoryEditorPathAnalysis({
    formData: options.formData,
    categorySettings: options.categorySettings,
    detailIsAsmr: options.detailIsAsmr,
    websiteTypeOptions: options.websiteTypeOptions,
    showNotifyByType: options.showNotifyByType,
    confirmDialog: options.confirmDialog,
    getFileNameWithoutExtension: options.getFileNameWithoutExtension,
    getResourceNameFromBasePath: options.getResourceNameFromBasePath,
    normalizeAudioAuthorList: options.normalizeAudioAuthorList,
    joinAudioAuthorNames: options.joinAudioAuthorNames,
    syncAudioAuthorFields: options.syncAudioAuthorFields
  })

  const assistActions = useCategoryEditorAssistActions({
    formData: options.formData,
    editingResourceId: options.editingResourceId,
    fetchResourceInfoLoading: options.fetchResourceInfoLoading,
    videoCoverFrameLoading: options.videoCoverFrameLoading,
    showAudioCoverCandidateModal: options.showAudioCoverCandidateModal,
    showVideoCoverCandidateModal: options.showVideoCoverCandidateModal,
    showVideoSubCoverCandidateModal: options.showVideoSubCoverCandidateModal,
    audioCoverCandidates: options.audioCoverCandidates,
    videoCoverCandidates: options.videoCoverCandidates,
    videoSubCoverCandidateItems: options.videoSubCoverCandidateItems,
    basePathFormItemRef: options.basePathFormItemRef,
    showSoftwareScriptModal: options.showSoftwareScriptModal,
    softwareScriptDraft: options.softwareScriptDraft,
    softwareScriptRuntimePath: options.softwareScriptRuntimePath,
    categoryName: options.categoryName,
    categorySettings: options.categorySettings,
    isSoftwareCategory: options.isSoftwareCategory,
    isVideoFolderCategory: options.isVideoFolderCategory,
    detailIsAsmr: options.detailIsAsmr,
    websiteTypeOptions: options.websiteTypeOptions,
    normalizedLanguageList: options.normalizedLanguageList,
    showNotifyByType: options.showNotifyByType,
    validateBasePathExtension: options.validateBasePathExtension,
    getBasePathValidationMessage: options.getBasePathValidationMessage,
    applyDefaultPathName: pathAnalysis.applyDefaultPathName,
    applyAudioPathAnalysis: pathAnalysis.applyAudioPathAnalysis,
    applyAudioCoverAnalysis: pathAnalysis.applyAudioCoverAnalysis,
    applyGamePathAnalysis: pathAnalysis.applyGamePathAnalysis,
    applyNovelFileAnalysis: pathAnalysis.applyNovelFileAnalysis,
    applyMultiImageDirectoryAnalysis: pathAnalysis.applyMultiImageDirectoryAnalysis,
    normalizeSelectedValues: options.normalizeSelectedValues,
    normalizeWebsiteUrl: options.normalizeWebsiteUrl,
    resolveCoverPreviewUrl: options.resolveCoverPreviewUrl,
    formatAudioCoverCandidateQuery,
    ensureSoftwareScriptRuntimes,
    resolveSoftwareScriptShell,
    denormalizeSoftwareScript,
    isEditorActive: options.isEditorActive
  })

  const closeAudioCoverCandidateModal = () => {
    options.showAudioCoverCandidateModal.value = false
    options.audioCoverCandidates.value = []
  }

  const handleUseAudioCoverCandidate = (candidate: {
    coverPath?: string
    albumName?: string
  }) => {
    options.formData.value.coverPath = String(candidate?.coverPath ?? '').trim()
    const albumName = String(candidate?.albumName ?? '').trim()
    if (albumName) {
      options.formData.value.meta = {
        ...(options.formData.value.meta ?? {}),
        album: albumName
      }
    }
    closeAudioCoverCandidateModal()
  }

  const closeVideoCoverCandidateModal = () => {
    options.showVideoCoverCandidateModal.value = false
    options.videoCoverCandidates.value = []
  }

  const handleUseVideoCoverCandidate = (coverPath: string) => {
    options.formData.value.coverPath = String(coverPath ?? '').trim()
    closeVideoCoverCandidateModal()
  }

  const closeVideoSubCoverCandidateModal = () => {
    options.showVideoSubCoverCandidateModal.value = false
    options.videoSubCoverCandidateItems.value = []
  }

  const handleUseVideoSubCoverCandidate = (coverPath: string) => {
    options.formData.value.coverPath = String(coverPath ?? '').trim()
    closeVideoSubCoverCandidateModal()
  }

  const fixedVideoCoverCandidates = computed(() =>
    options.videoCoverCandidates.value.filter((candidate) => candidate.group === 'fixed')
  )

  const randomVideoCoverCandidates = computed(() =>
    options.videoCoverCandidates.value.filter((candidate) => candidate.group === 'random')
  )

  return {
    ...assistActions,
    handleConfirmSoftwareScript,
    closeAudioCoverCandidateModal,
    handleUseAudioCoverCandidate,
    closeVideoCoverCandidateModal,
    handleUseVideoCoverCandidate,
    closeVideoSubCoverCandidateModal,
    handleUseVideoSubCoverCandidate,
    fixedVideoCoverCandidates,
    randomVideoCoverCandidates
  }
}
