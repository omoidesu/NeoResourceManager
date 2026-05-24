<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PropType } from 'vue'
import BackgroundProgressToast from '../../../components/BackgroundProgressToast.vue'

const props = defineProps({
  showLoading: {
    type: Boolean,
    required: true
  },
  showProgressToast: {
    type: Boolean,
    required: true
  },
  showPreview: {
    type: Boolean,
    required: true
  },
  batchProgressRunning: {
    type: Boolean,
    required: true
  },
  batchProgressStage: {
    type: String as PropType<'analyze' | 'import'>,
    required: true
  },
  batchAnalyzePercent: {
    type: Number,
    required: true
  },
  batchAnalyzeTotal: {
    type: Number,
    required: true
  },
  batchAnalyzeDisplayIndex: {
    type: Number,
    required: true
  },
  batchImportResourceLabel: {
    type: String,
    required: true
  },
  batchAnalyzeMessage: {
    type: String,
    required: true
  },
  currentDirectoryName: {
    type: String,
    required: true
  },
  selectedBatchImportCount: {
    type: Number,
    required: true
  },
  selectableBatchImportCount: {
    type: Number,
    required: true
  },
  batchImportItems: {
    type: Array as PropType<any[]>,
    required: true
  },
  isBatchImportSubmitting: {
    type: Boolean,
    required: true
  },
  batchImportFetchInfoEnabled: {
    type: Boolean,
    required: true
  },
  detailIsManga: {
    type: Boolean,
    required: true
  },
  detailIsAsmr: {
    type: Boolean,
    required: true
  },
  detailIsWebsite: {
    type: Boolean,
    required: true
  },
  showBatchImportButton: {
    type: Boolean,
    required: true
  },
  websiteTypeSelectOptions: {
    type: Array as PropType<any[]>,
    required: true
  },
  canToggleBatchImportItem: {
    type: Function as PropType<(item: any) => boolean>,
    required: true
  },
  isBatchImportItemImportable: {
    type: Function as PropType<(item: any) => boolean>,
    required: true
  },
  onUpdateShowLoading: {
    type: Function as PropType<(value: boolean) => void>,
    required: true
  },
  onUpdateShowPreview: {
    type: Function as PropType<(value: boolean) => void>,
    required: true
  },
  onAfterLeavePreview: {
    type: Function as PropType<() => void>,
    required: true
  },
  onMaskClick: {
    type: Function as PropType<() => void>,
    required: true
  },
  onRunInBackground: {
    type: Function as PropType<() => void>,
    required: true
  },
  onStopAnalysis: {
    type: Function as PropType<() => void>,
    required: true
  },
  onReopenProgress: {
    type: Function as PropType<() => void>,
    required: true
  },
  onDismissProgressToast: {
    type: Function as PropType<() => void>,
    required: true
  },
  onSelectAll: {
    type: Function as PropType<() => void>,
    required: true
  },
  onDeselectAll: {
    type: Function as PropType<() => void>,
    required: true
  },
  onInvert: {
    type: Function as PropType<() => void>,
    required: true
  },
  onToggleItem: {
    type: Function as PropType<(index: number) => void>,
    required: true
  },
  onSetItemChecked: {
    type: Function as PropType<(index: number, value: boolean) => void>,
    required: true
  },
  onSetItemWebsiteType: {
    type: Function as PropType<(index: number, value: string) => void>,
    required: true
  },
  onSetItemGameId: {
    type: Function as PropType<(index: number, value: string) => void>,
    required: true
  },
  onSelectLaunchFile: {
    type: Function as PropType<(index: number) => void>,
    required: true
  },
  onConfirmImport: {
    type: Function as PropType<() => void>,
    required: true
  },
  onClosePreview: {
    type: Function as PropType<() => void>,
    required: true
  },
  onUpdateFetchInfoEnabled: {
    type: Function as PropType<(value: boolean) => void>,
    required: true
  }
})

const batchImportSearchKeyword = ref('')

const normalizedBatchImportSearchKeyword = computed(() =>
  batchImportSearchKeyword.value.trim().toLowerCase()
)

const getBatchImportItemSearchText = (item: any) => [
  item?.title,
  item?.url,
  item?.folder,
  item?.source,
  item?.directoryName,
  item?.directoryPath,
  item?.launchFilePath,
  item?.launchFileName,
  item?.websiteType,
  item?.gameId,
  item?.importResultMessage,
  item?.errorMessage
].map((value) => String(value ?? '').toLowerCase()).join('\n')

const filteredBatchImportEntries = computed(() => {
  const keyword = normalizedBatchImportSearchKeyword.value
  return props.batchImportItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !keyword || getBatchImportItemSearchText(item).includes(keyword))
})

