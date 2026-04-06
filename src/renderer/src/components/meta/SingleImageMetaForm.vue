<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { DictType } from '../../../../common/constants'

const props = defineProps({
  metaData: {
    type: Object,
    required: true
  },
  basePath: {
    type: String,
    default: ''
  },
  fetchInfoLoading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['fetch-game-info'])
const imageSiteOptions = ref<any[]>([])

const getFileNameWithoutExtension = (filePath: string) => {
  const normalizedPath = String(filePath ?? '').trim()
  if (!normalizedPath) {
    return ''
  }

  const segments = normalizedPath.split(/[\\/]/)
  const fileName = segments[segments.length - 1] ?? ''
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0) {
    return fileName
  }

  return fileName.slice(0, dotIndex)
}

const detectPixivIdFromPath = (filePath: string) => {
  const fileStem = getFileNameWithoutExtension(filePath)
  const matched = fileStem.match(/^(\d+)_p\d+$/i)
  return matched?.[1] ?? ''
}

const canFetchPixivInfo = computed(() => Boolean(String(props.metaData?.pixivId ?? '').trim()))
const pixivWebsiteId = computed(() => {
  const matched = imageSiteOptions.value.find((item) => String(item?.label ?? '').trim().toLowerCase() === 'pixiv')
  return String(matched?.value ?? '').trim()
})
const pixivWebsiteUrl = computed(() => {
  const pixivId = String(props.metaData?.pixivId ?? '').trim()
  return pixivId ? `https://www.pixiv.net/artworks/${pixivId}` : ''
})

const syncPixivStoreFields = () => {
  const pixivId = String(props.metaData?.pixivId ?? '').trim()
  if (!pixivId) {
    props.metaData.websiteType = ''
    props.metaData.gameId = ''
    props.metaData.website = ''
    return
  }

  props.metaData.websiteType = pixivWebsiteId.value
  props.metaData.gameId = pixivId
  props.metaData.website = pixivWebsiteUrl.value
}

watch(
  () => props.basePath,
  (basePath) => {
    const detectedPixivId = detectPixivIdFromPath(basePath)
    if (!detectedPixivId) {
      return
    }

    props.metaData.pixivId = detectedPixivId

    if (!String(props.metaData?.format ?? '').trim()) {
      const matchedExtension = String(basePath ?? '').match(/\.([^.\\/]+)$/)
      props.metaData.format = String(matchedExtension?.[1] ?? '').toLowerCase()
    }
  },
  { immediate: true }
)

watch(
  () => props.metaData?.pixivId,
  () => {
    syncPixivStoreFields()
  },
  { immediate: true }
)

watch(pixivWebsiteId, () => {
  syncPixivStoreFields()
})

onMounted(async () => {
  imageSiteOptions.value = await window.api.db.getSelectDictData(DictType.IMAGE_SITE_TYPE)
  syncPixivStoreFields()
})
</script>

<template>
  <n-form-item label="图片 ID">
    <div class="single-image-meta__row">
      <n-input v-model:value="props.metaData.pixivId" placeholder="请输入 Pixiv 图片 ID" />
      <n-button
        quaternary
        type="info"
        :loading="props.fetchInfoLoading"
        :disabled="!canFetchPixivInfo || props.fetchInfoLoading"
        @click="emit('fetch-game-info')"
      >
        获取 Pixiv 信息
      </n-button>
    </div>
  </n-form-item>
  <n-form-item label="格式">
    <n-input v-model:value="props.metaData.format" placeholder="例如 jpg / png / webp" />
  </n-form-item>
</template>

<style scoped>
.single-image-meta__row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
}

.single-image-meta__row :deep(.n-input) {
  flex: 1;
  min-width: 0;
}
</style>
