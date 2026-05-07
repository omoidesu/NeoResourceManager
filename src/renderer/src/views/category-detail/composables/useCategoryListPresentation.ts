import { computed, type ComputedRef, type Ref } from 'vue'

type NamedCountItem = {
  id: string
  name: string
  count: number
}

type EngineCountItem = NamedCountItem & {
  icon?: string
}

interface UseCategoryListPresentationOptions {
  batchProgressRunning: ComputedRef<boolean>
  batchAnalyzeInBackground: Ref<boolean>
  selectedResourceIds: Ref<string[]>
  selectionModeManuallyEnabled: Ref<boolean>
  resourceList: Ref<any[]>
  authorList: Ref<any[]>
  actorList: Ref<any[]>
  albumList: Ref<any[]>
  engineList: Ref<any[]>
  tagList: Ref<any[]>
  typeList: Ref<any[]>
  authorSearch: Ref<string>
  actorSearch: Ref<string>
  albumSearch: Ref<string>
  tagSearch: Ref<string>
  typeSearch: Ref<string>
  detailIsAsmr: ComputedRef<boolean>
  showAuthorFilter: ComputedRef<boolean>
  showActorFilter: ComputedRef<boolean>
  isAudioCategory: ComputedRef<boolean>
  showEngineFilter: ComputedRef<boolean>
  totalResources: Ref<number>
  pageSize: Ref<number>
  currentPage: Ref<number>
  jumpPageInput: Ref<number | null>
  resolveEngineIcon: (value: string) => string
}