const hasBatchImportSearchKeyword = computed(() => Boolean(normalizedBatchImportSearchKeyword.value))

const visibleSelectableBatchImportCount = computed(() =>
  filteredBatchImportEntries.value.filter(({ item }) =>
    !item?.exists && !item?.errorMessage && props.isBatchImportItemImportable(item)
  ).length
)

const handleSelectAllVisible = () => {
  if (!hasBatchImportSearchKeyword.value) {
    props.onSelectAll()
    return
  }

  filteredBatchImportEntries.value.forEach(({ item, index }) => {
    props.onSetItemChecked(index, !item?.exists && !item?.errorMessage && props.isBatchImportItemImportable(item))
  })
}

const handleDeselectAllVisible = () => {
  if (!hasBatchImportSearchKeyword.value) {
    props.onDeselectAll()
    return
  }

  filteredBatchImportEntries.value.forEach(({ index }) => {
    props.onSetItemChecked(index, false)
  })
}

const handleInvertVisible = () => {
  if (!hasBatchImportSearchKeyword.value) {
    props.onInvert()
    return
  }

  filteredBatchImportEntries.value.forEach(({ item, index }) => {
    props.onSetItemChecked(
      index,
      !item?.exists && !item?.errorMessage && props.isBatchImportItemImportable(item)
        ? !item.checked
        : false
    )
  })
}

watch(
  () => props.showPreview,
  (showPreview) => {
    if (!showPreview) {
      batchImportSearchKeyword.value = ''
    }
  }
)
</script>

