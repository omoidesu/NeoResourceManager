<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps({
  metaData: {
    type: Object,
    required: true
  },
  actors: {
    type: Array<string>,
    default: () => []
  },
  actorLabel: {
    type: String,
    default: '演员'
  }
})

const emit = defineEmits(['update:metaData', 'update:actors', 'checkEngine', 'fetchGameInfo'])

const updateMetaData = (field: string, value: unknown): void => {
  emit('update:metaData', {
    ...props.metaData,
    [field]: value
  })
}

const year = computed({
  get: () => String(props.metaData?.year ?? ''),
  set: (value: string) => updateMetaData('year', value)
})

const actorInputValue = ref('')

const parseActors = (value: string): string[] => {
  return String(value ?? '')
    .split(/[\/,，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index)
}

const formatActors = (actors: unknown): string => {
  return Array.isArray(actors) ? actors.map((item) => String(item ?? '').trim()).filter(Boolean).join(' / ') : ''
}

const handleActorsInput = (value: string): void => {
  actorInputValue.value = value
  emit('update:actors', parseActors(value))
}

const normalizeActorsInput = (): void => {
  actorInputValue.value = formatActors(parseActors(actorInputValue.value))
}

watch(
  () => props.actors,
  (actors) => {
    const formattedValue = formatActors(actors)
    if (formattedValue !== formatActors(parseActors(actorInputValue.value))) {
      actorInputValue.value = formattedValue
    }
  },
  { immediate: true, deep: true }
)
</script>

<template>
  <n-form-item :label="actorLabel">
    <n-input
      :value="actorInputValue"
      :placeholder="`请输入${actorLabel}，多个可用 / 、 , 分隔`"
      @update:value="handleActorsInput"
      @blur="normalizeActorsInput"
    />
  </n-form-item>

  <n-form-item label="年份">
    <n-input v-model:value="year" placeholder="请输入年份" />
  </n-form-item>
</template>
