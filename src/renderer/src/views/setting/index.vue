<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import type { ComputedRef } from 'vue'
import { NButton, NCard, NForm, NFormItem, NGrid, NGi, NInput, NInputNumber, NSelect, NSpace, NSwitch } from 'naive-ui'
import { notify } from '../../utils/notification'
import { PanicMode, PictureReadScrollMode, Settings, VideoTranscodeMode } from '../../../../common/constants'

type SettingItem = typeof Settings[keyof typeof Settings]

const injectedIsDark = inject<ComputedRef<boolean>>('appIsDark', computed(() => true))

const loading = ref(true)
const saving = ref(false)
const testingEverything = ref(false)

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

const videoTranscodeModeOptions = [
  { label: '自动（优先硬件，必要时 CPU）', value: VideoTranscodeMode.AUTO },
  { label: '仅硬件转码', value: VideoTranscodeMode.HARDWARE_ONLY },
  { label: '仅 CPU 转码', value: VideoTranscodeMode.CPU_ONLY },
  { label: '禁用转码', value: VideoTranscodeMode.DISABLED }
]

const appearanceSettings = [
  Settings.THEME_TYPE,
  Settings.PICTURE_READ_SCROLL_MODE,
  Settings.BLUR_ALL_IMAGES,
  Settings.THEME_COLOR
]

const pathSettings = [
  Settings.CACHE_PATH,
  Settings.ARCHIVE_PATH,
  Settings.LOCALE_EMULATOR_PATH,
  Settings.MTOOL_PATH,
  Settings.EVERYTHING_CLI_PATH
]

