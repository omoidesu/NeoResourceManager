import { onBeforeUnmount, watch, type WatchSource } from 'vue'

export const useReaderVisibleWindowEvent = <K extends keyof WindowEventMap>(
  isVisible: WatchSource<boolean>,
  eventName: K,
  listener: (event: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
) => {
  let attached = false

  const add = () => {
    if (attached) {
      return
    }

    window.addEventListener(eventName, listener as EventListener, options)
    attached = true
  }

  const remove = () => {
    if (!attached) {
      return
    }

    window.removeEventListener(eventName, listener as EventListener, options)
    attached = false
  }

  watch(
    isVisible,
    (visible) => {
      if (visible) {
        add()
        return
      }

      remove()
    },
    { immediate: true }
  )

  onBeforeUnmount(remove)

  return {
    add,
    remove
  }
}
