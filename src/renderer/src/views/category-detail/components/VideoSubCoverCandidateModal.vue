<script setup lang="ts">
const props = withDefaults(defineProps<{
  show: boolean
  items: Array<{
    relativePath: string
    fileName: string
    candidates: Array<{
      label: string
      coverPath: string
      previewSrc: string
      time: number
    }>
  }>
  formatTime: (time: number) => string
}>(), {
  items: () => [],
  formatTime: (time: number) => `${time}`
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  select: [coverPath: string]
  'after-leave': []
}>()
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="选择番剧随机帧封面"
    :style="{ width: '1080px', maxWidth: '94vw' }"
    @update:show="emit('update:show', $event)"
    @after-leave="emit('after-leave')"
  >
    <n-space vertical :size="16">
      <n-alert type="info" :show-icon="false">
        已为番剧目录中的每个视频生成 3 张随机帧候选。点击任意一张后，将只更新当前番剧主封面，用于卡片和详情展示。
      </n-alert>
      <n-scrollbar style="max-height: 70vh;">
        <div class="video-sub-cover-candidate-list">
          <div
            v-for="item in items"
            :key="item.relativePath"
            class="video-sub-cover-candidate-group"
          >
            <div class="video-sub-cover-candidate-group__header">
              <div class="video-sub-cover-candidate-group__title">{{ item.fileName }}</div>
              <div class="video-sub-cover-candidate-group__meta">{{ item.relativePath }}</div>
            </div>
            <div class="video-sub-cover-candidate-group__grid">
              <button
                v-for="candidate in item.candidates"
                :key="`${item.relativePath}-${candidate.coverPath}`"
                type="button"
                class="audio-cover-candidate"
                @click="emit('select', candidate.coverPath)"
              >
                <div class="audio-cover-candidate__preview video-cover-candidate__preview">
                  <img :src="candidate.previewSrc" :alt="candidate.label" class="audio-cover-candidate__image">
                </div>
                <div class="audio-cover-candidate__body">
                  <div class="audio-cover-candidate__title">{{ candidate.label }}</div>
                  <div class="audio-cover-candidate__query">时间点：{{ formatTime(candidate.time) }}</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </n-scrollbar>
      <div class="audio-cover-candidate__footer">
        <n-space justify="end">
          <n-button @click="emit('update:show', false)">取消</n-button>
        </n-space>
      </div>
    </n-space>
  </n-modal>
</template>

<style scoped>
.video-sub-cover-candidate-list {
  display: grid;
  gap: 16px;
}

.video-sub-cover-candidate-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.video-sub-cover-candidate-group__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.video-sub-cover-candidate-group__title {
  font-size: 14px;
  font-weight: 700;
  color: var(--n-title-text-color, #f0f0f0);
}

.video-sub-cover-candidate-group__meta {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.68;
  word-break: break-all;
  color: var(--n-text-color-3, #9b9b9b);
}

.video-sub-cover-candidate-group__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.audio-cover-candidate {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--n-text-color, #d6d6d6);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.16s ease, background-color 0.16s ease, transform 0.16s ease;
}

.audio-cover-candidate:hover {
  border-color: rgba(99, 226, 183, 0.5);
  background: rgba(99, 226, 183, 0.08);
  transform: translateY(-1px);
}

.audio-cover-candidate__preview {
  overflow: hidden;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.08);
}

.video-cover-candidate__preview {
  width: 100%;
  aspect-ratio: 16 / 9;
}

.audio-cover-candidate__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.audio-cover-candidate__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.audio-cover-candidate__title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
  color: var(--n-title-text-color, #f0f0f0);
}

.audio-cover-candidate__query {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.72;
  color: var(--n-text-color-3, #9b9b9b);
}

.audio-cover-candidate__footer {
  display: flex;
  justify-content: flex-end;
}
</style>
