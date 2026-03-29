<script setup lang="ts">
import MainLayout from "./components/MainLayout.vue";
import {onBeforeUnmount, onMounted, ref, watch} from "vue";
import {Settings} from "../../common/constants";
import { notify, setNotificationTheme } from "./utils/notification";

const appIsDark = ref(true)
let stopNotificationPushListener: null | (() => void) = null

onMounted(async () => {
  stopNotificationPushListener = window.api.service.onNotificationPush((message) => {
    notify(message.type, message.title, message.content)
  })
  await window.api.service.startNotificationPush()

  const theme = await window.api.db.getSetting(Settings.THEME_TYPE)
  if (!theme || theme.value === 'dark') {
    appIsDark.value = true
  } else {
    appIsDark.value = false
  }
  setNotificationTheme(appIsDark.value)
})

watch(() => appIsDark.value,
  (newVal, _) => {
    setNotificationTheme(newVal)
    window.api.db.setSetting(Settings.THEME_TYPE, newVal ? 'dark' : 'light')
  })

onBeforeUnmount(() => {
  stopNotificationPushListener?.()
  stopNotificationPushListener = null
})
</script>

<template>
  <MainLayout v-model:isDark="appIsDark"/>
</template>

<style scoped>
html, body, #app {
  height: 100vh;
  margin: 0;
  overflow: hidden;
}
</style>