<template>
  <n-modal
    :show="showLoading"
    preset="card"
    title="批量导入"
    :mask-closable="batchProgressRunning"
    :closable="false"
    :auto-focus="false"
    @update:show="onUpdateShowLoading"
    @mask-click="onMaskClick"
    :style="{ width: '520px' }"
  >
    <div class="batch-import-loading">
      <div class="batch-import-loading__progress">
        <n-progress
          type="circle"
          status="info"
          :stroke-width="10"
          :percentage="batchAnalyzePercent"
          :show-indicator="false"
          class="batch-import-loading__inner-progress"
        />
        <div class="batch-import-loading__progress-center">
          <div class="batch-import-loading__progress-text">{{ batchAnalyzePercent }}%</div>
        </div>
      </div>
      <div class="batch-import-loading__title">
        <template v-if="batchProgressRunning && batchAnalyzeTotal > 0">
          <span class="batch-import-loading__title-text">
            {{ batchProgressStage === 'import'
              ? `正在导入第 ${batchAnalyzeDisplayIndex} / ${batchAnalyzeTotal} 个${batchImportResourceLabel}`
              : `正在分析第 ${batchAnalyzeDisplayIndex} / ${batchAnalyzeTotal} 个${detailIsWebsite ? '书签' : '目录'}` }}
          </span>
          <span class="batch-import-loading__title-directory" :title="currentDirectoryName">
            {{ currentDirectoryName }}
          </span>
        </template>
        <template v-else>
          {{ batchAnalyzeMessage || '正在准备批量导入，请稍候...' }}
        </template>
      </div>
    </div>
    <template #footer>
      <div class="modal-footer">
        <n-space justify="end">
          <n-button type="warning" @click="batchProgressStage === 'import' ? onRunInBackground() : onStopAnalysis()">
            {{ batchProgressStage === 'import' ? '后台运行' : '停止分析' }}
          </n-button>
        </n-space>
      </div>
    </template>
  </n-modal>

  <BackgroundProgressToast
    :show="showProgressToast"
    :progress="batchAnalyzePercent"
    :title="batchProgressStage === 'import' ? `正在后台导入${batchImportResourceLabel}` : `正在后台分析${batchImportResourceLabel}${detailIsWebsite ? '书签' : '目录'}`"
    :subtitle-lines="[
      batchProgressStage === 'import'
        ? `第 ${batchAnalyzeDisplayIndex} / ${batchAnalyzeTotal} 个${batchImportResourceLabel}`
        : `第 ${batchAnalyzeDisplayIndex} / ${batchAnalyzeTotal} 个${detailIsWebsite ? '书签' : '目录'}`,
      currentDirectoryName
    ]"
    clickable
    @click="onReopenProgress"
    @close="onDismissProgressToast"
  />

  <n-modal
    :show="showPreview"
    @update:show="onUpdateShowPreview"
    @after-leave="onAfterLeavePreview"
    preset="card"
    title="批量导入预览"
    closable
    :mask-closable="false"
    content-scrollable
    :style="{ width: '860px', height: '80vh' }"
  >
    <template #default>
      <div class="batch-import-modal">
        <div class="batch-import-modal__toolbar">
          <div class="batch-import-modal__toolbar-main">
            <n-input
              v-model:value="batchImportSearchKeyword"
              clearable
              size="small"
              placeholder="搜索标题、地址、文件夹或来源"
              class="batch-import-modal__search"
            />
            <n-space>
              <n-button size="small" @click="handleSelectAllVisible">全选</n-button>
              <n-button size="small" @click="handleDeselectAllVisible">取消全选</n-button>
              <n-button size="small" @click="handleInvertVisible">反选</n-button>
            </n-space>
          </div>
          <div class="batch-import-modal__summary">
            已选择 {{ selectedBatchImportCount }} / {{ selectableBatchImportCount }} 个可导入{{ detailIsWebsite ? '网站' : '目录' }}
            <template v-if="hasBatchImportSearchKeyword">
              · 筛选 {{ visibleSelectableBatchImportCount }} / {{ filteredBatchImportEntries.length }}
            </template>
          </div>
        </div>
        <AppScrollbar class="batch-import-modal__scrollbar">
          <div class="batch-import-modal__list">
            <div
              v-for="{ item, index } in filteredBatchImportEntries"
              :key="item.url || item.directoryPath"
              class="batch-import-item"
              :class="{
                'batch-import-item--clickable': canToggleBatchImportItem(item),
                'batch-import-item--checked': item.checked
              }"
              @click="onToggleItem(index)"
            >
              <div class="batch-import-item__row">
                <n-checkbox
                  :checked="item.checked"
                  :disabled="item.exists || !!item.errorMessage || !isBatchImportItemImportable(item)"
                  @click.stop
                  @update:checked="(value: boolean) => onSetItemChecked(index, value)"
                />
                <div class="batch-import-item__main">
                  <div class="batch-import-item__title">
                    {{ detailIsWebsite ? (item.title || item.url) : (item.directoryName || item.directoryPath) }}
                  </div>
                  <div class="batch-import-item__path">
                    {{ detailIsWebsite ? item.url : item.directoryPath }}
                  </div>
                </div>
                <n-space align="center" size="small">
                  <n-tag v-if="item.exists" type="warning" size="small">已存在</n-tag>
                  <n-tag v-else-if="item.errorMessage" type="error" size="small">分析失败</n-tag>
                  <n-tag
                    v-if="item.importResultType && item.importResultMessage"
                    :type="item.importResultType === 'success' ? 'success' : item.importResultType === 'error' ? 'error' : 'warning'"
                    size="small"
                  >
                    {{ item.importResultType === 'success' ? '已导入' : item.importResultType === 'error' ? '导入失败' : '已跳过' }}
                  </n-tag>
                  <n-button v-if="!detailIsManga && !detailIsAsmr && !detailIsWebsite" size="small" @click.stop="onSelectLaunchFile(index)">
                    手动选择
                  </n-button>
                </n-space>
              </div>
              <div class="batch-import-item__detail">
                <div class="batch-import-item__label">{{ detailIsWebsite ? '网站地址' : (detailIsManga ? '漫画图片' : (detailIsAsmr ? '音频文件' : '启动文件')) }}</div>
                <div v-if="detailIsWebsite" class="batch-import-item__value">
                  {{ item.folder ? `${item.folder} · ${item.source || '书签'}` : (item.source || '书签') }}
                </div>
                <div v-else-if="detailIsManga" class="batch-import-item__value">
                  {{ item.imageCount ? `共 ${item.imageCount} 张图片` : '目录中未找到可用图片' }}
                </div>
                <div v-else-if="detailIsAsmr" class="batch-import-item__value">
                  {{ item.audioCount ? `共 ${item.audioCount} 个音频文件` : '目录中未找到可用音频文件' }}
                </div>
                <div v-else-if="item.launchFilePath" class="batch-import-item__value">
                  <img
                    v-if="item.launchFileIcon"
                    :src="item.launchFileIcon"
                    alt="启动文件图标"
                    class="batch-import-item__file-icon"
                  />
                  {{ item.launchFilePath }}
                </div>
                <div v-else class="batch-import-item__value batch-import-item__value--error">
                  {{ item.errorMessage || (detailIsAsmr ? '目录中未找到可用音频文件' : '未分析出可用启动文件，请手动选择') }}
                </div>
                <div v-if="showBatchImportButton && !detailIsManga && !detailIsWebsite" class="batch-import-item__fields">
                  <div class="batch-import-item__field">
                    <div class="batch-import-item__label">贩售网站</div>
                    <n-select
                      :value="item.websiteType"
                      :options="websiteTypeSelectOptions"
                      clearable
                      placeholder="请选择贩售网站"
                      @click.stop
                      @update:value="(value) => onSetItemWebsiteType(index, String(value ?? ''))"
                    />
                  </div>
                  <div class="batch-import-item__field">
                    <div class="batch-import-item__label">作品 ID</div>
                    <n-input
                      :value="item.gameId"
                      placeholder="请输入作品ID"
                      @click.stop
                      @update:value="(value) => onSetItemGameId(index, value)"
                    />
                  </div>
                </div>
                <div
                  v-if="item.importResultMessage"
                  class="batch-import-item__result"
                  :class="{
                    'batch-import-item__result--success': item.importResultType === 'success',
                    'batch-import-item__result--error': item.importResultType === 'error'
                  }"
                >
                  {{ item.importResultMessage }}
                </div>
              </div>
            </div>
            <n-empty
              v-if="!filteredBatchImportEntries.length"
              description="没有匹配的导入项"
              class="batch-import-modal__empty"
            />
          </div>
        </AppScrollbar>
      </div>
    </template>
    <template #footer>
      <div class="modal-footer">
        <div class="modal-footer__split">
          <n-checkbox
            :checked="batchImportFetchInfoEnabled"
            @update:checked="(value: boolean) => onUpdateFetchInfoEnabled(value)"
          >
            {{ detailIsWebsite ? '导入后后台获取网站图标和封面' : '通过插件获取作品信息' }}
          </n-checkbox>
          <n-space justify="end">
            <n-button @click="onClosePreview">退出</n-button>
            <n-button type="primary" :loading="isBatchImportSubmitting" @click="onConfirmImport">
              确认导入
            </n-button>
          </n-space>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.batch-import-loading {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 4px 4px;
  align-items: center;
}

