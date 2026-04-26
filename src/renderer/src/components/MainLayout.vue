<script setup lang="ts">
import { computed, h, onMounted, provide, ref, watch } from 'vue'
import {darkTheme} from 'naive-ui'
import {commonThemeOverrides} from '../theme/common'
import {baseDarkThemeOverrides} from '../theme/dark'
import {baseLightThemeOverrides} from "../theme/light";
import type {MenuOption} from "naive-ui";
import { useRoute, useRouter } from 'vue-router'
import { createLogger } from '../../../main/util/logger'
import {
  AlertCircle,
  CheckmarkCircle,
  CloseOutline,
  InformationCircle,
  NotificationsOutline,
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
} from '../utils/notification-center'
import AudioPlayer from './AudioPlayer.vue'
import { useAudioPlayerStore } from '../utils/audio-player-store'
import packageJson from '../../../../package.json'

const router = useRouter()
const route = useRoute()
const primaryColor = '#764ba2'
const logger = createLogger('main-layout')
const APP_VERSION = packageJson.version

const props = defineProps<{isDark: boolean}>()
const emit = defineEmits(['update:isDark'])
const clearingNotifications = ref(false)
const audioPlayerStore = useAudioPlayerStore()
const globalAudioPlayerVisible = computed({
  get: () => audioPlayerStore.isVisible.value,
  set: (value: boolean) => {
    audioPlayerStore.isVisible.value = value
  }
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

const toggleTheme = () => {
  logger.info('toggle theme')
  emit('update:isDark', !props.isDark)
}

const showNotificationCenter = ref(false)
const notificationCenterStore = useNotificationCenterStore()
const hasOngoingItems = computed(() => notificationCenterStore.ongoingItems.value.length > 0)
const hasNotificationItems = computed(() => notificationCenterStore.notifications.value.length > 0)
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

// 动态合并主题
const currentThemeOverrides = computed(() => {
  const common = commonThemeOverrides(primaryColor)
  const dark = baseDarkThemeOverrides(primaryColor)
  const light = baseLightThemeOverrides(primaryColor)
  return props.isDark ? {...common, ...dark} : {...common, ...light}
})

provide('appIsDark', computed(() => props.isDark))

const activeKey = ref('dashboard')
const menuOptions = ref<MenuOption[]>([])

const renderMenuIcon = (emoji: string) => () => h('span', { class: 'app-menu-icon' }, emoji)
const renderMenuLabel = (title: string, caption: string) => () => h(
  'div',
  { class: 'app-menu-item' },
  [
    h('div', { class: 'app-menu-item__title' }, title),
    h('div', { class: 'app-menu-item__caption' }, caption)
  ]
)

const handleMenuClick = (key: string) => {
  activeKey.value = key

  const systemKeys = ['dashboard', 'search', 'setting', 'about']
  if (systemKeys.includes(key)) {
    logger.debug('navigate to system route', { key })
    router.push({name: key})
  } else {
    logger.debug('navigate to category route', { key })
    router.push({
      name: 'category',
      params: {
        id: key
      }
    })
  }
}

onMounted(async () => {
  const category = await window.api.db.getCategory();
  menuOptions.value = [
    {
      label: renderMenuLabel('主页', '总览与最近活动'),
      key: 'dashboard',
      icon: renderMenuIcon('🏠')
    },
    ...category.map((item: { emoji: any; name: any; id: any; }) => (
      {
        label: renderMenuLabel(item.name, '资源分类'),
        key: item.id,
        icon: renderMenuIcon(item.emoji || '📁')
      }
    )),
    {
      label: renderMenuLabel('搜索', '快速检索资源'),
      key: 'search',
      icon: renderMenuIcon('🔎')
    },
    {
      label: renderMenuLabel('设置', '偏好与运行选项'),
      key: 'setting',
      icon: renderMenuIcon('⚙')
    }, {
      label: renderMenuLabel('关于', '项目与版本信息'),
      key: 'about',
      icon: renderMenuIcon('✨')
    }
  ]
})

watch(
  () => route.name,
  (name) => {
    if (typeof name !== 'string') {
      return
    }

    if (['dashboard', 'search', 'setting', 'about'].includes(name)) {
      activeKey.value = name
      return
    }

    if (name === 'category') {
      activeKey.value = String(route.params.id ?? '')
    }
  },
  { immediate: true }
)

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

const formatMiniPlayerTooltipTime = (seconds: number) => formatMiniPlayerTime(seconds)

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
  <n-config-provider
    :theme="isDark ? darkTheme : null"
    :theme-overrides="currentThemeOverrides"
  >
    <n-layout has-sider class="app-container">

      <n-layout-sider
        bordered
        collapse-mode="width"
        :collapsed-width="64"
        :width="240"
        class="glass-sider"
      >
        <div class="logo-area">
          <div class="logo-area__badge">NR</div>
          <div class="logo-area__content">
            <div class="logo-area__title">Neo Resource</div>
            <div class="logo-area__subtitle">Manage games, asmr and media</div>
          </div>
          <div class="logo-area__version">v{{ APP_VERSION }}</div>
        </div>
        <n-scrollbar class="app-menu-scrollbar">
          <n-menu
            :options="menuOptions"
            :value="activeKey"
            class="app-menu"
            @update:value="handleMenuClick"
          />
        </n-scrollbar>
      </n-layout-sider>

      <n-layout class="main-body">
        <n-layout-header class="title-bar" bordered>
          <div class="drag-region"></div>
          <n-button text class="theme-toggle" @click="toggleTheme">
            <template #icon>
              <span style="font-size: 18px">{{isDark ? '🌙' : '☀️'}}</span>
            </template>
          </n-button>
          <n-button text class="notification-toggle" @click="showNotificationCenter = true">
            <n-badge dot type="default" :show="hasOngoingItems">
              <n-icon size="20">
                <NotificationsOutline />
              </n-icon>
            </n-badge>
          </n-button>
          <div class="window-actions">
          </div>
        </n-layout-header>

        <n-layout-content class="main-content" content-style="height: 100%;">
          <div class="content-shell">
            <router-view/>
            <AudioPlayer
              v-model:show="globalAudioPlayerVisible"
              :resource-id="audioPlayerStore.resourceId.value"
              :playlist="audioPlayerStore.playlist.value"
              :initial-path="audioPlayerStore.initialPath.value"
              :initial-time="audioPlayerStore.initialTime.value"
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
          </div>
        </n-layout-content>
      </n-layout>
    </n-layout>

    <n-drawer v-model:show="showNotificationCenter" placement="right" :width="500">
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
                      <div class="notification-center__mini-player-title">{{ item.meta?.secondaryText || item.meta?.title || getOngoingSecondaryText(item.content) || item.meta?.primaryText || item.meta?.trackLabel || getOngoingPrimaryText(item.content) }}</div>
                      <div class="notification-center__mini-player-subtitle">{{ item.meta?.primaryText || item.meta?.trackLabel || getOngoingPrimaryText(item.content) }}</div>
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
  </n-config-provider>
</template>

<style scoped>
body {
  transition: background-color 0.4s ease, color 0.4s ease;
}

.app-container {
  transition: background 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-container {
  height: 100vh;
  background: v-bind('isDark ? "#1a1a1a" : "#f5f5f7"');
}

.main-body {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.glass-sider {
  --n-color: rgba(255, 255, 255, 0.03) !important;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 14px 10px 12px;
  overflow: hidden;
}

.glass-sider :deep(.n-layout-sider-scroll-container) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden !important;
}

.logo-area {
  position: relative;
  margin: 2px 6px 14px;
  padding: 14px 14px 12px;
  border-radius: 18px;
  background:
    linear-gradient(155deg, rgba(118, 75, 162, 0.26), rgba(18, 163, 127, 0.16)),
    rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.14);
  overflow: hidden;
}

.logo-area::after {
  content: '';
  position: absolute;
  inset: auto -18px -26px auto;
  width: 84px;
  height: 84px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(99, 226, 183, 0.22), transparent 70%);
  pointer-events: none;
}

.logo-area__badge {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(99, 226, 183, 0.9), rgba(118, 75, 162, 0.88));
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.logo-area__content {
  margin-top: 12px;
}

.logo-area__title {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.logo-area__subtitle {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.56);
}

.logo-area__version {
  margin-top: 12px;
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  font-weight: 700;
}

.app-menu-scrollbar {
  flex: 1;
  min-height: 0;
  padding: 0 2px 0 0;
  overflow: hidden;
}

.app-menu {
  --n-item-height: 56px !important;
}

.app-menu-item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.app-menu-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 14px;
  line-height: 1;
}

