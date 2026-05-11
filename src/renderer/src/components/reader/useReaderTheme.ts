import { computed, type Ref } from 'vue'
import type { ComputedRef } from 'vue'

export const readerBackgroundOptions = [
  '#f6f5f7',
  '#e9e4d0',
  '#e6f1da',
  '#d9e4ef',
  '#0f0d0f',
  '#1a191b',
  '#272627'
]

const darkReaderBackgrounds = new Set(['#0f0d0f', '#1a191b', '#272627'])

export const useReaderTheme = (
  appIsDark: ComputedRef<boolean>,
  selectedReaderBackground: Ref<string>
) => {
  const readerBodyBackground = computed(
    () => selectedReaderBackground.value || (appIsDark.value ? '#1a191b' : '#f6f5f7')
  )
  const isReaderBackgroundDark = computed(() =>
    darkReaderBackgrounds.has(readerBodyBackground.value.toLowerCase())
  )
  const readerThemeColors = computed(() => {
    if (appIsDark.value) {
      return {
        shellBg: 'rgb(24, 25, 28)',
        bodyBg: readerBodyBackground.value,
        textColor: isReaderBackgroundDark.value ? '#d8dde5' : '#262626',
        mutedColor: 'rgba(216, 221, 229, 0.68)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderStrongColor: 'rgba(255, 255, 255, 0.12)',
        linkColor: isReaderBackgroundDark.value ? '#7de8c4' : '#0f8f6f',
        blockBg: 'rgba(255, 255, 255, 0.04)',
        codeBg: 'rgba(255, 255, 255, 0.08)',
        preBg: 'rgba(0, 0, 0, 0.28)'
      }
    }

    return {
      shellBg: '#f5f5f5',
      bodyBg: readerBodyBackground.value,
      textColor: isReaderBackgroundDark.value ? '#d8dde5' : '#262626',
      mutedColor: 'rgba(38, 38, 38, 0.62)',
      borderColor: 'rgba(24, 24, 28, 0.1)',
      borderStrongColor: 'rgba(24, 24, 28, 0.16)',
      linkColor: isReaderBackgroundDark.value ? '#7de8c4' : '#0f8f6f',
      blockBg: 'rgba(24, 24, 28, 0.04)',
      codeBg: 'rgba(24, 24, 28, 0.08)',
      preBg: 'rgba(24, 24, 28, 0.06)'
    }
  })
  const readerThemeStyle = computed(() => ({
    '--reader-shell-bg': readerThemeColors.value.shellBg,
    '--reader-body-bg': readerThemeColors.value.bodyBg,
    '--reader-text-color': readerThemeColors.value.textColor,
    '--reader-muted-color': readerThemeColors.value.mutedColor,
    '--reader-border-color': readerThemeColors.value.borderColor,
    '--reader-border-strong-color': readerThemeColors.value.borderStrongColor,
    '--reader-link-color': readerThemeColors.value.linkColor,
    '--reader-block-bg': readerThemeColors.value.blockBg,
    '--reader-code-bg': readerThemeColors.value.codeBg,
    '--reader-pre-bg': readerThemeColors.value.preBg
  }))

  return {
    readerBackgroundOptions,
    readerBodyBackground,
    isReaderBackgroundDark,
    readerThemeColors,
    readerThemeStyle
  }
}
