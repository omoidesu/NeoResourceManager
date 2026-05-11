<script setup lang="ts">
import {darkTheme, dateZhCN, zhCN} from 'naive-ui'
import { NotificationsOutline } from '@vicons/ionicons5'
import packageJson from '../../../../package.json'
import { useMainLayoutNavigation } from './main-layout/useMainLayoutNavigation'
import { useMainLayoutShell } from './main-layout/useMainLayoutShell'
import MainLayoutAudioHost from './main-layout/MainLayoutAudioHost.vue'
import MainLayoutNotificationCenter from './main-layout/MainLayoutNotificationCenter.vue'

const APP_VERSION = packageJson.version

const props = defineProps<{isDark: boolean}>()
const emit = defineEmits(['update:isDark'])

const {
  currentThemeOverrides,
  hasOngoingItems,
  showNotificationCenter,
  toggleTheme
} = useMainLayoutShell({
  getIsDark: () => props.isDark,
  updateIsDark: (value) => emit('update:isDark', value)
})

const {
  activeKey,
  handleMenuClick,
  handleMenuPreloadIntent,
  menuOptions
} = useMainLayoutNavigation()
</script>

<template>
  <n-config-provider
    :theme="isDark ? darkTheme : null"
    :theme-overrides="currentThemeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
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
            @pointerenter.capture="handleMenuPreloadIntent('menu-pointerenter')"
            @pointerdown.capture="handleMenuPreloadIntent('menu-pointerdown')"
            @focusin.capture="handleMenuPreloadIntent('menu-focus')"
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
            <MainLayoutAudioHost />
          </div>
        </n-layout-content>
      </n-layout>
    </n-layout>

    <MainLayoutNotificationCenter v-model:show="showNotificationCenter" />
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

</style>
