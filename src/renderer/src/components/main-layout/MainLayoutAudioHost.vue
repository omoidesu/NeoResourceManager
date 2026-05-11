<script setup lang="ts">
import { computed } from 'vue'
import {
  CloseOutline,
  Pause,
  Play,
  PlayBackOutline,
  PlayForwardOutline,
  Repeat,
  Shuffle,
  SwapHorizontal
} from '@vicons/ionicons5'
import AudioPlayer from '../AudioPlayer.vue'
import { useAudioPlayerStore } from '../../utils/audio-player-store'

const audioPlayerStore = useAudioPlayerStore()

const globalAudioPlayerVisible = computed({
  get: () => audioPlayerStore.isVisible.value,
  set: (value: boolean) => {
    audioPlayerStore.isVisible.value = value
  }
})

const miniPlayerPrimaryText = computed(() => {
  if (audioPlayerStore.displayMode.value === 'music') {
    return String(audioPlayerStore.currentTrack.value?.artist ?? audioPlayerStore.artist.value ?? '').trim()
      || String(audioPlayerStore.currentTrack.value?.label ?? '').trim()
      || String(audioPlayerStore.currentTrack.value?.resourceTitle ?? audioPlayerStore.title.value ?? '').trim()
  }

  return String(audioPlayerStore.currentTrack.value?.label ?? '').trim()
    || String(audioPlayerStore.currentTrack.value?.resourceTitle ?? audioPlayerStore.title.value ?? '').trim()
})

const miniPlayerSecondaryText = computed(() => {
  if (audioPlayerStore.displayMode.value === 'music') {
    return String(audioPlayerStore.currentTrack.value?.resourceTitle ?? audioPlayerStore.title.value ?? '').trim()
  }

  const resourceTitle = String(audioPlayerStore.currentTrack.value?.resourceTitle ?? audioPlayerStore.title.value ?? '').trim()
  return resourceTitle && resourceTitle !== miniPlayerPrimaryText.value ? resourceTitle : ''
})

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

const formatMiniPlayerTooltipTime = (seconds: number) => formatMiniPlayerTime(seconds)
</script>

<template>
  <AudioPlayer
    v-model:show="globalAudioPlayerVisible"
    :resource-id="audioPlayerStore.resourceId.value"
    :playlist="audioPlayerStore.playlist.value"
    :initial-path="audioPlayerStore.initialPath.value"
    :initial-time="audioPlayerStore.initialTime.value"
    :session-version="audioPlayerStore.sessionVersion.value"
    :resume-restart-threshold="audioPlayerStore.audioResumeRestartThreshold.value"
    :cover-src="audioPlayerStore.coverSrc.value"
    :title="audioPlayerStore.title.value"
    :artist="audioPlayerStore.artist.value"
    :display-mode="audioPlayerStore.displayMode.value"
  />
  <transition name="mini-audio-player-slide">
    <div v-if="audioPlayerStore.hasActiveTrack.value" class="mini-audio-player">
      <button type="button" class="mini-audio-player__close" @click="handleCloseMiniAudioPlayer">
        <n-icon :component="CloseOutline" />
      </button>
      <div class="mini-audio-player__cover" @click="handleReopenAudioPlayer">
        <img
          v-if="audioPlayerStore.coverSrc.value"
          :src="audioPlayerStore.coverSrc.value"
          alt="cover"
          class="mini-audio-player__cover-image"
        />
        <div v-else class="mini-audio-player__cover-placeholder">NO COVER</div>
      </div>
      <div class="mini-audio-player__meta" @click="handleReopenAudioPlayer">
        <div class="mini-audio-player__eyebrow">{{ miniPlayerPrimaryText }}</div>
        <div class="mini-audio-player__title">{{ miniPlayerSecondaryText || miniPlayerPrimaryText }}</div>
        <div class="mini-audio-player__time">
          {{ formatMiniPlayerTime(audioPlayerStore.currentTime.value) }}
          /
          {{ formatMiniPlayerTime(audioPlayerStore.duration.value || audioPlayerStore.currentTrack.value?.duration) }}
        </div>
        <div class="mini-audio-player__progress-wrap" @click.stop>
          <n-slider
            :value="audioPlayerStore.currentTime.value || 0"
            :max="Math.max(audioPlayerStore.duration.value || audioPlayerStore.currentTrack.value?.duration || 1, 1)"
            :step="0.1"
            :format-tooltip="formatMiniPlayerTooltipTime"
            class="mini-audio-player__progress"
            @update:value="audioPlayerStore.controls.value.seek?.($event)"
          />
        </div>
      </div>
      <div class="mini-audio-player__actions">
        <n-tooltip v-if="audioPlayerStore.displayMode.value === 'music'" trigger="hover">
          <template #trigger>
            <n-button quaternary circle @click="audioPlayerStore.controls.value.cyclePlaybackMode?.()">
              <template #icon>
                <n-icon :component="playbackModeIcon" />
              </template>
            </n-button>
          </template>
          {{ playbackModeLabel }}
        </n-tooltip>
        <n-button quaternary circle @click="audioPlayerStore.controls.value.previous?.()">
          <template #icon>
            <n-icon :component="PlayBackOutline" />
          </template>
        </n-button>
        <n-button circle type="primary" @click="audioPlayerStore.controls.value.playPause?.()">
          <template #icon>
            <n-icon :component="audioPlayerStore.isPlaying.value ? Pause : Play" />
          </template>
        </n-button>
        <n-button quaternary circle @click="audioPlayerStore.controls.value.next?.()">
          <template #icon>
            <n-icon :component="PlayForwardOutline" />
          </template>
        </n-button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.mini-audio-player {
  position: fixed;
  right: 18px;
  bottom: 78px;
  z-index: 12;
  display: flex;
  align-items: center;
  gap: 14px;
  width: min(420px, calc(100% - 36px));
  padding: 14px 16px;
  border: 1px solid rgba(128, 128, 128, 0.16);
  border-radius: 18px;
  background: rgba(24, 24, 24, 0.94);
  backdrop-filter: blur(16px);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.24);
}

.mini-audio-player-slide-enter-active,
.mini-audio-player-slide-leave-active {
  transition: opacity 0.42s ease, transform 0.48s cubic-bezier(0.22, 1, 0.36, 1);
}

.mini-audio-player-slide-enter-from,
.mini-audio-player-slide-leave-to {
  opacity: 0;
  transform: translate3d(72px, 0, 0);
}

.mini-audio-player-slide-enter-to,
.mini-audio-player-slide-leave-from {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.mini-audio-player__cover {
  width: 72px;
  height: 72px;
  flex: 0 0 72px;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini-audio-player__cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mini-audio-player__cover-placeholder {
  padding: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.38);
  text-align: center;
}

.mini-audio-player__close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.76);
  cursor: pointer;
}

.mini-audio-player__meta {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  padding-right: 28px;
}

.mini-audio-player__eyebrow {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.mini-audio-player__title {
  margin-top: 2px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-audio-player__time {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.42);
  font-variant-numeric: tabular-nums;
}

.mini-audio-player__progress-wrap {
  margin-top: 8px;
}

.mini-audio-player__progress :deep(.n-slider) {
  cursor: pointer;
}

.mini-audio-player__progress :deep(.n-slider-rail) {
  height: 6px;
  border-radius: 999px;
}

.mini-audio-player__progress :deep(.n-slider-handle) {
  width: 12px;
  height: 12px;
}

.mini-audio-player__actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
