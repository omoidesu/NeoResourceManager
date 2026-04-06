<script setup lang="ts">
import { AddOutline, CloseOutline } from '@vicons/ionicons5'
import { computed, h, onMounted, ref, watch } from 'vue'
import { DictType } from '../../../../common/constants'
import { notify } from '../../utils/notification'

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
const emit = defineEmits(['checkEngine', 'fetchGameInfo'])
type AdditionalStoreItem = {
  websiteType: string
  workId: string
  website: string
}

const langOptions = ref<any[]>([])
const engineOptions = ref<any[]>([])
const websiteTypeOptions = ref<any[]>([])
const engineIconModules = import.meta.glob('../../assets/engine-icons/*', {
  eager: true,
  import: 'default'
}) as Record<string, string>
const storeIconModules = import.meta.glob('../../assets/store-icons/*', {
  eager: true,
  import: 'default'
}) as Record<string, string>
const engineIconUrlByName = new Map<string, string>(
  Object.entries(engineIconModules).map(([path, url]) => [path.split('/').pop() ?? path, url])
)
const storeIconUrlByName = new Map<string, string>(
  Object.entries(storeIconModules).map(([path, url]) => [path.split('/').pop() ?? path, url])
)

const resolveAssetIcon = (icon: string, iconMap: Map<string, string>) => {
  if (!icon) {
    return ''
  }

  if (/^(?:https?:|data:|\/)/.test(icon)) {
    return icon
  }

  return iconMap.get(icon) ?? icon
}

