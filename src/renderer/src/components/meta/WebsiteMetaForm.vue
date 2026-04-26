<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { notify } from '../../utils/notification'

const props = defineProps({
  metaData: {
    type: Object,
    required: true
  },
  fetchInfoLoading: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits<{
  (event: 'fetch-website-info'): void
  (event: 'fetch-game-info'): void
  (event: 'check-engine'): void
}>()

const normalizeUrl = (value: unknown) => String(value ?? '').trim()
const faviconPreviewSrc = ref('')
let faviconPreviewTaskId = 0

const normalizedFaviconValue = computed(() => normalizeUrl(props.metaData?.favicon))

const normalizeRemoteIconUrl = (value: string) => {
  if (!value) {
    return ''
  }

  if (value.startsWith('//')) {
    return `https:${value}`
  }

  return value
}

watch(
  normalizedFaviconValue,
  async (value) => {
    const nextTaskId = ++faviconPreviewTaskId
    if (!value) {
      faviconPreviewSrc.value = ''
      return
    }

    try {
      const previewTarget = /^https?:\/\//i.test(value) || value.startsWith('//') || value.startsWith('data:')
        ? normalizeRemoteIconUrl(value)
        : value

      const previewUrl = await window.api.dialog.getImagePreviewUrl(previewTarget, {
        maxWidth: 48,
        maxHeight: 48,
        fit: 'inside',
        quality: 90
      })
      if (nextTaskId !== faviconPreviewTaskId) {
        return
      }
      if (previewUrl) {
        faviconPreviewSrc.value = String(previewUrl).trim()
        return
      }
      throw new Error('preview unavailable')
    } catch {
      try {
        const fileIconUrl = await window.api.dialog.getFileIconAsDataUrl(value)
        if (nextTaskId !== faviconPreviewTaskId) {
          return
        }
        faviconPreviewSrc.value = String(fileIconUrl ?? '').trim()
      } catch {
        if (nextTaskId !== faviconPreviewTaskId) {
          return
        }
        faviconPreviewSrc.value = /^https?:\/\//i.test(value) || value.startsWith('//') || value.startsWith('data:')
          ? normalizeRemoteIconUrl(value)
          : ''
      }
    }
  },
  { immediate: true }
)

const handleFetchWebsiteInfo = async () => {
  const url = normalizeUrl(props.metaData?.website)
  if (!url) {
    notify('warning', '获取信息', '请先填写网站地址')
    return
  }

  emit('fetch-website-info')
}

const handleChooseFavicon = async () => {
  try {
    const faviconPath = await window.api.dialog.selectFile(['png', 'jpg', 'jpeg', 'webp', 'ico', 'svg'])
    if (faviconPath) {
      props.metaData.favicon = faviconPath
    }
  } catch (error) {
    notify('error', '选择图标', error instanceof Error ? error.message : '选择网站图标失败')
  }
}

const handleClearFavicon = () => {
  props.metaData.favicon = ''
}
</script>

<template>
  <n-form-item label="网站地址" path="meta.website">
    <div class="website-meta-url-field">
      <n-input
        v-model:value="props.metaData.website"
        placeholder="请输入完整 URL，例如 https://example.com"
      />
      <n-button :loading="fetchInfoLoading" :disabled="!props.metaData.website" @click="handleFetchWebsiteInfo">
        获取信息
      </n-button>
    </div>
  </n-form-item>

  <n-form-item label="站点图标">
    <div class="website-meta-favicon-field">
      <div v-if="faviconPreviewSrc" class="website-meta-favicon-preview">
        <img :src="faviconPreviewSrc" alt="网站图标预览" class="website-meta-favicon-preview__image" />
      </div>
      <div class="website-meta-favicon-field__main">
        <n-input
          :value="props.metaData.favicon"
          placeholder="可选：自定义网站图标"
          readonly
        />
      </div>
      <div class="website-meta-favicon-field__actions">
        <n-button @click="handleChooseFavicon">选择文件</n-button>
        <n-button quaternary type="error" :disabled="!props.metaData.favicon" @click="handleClearFavicon">
          清除
        </n-button>
      </div>
    </div>
  </n-form-item>
</template>

<style scoped>
.website-meta-url-field {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
}

.website-meta-url-field__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.website-meta-favicon-field {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.website-meta-favicon-field__main {
  min-width: 0;
}

.website-meta-favicon-field__actions {
  grid-column: 2;
  display: flex;
  align-items: center;
  gap: 8px;
}

.website-meta-favicon-preview {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.website-meta-favicon-preview__image {
  width: 20px;
  height: 20px;
  object-fit: contain;
  display: block;
}

@media (max-width: 640px) {
  .website-meta-favicon-field {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .website-meta-favicon-field__actions {
    grid-column: 1 / -1;
    padding-left: 48px;
    flex-wrap: wrap;
  }
}
</style>
