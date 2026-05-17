<script setup lang="ts">
import {computed} from 'vue'
import RichTextEditor from '../../../components/RichTextEditor.vue'
import type { ResourceEditorDrawerProps } from '../component-contracts'

const props = withDefaults(defineProps<ResourceEditorDrawerProps>(), {
  categoryName: '',
  categorySettings: () => ({}),
  formData: () => ({}),
  formRules: () => ({}),
  setFormRef: null,
  setBasePathFormItemRef: null,
  modelComponent: null,
  authorSelectOptions: () => [],
  tagSelectOptions: () => [],
  typeSelectOptions: () => [],
  createSelectOption: null,
  coverPreviewSrc: '',
  coverPreviewLabel: ''
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  'open-software-script': []
  'select-base-path': []
  'update:actors': [value: string[]]
  'check-engine': []
  'fetch-game-info': []
  'fetch-website-info': []
  'update:audio-authors': [value: string[]]
  'tags-change': [value: string[]]
  'tag-search': [value: string]
  'tag-input-keydown': [event: KeyboardEvent]
  'tag-input-blur': []
  'types-change': [value: string[]]
  'type-search': [value: string]
  'type-input-keydown': [event: KeyboardEvent]
  'type-input-blur': []
  'choose-custom-cover': []
  'fetch-website-cover': []
  'fetch-album-cover': []
  'use-video-random-frame-cover': []
  'use-screenshot-cover': []
  'choose-cover-from-screenshot-folder': []
  'use-first-cover': []
  'clear-cover': []
  close: []
  'submit-add': []
  'submit-edit': []
  'reset-edit': []
  'restore-default-edit': []
}>()

const showModel = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value)
})

const isEditMode = computed(() => props.mode === 'edit')
const modalTitle = computed(() => `${isEditMode.value ? '修改' : '添加'}${props.categoryName || ''}`)
const modalStyle = computed(() => ({
  width: isEditMode.value ? '680px' : '600px',
  height: '80vh'
}))
const modelKey = computed(() => `${props.modelComponentKey}${isEditMode.value ? '-edit' : ''}`)
const extendTable = computed(() => String(props.categorySettings.extendTable ?? ''))
const resourcePathType = computed(() => String(props.categorySettings.resourcePathType ?? ''))
const isWebsiteCategory = computed(() => extendTable.value === 'website_meta')
const showCoverField = computed(() => extendTable.value !== 'single_image_meta')
const showWebsiteCoverFetchButton = computed(() => isWebsiteCategory.value)
const showScreenshotCoverButton = computed(() => ![
  'software_meta',
  'multi_image_meta',
  'asmr_meta',
  'audio_meta',
  'novel_meta',
  'video_meta',
  'website_meta'
].includes(extendTable.value))
const showScreenshotFolderButton = computed(() => ![
  'software_meta',
  'audio_meta',
  'multi_image_meta',
  'asmr_meta',
  'novel_meta',
  'website_meta'
].includes(extendTable.value))
const showDuplicateResourceHint = computed(() =>
  !isEditMode.value && Boolean(props.duplicateResourceChecking)
)
</script>

