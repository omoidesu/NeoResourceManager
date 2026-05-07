import type { ComputedRef } from 'vue'

export const createBatchImportItemEnricher = (
  detailIsManga: ComputedRef<boolean>,
  detailIsAsmr: ComputedRef<boolean>
) => {
  return async (item: any) => {
    if (detailIsManga.value || detailIsAsmr.value) {
      return {
        ...item,
        launchFileIcon: '',
        fetchInfoEnabled: item.fetchInfoEnabled !== false
      }
    }

    if (!item?.launchFilePath) {
      return {
        ...item,
        launchFileIcon: '',
        fetchInfoEnabled: item.fetchInfoEnabled !== false
      }
    }

    try {
      return {
        ...item,
        launchFileIcon: (await window.api.dialog.getFileIconAsDataUrl(item.launchFilePath)) ?? '',
        fetchInfoEnabled: item.fetchInfoEnabled !== false
      }
    } catch {
      return {
        ...item,
        launchFileIcon: '',
        fetchInfoEnabled: item.fetchInfoEnabled !== false
      }
    }
  }
}
