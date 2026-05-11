import { ref } from 'vue'
import {
  resolveImagePreviewSource,
  type PreviewOptions
} from '../../shared/preview/usePreviewAssetLoader'

export const useReaderImagePreviewCache = (options: PreviewOptions) => {
  const srcMap = ref<Record<string, string>>({})

  const load = async (filePath: string) => {
    const normalizedPath = String(filePath ?? '').trim()
    if (!normalizedPath) {
      return ''
    }

    const cachedSource = srcMap.value[normalizedPath]
    if (cachedSource) {
      return cachedSource
    }

    try {
      const previewSource = await resolveImagePreviewSource(normalizedPath, options)
      if (!previewSource) {
        return ''
      }

      srcMap.value = {
        ...srcMap.value,
        [normalizedPath]: previewSource
      }

      return previewSource
    } catch {
      return ''
    }
  }

  const loadMany = async (filePaths: string[]) => {
    await Promise.all(filePaths.map((filePath) => load(filePath)))
  }

  const clear = () => {
    srcMap.value = {}
  }

  return {
    srcMap,
    load,
    loadMany,
    clear
  }
}