.app-menu-item__title {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.app-menu-item__caption {
  margin-top: 2px;
  font-size: 10px;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.42);
}

.app-menu :deep(.n-menu-item-content),
.app-menu :deep(.n-submenu .n-submenu-title) {
  border-radius: 14px;
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}

.app-menu :deep(.n-menu-item-content::before) {
  border-radius: 14px !important;
}

.app-menu :deep(.n-menu-item-content--selected) {
  box-shadow: inset 0 0 0 1px rgba(99, 226, 183, 0.2);
}

.app-menu :deep(.n-menu-item-content-header) {
  min-width: 0;
}

.app-menu :deep(.n-menu-item-content__icon) {
  margin-right: 10px !important;
}

.title-bar {
  height: 40px;
  display: flex;
  background: transparent;
  padding: 0 12px;
}

.drag-region {
  flex: 1;
  -webkit-app-region: drag; /* 允许拖动窗口 */
  height: 100%;
}

.window-actions {
  -webkit-app-region: no-drag; /* 按钮区域禁止拖动，否则无法点击 */
}

.theme-toggle {
  -webkit-app-region: no-drag; /* 按钮必须禁止拖拽 */
  margin-right: 12px;
  cursor: pointer;
  transition: transform 0.2s;
}

.notification-toggle {
  -webkit-app-region: no-drag;
  margin-right: 12px;
}

.theme-toggle:hover {
  transform: rotate(20deg) scale(1.1);
}

.main-content {
  flex: 1;
  min-height: 0;
  height: calc(100vh - 40px);
}

.content-shell {
  height: 100%;
  min-height: 0;
  position: relative;
}

.mini-audio-player {
  position: absolute;
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
