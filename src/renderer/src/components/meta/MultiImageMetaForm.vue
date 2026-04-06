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
const mangaSiteOptions = ref<any[]>([])

const getDirectoryName = (basePath: string) => {
  const normalizedPath = String(basePath ?? '').trim().replace(/[\\/]+$/, '')
  if (!normalizedPath) {
    return ''
  }

  const segments = normalizedPath.split(/[\\/]/)
  return segments[segments.length - 1] ?? ''
}

const normalizeSearchKeyword = (value: string) => {
  return String(value ?? '')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/【[^】]*】/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/（[^）]*）/g, ' ')
    .replace(/\[[^\]]*漢化[^\]]*]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const comicMetaWebsiteId = computed(() => {
  const matched = mangaSiteOptions.value.find((item) => String(item?.label ?? '').trim().toLowerCase() === 'comicmeta')
  return String(matched?.value ?? '').trim()
})

const canFetchMangaInfo = computed(() => Boolean(String(props.metaData?.gameId ?? '').trim()))

watch(
  () => props.basePath,
  (basePath) => {
    const normalizedKeyword = normalizeSearchKeyword(getDirectoryName(basePath))
    if (!normalizedKeyword) {
      return
    }

    if (!String(props.metaData?.gameId ?? '').trim()) {
      props.metaData.gameId = normalizedKeyword
    }
  },
  { immediate: true }
)

watch(
  comicMetaWebsiteId,
  (value) => {
    props.metaData.websiteType = value
  },
  { immediate: true }
)

onMounted(async () => {
  mangaSiteOptions.value = await window.api.db.getSelectDictData(DictType.MANGA_SITE_TYPE)
  props.metaData.websiteType = comicMetaWebsiteId.value
})
</script>

<template>
  <n-form-item label="汉化者">
    <n-input v-model:value="props.metaData.translator" placeholder="请输入汉化者或汉化组" />
  </n-form-item>
  <n-form-item label="漫画搜索词">
    <div class="multi-image-meta__row">
      <n-input v-model:value="props.metaData.gameId" placeholder="请输入漫画标题、作者或目录名关键词" />
      <n-button
        quaternary
        type="info"
        :loading="props.fetchInfoLoading"
        :disabled="!canFetchMangaInfo || props.fetchInfoLoading"
        @click="emit('fetch-game-info')"
      >
        获取漫画信息
      </n-button>
    </div>
  </n-form-item>
</template>

<style scoped>
.multi-image-meta__row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
}

.multi-image-meta__row :deep(.n-input) {
  flex: 1;
  min-width: 0;
}
</style>
