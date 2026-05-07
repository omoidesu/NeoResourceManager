import type { ComputedRef, Ref } from 'vue'

interface UseCategoryListQueryStateOptions {
  keyword: Ref<string>
  missingFile: Ref<boolean>
  favoriteOnly: Ref<boolean>
  completedOnly: Ref<boolean>
  runningOnly: Ref<boolean>
  effectiveCompletedOnly: ComputedRef<boolean>
  selectedAuthorList: Ref<string[]>
  selectedActorList: Ref<string[]>
  selectedAlbumList: Ref<string[]>
  selectedEngineList: Ref<string[]>
  selectedTagList: Ref<string[]>
  selectedTypeList: Ref<string[]>
  authorSearch: Ref<string>
  actorSearch: Ref<string>
  albumSearch: Ref<string>
  tagSearch: Ref<string>
  typeSearch: Ref<string>
  selectionModeManuallyEnabled: Ref<boolean>
  selectedResourceIds: Ref<string[]>
  resourceList: Ref<any[]>
  totalResources: Ref<number>
  authorList: Ref<any[]>
  actorList: Ref<any[]>
  albumList: Ref<any[]>
  engineList: Ref<any[]>
  languageOptions: Ref<any[]>
  websiteTypeOptions: Ref<any[]>
  tagList: Ref<any[]>
  typeList: Ref<any[]>
  currentPage: Ref<number>
  sortBy: Ref<string>
  pageSize: Ref<number>
}

export const useCategoryListQueryState = (options: UseCategoryListQueryStateOptions) => {
  const buildResourceQuery = (page: number, size: number) => ({
    keyword: options.keyword.value.trim(),
    authorIds: [...options.selectedAuthorList.value],
    actorNames: [...options.selectedActorList.value],
    albumNames: [...options.selectedAlbumList.value],
    engineIds: [...options.selectedEngineList.value],
    tagIds: [...options.selectedTagList.value],
    typeIds: [...options.selectedTypeList.value],
    missingOnly: options.missingFile.value,
    favoriteOnly: options.favoriteOnly.value,
    completedOnly: options.effectiveCompletedOnly.value,
    runningOnly: options.runningOnly.value,
    page,
    pageSize: size,
    sortBy: options.sortBy.value
  })

  const resetSelected = () => {
    options.missingFile.value = false
    options.favoriteOnly.value = false
    options.completedOnly.value = false
    options.runningOnly.value = false
    options.selectedAuthorList.value = []
    options.selectedActorList.value = []
    options.selectedAlbumList.value = []
    options.selectedEngineList.value = []
    options.selectedTagList.value = []
    options.selectedTypeList.value = []
    options.authorSearch.value = ''
    options.actorSearch.value = ''
    options.albumSearch.value = ''
    options.tagSearch.value = ''
    options.typeSearch.value = ''
  }

  const resetCategoryListState = () => {
    options.selectionModeManuallyEnabled.value = false
    options.selectedResourceIds.value = []
    options.resourceList.value = []
    options.totalResources.value = 0
    options.authorList.value = []
    options.actorList.value = []
    options.albumList.value = []
    options.engineList.value = []
    options.languageOptions.value = []
    options.websiteTypeOptions.value = []
    options.tagList.value = []
    options.typeList.value = []
    options.currentPage.value = 1
  }

  return {
    buildResourceQuery,
    resetSelected,
    resetCategoryListState
  }
}
