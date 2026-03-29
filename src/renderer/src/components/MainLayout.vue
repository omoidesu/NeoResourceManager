<script setup lang="ts">
import {computed, onMounted, provide, ref} from 'vue'
import {darkTheme} from 'naive-ui'
import {commonThemeOverrides} from '../theme/common'
import {baseDarkThemeOverrides} from '../theme/dark'
import {baseLightThemeOverrides} from "../theme/light";
import type {MenuOption} from "naive-ui";
import {useRouter} from 'vue-router'
import { createLogger } from '../../../main/util/logger'
import {
  AlertCircle,
  CheckmarkCircle,
  InformationCircle,
  NotificationsOutline,
  TrashOutline,
  Warning
} from '@vicons/ionicons5'
import {
  clearNotificationCenterItems,
  removeNotificationCenterItem,
  useNotificationCenterStore
} from '../utils/notification-center'

const router = useRouter()
const primaryColor = '#764ba2'
const logger = createLogger('main-layout')

const props = defineProps<{isDark: boolean}>()
const emit = defineEmits(['update:isDark'])
const clearingNotifications = ref(false)

const toggleTheme = () => {
  logger.info('toggle theme')
  emit('update:isDark', !props.isDark)
}

const showNotificationCenter = ref(false)
const notificationCenterStore = useNotificationCenterStore()
const hasOngoingItems = computed(() => notificationCenterStore.ongoingItems.value.length > 0)
const hasNotificationItems = computed(() => notificationCenterStore.notifications.value.length > 0)

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

const handleMenuClick = (key: string) => {
  activeKey.value = key

  const systemKeys = ['dashboard', 'search', 'setting']
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
      label: '🏠 主页',
      key: 'dashboard'
    },
    ...category.map((item: { emoji: any; name: any; id: any; }) => (
      {
        label: `${item.emoji || '📁'} ${item.name}`,
        key: item.id
      }
    )),
    {
      label: '🔎 搜索',
      key: 'search',
    },
    {
      label: '⚙ 设置',
      key: 'setting',
    }
  ]
})

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
        <div class="logo-area">Neo Resource</div>
        <n-menu
          :options="menuOptions"
          :value="activeKey"
          @update:value="handleMenuClick"
        />
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
                  @click="item.onClick?.()"
                >
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
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
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
  padding: 12px 14px;
  border: 1px solid rgba(128, 128, 128, 0.16);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
}

.notification-center__item--ongoing {
  cursor: pointer;
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
</style>
