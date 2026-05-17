<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue'
import type { HTMLAttributes, StyleValue } from 'vue'

defineOptions({
  inheritAttrs: false
})

const props = withDefaults(defineProps<{
  xScrollable?: boolean
  scrollbarHidden?: boolean
  contentClass?: HTMLAttributes['class']
  contentStyle?: StyleValue
}>(), {
  xScrollable: false,
  scrollbarHidden: false
})

const attrs = useAttrs()
const containerRef = ref<HTMLElement | null>(null)

const passThroughAttrs = computed(() => {
  const { class: _class, style: _style, ...restAttrs } = attrs
  return restAttrs
})

const rootClass = computed<HTMLAttributes['class']>(() => [
  'app-scrollbar',
  props.xScrollable ? 'app-scrollbar--x' : 'app-scrollbar--y',
  props.scrollbarHidden ? 'app-scrollbar--hidden' : '',
  attrs.class as HTMLAttributes['class']
])

const rootStyle = computed<StyleValue>(() => attrs.style as StyleValue)

const contentClassName = computed<HTMLAttributes['class']>(() => [
  'app-scrollbar__content',
  props.xScrollable ? 'app-scrollbar__content--x' : '',
  props.contentClass
])

const scrollTo = (options: ScrollToOptions | number, y?: number): void => {
  const container = containerRef.value
  if (!container) {
    return
  }

  if (typeof options === 'number') {
    container.scrollTo(options, y ?? 0)
    return
  }

  container.scrollTo(options)
}

const scrollBy = (options: ScrollToOptions | number, y?: number): void => {
  const container = containerRef.value
  if (!container) {
    return
  }

  if (typeof options === 'number') {
    container.scrollBy(options, y ?? 0)
    return
  }

  container.scrollBy(options)
}

defineExpose({
  containerRef,
  scrollTo,
  scrollBy
})
</script>

<template>
  <div
    ref="containerRef"
    v-bind="passThroughAttrs"
    :class="rootClass"
    :style="rootStyle"
  >
    <div :class="contentClassName" :style="contentStyle">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.app-scrollbar {
  min-width: 0;
  min-height: 0;
  overscroll-behavior: contain;
  scrollbar-color: rgba(99, 226, 183, 0.46) rgba(255, 255, 255, 0.06);
  scrollbar-width: thin;
}

.app-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.app-scrollbar::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 999px;
}

.app-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(99, 226, 183, 0.42);
  border-radius: 999px;
}

.app-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 226, 183, 0.62);
}

.app-scrollbar--y {
  overflow-x: hidden;
  overflow-y: auto;
}

.app-scrollbar--x {
  overflow-x: auto;
  overflow-y: hidden;
}

.app-scrollbar--hidden {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.app-scrollbar--hidden::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.app-scrollbar__content {
  min-width: 0;
}

.app-scrollbar__content--x {
  width: fit-content;
}
</style>
