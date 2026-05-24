import { computed, defineComponent, h, reactive, ref, watch } from 'vue'
import { createDiscreteApi, darkTheme } from 'naive-ui'
import { commonThemeOverrides } from '../theme/common'
import { baseDarkThemeOverrides } from '../theme/dark'
import { baseLightThemeOverrides } from '../theme/light'
import { getAppPrimaryColor } from '../theme/primary'
import { createLogger } from '../../../main/util/logger'
import { pushNotificationCenterItem } from './notification-center'

type NotifyType = 'success' | 'error' | 'info' | 'warning'
type NotifyOptions = {
  aggregateKey?: string
  aggregateCount?: number
  replaceExisting?: boolean
}
type DiscreteApiInstance = {
  notification: ReturnType<typeof createDiscreteApi>['notification']
  dialog: ReturnType<typeof createDiscreteApi>['dialog']
}

const NOTIFICATION_DURATION = 7500

let isDarkTheme = true
let notificationStyleInjected = false
let discreteApiCache: DiscreteApiInstance | null = null
let discreteApiThemeKey = ''
const ongoingNotificationMap = new Map<string, { destroy?: () => void }>()
const aggregateNotificationMap = new Map<string, { destroy?: () => void }>()
const aggregateNotificationStateMap = new Map<string, {
  title: string
  content: string
  count: number
  timerVersion: number
}>()
const aggregateNotificationTimerMap = new Map<string, ReturnType<typeof setTimeout>>()
const logger = createLogger('notification')

function disposeAggregateNotification(key: string) {
  const aggregateKey = String(key ?? '').trim()
  if (!aggregateKey) {
    return
  }

  const existingTimer = aggregateNotificationTimerMap.get(aggregateKey)
  if (existingTimer) {
    clearTimeout(existingTimer)
    aggregateNotificationTimerMap.delete(aggregateKey)
  }

  aggregateNotificationMap.get(aggregateKey)?.destroy?.()
  aggregateNotificationMap.delete(aggregateKey)
  aggregateNotificationStateMap.delete(aggregateKey)
}

function scheduleAggregateNotificationDestroy(key: string) {
  const aggregateKey = String(key ?? '').trim()
  if (!aggregateKey) {
    return
  }

  const existingTimer = aggregateNotificationTimerMap.get(aggregateKey)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  aggregateNotificationTimerMap.set(aggregateKey, setTimeout(() => {
    disposeAggregateNotification(aggregateKey)
  }, NOTIFICATION_DURATION))
}

const AggregateNotificationTitle = defineComponent<{
  state: {
    title: string
  }
}>({
  name: 'AggregateNotificationTitle',
  props: ['state'],
  setup(props) {
    return () => h('div', { class: 'nrm-notification-title__text' }, String(props.state?.title ?? ''))
  }
})

const AggregateNotificationContent = defineComponent<{
  state: {
    content: string
    count: number
    timerVersion: number
  }
  progressColor: string
}>({
  name: 'AggregateNotificationContent',
  props: ['state', 'progressColor'],
  setup(props) {
    const renderAggregateText = () => {
      const content = String(props.state?.content ?? '')
      const count = Number(props.state?.count ?? 1)
      const lines = content.split('\n')

      if (count <= 1 || !lines.length) {
        return [h('div', { class: 'nrm-notification-content__text' }, content)]
      }

      const [firstLine, ...restLines] = lines
      const suffix = firstLine.replace(/^累计\s*\d+\s*条相同通知。?/, '').trim()
      const firstLineNode = h('div', { class: 'nrm-notification-content__text' }, [
        h('span', { class: 'nrm-notification-content__aggregate-line' }, [
          h('span', null, '累计 '),
          h(RollingCountNumber, {
            value: count
          }),
          h('span', null, ` 条相同通知${suffix ? suffix : '。'}`)
        ])
      ])

      if (!restLines.length) {
        return [firstLineNode]
      }

      return [
        firstLineNode,
        h('div', { class: 'nrm-notification-content__text' }, restLines.join('\n'))
      ]
    }

    return () => h('div', {
      class: 'nrm-notification-content',
      style: { cursor: 'pointer' }
    }, [
      ...renderAggregateText(),
      h(
        'div',
        {
          key: `track-${Number(props.state?.timerVersion ?? 0)}`,
          class: [
            'nrm-notification-content__track',
            !isDarkTheme && 'nrm-notification-content__track--light'
          ]
        },
        [
          h('div', {
            class: 'nrm-notification-content__bar',
            style: {
              background: String(props.progressColor ?? ''),
              '--nrm-notification-duration': `${NOTIFICATION_DURATION}ms`
            }
          })
        ]
      )
    ])
  }
})

