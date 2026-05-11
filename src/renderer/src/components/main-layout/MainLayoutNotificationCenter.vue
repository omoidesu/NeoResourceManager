<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AlertCircle,
  CheckmarkCircle,
  CloseOutline,
  InformationCircle,
  Pause,
  Play,
  PlayBackOutline,
  PlayForwardOutline,
  Repeat,
  Shuffle,
  SwapHorizontal,
  TrashOutline,
  Warning
} from '@vicons/ionicons5'
import {
  clearNotificationCenterItems,
  removeNotificationCenterItem,
  useNotificationCenterStore
} from '../../utils/notification-center'
import { useAudioPlayerStore } from '../../utils/audio-player-store'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const drawerVisible = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value)
})

const clearingNotifications = ref(false)
const notificationCenterStore = useNotificationCenterStore()
const audioPlayerStore = useAudioPlayerStore()

const hasOngoingItems = computed(() => notificationCenterStore.ongoingItems.value.length > 0)
const hasNotificationItems = computed(() => notificationCenterStore.notifications.value.length > 0)

const playbackModeIcon = computed(() => {
  if (audioPlayerStore.playbackMode.value === 'loop' || audioPlayerStore.playbackMode.value === 'repeat-one') {
    return Repeat
  }

  if (audioPlayerStore.playbackMode.value === 'shuffle') {
    return Shuffle
  }

  return SwapHorizontal
})

const playbackModeLabel = computed(() => {
  if (audioPlayerStore.playbackMode.value === 'loop') {
    return '列表循环'
  }

  if (audioPlayerStore.playbackMode.value === 'shuffle') {
    return '随机播放'
  }

  if (audioPlayerStore.playbackMode.value === 'repeat-one') {
    return '单曲循环'
  }

  return '顺序播放'
})

const handleReopenAudioPlayer = () => {
  audioPlayerStore.isVisible.value = true
  audioPlayerStore.controls.value.reopen?.()
}

const handleCloseMiniAudioPlayer = async () => {
  const stopControl = audioPlayerStore.controls.value.stop
  if (!stopControl) {
    return
  }

  await Promise.resolve(stopControl())
}

const formatNotificationTime = (timestamp: number) => {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp))
  } catch {
    return ''
  }
}

const getNotificationIcon = (type: 'success' | 'error' | 'info' | 'warning') => {
  switch (type) {
    case 'success':
      return CheckmarkCircle
    case 'warning':
      return Warning
    case 'error':
      return AlertCircle
    case 'info':
    default:
      return InformationCircle
  }
}

const getNotificationIconColor = (type: 'success' | 'error' | 'info' | 'warning') => {
  switch (type) {
    case 'success':
      return '#18a058'
    case 'warning':
      return '#f0a020'
    case 'error':
      return '#d03050'
    case 'info':
    default:
      return '#2080f0'
  }
}

const getOngoingPrimaryText = (content: string) => content.split('\n')[0] ?? ''
const getOngoingSecondaryText = (content: string) => content.split('\n')[1] ?? ''

