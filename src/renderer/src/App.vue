<script setup lang="ts">
import MainLayout from "./components/MainLayout.vue";
import {onBeforeUnmount, onMounted, ref, watch} from "vue";
import {Settings} from "../../common/constants";
import { notify, setNotificationTheme } from "./utils/notification";

const appIsDark = ref(true)
const blurAllImages = ref(false)
let stopNotificationPushListener: null | (() => void) = null

const applyBlurImageSetting = (rawValue: unknown) => {
  const normalizedValue = String(rawValue ?? '').trim().toLowerCase()
  blurAllImages.value = ['1', 'true', 'yes', 'on'].includes(normalizedValue)
}

const handleAppSettingsChanged = (event: Event) => {
  const customEvent = event as CustomEvent<{ settings?: Record<string, string> }>
  const nextValue = customEvent.detail?.settings?.[Settings.BLUR_ALL_IMAGES.name]
  if (nextValue == null) {
    return
  }

  applyBlurImageSetting(nextValue)
}

onMounted(async () => {
  stopNotificationPushListener = window.api.service.onNotificationPush((message) => {
    notify(message.type, message.title, message.content)
  })
  await window.api.service.startNotificationPush()

  const [theme, blurSetting] = await Promise.all([
    window.api.db.getSetting(Settings.THEME_TYPE),
    window.api.db.getSetting(Settings.BLUR_ALL_IMAGES)
  ])
  if (!theme || theme.value === 'dark') {
    appIsDark.value = true
  } else {
    appIsDark.value = false
  }
  applyBlurImageSetting(blurSetting?.value ?? Settings.BLUR_ALL_IMAGES.default)
  setNotificationTheme(appIsDark.value)
  window.addEventListener('app-settings-changed', handleAppSettingsChanged as EventListener)
})

watch(() => appIsDark.value,
  (newVal, _) => {
    setNotificationTheme(newVal)
    window.api.db.setSetting(Settings.THEME_TYPE, newVal ? 'dark' : 'light')
  })

onBeforeUnmount(() => {
  stopNotificationPushListener?.()
  stopNotificationPushListener = null
  window.removeEventListener('app-settings-changed', handleAppSettingsChanged as EventListener)
})
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--blur-all-images': blurAllImages }">
    <MainLayout v-model:isDark="appIsDark"/>
  </div>
</template>

<style>
html, body, #app {
  height: 100vh;
  margin: 0;
  overflow: hidden;
}

.app-shell {
  height: 100%;
}

.app-shell--blur-all-images .resource-card__cover-image,
.app-shell--blur-all-images .resource-card__website-cover-icon {
  filter: blur(18px) !important;
  transition: filter 0.2s ease;
}

.app-shell--blur-all-images .cover-card__art::before {
  filter: blur(18px) saturate(0.74) brightness(0.8) !important;
  transform: scale(1.08);
  transition: filter 0.2s ease, transform 0.2s ease;
}

.app-shell--blur-all-images .next-play-hero::before,
.app-shell--blur-all-images .next-play-mini-card::before,
.app-shell--blur-all-images .queue-pinned-card::before {
  display: none !important;
}

.app-shell--blur-all-images .next-play-hero,
.app-shell--blur-all-images .next-play-mini-card,
.app-shell--blur-all-images .queue-pinned-card {
  background-image: none !important;
}

.app-shell--blur-all-images .next-play-hero {
  background: color-mix(in srgb, currentColor 26%, var(--home-solid-panel-alt, #161616)) !important;
  border: 1px solid color-mix(in srgb, currentColor 42%, transparent) !important;
}

.app-shell--blur-all-images .next-play-mini-card {
  background: color-mix(in srgb, currentColor 22%, var(--home-solid-panel-alt, #161616)) !important;
  border: 1px solid color-mix(in srgb, currentColor 38%, transparent) !important;
}

.app-shell--blur-all-images .queue-pinned-card {
  background: color-mix(in srgb, var(--home-panel-subtle, #1f2937) 78%, var(--home-solid-panel, #1b1b1b)) !important;
}
</style>
