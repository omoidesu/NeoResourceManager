import { h } from 'vue'
import { createDiscreteApi, darkTheme } from 'naive-ui'
import { commonThemeOverrides } from '../theme/common'
import { baseDarkThemeOverrides } from '../theme/dark'
import { baseLightThemeOverrides } from '../theme/light'
import { createLogger } from '../../../main/util/logger'
import { pushNotificationCenterItem } from './notification-center'

type NotifyType = 'success' | 'error' | 'info' | 'warning'
type DiscreteApiInstance = {
  notification: ReturnType<typeof createDiscreteApi>['notification']
  dialog: ReturnType<typeof createDiscreteApi>['dialog']
}

const PRIMARY_COLOR = '#764ba2'
const NOTIFICATION_DURATION = 7500

let isDarkTheme = true
let notificationStyleInjected = false
let discreteApiCache: DiscreteApiInstance | null = null
let discreteApiThemeKey = ''
const logger = createLogger('notification')

export function setNotificationTheme(isDark: boolean) {
  isDarkTheme = isDark
  discreteApiCache = null
  discreteApiThemeKey = ''
}

function ensureNotificationStyles() {
  if (notificationStyleInjected || typeof document === 'undefined') {
    return
  }

  const style = document.createElement('style')
  style.setAttribute('data-nrm-notification-style', 'true')
  style.textContent = `
    @keyframes nrm-notification-countdown {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
    }

    .nrm-notification-title {
      width: 100%;
    }

    .nrm-notification-title__text {
      font-weight: 600;
      line-height: 1.2;
    }

    .nrm-notification-content {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: calc(100% + 32px);
      margin-left: -16px;
      margin-right: -16px;
      margin-top: 2px;
    }

    .nrm-notification-content__text {
      line-height: 1.5;
      padding: 0 16px;
    }

    .nrm-notification-content__track {
      position: relative;
      width: 100%;
      height: 3px;
      overflow: hidden;
      border-radius: 0;
      background: rgba(255, 255, 255, 0.12);
      margin-top: 2px;
      margin-bottom: -13px;
    }

    .nrm-notification-content__track--light {
      background: rgba(0, 0, 0, 0.08);
    }

    .nrm-notification-content__bar {
      width: 100%;
      height: 100%;
      transform-origin: left center;
      animation-name: nrm-notification-countdown;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
      animation-duration: var(--nrm-notification-duration, 2500ms);
    }
  `

  document.head.appendChild(style)
  notificationStyleInjected = true
}

function getNotificationApi() {
  const themeKey = isDarkTheme ? 'dark' : 'light'
  if (discreteApiCache && discreteApiThemeKey === themeKey) {
    return discreteApiCache
  }

  const common = commonThemeOverrides(PRIMARY_COLOR)
  const dark = baseDarkThemeOverrides(PRIMARY_COLOR)
  const light = baseLightThemeOverrides(PRIMARY_COLOR)

  discreteApiCache = createDiscreteApi(['notification', 'dialog'], {
    configProviderProps: {
      theme: isDarkTheme ? darkTheme : null,
      themeOverrides: isDarkTheme ? { ...common, ...dark } : { ...common, ...light }
    }
  })
  discreteApiThemeKey = themeKey

  return discreteApiCache
}

function getProgressColor(type: NotifyType) {
  switch (type) {
    case 'success':
      return '#36ad6a'
    case 'error':
      return '#d03050'
    case 'warning':
      return '#f0a020'
    case 'info':
    default:
      return PRIMARY_COLOR
  }
}

export function notify(type: NotifyType, title: string, content: string) {
  ensureNotificationStyles()
  pushNotificationCenterItem({ type, title, content })

  const logMessage = `[${title}] ${content}`

  if (type === 'error') {
    logger.error(logMessage)
  } else if (type === 'warning') {
    logger.warn(logMessage)
  } else {
    logger.info(logMessage)
  }

  const notification = getNotificationApi().notification
  const progressColor = getProgressColor(type)

  let notificationReactive: { destroy?: () => void } | null = null

  notificationReactive = notification[type]({
    title: () =>
      h('div', {
        class: 'nrm-notification-title',
        style: { cursor: 'pointer' },
        onClick: () => {
          notificationReactive?.destroy?.()
        }
      }, [
        h('div', { class: 'nrm-notification-title__text' }, title)
      ]),
    content: () =>
      h('div', {
        class: 'nrm-notification-content',
        style: { cursor: 'pointer' },
        onClick: () => {
          notificationReactive?.destroy?.()
        }
      }, [
        h('div', { class: 'nrm-notification-content__text' }, content),
        h(
          'div',
          {
            class: [
              'nrm-notification-content__track',
              !isDarkTheme && 'nrm-notification-content__track--light'
            ]
          },
          [
            h('div', {
              class: 'nrm-notification-content__bar',
              style: {
                background: progressColor,
                '--nrm-notification-duration': `${NOTIFICATION_DURATION}ms`
              }
            })
          ]
        )
      ]),
    duration: NOTIFICATION_DURATION
  })
}

export function confirmDialog(title: string, content: string) {
  return new Promise<boolean>((resolve) => {
    const dialog = getNotificationApi().dialog

    dialog.error({
      title,
      content,
      positiveText: '确认',
      negativeText: '取消',
      autoFocus: false,
      onPositiveClick: () => {
        resolve(true)
      },
      onNegativeClick: () => {
        resolve(false)
      },
      onClose: () => {
        resolve(false)
      }
    })
  })
}
