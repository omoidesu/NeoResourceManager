<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  metaData: {
    type: Object,
    required: true
  },
  basePath: {
    type: String,
    default: ''
  }
})

const versionParts = computed(() => {
  const version = String(props.metaData?.version ?? '1.0.0')
  const [major = '1', minor = '0', patch = '0'] = version.split('.')
  return [major, minor, patch]
})

const handleVersionPartChange = (index: number, value: string) => {
  const normalizedValue = String(value ?? '').replace(/[^\dA-Za-z.-]/g, '').trim()
  const nextParts = [...versionParts.value]
  nextParts[index] = normalizedValue
  props.metaData.version = nextParts.map((item, partIndex) => item || (partIndex === 0 ? '1' : '0')).join('.')
}
</script>

<template>
  <n-form-item label="软件版本">
    <div class="version-field">
      <n-input
        :value="versionParts[0]"
        maxlength="16"
        placeholder="主版本"
        @update:value="(value) => handleVersionPartChange(0, value)"
      />
      <span class="version-field__dot">.</span>
      <n-input
        :value="versionParts[1]"
        maxlength="16"
        placeholder="次版本"
        @update:value="(value) => handleVersionPartChange(1, value)"
      />
      <span class="version-field__dot">.</span>
      <n-input
        :value="versionParts[2]"
        maxlength="16"
        placeholder="修订号"
        @update:value="(value) => handleVersionPartChange(2, value)"
      />
    </div>
  </n-form-item>

  <n-form-item label="命令行参数">
    <n-input
      v-model:value="metaData.commandLineArgs"
      type="textarea"
      :rows="3"
      placeholder="例如：--profile default --lang ja-JP"
    />
  </n-form-item>
</template>

<style scoped>
.version-field {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}

.version-field :deep(.n-input) {
  flex: 1;
  min-width: 0;
}

.version-field__dot {
  flex: 0 0 auto;
  opacity: 0.7;
}
</style>