const archiveSettings = [
  Settings.ARCHIVE_FORMAT,
  Settings.ARCHIVE_LEVEL,
  Settings.ARCHIVE_PASSWORD,
  Settings.ARCHIVE_SPLIT_SIZE,
  Settings.ARCHIVE_SPLIT_SIZE_CUSTOM_MB,
  Settings.ARCHIVE_ENABLE_MULTITHREAD,
  Settings.ARCHIVE_THREAD_COUNT
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

const playbackSettings = [
  Settings.AUDIO_PLAYBACK_RESUME_RESTART_THRESHOLD,
  Settings.VIDEO_PLAYBACK_RESUME_RESTART_THRESHOLD,
  Settings.VIDEO_ALLOW_AUTO_REMUX,
  Settings.VIDEO_TRANSCODE_MODE,
  Settings.VIDEO_FULL_CACHE_TRANSCODE_MAX_MB,
  Settings.VIDEO_SHOW_PLAYBACK_MODE
]

const apiSettings = [
  Settings.API_PORT
]

const shortcutSettings = [
  Settings.SHORTCUT_PRINT_SCREEN,
  Settings.SHORTCUT_PANIC_KEY,
  Settings.PANIC_MODE,
  Settings.PANIC_OPEN_URL
]

const booleanSettingNames = [
  Settings.ARCHIVE_ENABLE_MULTITHREAD.name,
  Settings.USE_EVERYTHING_HTTP.name,
  Settings.USE_EVERYTHING_CLI.name,
  Settings.ENABLE_PROXY.name,
  Settings.BLUR_ALL_IMAGES.name,
  Settings.VIDEO_ALLOW_AUTO_REMUX.name,
  Settings.VIDEO_SHOW_PLAYBACK_MODE.name
] as string[]
const everythingSettingNames = new Set<string>(everythingSettings.map((setting) => setting.name))

const pageStyle = computed(() => ({
  backgroundColor: injectedIsDark.value ? '#121212' : '#f7f8fa',
  color: injectedIsDark.value ? 'rgba(255, 255, 245, 0.86)' : '#1f2329'
}))

const groupedSections = [
  { title: '外观', items: appearanceSettings },
  { title: '路径', items: pathSettings },
  { title: '归档', items: archiveSettings },
  { title: 'Everything', items: everythingSettings },
  { title: '代理', items: proxySettings },
  { title: '播放', items: playbackSettings },
  { title: 'API', items: apiSettings },
  { title: '快捷键与伪装', items: shortcutSettings }
]

const isBooleanSetting = (setting: SettingItem) =>
  booleanSettingNames.includes(setting.name)

const numberSettingNames = new Set<string>([
  Settings.ARCHIVE_THREAD_COUNT.name,
  Settings.ARCHIVE_SPLIT_SIZE_CUSTOM_MB.name,
  Settings.AUDIO_PLAYBACK_RESUME_RESTART_THRESHOLD.name,
  Settings.VIDEO_PLAYBACK_RESUME_RESTART_THRESHOLD.name,
  Settings.VIDEO_FULL_CACHE_TRANSCODE_MAX_MB.name,
  Settings.API_PORT.name
])

const archiveFormatOptions = [
  { label: '7z', value: '7z' },
  { label: 'zip', value: 'zip' },
  { label: 'tar', value: 'tar' },
  { label: 'xz', value: 'xz' },
  { label: 'tar.xz', value: 'tar.xz' },
  { label: 'exe', value: 'exe' }
] as const

const archiveLevelOptions = [
  { label: '0 - 仅存储', value: '0' },
  { label: '1 - 极速压缩', value: '1' },
  { label: '2 - 快速压缩', value: '2' },
  { label: '3 - 快速压缩', value: '3' },
  { label: '4 - 标准压缩', value: '4' },
  { label: '5 - 标准压缩', value: '5' },
  { label: '6 - 标准压缩', value: '6' },
  { label: '7 - 最大压缩', value: '7' },
  { label: '8 - 最大压缩', value: '8' },
  { label: '9 - 极限压缩', value: '9' }
] as const

const archiveSplitSizeOptions = [
  { label: '不分卷', value: 'none' },
  { label: '100MB', value: '100' },
  { label: '300MB', value: '300' },
  { label: '500MB', value: '500' },
  { label: '1GB', value: '1024' },
  { label: '2GB', value: '2048' },
  { label: '4GB(FAT32)', value: '4096' },
  { label: '自定义', value: 'custom' }
] as const

const isNumberSetting = (setting: SettingItem) =>
  numberSettingNames.has(setting.name)

const isPasswordSetting = (setting: SettingItem) =>
  setting.name === Settings.EVERYTHING_PASSWORD.name || setting.name === Settings.ARCHIVE_PASSWORD.name

const getSelectOptions = (setting: SettingItem) => {
  switch (setting.name) {
    case Settings.THEME_TYPE.name:
      return themeOptions
    case Settings.PICTURE_READ_SCROLL_MODE.name:
      return pictureReadModeOptions
    case Settings.PANIC_MODE.name:
      return panicModeOptions
    case Settings.VIDEO_TRANSCODE_MODE.name:
      return videoTranscodeModeOptions
    case Settings.ARCHIVE_FORMAT.name:
      return [...archiveFormatOptions]
    case Settings.ARCHIVE_LEVEL.name:
      return [...archiveLevelOptions]
    case Settings.ARCHIVE_SPLIT_SIZE.name:
      return [...archiveSplitSizeOptions]
    default:
      return []
  }
}

const getSettingPlaceholder = (setting: SettingItem) => {
  switch (setting.name) {
    case Settings.CACHE_PATH.name:
      return '请选择缓存目录'
    case Settings.ARCHIVE_PATH.name:
      return '请选择资源归档目录'
    case Settings.LOCALE_EMULATOR_PATH.name:
      return '请选择 LEProc.exe 路径'
    case Settings.MTOOL_PATH.name:
      return '请选择 MTool.exe、nw.exe，或 MTool 根目录'
    case Settings.EVERYTHING_CLI_PATH.name:
      return '请选择 Everything 命令行程序路径'
    case Settings.EVERYTHING_INTERFACE.name:
      return '例如 127.0.0.1'
    case Settings.EVERYTHING_HTTP_PORT.name:
      return '例如 80'
    case Settings.EVERYTHING_USERNAME.name:
      return '请输入 Everything HTTP 用户名'
    case Settings.EVERYTHING_PASSWORD.name:
      return '请输入 Everything HTTP 密码'
    case Settings.PROXY_HOST.name:
      return '例如 127.0.0.1 或 http://127.0.0.1'
    case Settings.PROXY_PORT.name:
      return '例如 7890'
    case Settings.SHORTCUT_PRINT_SCREEN.name:
      return '例如 f12'
    case Settings.SHORTCUT_PANIC_KEY.name:
      return '例如 escape escape'
    case Settings.PANIC_OPEN_URL.name:
      return '例如 https://www.bilibili.com'
    case Settings.THEME_COLOR.name:
      return '例如 #63e2b7'
    case Settings.ARCHIVE_PASSWORD.name:
      return '留空表示不设置压缩包密码'
    case Settings.ARCHIVE_THREAD_COUNT.name:
      return '默认 16'
    case Settings.ARCHIVE_SPLIT_SIZE_CUSTOM_MB.name:
      return '请输入自定义分卷大小，单位 MB'
    case Settings.AUDIO_PLAYBACK_RESUME_RESTART_THRESHOLD.name:
    case Settings.VIDEO_PLAYBACK_RESUME_RESTART_THRESHOLD.name:
      return '0 到 100，默认 95'
    case Settings.VIDEO_FULL_CACHE_TRANSCODE_MAX_MB.name:
      return '默认 1024，设为 0 表示禁止完整缓存转码'
    case Settings.API_PORT.name:
      return '默认 14518，重启后生效'
    default:
      return `请输入${setting.description}`
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
    const shouldSyncEverythingClient = Array.from(everythingSettingNames).some(
      (name) => String(initialFormData.value[name] ?? '') !== String(formData.value[name] ?? '')
    )
    const shouldRestartApiServer =
      String(initialFormData.value[Settings.API_PORT.name] ?? '') !== String(formData.value[Settings.API_PORT.name] ?? '')

    await Promise.all(
      allSettings.map((setting) =>
        window.api.db.setSetting(setting, String(formData.value[setting.name] ?? ''))
      )
    )

    if (shouldSyncEverythingClient) {
      await window.api.service.syncEverythingClientFromSettings()
    }

    if (shouldRestartApiServer) {
      const result = await window.api.service.restartApiServer()
      notify('success', 'API 服务', `已切换到 ${result.host}:${result.port}`)
    }

    initialFormData.value = { ...formData.value }
    window.dispatchEvent(new CustomEvent('app-settings-changed', {
      detail: {
        settings: { ...formData.value }
      }
    }))
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
    const selectedPath = await window.api.dialog.selectFile(['exe', 'bat', 'cmd'])
    if (!selectedPath) {
      return
    }

    setSettingValue(setting, selectedPath)
  } catch (error) {
    notify('error', '设置', error instanceof Error ? error.message : '选择文件失败')
  }
}

const handlePickPath = (setting: SettingItem) => {
  if (setting.name === Settings.CACHE_PATH.name || setting.name === Settings.ARCHIVE_PATH.name) {
    void handleSelectFolder(setting)
    return
  }

  void handleSelectExe(setting)
}

const getNumberSettingMax = (setting: SettingItem) => {
  if (setting.name === Settings.ARCHIVE_THREAD_COUNT.name) {
    return 128
  }

  if (setting.name === Settings.VIDEO_FULL_CACHE_TRANSCODE_MAX_MB.name) {
    return 102400
  }

  return 100
}

const handleTestEverythingServer = async () => {
  testingEverything.value = true

  try {
    const result = await window.api.service.testEverythingHttpServer({
      host: getSettingValue(Settings.EVERYTHING_INTERFACE),
      port: getSettingValue(Settings.EVERYTHING_HTTP_PORT),
      username: getSettingValue(Settings.EVERYTHING_USERNAME),
      password: getSettingValue(Settings.EVERYTHING_PASSWORD)
    })

    if (result?.type === 'success') {
      notify('success', 'Everything', String(result?.message ?? 'Everything HTTP 服务器连接成功'))
      return
    }

    notify(result?.type === 'warning' ? 'warning' : 'error', 'Everything', String(result?.message ?? 'Everything HTTP 服务器连接失败'))
  } catch (error) {
    notify('error', 'Everything', error instanceof Error ? error.message : 'Everything HTTP 服务器连接失败')
  } finally {
    testingEverything.value = false
  }
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
        <div class="settings-page__subtitle">管理主题、路径、归档、Everything、代理、播放与快捷键。</div>
      </div>
      <n-space>
        <n-button @click="handleReset">重置</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">保存全部</n-button>
      </n-space>
    </div>

    <AppScrollbar class="settings-page__scrollbar">
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
                      :placeholder="getSettingPlaceholder(setting)"
                      @update:value="(value) => setSettingValue(setting, String(value ?? ''))"
                    />
                  </template>

                  <template v-else-if="pathSettings.some((item) => item.name === setting.name)">
                    <div class="settings-path-field">
                      <n-input
                        :value="getSettingValue(setting)"
                        :placeholder="getSettingPlaceholder(setting)"
                        @update:value="(value) => setSettingValue(setting, value)"
                      />
                      <n-button @click="handlePickPath(setting)">选择</n-button>
                    </div>
                  </template>

                  <template v-else-if="setting.name === Settings.ARCHIVE_SPLIT_SIZE_CUSTOM_MB.name">
                    <n-input-number
                      v-if="getSettingValue(Settings.ARCHIVE_SPLIT_SIZE) === 'custom'"
                      :value="Number(getSettingValue(setting) || setting.default || 100)"
                      :min="1"
                      :precision="0"
                      :step="50"
                      :placeholder="getSettingPlaceholder(setting)"
                      style="width: 100%;"
                      @update:value="(value) => setSettingValue(setting, String(Math.max(1, Number(value ?? setting.default ?? 100))))"
                    />
                    <n-input
                      v-else
                      value="仅在分卷大小选择“自定义”时可编辑"
                      disabled
                    />
                  </template>

                  <template v-else-if="isNumberSetting(setting)">
                    <n-input-number
                      :value="Number(getSettingValue(setting) || setting.default || 0)"
                      :min="setting.name === Settings.ARCHIVE_THREAD_COUNT.name ? 1 : 0"
                      :max="getNumberSettingMax(setting)"
                      :precision="0"
                      :placeholder="getSettingPlaceholder(setting)"
                      style="width: 100%;"
                      @update:value="(value) => setSettingValue(setting, String(
                        setting.name === Settings.ARCHIVE_THREAD_COUNT.name
                          ? Math.max(1, Math.min(128, Number(value ?? setting.default ?? 16)))
                          : Math.max(0, Math.min(getNumberSettingMax(setting), Number(value ?? setting.default ?? 0)))
                      ))"
                    />
                  </template>

                  <template v-else>
                    <n-input
                      :type="isPasswordSetting(setting) ? 'password' : 'text'"
                      show-password-on="click"
                      :value="getSettingValue(setting)"
                      :placeholder="getSettingPlaceholder(setting)"
                      @update:value="(value) => setSettingValue(setting, value)"
                    />
                  </template>
                </n-form-item>
              </n-form>
              <div v-if="section.title === 'Everything'" class="settings-card__actions">
                <n-button
                  secondary
                  :loading="testingEverything"
                  :disabled="getSettingValue(Settings.USE_EVERYTHING_HTTP) !== '1'"
                  @click="handleTestEverythingServer"
                >
                  测试 Everything 服务器
                </n-button>
              </div>
            </n-card>
          </n-gi>
        </n-grid>
      </div>
    </AppScrollbar>
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

.settings-card__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
</style>
