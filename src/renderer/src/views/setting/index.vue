<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import type { ComputedRef } from 'vue'
import { NButton, NCard, NForm, NFormItem, NGrid, NGi, NInput, NScrollbar, NSelect, NSpace, NSwitch } from 'naive-ui'
import { notify } from '../../utils/notification'
import { PanicMode, PictureReadScrollMode, Settings } from '../../../../common/constants'

type SettingItem = typeof Settings[keyof typeof Settings]

const injectedIsDark = inject<ComputedRef<boolean>>('appIsDark', computed(() => true))

const loading = ref(true)
const saving = ref(false)

const formData = ref<Record<string, string>>({})
const initialFormData = ref<Record<string, string>>({})

const allSettings = Object.values(Settings)

const themeOptions = [
  { label: '深色', value: 'dark' },
  { label: '浅色', value: 'light' }
]

const pictureReadModeOptions = [
  { label: '滚轮缩放', value: PictureReadScrollMode.ZOOM },
  { label: '滚轮切换图片', value: PictureReadScrollMode.SCROLL }
]

const panicModeOptions = [
  { label: '打开网址', value: PanicMode.OPEN_URL },
  { label: '系统更新', value: PanicMode.SYSTEM_UPDATING },
  { label: '系统崩溃', value: PanicMode.SYSTEM_CRASH }
]

const appearanceSettings = [
  Settings.THEME_TYPE,
  Settings.PICTURE_READ_SCROLL_MODE,
  Settings.THEME_COLOR
]

const pathSettings = [
  Settings.CACHE_PATH,
  Settings.LOCALE_EMULATOR_PATH,
  Settings.EVERYTHING_CLI_PATH
]

const everythingSettings = [
  Settings.USE_EVERYTHING_HTTP,
  Settings.EVERYTHING_INTERFACE,
  Settings.EVERYTHING_HTTP_PORT,
  Settings.EVERYTHING_USERNAME,
  Settings.EVERYTHING_PASSWORD,
  Settings.USE_EVERYTHING_CLI
]

const proxySettings = [
  Settings.ENABLE_PROXY,
  Settings.PROXY_HOST,
  Settings.PROXY_PORT
]

const shortcutSettings = [
  Settings.SHORTCUT_PRINT_SCREEN,
  Settings.SHORTCUT_PANIC_KEY,
  Settings.PANIC_MODE,
  Settings.PANIC_OPEN_URL
]

const booleanSettingNames = [
  Settings.USE_EVERYTHING_HTTP.name,
  Settings.USE_EVERYTHING_CLI.name,
  Settings.ENABLE_PROXY.name
] as string[]

const pageStyle = computed(() => ({
  backgroundColor: injectedIsDark.value ? '#121212' : '#f7f8fa',
  color: injectedIsDark.value ? 'rgba(255, 255, 245, 0.86)' : '#1f2329'
}))

const groupedSections = [
  { title: '外观', items: appearanceSettings },
  { title: '路径', items: pathSettings },
  { title: 'Everything', items: everythingSettings },
  { title: '代理', items: proxySettings },
  { title: '快捷键与伪装', items: shortcutSettings }
]

const isBooleanSetting = (setting: SettingItem) =>
  booleanSettingNames.includes(setting.name)

const getSelectOptions = (setting: SettingItem) => {
  switch (setting.name) {
    case Settings.THEME_TYPE.name:
      return themeOptions
    case Settings.PICTURE_READ_SCROLL_MODE.name:
      return pictureReadModeOptions
    case Settings.PANIC_MODE.name:
      return panicModeOptions
    default:
      return []
  }
}

const getSettingValue = (setting: SettingItem) =>
  formData.value[setting.name] ?? setting.default ?? ''

const setSettingValue = (setting: SettingItem, value: string) => {
  formData.value = {
    ...formData.value,
    [setting.name]: value
  }
}

const loadSettings = async () => {
  loading.value = true

  try {
    const entries = await Promise.all(
      allSettings.map(async (setting) => {
        const item = await window.api.db.getSetting(setting)
        return [setting.name, String(item?.value ?? setting.default ?? '')] as const
      })
    )

    const nextFormData = Object.fromEntries(entries)
    formData.value = nextFormData
    initialFormData.value = { ...nextFormData }
  } catch (error) {
    notify('error', '设置', error instanceof Error ? error.message : '加载设置失败')
  } finally {
    loading.value = false
  }
}