const RollingCountNumber = defineComponent<{
  value: number
}>({
  name: 'RollingCountNumber',
  props: ['value'],
  setup(props) {
    const previousValue = ref(Math.max(0, Math.floor(Number(props.value ?? 0) || 0)))
    const currentValue = ref(Math.max(0, Math.floor(Number(props.value ?? 0) || 0)))
    const animationToken = ref(0)

    watch(() => Number(props.value ?? 0), (nextValue) => {
      const normalizedNext = Math.max(0, Math.floor(Number(nextValue) || 0))
      if (normalizedNext === currentValue.value) {
        return
      }

      previousValue.value = currentValue.value
      currentValue.value = normalizedNext
      animationToken.value += 1
    })

    const digitPairs = computed(() => {
      const previousText = String(previousValue.value)
      const currentText = String(currentValue.value)
      const maxLength = Math.max(previousText.length, currentText.length)
      const normalizedPrevious = previousText.padStart(maxLength, '0')
      const normalizedCurrent = currentText.padStart(maxLength, '0')

      return normalizedCurrent.split('').map((digit, index) => ({
        key: `${index}-${animationToken.value}-${normalizedPrevious[index]}-${digit}`,
        from: normalizedPrevious[index],
        to: digit
      }))
    })

    return () => h('span', {
      class: 'nrm-notification-content__rolling-number',
      'aria-label': String(currentValue.value)
    }, digitPairs.value.map((pair) => h('span', {
      key: pair.key,
      class: 'nrm-notification-content__rolling-digit'
    }, [
      h('span', { class: 'nrm-notification-content__rolling-digit-inner' }, [
        h('span', { class: 'nrm-notification-content__rolling-digit-face' }, pair.from),
        h('span', { class: 'nrm-notification-content__rolling-digit-face' }, pair.to)
      ])
    ])))
  }
})

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
      white-space: pre-line;
    }

    .nrm-notification-content__aggregate-line {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      font-weight: 600;
    }

    .nrm-notification-content__rolling-number {
      display: inline-flex;
      align-items: center;
      gap: 1px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .nrm-notification-content__rolling-digit {
      position: relative;
      display: inline-flex;
      width: 0.72em;
      height: 1em;
      overflow: hidden;
      justify-content: center;
    }

    .nrm-notification-content__rolling-digit-inner {
      display: flex;
      flex-direction: column;
      align-items: center;
      transform: translateY(0);
      animation: nrm-notification-digit-roll 320ms ease-out forwards;
    }

    .nrm-notification-content__rolling-digit-face {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 1em;
      line-height: 1;
    }

    @keyframes nrm-notification-digit-roll {
      from {
        transform: translateY(0);
      }
      to {
        transform: translateY(-1em);
      }
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

  const primaryColor = getAppPrimaryColor(isDarkTheme)
  const common = commonThemeOverrides(primaryColor)
  const dark = baseDarkThemeOverrides(primaryColor)
  const light = baseLightThemeOverrides(primaryColor)

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
      return getAppPrimaryColor(isDarkTheme)
  }
}

export function notify(type: NotifyType, title: string, content: string, options: NotifyOptions = {}) {
  ensureNotificationStyles()
  pushNotificationCenterItem({
    type,
    title,
    content,
    aggregateKey: options.aggregateKey,
    aggregateCount: options.aggregateCount
  })

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
  const aggregateKey = String(options.aggregateKey ?? '').trim()

  if (aggregateKey) {
    const existingState = aggregateNotificationStateMap.get(aggregateKey)
    if (existingState) {
      existingState.title = title
      existingState.content = content
      existingState.count = Number(options.aggregateCount ?? 1)
      existingState.timerVersion += 1
      scheduleAggregateNotificationDestroy(aggregateKey)
      return
    }
  }

  let notificationReactive: { destroy?: () => void } | null = null
  const aggregateState = aggregateKey
    ? reactive({
      title,
      content,
      count: Number(options.aggregateCount ?? 1),
      timerVersion: 0
    })
    : null

  notificationReactive = notification[type]({
    title: () =>
      h('div', {
        class: 'nrm-notification-title',
        style: { cursor: 'pointer' },
        onClick: () => {
          notificationReactive?.destroy?.()
        }
      }, [
        aggregateState
          ? h(AggregateNotificationTitle, { state: aggregateState })
          : h('div', { class: 'nrm-notification-title__text' }, title)
      ]),
    content: () =>
      aggregateState
        ? h('div', {
          onClick: () => {
            notificationReactive?.destroy?.()
          }
        }, [
          h(AggregateNotificationContent, {
            state: aggregateState,
            progressColor
          })
        ])
        : h('div', {
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
    duration: aggregateKey ? 0 : NOTIFICATION_DURATION,
    onClose: () => {
      if (aggregateKey) {
        disposeAggregateNotification(aggregateKey)
      }
    }
  })

  if (aggregateKey) {
    aggregateNotificationMap.set(aggregateKey, notificationReactive)
    aggregateNotificationStateMap.set(aggregateKey, aggregateState!)
    scheduleAggregateNotificationDestroy(aggregateKey)
  }
}

export function showOngoingNotification(id: string, title: string, content: string) {
  ensureNotificationStyles()
  closeOngoingNotification(id)

  const notification = getNotificationApi().notification
  let notificationReactive: { destroy?: () => void } | null = null

  notificationReactive = notification.info({
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
        style: { cursor: 'pointer' }
      }, [
        h('div', { class: 'nrm-notification-content__text' }, content)
      ]),
    duration: 0
  })

  ongoingNotificationMap.set(id, notificationReactive)
}

export function closeOngoingNotification(id: string) {
  const ongoingNotification = ongoingNotificationMap.get(id)
  if (!ongoingNotification) {
    return
  }

  ongoingNotification.destroy?.()
  ongoingNotificationMap.delete(id)
}

export function confirmDialog(title: string, content: string) {
  return new Promise<boolean>((resolve) => {
    const dialog = getNotificationApi().dialog

    dialog.error({
      title,
      content: () =>
        h('div', {
          style: {
            whiteSpace: 'pre-line',
            lineHeight: '1.6'
          }
        }, content),
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
