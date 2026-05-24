<script setup lang="ts">
const props = withDefaults(defineProps<{
  previewSrc?: string
  previewLabel?: string
  busy?: boolean
  videoCoverFrameLoading?: boolean
  hasBasePath?: boolean
  hasEditingResourceId?: boolean
  hasCoverPath?: boolean
  showWebsiteCoverFetchButton?: boolean
  showAlbumCoverFetchButton?: boolean
  showVideoRandomFrameButton?: boolean
  showScreenshotCoverButton?: boolean
  disableScreenshotCoverButton?: boolean
  showScreenshotFolderButton?: boolean
  showFirstCoverButton?: boolean
}>(), {
  previewSrc: '',
  previewLabel: '暂未设置封面',
  busy: false,
  videoCoverFrameLoading: false,
  hasBasePath: false,
  hasEditingResourceId: false,
  hasCoverPath: false,
  showWebsiteCoverFetchButton: false,
  showAlbumCoverFetchButton: false,
  showVideoRandomFrameButton: false,
  showScreenshotCoverButton: false,
  disableScreenshotCoverButton: false,
  showScreenshotFolderButton: false,
  showFirstCoverButton: false
})

const emit = defineEmits<{
  'choose-custom-cover': []
  'fetch-website-cover': []
  'fetch-album-cover': []
  'use-video-random-frame-cover': []
  'use-screenshot-cover': []
  'choose-cover-from-screenshot-folder': []
  'use-first-cover': []
  'clear-cover': []
}>()
</script>

<template>
  <div class="cover-field">
    <div class="cover-preview">
      <img v-if="previewSrc" :src="previewSrc" alt="封面预览" class="cover-preview__image" />
      <span v-else class="cover-preview__label">{{ previewLabel }}</span>
    </div>
    <n-space size="small" wrap>
      <n-button size="small" :loading="busy" @click="emit('choose-custom-cover')">选择自定义封面</n-button>
      <n-button
        v-if="showWebsiteCoverFetchButton"
        size="small"
        :loading="busy"
        @click="emit('fetch-website-cover')"
      >
        自动获取页面图片
      </n-button>
      <n-button
        v-if="showAlbumCoverFetchButton"
        size="small"
        :loading="busy"
        @click="emit('fetch-album-cover')"
      >
        获取专辑封面
      </n-button>
      <n-button
        v-if="showVideoRandomFrameButton"
        size="small"
        :loading="videoCoverFrameLoading"
        :disabled="!hasBasePath || videoCoverFrameLoading"
        @click="emit('use-video-random-frame-cover')"
      >
        使用随机帧
      </n-button>
      <n-button
        v-if="showScreenshotCoverButton"
        size="small"
        :loading="busy"
        :disabled="!hasBasePath || busy || disableScreenshotCoverButton"
        @click="emit('use-screenshot-cover')"
      >
        使用截图作为封面
      </n-button>
      <n-button
        v-if="showScreenshotFolderButton"
        size="small"
        :loading="busy"
        :disabled="!hasEditingResourceId || busy"
        @click="emit('choose-cover-from-screenshot-folder')"
      >
        从截图文件夹选择
      </n-button>
      <n-button
        v-if="showFirstCoverButton"
        size="small"
        :loading="busy"
        :disabled="!hasBasePath || busy"
        @click="emit('use-first-cover')"
      >
        选择第一张封面
      </n-button>
      <n-button
        size="small"
        type="error"
        quaternary
        :disabled="!hasCoverPath || busy"
        @click="emit('clear-cover')"
      >
        清除封面
      </n-button>
    </n-space>
  </div>
</template>

<style scoped>
.cover-field {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cover-preview {
  min-height: 108px;
  border: 1px dashed rgba(128, 128, 128, 0.32);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  background: rgba(127, 127, 127, 0.06);
  overflow: hidden;
}

.cover-preview__label {
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  opacity: 0.72;
  word-break: break-all;
}

.cover-preview__image {
  width: 100%;
  height: 100%;
  max-height: 180px;
  object-fit: contain;
  display: block;
}
</style>
