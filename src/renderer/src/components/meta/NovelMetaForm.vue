<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  metaData: {
    type: Object,
    required: true
  },
  fetchInfoLoading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:metaData', 'fetch-game-info'])

const updateMetaData = (field: string, value: unknown): void => {
  emit('update:metaData', {
    ...props.metaData,
    [field]: value
  })
}

const translator = computed({
  get: () => String(props.metaData?.translator ?? ''),
  set: (value: string) => updateMetaData('translator', value)
})

const isbn = computed({
  get: () => String(props.metaData?.isbn ?? ''),
  set: (value: string) => updateMetaData('isbn', value)
})

const canFetchInfo = computed(() => Boolean(isbn.value.trim()))

const year = computed({
  get: () => {
    const rawValue = props.metaData?.year
    if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
      return null
    }

    const value = Number(rawValue)
    return Number.isFinite(value) ? value : null
  },
  set: (value: number | null) => updateMetaData('year', value)
})

const publisher = computed({
  get: () => String(props.metaData?.publisher ?? ''),
  set: (value: string) => updateMetaData('publisher', value)
})
</script>

<template>
  <n-form-item label="译者">
    <n-input v-model:value="translator" placeholder="请输入译者" />
  </n-form-item>

  <n-form-item label="ISBN">
    <div class="novel-meta-form__row">
      <n-input v-model:value="isbn" placeholder="请输入 ISBN" />
      <n-button
        quaternary
        type="info"
        :loading="props.fetchInfoLoading"
        :disabled="!canFetchInfo || props.fetchInfoLoading"
        @click="emit('fetch-game-info')"
      >
        获取信息
      </n-button>
    </div>
  </n-form-item>

  <n-form-item label="发行年">
    <n-input-number
      v-model:value="year"
      class="novel-meta-form__year"
      :min="0"
      :max="9999"
      :precision="0"
      clearable
      placeholder="请输入发行年份"
    />
  </n-form-item>

  <n-form-item label="出版社">
    <n-input v-model:value="publisher" placeholder="请输入出版社" />
  </n-form-item>
</template>

<style scoped>
.novel-meta-form__year {
  width: 100%;
}

.novel-meta-form__row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
}

.novel-meta-form__row :deep(.n-input) {
  flex: 1;
  min-width: 0;
}
</style>