export const useCategoryListPresentation = (options: UseCategoryListPresentationOptions) => {
  const selectedResourceCount = computed(() => options.selectedResourceIds.value.length)
  const resourceSelectionMode = computed(() =>
    selectedResourceCount.value > 0 || options.selectionModeManuallyEnabled.value
  )
  const currentPageResourceIds = computed(() =>
    options.resourceList.value
      .map((item) => String(item?.id ?? '').trim())
      .filter(Boolean)
  )
  const currentCategoryBatchInBackground = computed(() =>
    options.batchProgressRunning.value && options.batchAnalyzeInBackground.value
  )

  const pageSizeOptions = [
    { label: '12 / 页', value: 12 },
    { label: '24 / 页', value: 24 },
    { label: '48 / 页', value: 48 },
    { label: '96 / 页', value: 96 }
  ]

  const normalizedAuthorList = computed<NamedCountItem[]>(() =>
    options.authorList.value
      .map((author) => ({
        id: author.id ?? author.authorId ?? '',
        name: author.name ?? author.authorName ?? '',
        count: Number(author.count ?? 0)
      }))
      .filter((author) => author.id && author.name)
  )

  const normalizedActorList = computed<NamedCountItem[]>(() =>
    options.actorList.value
      .map((actor) => {
        const name = String(actor?.name ?? actor?.actorName ?? '').trim()
        return {
          id: name,
          name,
          count: Number(actor?.count ?? 0)
        }
      })
      .filter((actor) => actor.id && actor.name)
  )

  const normalizedEngineList = computed<EngineCountItem[]>(() =>
    options.engineList.value
      .map((engine) => ({
        id: engine.id ?? engine.engineId ?? '',
        name: engine.name ?? engine.engineName ?? '',
        icon: options.resolveEngineIcon(engine.icon ?? engine.extra?.icon ?? ''),
        count: Number(engine.count ?? 0)
      }))
      .filter((engine) => engine.id && engine.name)
  )

  const normalizedTagList = computed<NamedCountItem[]>(() =>
    options.tagList.value
      .map((tag) => ({
        id: tag.id ?? tag.tagId ?? '',
        name: tag.name ?? tag.tagName ?? '',
        count: Number(tag.count ?? 0)
      }))
      .filter((tag) => tag.id && tag.name)
  )

  const normalizedTypeList = computed<NamedCountItem[]>(() =>
    options.typeList.value
      .map((type) => ({
        id: type.id ?? type.typeId ?? '',
        name: type.name ?? type.typeName ?? '',
        count: Number(type.count ?? 0)
      }))
      .filter((type) => type.id && type.name)
  )

  const normalizedAlbumList = computed(() =>
    options.albumList.value
      .map((album) => ({
        name: String(album?.name ?? album?.albumName ?? '').trim(),
        count: Number(album?.count ?? 0)
      }))
      .filter((album) => album.name)
  )

  const normalizedAuthorSearch = computed(() => options.authorSearch.value.trim().toLowerCase())
  const normalizedActorSearch = computed(() => options.actorSearch.value.trim().toLowerCase())
  const normalizedAlbumSearch = computed(() => options.albumSearch.value.trim().toLowerCase())
  const normalizedTagSearch = computed(() => options.tagSearch.value.trim().toLowerCase())
  const normalizedTypeSearch = computed(() => options.typeSearch.value.trim().toLowerCase())

  const filteredAuthorList = computed(() => {
    if (!normalizedAuthorSearch.value) {
      return normalizedAuthorList.value
    }

    return normalizedAuthorList.value.filter((author) =>
      String(author.name).toLowerCase().includes(normalizedAuthorSearch.value)
    )
  })

  const filteredActorList = computed(() => {
    if (!normalizedActorSearch.value) {
      return normalizedActorList.value
    }

    return normalizedActorList.value.filter((actor) =>
      String(actor.name).toLowerCase().includes(normalizedActorSearch.value)
    )
  })

  const filteredEngineList = computed(() => normalizedEngineList.value)

  const filteredTagList = computed(() => {
    if (!normalizedTagSearch.value) {
      return normalizedTagList.value
    }

    return normalizedTagList.value.filter((tag) =>
      String(tag.name).toLowerCase().includes(normalizedTagSearch.value)
    )
  })

  const filteredTypeList = computed(() => {
    if (!normalizedTypeSearch.value) {
      return normalizedTypeList.value
    }

    return normalizedTypeList.value.filter((type) =>
      String(type.name).toLowerCase().includes(normalizedTypeSearch.value)
    )
  })

  const filteredAlbumList = computed(() => {
    if (!normalizedAlbumSearch.value) {
      return normalizedAlbumList.value
    }

    return normalizedAlbumList.value.filter((album) =>
      String(album.name).toLowerCase().includes(normalizedAlbumSearch.value)
    )
  })

  const filterSectionCount = computed(() => {
    let count = options.detailIsAsmr.value ? 2 : 3
    if (!options.showAuthorFilter.value) {
      count -= 1
    }
    if (options.showActorFilter.value) {
      count += 1
    }
    if (options.isAudioCategory.value) {
      count += 1
    }
    if (options.showEngineFilter.value) {
      count += 1
    }
    return count
  })

  const filterSectionsStyle = computed(() => ({
    gridTemplateRows: `repeat(${filterSectionCount.value}, minmax(0, 1fr))`
  }))

  const totalPages = computed(() => Math.max(1, Math.ceil(options.totalResources.value / options.pageSize.value)))

  const handleJumpPage = () => {
    const nextPage = Math.min(
      totalPages.value,
      Math.max(1, Number(options.jumpPageInput.value ?? options.currentPage.value))
    )

    options.jumpPageInput.value = nextPage
    options.currentPage.value = nextPage
  }

  return {
    selectedResourceCount,
    resourceSelectionMode,
    currentPageResourceIds,
    currentCategoryBatchInBackground,
    pageSizeOptions,
    normalizedAuthorList,
    normalizedActorList,
    normalizedEngineList,
    normalizedTagList,
    normalizedTypeList,
    normalizedAlbumList,
    filteredAuthorList,
    filteredActorList,
    filteredEngineList,
    filteredTagList,
    filteredTypeList,
    filteredAlbumList,
    filterSectionCount,
    filterSectionsStyle,
    totalPages,
    handleJumpPage
  }
}