const handleReset = () => {
  formData.value = { ...initialFormData.value }
}

const handleSave = async () => {
  saving.value = true

  try {
    await Promise.all(
      allSettings.map((setting) =>
        window.api.db.setSetting(setting, String(formData.value[setting.name] ?? ''))
      )
    )
    initialFormData.value = { ...formData.value }
    notify('success', '设置', '设置已保存')
  } catch (error) {
    notify('error', '设置', error instanceof Error ? error.message : '保存设置失败')
  } finally {
    saving.value = false
  }
}

const handleSelectFolder = async (setting: SettingItem) => {
  try {
    const selectedPath = await window.api.dialog.selectFolder()
    if (!selectedPath) {
      return
    }

    setSettingValue(setting, selectedPath)
  } catch (error) {
    notify('error', '设置', error instanceof Error ? error.message : '选择目录失败')
  }
}

const handleSelectExe = async (setting: SettingItem) => {
  try {
    const selectedPath = await window.api.dialog.selectFile(['.exe', '.bat', '.cmd'])
    if (!selectedPath) {
      return
    }

    setSettingValue(setting, selectedPath)
  } catch (error) {
    notify('error', '设置', error instanceof Error ? error.message : '选择文件失败')
  }
}

const handlePickPath = (setting: SettingItem) => {
  if (setting.name === Settings.CACHE_PATH.name) {
    void handleSelectFolder(setting)
    return
  }

  void handleSelectExe(setting)
}

onMounted(() => {
  void loadSettings()
})
</script>

<template>
  <div class="settings-page" :style="pageStyle">
    <div class="settings-page__header">
      <div>
        <div class="settings-page__title">设置</div>
        <div class="settings-page__subtitle">管理主题、路径、Everything、代理与快捷键。</div>
      </div>
      <n-space>
        <n-button @click="handleReset">重置</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">保存全部</n-button>
      </n-space>
    </div>

    <n-scrollbar class="settings-page__scrollbar">
      <div class="settings-page__content">
        <n-grid :cols="2" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
          <n-gi v-for="section in groupedSections" :key="section.title" span="2 m:2 l:1">
            <n-card :title="section.title" class="settings-card" :bordered="false">
              <n-form label-placement="top">
                <n-form-item
                  v-for="setting in section.items"
                  :key="setting.name"
                  :label="setting.description"
                  class="settings-form-item"
                >
                  <template v-if="isBooleanSetting(setting)">
                    <n-switch
                      :value="getSettingValue(setting) === '1'"
                      @update:value="(value) => setSettingValue(setting, value ? '1' : '0')"
                    />
                  </template>

                  <template v-else-if="getSelectOptions(setting).length">
                    <n-select
                      :value="getSettingValue(setting)"
                      :options="getSelectOptions(setting)"
                      @update:value="(value) => setSettingValue(setting, String(value ?? ''))"
                    />
                  </template>

                  <template v-else-if="pathSettings.some((item) => item.name === setting.name)">
                    <div class="settings-path-field">
                      <n-input
                        :value="getSettingValue(setting)"
                        @update:value="(value) => setSettingValue(setting, value)"
                      />
                      <n-button @click="handlePickPath(setting)">选择</n-button>
                    </div>
                  </template>

                  <template v-else>
                    <n-input
                      :type="setting.name === Settings.EVERYTHING_PASSWORD.name ? 'password' : 'text'"
                      show-password-on="click"
                      :value="getSettingValue(setting)"
                      @update:value="(value) => setSettingValue(setting, value)"
                    />
                  </template>
                </n-form-item>
              </n-form>
            </n-card>
          </n-gi>
        </n-grid>
      </div>
    </n-scrollbar>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  padding: 20px;
  box-sizing: border-box;
}

.settings-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.settings-page__title {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.settings-page__subtitle {
  margin-top: 6px;
  font-size: 13px;
  opacity: 0.68;
}

.settings-page__scrollbar {
  min-height: 0;
}

.settings-page__content {
  padding-right: 8px;
  box-sizing: border-box;
}

.settings-card {
  height: 100%;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.03);
}

.settings-form-item:last-child {
  margin-bottom: 0;
}

.settings-path-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  width: 100%;
}
</style>
