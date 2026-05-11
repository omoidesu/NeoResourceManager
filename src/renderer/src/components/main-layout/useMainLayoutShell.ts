import { computed, provide, ref } from 'vue'
import { commonThemeOverrides } from '../../theme/common'
import { baseDarkThemeOverrides } from '../../theme/dark'
import { baseLightThemeOverrides } from '../../theme/light'
import { getAppPrimaryColor } from '../../theme/primary'
import { createLogger } from '../../../../main/util/logger'
import { useNotificationCenterStore } from '../../utils/notification-center'

export const useMainLayoutShell = (options: {
  getIsDark: () => boolean
  updateIsDark: (value: boolean) => void
}) => {
  const logger = createLogger('main-layout')
  const isDark = computed(() => options.getIsDark())
  const primaryColor = computed(() => getAppPrimaryColor(isDark.value))
  const showNotificationCenter = ref(false)
  const notificationCenterStore = useNotificationCenterStore()
  const hasOngoingItems = computed(() => notificationCenterStore.ongoingItems.value.length > 0)

  const currentThemeOverrides = computed(() => {
    const common = commonThemeOverrides(primaryColor.value)
    const dark = baseDarkThemeOverrides(primaryColor.value)
    const light = baseLightThemeOverrides(primaryColor.value)
    return isDark.value ? { ...common, ...dark } : { ...common, ...light }
  })

  provide('appIsDark', isDark)
  provide('appPrimaryColor', primaryColor)

  const toggleTheme = () => {
    logger.info('toggle theme')
    options.updateIsDark(!isDark.value)
  }

  return {
    currentThemeOverrides,
    hasOngoingItems,
    showNotificationCenter,
    toggleTheme
  }
}