const renderWebsiteLabelNode = (icon: string, rawLabel: string) => {
  const iconNode = /^([/.]|https?:|data:)/.test(icon)
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

const engineSelectOptions = computed(() =>
  engineOptions.value.map((option) => {
    const icon = resolveAssetIcon(option.extra?.icon || '', engineIconUrlByName)

    if (!icon) {
      return option
    }

    return {
      ...option,
      rawLabel: option.label,
      icon,
      displayLabel: option.label,
      label: () => renderWebsiteLabelNode(icon, option.label)
    }
  })
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

const websitePrefix = computed(() => {
  const template = renderedWebsiteTemplate.value
  return template ? template.split('{}')[0] ?? '' : ''
})

const websiteSuffix = computed(() => {
  const template = renderedWebsiteTemplate.value
  return template ? template.split('{}')[1] ?? '' : ''
})

const showStructuredWebsite = computed(() => {
  return Boolean(props.metaData?.websiteType && currentWebsiteTemplate.value)
})

const hasGameId = computed(() => {
  return Boolean((props.metaData?.gameId ?? '').trim())
})

const canFetchGameInfo = computed(() => {
  return Boolean(currentWebsiteOption.value?.extra?.enableFetchInfo) && hasGameId.value
})

const hasBasePath = computed(() => {
  return Boolean((props.basePath ?? '').trim())
})

const hasWebsite = computed(() => {
  return Boolean((props.metaData?.website ?? '').trim())
})

const versionParts = computed(() => {
  const version = String(props.metaData?.version ?? '')
  const [major = '1', minor = '0', patch = '0'] = version.split('.')

  return [major, minor, patch]
})

const additionalStores = computed<AdditionalStoreItem[]>(() => {
  if (!Array.isArray(props.metaData.additionalStores)) {
    props.metaData.additionalStores = []
  }

  return props.metaData.additionalStores
})

const getWebsiteOption = (websiteType: string) => {
  return websiteOptionByValue.value.get(String(websiteType ?? '').trim()) ?? null
}

const getDlsiteRule = (gameId: string) => {
  const normalizedGameId = String(gameId ?? '')
  for (const [rule, prefix] of Object.entries(dlsiteStartsWith.value)) {
    if (normalizedGameId.startsWith(prefix)) {
      return rule
    }
  }

  return ''
}

const getWebsiteTemplate = (websiteType: string, gameId: string) => {
  const option = getWebsiteOption(websiteType)
  const template = option?.extra?.url?.games ?? ''

  if (!template) {
    return ''
  }

  const dlsiteValue = websiteTypeValueByLabel.value.get('DLsite')
  if (websiteType === dlsiteValue) {
    return template.replace('{rule}', getDlsiteRule(gameId) || 'maniax')
  }

  return template
}

const getWebsiteParts = (websiteType: string, gameId: string) => {
  const template = getWebsiteTemplate(websiteType, gameId)
  return {
    template,
    prefix: template ? template.split('{}')[0] ?? '' : '',
    suffix: template ? template.split('{}')[1] ?? '' : ''
  }
}

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
  props.metaData.gameId = value

  for (const prefix of Object.values(dlsiteStartsWith.value)) {
    if (value.startsWith(prefix)) {
      props.metaData.websiteType = websiteTypeValueByLabel.value.get('DLsite') ?? ''
      syncWebsiteUrl()
      return
    }
  }

  if (value.startsWith('d_')) {
    props.metaData.websiteType = websiteTypeValueByLabel.value.get('FANZA') ?? ''
    syncWebsiteUrl()
    return
  }

  if (value.startsWith('RA')) {
    props.metaData.websiteType = websiteTypeValueByLabel.value.get('072 Project') ?? ''
    syncWebsiteUrl()
    return
  }

  if (
    props.metaData.websiteType === websiteTypeValueByLabel.value.get('DLsite') ||
    props.metaData.websiteType === websiteTypeValueByLabel.value.get('FANZA') ||
    props.metaData.websiteType === websiteTypeValueByLabel.value.get('072 Project')
  ) {
    props.metaData.websiteType = ''
    props.metaData.website = ''
  }
}

const syncAdditionalStoreWebsite = (item: AdditionalStoreItem) => {
  const { template } = getWebsiteParts(item.websiteType, item.workId)

  if (template) {
    item.website = template.replace('{}', item.workId ?? '')
    return
  }

  if (!item.websiteType) {
    item.website = ''
  }
}

const handleAdditionalStoreGameIdChange = (item: AdditionalStoreItem, value: string) => {
  item.workId = value
  syncAdditionalStoreWebsite(item)
}

const handleAdditionalStoreWebsiteTypeChange = (item: AdditionalStoreItem, value: string | null) => {
  item.websiteType = value ?? ''
  syncAdditionalStoreWebsite(item)
}

const handleAddAdditionalStore = () => {
  additionalStores.value.push({
    websiteType: '',
    workId: '',
    website: ''
  })
}

const handleRemoveAdditionalStore = (index: number) => {
  additionalStores.value.splice(index, 1)
}

const handleWebsiteTypeChange = (value: string | null) => {
  props.metaData.websiteType = value ?? ''
  syncWebsiteUrl()
}

const handleLanguageChange = (value: string | null) => {
  props.metaData.language = value ?? ''
}

const handleEngineChange = (value: string | null) => {
  props.metaData.engine = value ?? ''
}

const handleVersionPartChange = (index: number, value: string) => {
  const sanitizedValue = value.replace(/[^\dA-Za-z]/g, '')
  const nextParts = [...versionParts.value]
  nextParts[index] = sanitizedValue

  props.metaData.version = nextParts.join('.').replace(/\.+$/, '').replace(/^\.*/, '')
}

const handleOpenWebsite = async () => {
  if (!hasWebsite.value) {
    return
  }

  try {
    const message = await window.api.dialog.openExternalUrl(props.metaData.website)
    if (message) {
      notify('error', '访问失败', message)
      return
    }
  } catch (error) {
    notify('error', '访问失败', error instanceof Error ? error.message : '打开网站失败')
  }
}

const handleOpenAdditionalWebsite = async (website: string) => {
  const normalizedWebsite = String(website ?? '').trim()
  if (!normalizedWebsite) {
    return
  }

  try {
    const message = await window.api.dialog.openExternalUrl(normalizedWebsite)
    if (message) {
      notify('error', '访问失败', message)
      return
    }
  } catch (error) {
    notify('error', '访问失败', error instanceof Error ? error.message : '打开网站失败')
  }
}

onMounted(async () => {
  langOptions.value = await window.api.db.getSelectDictData(DictType.LANGUAGE_TYPE)
  engineOptions.value = await window.api.db.getSelectDictData(DictType.GAME_ENGINE_TYPE)
  websiteTypeOptions.value = await window.api.db.getSelectDictData(DictType.GAME_SITE_TYPE)

  handleGameIdChange(props.metaData?.gameId ?? '')
})

watch(
  () => [props.metaData?.gameId ?? '', props.metaData?.websiteType ?? '', renderedWebsiteTemplate.value],
  () => {
    syncWebsiteUrl()
  },
  { immediate: true }
)

watch(
  additionalStores,
  (items) => {
    items.forEach((item) => syncAdditionalStoreWebsite(item))
  },
  { deep: true, immediate: true }
)

</script>

<template>
  <n-form-item label="游戏id">
    <n-input :value="props.metaData.gameId" @update:value="handleGameIdChange" placeholder="请输入作品ID，如 RJ123456" />
  </n-form-item>
  <n-form-item label="昵称">
    <n-input v-model:value="props.metaData.nickname" placeholder="请输入昵称" />
  </n-form-item>
  <n-form-item label="中文名">
    <n-input v-model:value="props.metaData.nameZh" placeholder="请输入中文名" />
  </n-form-item>
  <n-form-item label="日文名">
    <n-input v-model:value="props.metaData.nameJp" placeholder="请输入日文名" />
  </n-form-item>
  <n-form-item label="英文名">
    <n-input v-model:value="props.metaData.nameEn" placeholder="请输入英文名" />
  </n-form-item>
  <n-form-item label="语言">
    <n-select
      :value="props.metaData.language || null"
      :options="langOptions"
      placeholder="请选择语言"
      @update:value="handleLanguageChange"
    />
  </n-form-item>
  <n-form-item label="游戏版本">
    <div class="version-field">
      <n-input
        :value="versionParts[0]"
        maxlength="8"
        placeholder=""
        @update:value="(value) => handleVersionPartChange(0, value)"
      />
      <span class="version-field__dot">.</span>
      <n-input
        :value="versionParts[1]"
        maxlength="8"
        placeholder=""
        @update:value="(value) => handleVersionPartChange(1, value)"
      />
      <span class="version-field__dot">.</span>
      <n-input
        :value="versionParts[2]"
        maxlength="8"
        placeholder=""
        @update:value="(value) => handleVersionPartChange(2, value)"
      />
    </div>
  </n-form-item>
  <n-form-item label="游戏引擎">
    <n-select
      :value="props.metaData.engine || null"
      :options="engineSelectOptions"
      placeholder="请选择游戏引擎"
      @update:value="handleEngineChange"
    />
    <n-button
      @click="emit('checkEngine')"
      quaternary
      type="warning"
      class="check-engine-btn"
      :disabled="!hasBasePath"
    >
      检测游戏引擎
    </n-button>
  </n-form-item>
  <n-form-item label="贩售网站">
    <div class="website-select-row">
      <n-select
        :value="props.metaData.websiteType"
        :options="websiteSelectOptions"
        placeholder="请选择主贩售网站"
        @update:value="handleWebsiteTypeChange"
      />
      <n-button
        quaternary
        type="info"
        class="fetch-game-btn"
        :disabled="!canFetchGameInfo"
        @click="emit('fetchGameInfo')"
      >
        获取游戏信息
      </n-button>
      <n-button quaternary type="primary" class="add-store-btn" @click="handleAddAdditionalStore">
        <template #icon>
          <n-icon :component="AddOutline" />
        </template>
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
        <span class="website-address-group__prefix" :title="websitePrefix">{{ websitePrefix }}</span>
        <n-input
          class="website-address-group__input"
          :value="props.metaData.gameId"
          placeholder="作品ID"
          readonly
        />
        <span v-if="websiteSuffix" class="website-address-group__suffix" :title="websiteSuffix">{{ websiteSuffix }}</span>
      </div>
      <n-button quaternary type="info" :disabled="!hasWebsite" @click="handleOpenWebsite">
        访问网站
      </n-button>
    </div>
  </n-form-item>
  <template v-for="(storeItem, index) in additionalStores" :key="`additional-store-${index}`">
    <n-form-item :label="`附加站点${index + 1}`">
      <div class="additional-store-row">
        <n-select
          :value="storeItem.websiteType || null"
          :options="websiteSelectOptions"
          placeholder="请选择附加贩售网站"
          @update:value="(value) => handleAdditionalStoreWebsiteTypeChange(storeItem, value)"
        />
        <n-input
          :value="storeItem.workId"
          placeholder="请输入附加站点作品ID"
          @update:value="(value) => handleAdditionalStoreGameIdChange(storeItem, value)"
        />
        <n-button quaternary type="error" @click="handleRemoveAdditionalStore(index)">
          <template #icon>
            <n-icon :component="CloseOutline" />
          </template>
        </n-button>
        </div>
      </n-form-item>
    <n-form-item :label="`附加地址${index + 1}`">
      <div class="website-readonly-row">
        <n-input
          v-if="!getWebsiteParts(storeItem.websiteType, storeItem.workId).template"
          v-model:value="storeItem.website"
          placeholder="选择贩售网站后自动生成附加地址"
          readonly
        />
        <div v-else class="website-address-group">
          <span class="website-address-group__prefix" :title="getWebsiteParts(storeItem.websiteType, storeItem.workId).prefix">
            {{ getWebsiteParts(storeItem.websiteType, storeItem.workId).prefix }}
          </span>
          <n-input
            class="website-address-group__input"
            :value="storeItem.workId"
            placeholder="作品ID"
            readonly
          />
          <span
            v-if="getWebsiteParts(storeItem.websiteType, storeItem.workId).suffix"
            class="website-address-group__suffix"
            :title="getWebsiteParts(storeItem.websiteType, storeItem.workId).suffix"
          >
            {{ getWebsiteParts(storeItem.websiteType, storeItem.workId).suffix }}
          </span>
        </div>
        <n-button
          quaternary
          type="info"
          :disabled="!String(storeItem.website ?? '').trim()"
          @click="handleOpenAdditionalWebsite(storeItem.website)"
        >
          访问网站
        </n-button>
      </div>
    </n-form-item>
  </template>
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

.check-engine-btn {
  margin-left: 10px;
}

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

.add-store-btn {
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

.additional-store-row {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 140px) auto;
  gap: 10px;
  align-items: center;
}
</style>
