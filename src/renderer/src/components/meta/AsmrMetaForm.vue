<script setup lang="ts">
import { computed, h, onMounted, watch, ref } from 'vue'
import { DictType } from '../../../../common/constants'

const props = defineProps({
  metaData: {
    type: Object,
    required: true
  },
  actors: {
    type: Array,
    default: () => []
  },
  basePath: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['fetchGameInfo', 'update:actors'])

const langOptions = ref<any[]>([])
const websiteTypeOptions = ref<any[]>([])
const storeIconModules = import.meta.glob('../../assets/store-icons/*', {
  eager: true,
  import: 'default'
}) as Record<string, string>
const storeIconUrlByName = new Map<string, string>(
  Object.entries(storeIconModules).map(([path, url]) => [path.split('/').pop() ?? path, url])
)

const resolveAssetIcon = (icon: string, iconMap: Map<string, string>) => {
  if (!icon) {
    return ''
  }

  if (/^(?:https?:|data:|file:|\/|[a-zA-Z]:[\\/])/.test(icon)) {
    return icon
  }

  return iconMap.get(icon) ?? icon
}

const renderWebsiteLabelNode = (icon: string, rawLabel: string) => {
  const iconNode = /^(?:[/.]|https?:|data:|file:|[a-zA-Z]:[\\/])/.test(icon)
    ? h('span', {
        class: 'website-option__icon-shell',
        style: {
          width: '18px',
          height: '18px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 18px',
          overflow: 'hidden'
        }
      }, [
        h('img', {
          class: 'website-option__icon-image',
          src: icon,
          alt: rawLabel,
          style: {
            width: '16px',
            height: '16px',
            maxWidth: '16px',
            maxHeight: '16px',
            objectFit: 'contain',
            display: 'block',
            flexShrink: 0
          }
        })
      ])
    : h('span', {
        class: 'website-option__icon',
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '18px',
          flex: '0 0 18px'
        }
      }, icon || rawLabel)

  return h(
    'div',
    {
      class: 'website-option',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%'
      }
    },
    [
      iconNode,
      h('span', {
        class: 'website-option__label',
        style: {
          display: 'inline-block',
          lineHeight: '18px',
          whiteSpace: 'nowrap'
        }
      }, rawLabel)
    ]
  )
}

const websiteSelectOptions = computed(() =>
  websiteTypeOptions.value.map((option) => ({
    ...option,
    rawLabel: option.label,
    icon: resolveAssetIcon(option.extra?.icon || '', storeIconUrlByName),
    displayLabel: option.label,
    label: () => renderWebsiteLabelNode(resolveAssetIcon(option.extra?.icon || '', storeIconUrlByName), option.label)
  }))
)

const websiteTypeValueByLabel = computed(() => {
  return new Map<string, string>(websiteTypeOptions.value.map((option) => [option.label, option.value]))
})

const websiteOptionByValue = computed(() => {
  return new Map<string, any>(websiteTypeOptions.value.map((option) => [option.value, option]))
})

const dlsiteStartsWith = computed<Record<string, string>>(() => {
  const dlsiteOption = websiteTypeOptions.value.find((option) => option.label === 'DLsite')
  return dlsiteOption?.extra?.rule?.startsWith ?? {}
})

const currentWebsiteOption = computed(() => {
  return websiteOptionByValue.value.get(props.metaData?.websiteType ?? '') ?? null
})

const currentWebsiteTemplate = computed(() => {
  return currentWebsiteOption.value?.extra?.url?.games ?? ''
})

const matchedDlsiteRule = computed(() => {
  const gameId = props.metaData?.gameId ?? ''

  for (const [rule, prefix] of Object.entries(dlsiteStartsWith.value)) {
    if (gameId.startsWith(prefix)) {
      return rule
    }
  }

  return ''
})

const renderedWebsiteTemplate = computed(() => {
  const template = currentWebsiteTemplate.value
  if (!template) {
    return ''
  }

  const dlsiteValue = websiteTypeValueByLabel.value.get('DLsite')
  if (props.metaData?.websiteType === dlsiteValue) {
    return template.replace('{rule}', matchedDlsiteRule.value || 'maniax')
  }

  return template
})

const showStructuredWebsite = computed(() => {
  return Boolean(props.metaData?.websiteType && currentWebsiteTemplate.value)
})

const canFetchAsmrInfo = computed(() => {
  return Boolean(currentWebsiteOption.value?.extra?.enableFetchInfo) && Boolean(String(props.metaData?.gameId ?? '').trim())
})

const actorInputValue = computed({
  get: () => Array.isArray(props.actors) ? props.actors.join(' / ') : '',
  set: (value: string) => {
    const actors = String(value ?? '')
      .split(/[\/,、，]/)
      .map((item) => item.trim())
      .filter(Boolean)

    emit('update:actors', Array.from(new Set(actors)))
  }
})

const syncWebsiteUrl = () => {
  if (showStructuredWebsite.value) {
    props.metaData.website = renderedWebsiteTemplate.value.replace('{}', props.metaData?.gameId ?? '')
    return
  }

  if (!props.metaData?.websiteType) {
    props.metaData.website = ''
  }
}