<template>
  <n-modal
    v-model:show="showModel"
    preset="card"
    :title="modalTitle"
    content-scrollable
    :style="modalStyle"
  >
    <template #default>
      <AppScrollbar v-if="isEditMode" style="max-height: 100%;">
        <div class="edit-drawer">
          <n-form :ref="setFormRef ?? undefined" :model="formData" label-placement="left" label-width="100" :rules="formRules">
            <n-form-item :label="`${categoryName}名`" path="name">
              <n-input v-model:value="formData.name" :placeholder="`请输入${categoryName}名`" />
            </n-form-item>
            <n-form-item
              v-if="resourcePathType"
              :ref="setBasePathFormItemRef ?? undefined"
              :label="`${categoryName}路径`"
              path="basePath"
            >
              <div class="path-field">
                <n-input
                  v-model:value="formData.basePath"
                  disabled
                  :placeholder="`请选择${categoryName}路径`"
                />
                <div class="path-field__actions">
                  <n-button v-if="isSoftwareCategory" @click="emit('open-software-script')">脚本</n-button>
                  <n-button @click="emit('select-base-path')">
                    选择{{ resourcePathType === 'file' ? '文件' : '目录' }}
                  </n-button>
                </div>
              </div>
              <div v-if="showDuplicateResourceHint" class="path-field__hint">
                <span class="path-field__hint-text">正在检查是否重复...</span>
              </div>
            </n-form-item>
            <n-form-item
              v-if="categorySettings.authorText && isNovelCategory"
              :label="categorySettings.authorText"
              path="author"
            >
              <n-input v-model:value="formData.author" :placeholder="authorInputPlaceholder" />
            </n-form-item>
            <component
              :is="modelComponent"
              v-if="modelComponent"
              :key="modelKey"
              v-model:metaData="formData.meta"
              :actors="formData.actors"
              :base-path="formData.basePath"
              :title="formData.name"
              :fetch-info-loading="fetchResourceInfoLoading"
              :actor-label="actorFilterLabel"
              @update:actors="(value: string[]) => emit('update:actors', value)"
              @check-engine="emit('check-engine')"
              @fetch-game-info="emit('fetch-game-info')"
              @fetch-website-info="emit('fetch-website-info')"
            />
            <n-form-item
              v-if="categorySettings.authorText && !isNovelCategory"
              :label="categorySettings.authorText"
              path="author"
            >
              <n-select
                v-if="isAudioCategory"
                :value="formData.authors"
                multiple
                filterable
                tag
                clearable
                :options="authorSelectOptions"
                :placeholder="authorInputPlaceholder"
                :on-create="createSelectOption ?? undefined"
                @update:value="(value: string[]) => emit('update:audio-authors', value)"
              />
              <n-input v-else v-model:value="formData.author" :placeholder="authorInputPlaceholder" />
            </n-form-item>
            <n-form-item :label="descriptionLabel" path="description">
              <RichTextEditor v-model="formData.description" :placeholder="descriptionPlaceholder" />
            </n-form-item>
            <n-form-item :label="`${categoryName}标签`" path="tags">
              <n-select
                :value="formData.tags"
                multiple
                filterable
                tag
                clearable
                :options="tagSelectOptions"
                :input-props="{
                  onKeydown: (event: KeyboardEvent) => emit('tag-input-keydown', event),
                  onBlur: () => emit('tag-input-blur')
                }"
                placeholder="可选择已有标签，也可输入新标签，按空格、顿号、英文逗号或回车批量添加"
                :on-search="(value: string) => emit('tag-search', value)"
                :on-create="createSelectOption ?? undefined"
                @update:value="(value: string[]) => emit('tags-change', value)"
              />
            </n-form-item>
            <n-form-item v-if="!detailIsAsmr" :label="`${categoryName}分类`" path="types">
              <n-select
                :value="formData.types"
                multiple
                filterable
                tag
                clearable
                :options="typeSelectOptions"
                :input-props="{
                  onKeydown: (event: KeyboardEvent) => emit('type-input-keydown', event),
                  onBlur: () => emit('type-input-blur')
                }"
                placeholder="可选择已有分类，也可输入新分类，按空格、顿号、英文逗号或回车批量添加"
                :on-search="(value: string) => emit('type-search', value)"
                :on-create="createSelectOption ?? undefined"
                @update:value="(value: string[]) => emit('types-change', value)"
              />
            </n-form-item>
            <n-form-item
              v-if="showCoverField"
              label="封面图"
              path="cover"
            >
              <div class="cover-field">
                <div class="cover-preview">
                  <img v-if="coverPreviewSrc" :src="coverPreviewSrc" alt="封面预览" class="cover-preview__image" />
                  <span v-else class="cover-preview__label">{{ coverPreviewLabel }}</span>
                </div>
                <n-space size="small" wrap>
                  <n-button size="small" @click="emit('choose-custom-cover')">选择自定义封面</n-button>
                  <n-button
                    v-if="showWebsiteCoverFetchButton"
                    size="small"
                    @click="emit('fetch-website-cover')"
                  >
                    自动获取页面图片
                  </n-button>
                  <n-button
                    v-if="extendTable === 'audio_meta'"
                    size="small"
                    @click="emit('fetch-album-cover')"
                  >
                    获取专辑封面
                  </n-button>
                  <n-button
                    v-if="extendTable === 'video_meta'"
                    size="small"
                    :loading="videoCoverFrameLoading"
                    :disabled="!hasBasePath || videoCoverFrameLoading"
                    @click="emit('use-video-random-frame-cover')"
                  >
                    使用随机帧
                  </n-button>
                  <n-button
                    v-if="showScreenshotCoverButton"
                    size="small"
                    :disabled="!hasBasePath"
                    @click="emit('use-screenshot-cover')"
                  >
                    使用截图作为封面
                  </n-button>
                  <n-button
                    v-if="showScreenshotFolderButton"
                    size="small"
                    :disabled="!editingResourceId"
                    @click="emit('choose-cover-from-screenshot-folder')"
                  >
                    从截图文件夹选择
                  </n-button>
                  <n-button
                    v-if="extendTable === 'multi_image_meta'"
                    size="small"
                    :disabled="!hasBasePath"
                    @click="emit('use-first-cover')"
                  >
                    选择第一张封面
                  </n-button>
                  <n-button size="small" type="error" quaternary :disabled="!hasCoverPath" @click="emit('clear-cover')">
                    清除封面
                  </n-button>
                </n-space>
              </div>
            </n-form-item>
          </n-form>
        </div>
      </AppScrollbar>

      <n-form v-else :ref="setFormRef ?? undefined" :model="formData" label-placement="left" label-width="100" :rules="formRules">
        <n-form-item :label="`${categoryName}名`" path="name">
          <n-input v-model:value="formData.name" :placeholder="`请输入${categoryName}名`" />
        </n-form-item>
        <n-form-item
          v-if="resourcePathType"
          :ref="setBasePathFormItemRef ?? undefined"
          :label="`${categoryName}路径`"
          path="basePath"
        >
          <div class="path-field">
            <n-input
              v-model:value="formData.basePath"
              disabled
              :placeholder="`请选择${categoryName}路径`"
            />
            <div class="path-field__actions">
              <n-button v-if="isSoftwareCategory" @click="emit('open-software-script')">脚本</n-button>
              <n-button @click="emit('select-base-path')">
                选择{{ resourcePathType === 'file' ? '文件' : '目录' }}
              </n-button>
            </div>
          </div>
          <div v-if="showDuplicateResourceHint" class="path-field__hint">
            <span class="path-field__hint-text">正在检查是否重复...</span>
          </div>
        </n-form-item>
        <n-form-item
          v-if="categorySettings.authorText && isNovelCategory"
          :label="categorySettings.authorText"
          path="author"
        >
          <n-input v-model:value="formData.author" :placeholder="authorInputPlaceholder" />
        </n-form-item>
        <component
          :is="modelComponent"
          v-if="modelComponent"
          :key="modelKey"
          v-model:metaData="formData.meta"
          :actors="formData.actors"
          :base-path="formData.basePath"
          :title="formData.name"
          :fetch-info-loading="fetchResourceInfoLoading"
          :actor-label="actorFilterLabel"
          @update:actors="(value: string[]) => emit('update:actors', value)"
          @check-engine="emit('check-engine')"
          @fetch-game-info="emit('fetch-game-info')"
          @fetch-website-info="emit('fetch-website-info')"
        />
        <n-form-item
          v-if="categorySettings.authorText && !isNovelCategory"
          :label="categorySettings.authorText"
          path="author"
        >
          <n-select
            v-if="isAudioCategory"
            :value="formData.authors"
            multiple
            filterable
            tag
            clearable
            :options="authorSelectOptions"
            :placeholder="authorInputPlaceholder"
            :on-create="createSelectOption ?? undefined"
            @update:value="(value: string[]) => emit('update:audio-authors', value)"
          />
          <n-input v-else v-model:value="formData.author" :placeholder="authorInputPlaceholder" />
        </n-form-item>
        <n-form-item :label="descriptionLabel" path="description">
          <RichTextEditor v-model="formData.description" :placeholder="descriptionPlaceholder" />
        </n-form-item>
        <n-form-item :label="`${categoryName}标签`" path="tags">
          <n-select
            :value="formData.tags"
            multiple
            filterable
            tag
            clearable
            :options="tagSelectOptions"
            :input-props="{
              onKeydown: (event: KeyboardEvent) => emit('tag-input-keydown', event),
              onBlur: () => emit('tag-input-blur')
            }"
            placeholder="可选择已有标签，也可输入新标签，按空格、顿号、英文逗号或回车批量添加"
            :on-search="(value: string) => emit('tag-search', value)"
            :on-create="createSelectOption ?? undefined"
            @update:value="(value: string[]) => emit('tags-change', value)"
          />
        </n-form-item>
        <n-form-item v-if="!detailIsAsmr" :label="`${categoryName}分类`" path="types">
          <n-select
            :value="formData.types"
            multiple
            filterable
            tag
            clearable
            :options="typeSelectOptions"
            :input-props="{
              onKeydown: (event: KeyboardEvent) => emit('type-input-keydown', event),
              onBlur: () => emit('type-input-blur')
            }"
            placeholder="可选择已有分类，也可输入新分类，按空格、顿号、英文逗号或回车批量添加"
            :on-search="(value: string) => emit('type-search', value)"
            :on-create="createSelectOption ?? undefined"
            @update:value="(value: string[]) => emit('types-change', value)"
          />
        </n-form-item>
        <n-form-item
          v-if="showCoverField"
          label="封面图"
          path="cover"
        >
          <div class="cover-field">
            <div class="cover-preview">
              <img v-if="coverPreviewSrc" :src="coverPreviewSrc" alt="封面预览" class="cover-preview__image" />
              <span v-else class="cover-preview__label">{{ coverPreviewLabel }}</span>
            </div>
            <n-space size="small" wrap>
              <n-button size="small" @click="emit('choose-custom-cover')">选择自定义封面</n-button>
              <n-button
                v-if="showWebsiteCoverFetchButton"
                size="small"
                @click="emit('fetch-website-cover')"
              >
                自动获取页面图片
              </n-button>
              <n-button
                v-if="extendTable === 'audio_meta'"
                size="small"
                @click="emit('fetch-album-cover')"
              >
                获取专辑封面
              </n-button>
              <n-button
                v-if="extendTable === 'video_meta'"
                size="small"
                :loading="videoCoverFrameLoading"
                :disabled="!hasBasePath || videoCoverFrameLoading"
                @click="emit('use-video-random-frame-cover')"
              >
                使用随机帧
              </n-button>
              <n-button
                v-if="showScreenshotCoverButton"
                size="small"
                :disabled="!hasBasePath"
                @click="emit('use-screenshot-cover')"
              >
                使用截图作为封面
              </n-button>
              <n-button
                v-if="showScreenshotFolderButton"
                size="small"
                :disabled="!editingResourceId"
                @click="emit('choose-cover-from-screenshot-folder')"
              >
                从截图文件夹选择
              </n-button>
              <n-button
                v-if="extendTable === 'multi_image_meta'"
                size="small"
                :disabled="!hasBasePath"
                @click="emit('use-first-cover')"
              >
                选择第一张封面
              </n-button>
              <n-button size="small" type="error" quaternary :disabled="!hasCoverPath" @click="emit('clear-cover')">
                清除封面
              </n-button>
            </n-space>
          </div>
        </n-form-item>
      </n-form>
    </template>

    <template #footer>
      <div class="modal-footer">
        <template v-if="isEditMode">
          <n-space justify="end">
            <n-button @click="emit('reset-edit')">重置</n-button>
            <n-button @click="emit('restore-default-edit')">恢复默认</n-button>
            <n-button type="primary" @click="emit('submit-edit')">确认</n-button>
          </n-space>
        </template>
        <template v-else>
          <n-button @click="emit('close')">取消</n-button>
          <n-button
            type="primary"
            :disabled="Boolean(props.duplicateResourceChecking || props.duplicateResourceMessage)"
            @click="emit('submit-add')"
          >
            添加
          </n-button>
        </template>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}

.cover-field {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cover-preview {
  min-height: 108px;
  border: 1px dashed rgba(128, 128, 128, 0.32);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  background: rgba(127, 127, 127, 0.06);
  overflow: hidden;
}

.cover-preview__label {
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  opacity: 0.72;
  word-break: break-all;
}

.cover-preview__image {
  width: 100%;
  height: 100%;
  max-height: 180px;
  object-fit: contain;
  display: block;
}

.path-field {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
}

.path-field__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-field__hint {
  margin-top: 8px;
}

.path-field__hint-text {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.52);
}

.edit-drawer {
  padding-right: 4px;
}
</style>
