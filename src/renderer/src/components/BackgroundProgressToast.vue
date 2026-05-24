<script setup lang="ts">
import { CloseOutline } from '@vicons/ionicons5'
import { NButton, NProgress } from 'naive-ui'

const props = withDefaults(defineProps<{
  show: boolean
  progress: number
  title: string
  subtitleLines?: string[]
  clickable?: boolean
  closable?: boolean
}>(), {
  subtitleLines: () => [],
  clickable: false,
  closable: true
})

const emit = defineEmits<{
  click: []
  close: []
}>()

const handleClick = () => {
  if (!props.clickable) {
    return
  }

  emit('click')
}

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <div
    v-if="show"
    class="background-progress-toast"
    :class="{ 'background-progress-toast--clickable': clickable }"
    @click="handleClick"
  >
    <n-button
      v-if="closable"
      quaternary
      circle
      size="tiny"
      class="background-progress-toast__close"
      @click.stop="handleClose"
    >
      <template #icon>
        <n-icon>
          <CloseOutline />
        </n-icon>
      </template>
    </n-button>
    <div class="background-progress-toast__progress">
      <n-progress
        type="circle"
        status="info"
        :stroke-width="8"
        :percentage="progress"
        :show-indicator="false"
      />
      <div class="background-progress-toast__progress-text">{{ progress }}%</div>
    </div>
    <div class="background-progress-toast__content">
      <div class="background-progress-toast__title">{{ title }}</div>
      <div
        v-for="(line, index) in subtitleLines"
        :key="`${index}-${line}`"
        class="background-progress-toast__subtitle"
        :title="line"
      >
        {{ line }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.background-progress-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 14px;
  width: 375px;
  max-width: calc(100vw - 40px);
  padding: 14px 16px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  border-radius: 16px;
  background: rgba(32, 32, 32, 0.96);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.26);
}

.background-progress-toast--clickable {
  cursor: pointer;
}

.background-progress-toast__close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
}

.background-progress-toast__progress {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  overflow: hidden;
}

.background-progress-toast__progress::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.08);
  border-top-color: rgba(99, 226, 183, 0.95);
  border-right-color: rgba(99, 226, 183, 0.28);
  animation: background-progress-toast-spin 1s linear infinite;
  box-sizing: border-box;
}

.background-progress-toast__progress :deep(.n-progress) {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 34px !important;
  height: 34px !important;
  transform: translate(-50%, -50%);
}

.background-progress-toast__progress :deep(.n-progress-graph) {
  width: 100% !important;
  height: 100% !important;
}

.background-progress-toast__progress-text {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 34px;
  height: 34px;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

@keyframes background-progress-toast-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.background-progress-toast__content {
  min-width: 0;
  flex: 1;
  padding-right: 18px;
  overflow: hidden;
}

.background-progress-toast__title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.background-progress-toast__subtitle {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.72;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
