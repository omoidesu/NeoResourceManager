<script setup lang="ts">
const props = withDefaults(defineProps<{
  show: boolean
  candidates: Array<{
    label: string
    coverPath: string
    previewSrc: string
    queryText: string
  }>
}>(), {
  candidates: () => []
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  select: [candidate: {
    label: string
    coverPath: string
    previewSrc: string
    queryText: string
  }]
  'after-leave': []
}>()
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="选择专辑封面"
    :style="{ width: '820px' }"
    @update:show="emit('update:show', $event)"
    @after-leave="emit('after-leave')"
  >
    <n-space vertical :size="16">
      <n-alert type="info" :show-icon="false">
        已按“歌名 + 歌手 / 歌名 + 专辑 / 歌手 + 专辑”查找到可用封面，请选择要使用的那一张。
      </n-alert>
      <div class="audio-cover-candidate-list">
        <button
          v-for="candidate in candidates"
          :key="`${candidate.label}-${candidate.coverPath}`"
          type="button"
          class="audio-cover-candidate"
          @click="emit('select', candidate)"
        >
          <div class="audio-cover-candidate__preview">
            <img :src="candidate.previewSrc" :alt="candidate.label" class="audio-cover-candidate__image">
          </div>
          <div class="audio-cover-candidate__body">
            <div class="audio-cover-candidate__title">{{ candidate.label }}</div>
            <div class="audio-cover-candidate__query">{{ candidate.queryText }}</div>
          </div>
        </button>
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

.audio-cover-candidate {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 16px;
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
  width: 180px;
  height: 180px;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.08);
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
  gap: 8px;
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
  white-space: pre-wrap;
  color: var(--n-text-color-3, #9b9b9b);
}

.audio-cover-candidate__footer {
  display: flex;
  justify-content: flex-end;
}
</style>
