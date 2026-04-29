export const APP_PRIMARY_COLORS = {
  dark: '#63e2b7',
  light: '#18a058'
} as const

export const getAppPrimaryColor = (isDark: boolean) => isDark
  ? APP_PRIMARY_COLORS.dark
  : APP_PRIMARY_COLORS.light
