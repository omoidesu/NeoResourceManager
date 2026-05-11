<script setup lang="ts">
const props = withDefaults(defineProps<{
  show: boolean
  fixedCandidates: Array<{
    label: string
    coverPath: string
    previewSrc: string
    time: number
  }>
  randomCandidates: Array<{
    label: string
    coverPath: string
    previewSrc: string
    time: number
  }>
  formatTime: (time: number) => string
}>(), {
  fixedCandidates: () => [],
  randomCandidates: () => [],
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
    title="选择随机帧封面"
    :style="{ width: '920px' }"
    @update:show="emit('update:show', $event)"
    @after-leave="emit('after-leave')"
  >
    <n-space vertical :size="16">
      <n-alert type="info" :show-icon="false">
        已从视频中生成固定时间和随机时间的封面候选，请选择要使用的那一张。
      </n-alert>
      <div class="video-cover-candidate-section">
        <div class="video-cover-candidate-section__title">固定时间</div>
        <div v-if="fixedCandidates.length" class="audio-cover-candidate-list video-cover-candidate-list">
          <button
            v-for="candidate in fixedCandidates"
            :key="`${candidate.label}-${candidate.coverPath}`"
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
        <div v-else class="video-cover-candidate-section__empty">视频长度不足，暂无固定时间候选</div>
      </div>
      <div class="video-cover-candidate-section">
        <div class="video-cover-candidate-section__title">随机时间</div>
        <div class="audio-cover-candidate-list video-cover-candidate-list">
          <button
            v-for="candidate in randomCandidates"
            :key="`${candidate.label}-${candidate.coverPath}`"
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
      <div class="audio-cover-candidate__footer">
        <n-space justify="end">
          <n-button @click="emit('update:show', false)">取消</n-button>
        </n-space>
      </div>
    </n-space>
  </n-modal>
</template>

<style scoped>
.audio-cover-candidate-list {
  display: grid;
  gap: 12px;
}

.video-cover-candidate-list {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
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

.video-cover-candidate-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.video-cover-candidate-section__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--n-title-text-color, #f0f0f0);
}

.video-cover-candidate-section__empty {
  font-size: 12px;
  opacity: 0.68;
  color: var(--n-text-color-3, #9b9b9b);
}

.audio-cover-candidate__footer {
  display: flex;
  justify-content: flex-end;
}
</style>