.batch-import-loading__title {
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  line-height: 1.7;
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.batch-import-loading__title-text {
  display: block;
}

.batch-import-loading__title-directory {
  display: block;
  width: 100%;
  max-width: 420px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.batch-import-loading__progress {
  position: relative;
  width: 128px;
  height: 128px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.batch-import-loading__progress::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 6px solid rgba(255, 255, 255, 0.08);
  border-top-color: rgba(99, 226, 183, 0.55);
  border-right-color: rgba(99, 226, 183, 0.18);
  box-sizing: border-box;
  animation: batch-import-spin 1.25s linear infinite;
}

.batch-import-loading__inner-progress {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 92px;
  height: 92px;
  transform: translate(-50%, -50%);
}

.batch-import-loading__inner-progress :deep(.n-progress) {
  width: 92px !important;
  height: 92px !important;
}

.batch-import-loading__inner-progress :deep(.n-progress-graph) {
  width: 100% !important;
  height: 100% !important;
}

.batch-import-loading__progress-center {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 92px;
  height: 92px;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.batch-import-loading__progress-text {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}

@keyframes batch-import-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.batch-import-modal {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
}

.batch-import-modal__toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 8px;
  background: rgb(36, 36, 36);
}

.batch-import-modal__toolbar-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 1 520px;
  min-width: 0;
}

.batch-import-modal__search {
  width: 280px;
  flex: 1 1 280px;
  max-width: 360px;
}

.batch-import-modal__summary {
  font-size: 12px;
  opacity: 0.72;
}

.batch-import-modal__scrollbar {
  height: 100%;
  min-height: 0;
}

.batch-import-modal__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 8px;
}

.batch-import-modal__empty {
  padding: 48px 0;
}

.batch-import-item {
  padding: 14px 16px;
  border: 1px solid rgba(128, 128, 128, 0.16);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.batch-import-item--clickable {
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease, transform 0.18s ease;
}

.batch-import-item--clickable:hover {
  border-color: rgba(99, 226, 183, 0.28);
  background: rgba(99, 226, 183, 0.04);
}

.batch-import-item--checked {
  border-color: rgba(99, 226, 183, 0.45);
  background: rgba(99, 226, 183, 0.06);
}

.batch-import-item__row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.batch-import-item__main {
  flex: 1;
  min-width: 0;
}

.batch-import-item__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}

.batch-import-item__path,
.batch-import-item__value {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.74;
  word-break: break-all;
}

.batch-import-item__value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.batch-import-item__file-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex: 0 0 auto;
}

.batch-import-item__detail {
  margin-left: 34px;
  margin-top: 10px;
}

.batch-import-item__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.batch-import-item__field {
  min-width: 0;
}

.batch-import-item__label {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.78;
}

.batch-import-item__value--error {
  color: #e88080;
}

.batch-import-item__result {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.78;
  word-break: break-word;
}

.batch-import-item__result--success {
  color: #63e2b7;
}

.batch-import-item__result--error {
  color: #e88080;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}

.modal-footer__split {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
</style>