const handleGameIdChange = (value: string) => {
  const normalizedValue = String(value ?? '').trim().toUpperCase()
  props.metaData.gameId = normalizedValue

  for (const prefix of Object.values(dlsiteStartsWith.value)) {
    if (normalizedValue.startsWith(prefix)) {
      props.metaData.websiteType = websiteTypeValueByLabel.value.get('DLsite') ?? ''
      syncWebsiteUrl()
      return
    }
  }

  if (props.metaData.websiteType === websiteTypeValueByLabel.value.get('DLsite')) {
    props.metaData.websiteType = ''
    props.metaData.website = ''
  }
}

const handleWebsiteTypeChange = (value: string | null) => {
  props.metaData.websiteType = value ?? ''
  syncWebsiteUrl()
}

const handleOpenWebsite = async () => {
  const website = String(props.metaData?.website ?? '').trim()
  if (!website) {
    return
  }

  await window.api.dialog.openExternalUrl(website)
}

onMounted(async () => {
  langOptions.value = await window.api.db.getSelectDictData(DictType.LANGUAGE_TYPE)
  websiteTypeOptions.value = await window.api.db.getSelectDictData(DictType.ASMR_SITE_TYPE)

  handleGameIdChange(props.metaData?.gameId ?? '')
})

watch(
  () => [props.metaData?.gameId ?? '', props.metaData?.websiteType ?? '', renderedWebsiteTemplate.value],
  () => {
    syncWebsiteUrl()
  },
  { immediate: true }
)
</script>

<template>
  <n-form-item label="音声ID">
    <n-input :value="props.metaData.gameId" @update:value="handleGameIdChange" placeholder="请输入作品ID，如 RJ123456" />
  </n-form-item>
  <n-form-item label="CV">
    <n-input v-model:value="actorInputValue" placeholder="请输入 CV / 声优，多个可用 / 、 , 分隔" />
  </n-form-item>
  <n-form-item label="脚本">
    <n-input v-model:value="props.metaData.scenario" placeholder="请输入脚本作者" />
  </n-form-item>
  <n-form-item label="画师">
    <n-input v-model:value="props.metaData.illust" placeholder="请输入画师" />
  </n-form-item>
  <n-form-item label="语言">
    <n-select
      :value="props.metaData.language || null"
      :options="langOptions"
      placeholder="请选择语言"
      @update:value="(value) => { props.metaData.language = value ?? '' }"
    />
  </n-form-item>
  <n-form-item label="贩售网站">
    <div class="website-select-row">
      <n-select
        :value="props.metaData.websiteType"
        :options="websiteSelectOptions"
        placeholder="请选择主贩售网站"
        @update:value="handleWebsiteTypeChange"
      />
      <n-button quaternary type="info" class="fetch-game-btn" :disabled="!canFetchAsmrInfo" @click="emit('fetchGameInfo')">
        获取音声信息
      </n-button>
    </div>
  </n-form-item>
  <n-form-item label="网站地址">
    <div class="website-readonly-row">
      <n-input
        v-if="!showStructuredWebsite"
        v-model:value="props.metaData.website"
        placeholder="选择贩售网站后自动生成地址"
        readonly
      />
      <div v-else class="website-address-group">
        <span class="website-address-group__prefix" :title="renderedWebsiteTemplate.split('{}')[0] ?? ''">
          {{ renderedWebsiteTemplate.split('{}')[0] ?? '' }}
        </span>
        <n-input class="website-address-group__input" :value="props.metaData.gameId" placeholder="作品ID" readonly />
        <span
          v-if="renderedWebsiteTemplate.split('{}')[1] ?? ''"
          class="website-address-group__suffix"
          :title="renderedWebsiteTemplate.split('{}')[1] ?? ''"
        >
          {{ renderedWebsiteTemplate.split('{}')[1] ?? '' }}
        </span>
      </div>
      <n-button quaternary type="info" :disabled="!String(props.metaData.website ?? '').trim()" @click="handleOpenWebsite">
        访问网站
      </n-button>
    </div>
  </n-form-item>
</template>

<style scoped>
.website-select-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
}

.website-select-row :deep(.n-select) {
  flex: 1;
  min-width: 0;
}

.fetch-game-btn {
  flex: 0 0 auto;
}

.website-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.website-option__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
}

.website-option__icon-shell {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 18px;
  overflow: hidden;
}

.website-option__icon-image {
  width: 16px;
  height: 16px;
  object-fit: contain;
  display: inline-block;
}

.website-readonly-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
}

.website-readonly-row > :first-child {
  flex: 1;
  min-width: 0;
}

.website-address-group {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}

.website-address-group__prefix,
.website-address-group__suffix {
  color: var(--n-text-color);
  opacity: 0.75;
  line-height: 34px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.website-address-group__prefix {
  flex: 1 1 auto;
  min-width: 0;
}

.website-address-group__input {
  flex: 0 0 120px;
  min-width: 120px;
}

.website-address-group__suffix {
  flex: 0 0 auto;
}
</style>