const formatMiniPlayerTime = (seconds: number | null | undefined) => {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds ?? 0)))
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainSeconds = totalSeconds % 60
  const hours = Math.floor(totalSeconds / 3600)

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainSeconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainSeconds).padStart(2, '0')}`
}

const handleClearAllNotifications = () => {
  if (!hasNotificationItems.value || clearingNotifications.value) {
    return
  }

  clearingNotifications.value = true
  window.setTimeout(() => {
    clearNotificationCenterItems()
    clearingNotifications.value = false
  }, 220)
}
</script>

<template>
  <n-drawer v-model:show="drawerVisible" placement="right" :width="500">
    <n-drawer-content title="通知中心" closable>
      <n-scrollbar style="max-height: 100%;">
        <div class="notification-center">
          <div v-if="hasOngoingItems" class="notification-center__section">
            <div class="notification-center__section-header">
              <div class="notification-center__title">进行中</div>
            </div>
            <div v-if="notificationCenterStore.ongoingItems.value.length" class="notification-center__list">
              <div
                v-for="item in notificationCenterStore.ongoingItems.value"
                :key="item.id"
                class="notification-center__item notification-center__item--ongoing"
                :class="{ 'notification-center__item--cover': item.kind === 'audio-player' && Boolean(item.meta?.coverSrc) }"
                :style="item.kind === 'audio-player' && item.meta?.coverSrc ? { backgroundImage: `linear-gradient(180deg, rgba(12, 14, 18, 0.97) 0%, rgba(12, 14, 18, 0.92) 16%, rgba(16, 18, 24, 0.84) 50%, rgba(12, 14, 18, 0.92) 84%, rgba(12, 14, 18, 0.97) 100%), url(${item.meta.coverSrc})` } : undefined"
                @click="item.kind === 'audio-player' ? handleReopenAudioPlayer() : item.onClick?.()"
              >
                <template v-if="item.kind === 'audio-player'">
                  <div class="notification-center__mini-player">
                    <div class="notification-center__mini-player-header">
                      <div class="notification-center__item-title">{{ item.title }}</div>
                      <n-button quaternary circle size="small" @click.stop="handleCloseMiniAudioPlayer">
                        <template #icon>
                          <n-icon :component="CloseOutline" />
                        </template>
                      </n-button>
                    </div>
                    <div class="notification-center__mini-player-title">
                      {{ item.meta?.secondaryText || item.meta?.title || getOngoingSecondaryText(item.content) || item.meta?.primaryText || item.meta?.trackLabel || getOngoingPrimaryText(item.content) }}
                    </div>
                    <div class="notification-center__mini-player-subtitle">
                      {{ item.meta?.primaryText || item.meta?.trackLabel || getOngoingPrimaryText(item.content) }}
                    </div>
                    <n-progress
                      type="line"
                      :show-indicator="false"
                      :percentage="Math.min(100, Math.max(0, ((Number(item.meta?.currentTime ?? 0)) / Math.max(Number(item.meta?.duration ?? 0), 1)) * 100))"
                      class="notification-center__progress"
                    />
                    <div class="notification-center__mini-player-footer">
                      <div class="notification-center__mini-player-time">
                        {{ formatMiniPlayerTime(item.meta?.currentTime) }} / {{ formatMiniPlayerTime(item.meta?.duration) }}
                      </div>
                      <div class="notification-center__mini-player-actions">
                        <n-tooltip v-if="audioPlayerStore.displayMode.value === 'music'" trigger="hover">
                          <template #trigger>
                            <n-button quaternary circle size="small" @click.stop="audioPlayerStore.controls.value.cyclePlaybackMode?.()">
                              <template #icon>
                                <n-icon :component="playbackModeIcon" />
                              </template>
                            </n-button>
                          </template>
                          {{ playbackModeLabel }}
                        </n-tooltip>
                        <n-button quaternary circle size="small" @click.stop="audioPlayerStore.controls.value.previous?.()">
                          <template #icon>
                            <n-icon :component="PlayBackOutline" />
                          </template>
                        </n-button>
                        <n-button circle size="small" type="primary" @click.stop="audioPlayerStore.controls.value.playPause?.()">
                          <template #icon>
                            <n-icon :component="item.meta?.isPlaying ? Pause : Play" />
                          </template>
                        </n-button>
                        <n-button quaternary circle size="small" @click.stop="audioPlayerStore.controls.value.next?.()">
                          <template #icon>
                            <n-icon :component="PlayForwardOutline" />
                          </template>
                        </n-button>
                      </div>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="notification-center__item-header">
                    <div class="notification-center__item-title">{{ item.title }}</div>
                    <div class="notification-center__item-time">{{ formatNotificationTime(item.createdAt) }}</div>
                  </div>
                  <div class="notification-center__item-content notification-center__item-content--single-line">
                    {{ getOngoingPrimaryText(item.content) }}
                  </div>
                  <div
                    v-if="getOngoingSecondaryText(item.content)"
                    class="notification-center__item-content notification-center__item-content--single-line"
                    :title="getOngoingSecondaryText(item.content)"
                  >
                    {{ getOngoingSecondaryText(item.content) }}
                  </div>
                  <n-progress
                    v-if="typeof item.progress === 'number'"
                    type="line"
                    :percentage="item.progress"
                    :show-indicator="false"
                    status="info"
                    class="notification-center__progress"
                  />
                </template>
              </div>
            </div>
          </div>

          <div class="notification-center__section">
            <div class="notification-center__section-header">
              <div class="notification-center__title">通知</div>
              <n-button
                v-if="hasNotificationItems"
                text
                size="small"
                class="notification-center__clear"
                @click="handleClearAllNotifications"
              >
                <template #icon>
                  <n-icon>
                    <TrashOutline />
                  </n-icon>
                </template>
                清除全部
              </n-button>
            </div>
            <div
              v-if="notificationCenterStore.notifications.value.length"
              class="notification-center__list"
              :class="{ 'notification-center__list--clearing': clearingNotifications }"
            >
              <div
                v-for="item in notificationCenterStore.notifications.value"
                :key="item.id"
                class="notification-center__item"
                @click="removeNotificationCenterItem(item.id)"
              >
                <div class="notification-center__item-header">
                  <div class="notification-center__item-title-wrap">
                    <n-icon
                      class="notification-center__item-icon"
                      size="20"
                      :color="getNotificationIconColor(item.type)"
                    >
                      <component :is="getNotificationIcon(item.type)" />
                    </n-icon>
                    <div class="notification-center__item-title">{{ item.title }}</div>
                  </div>
                  <div class="notification-center__item-time">{{ formatNotificationTime(item.createdAt) }}</div>
                </div>
                <div class="notification-center__item-content">{{ item.content }}</div>
              </div>
            </div>
            <n-empty v-else description="暂无通知" />
          </div>
        </div>
      </n-scrollbar>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.notification-center {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.notification-center__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.notification-center__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.notification-center__title {
  font-size: 16px;
  font-weight: 700;
}

.notification-center__clear {
  flex: 0 0 auto;
}

.notification-center__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: opacity 0.22s ease, transform 0.22s ease, filter 0.22s ease;
}

.notification-center__list--clearing {
  opacity: 0;
  transform: translateX(20px);
  filter: blur(2px);
}

.notification-center__item {
  position: relative;
  padding: 12px 14px;
  border: 1px solid rgba(128, 128, 128, 0.16);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  overflow: hidden;
  background-clip: padding-box;
}

.notification-center__item--ongoing {
  cursor: pointer;
}

.notification-center__item--cover {
  border-color: rgba(255, 255, 255, 0.06);
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.18),
    inset 0 22px 36px rgba(8, 10, 14, 0.24),
    inset 0 -22px 36px rgba(8, 10, 14, 0.24);
}

.notification-center__item--cover::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgba(10, 12, 16, 0.84) 0%,
      rgba(10, 12, 16, 0.72) 10%,
      rgba(12, 14, 18, 0.32) 28%,
      rgba(12, 14, 18, 0.24) 72%,
      rgba(10, 12, 16, 0.72) 90%,
      rgba(10, 12, 16, 0.84) 100%
    );
  box-shadow:
    inset 0 2px 0 rgba(10, 12, 16, 0.74),
    inset 0 -2px 0 rgba(10, 12, 16, 0.74);
}

.notification-center__item--cover > * {
  position: relative;
  z-index: 1;
}

.notification-center__item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.notification-center__item-title {
  font-size: 14px;
  font-weight: 600;
}

.notification-center__item-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.notification-center__item-icon {
  flex: 0 0 auto;
}

.notification-center__item-time {
  font-size: 12px;
  opacity: 0.6;
}

.notification-center__item-content {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-line;
  word-break: break-word;
}

.notification-center__item-content--single-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: normal;
}

.notification-center__progress {
  margin-top: 10px;
}

.notification-center__mini-player {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notification-center__mini-player-header,
.notification-center__mini-player-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.notification-center__mini-player-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  word-break: break-word;
}

.notification-center__mini-player-subtitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.notification-center__mini-player-time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.48);
  font-variant-numeric: tabular-nums;
}

.notification-center__mini-player-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
