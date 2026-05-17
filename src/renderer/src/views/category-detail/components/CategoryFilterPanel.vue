<script setup lang="ts">
import {computed} from 'vue'
import {FunnelOutline} from '@vicons/ionicons5'
import type { CategoryFilterPanelProps } from '../component-contracts'

const props = withDefaults(defineProps<CategoryFilterPanelProps>(), {
  filterSectionsStyle: () => ({}),
  categorySettings: () => ({}),
  filteredAuthorList: () => [],
  selectedAuthorList: () => [],
  filteredActorList: () => [],
  selectedActorList: () => [],
  filteredAlbumList: () => [],
  selectedAlbumList: () => [],
  filteredTagList: () => [],
  selectedTagList: () => [],
  filteredTypeList: () => [],
  selectedTypeList: () => [],
  filteredEngineList: () => [],
  selectedEngineList: () => []
})

const emit = defineEmits<{
  'update:missingFile': [value: boolean]
  'update:favoriteOnly': [value: boolean]
  'update:completedOnly': [value: boolean]
  'update:runningOnly': [value: boolean]
  'update:authorSearch': [value: string]
  'update:selectedAuthorList': [value: string[]]
  'update:actorSearch': [value: string]
  'update:selectedActorList': [value: string[]]
  'update:albumSearch': [value: string]
  'update:selectedAlbumList': [value: string[]]
  'update:tagSearch': [value: string]
  'update:selectedTagList': [value: string[]]
  'update:typeSearch': [value: string]
  'update:selectedTypeList': [value: string[]]
  'update:selectedEngineList': [value: string[]]
  'reset-selected': []
}>()

const missingFileModel = computed({
  get: () => props.missingFile,
  set: (value: boolean) => emit('update:missingFile', value)
})

const favoriteOnlyModel = computed({
  get: () => props.favoriteOnly,
  set: (value: boolean) => emit('update:favoriteOnly', value)
})

const completedOnlyModel = computed({
  get: () => props.completedOnly,
  set: (value: boolean) => emit('update:completedOnly', value)
})

const runningOnlyModel = computed({
  get: () => props.runningOnly,
  set: (value: boolean) => emit('update:runningOnly', value)
})

const authorSearchModel = computed({
  get: () => props.authorSearch,
  set: (value: string) => emit('update:authorSearch', value)
})

const selectedAuthorListModel = computed({
  get: () => props.selectedAuthorList,
  set: (value: string[]) => emit('update:selectedAuthorList', value)
})

const actorSearchModel = computed({
  get: () => props.actorSearch,
  set: (value: string) => emit('update:actorSearch', value)
})

const selectedActorListModel = computed({
  get: () => props.selectedActorList,
  set: (value: string[]) => emit('update:selectedActorList', value)
})

const albumSearchModel = computed({
  get: () => props.albumSearch,
  set: (value: string) => emit('update:albumSearch', value)
})

const selectedAlbumListModel = computed({
  get: () => props.selectedAlbumList,
  set: (value: string[]) => emit('update:selectedAlbumList', value)
})

const tagSearchModel = computed({
  get: () => props.tagSearch,
  set: (value: string) => emit('update:tagSearch', value)
})

const selectedTagListModel = computed({
  get: () => props.selectedTagList,
  set: (value: string[]) => emit('update:selectedTagList', value)
})

const typeSearchModel = computed({
  get: () => props.typeSearch,
  set: (value: string) => emit('update:typeSearch', value)
})

const selectedTypeListModel = computed({
  get: () => props.selectedTypeList,
  set: (value: string[]) => emit('update:selectedTypeList', value)
})

const selectedEngineListModel = computed({
  get: () => props.selectedEngineList,
  set: (value: string[]) => emit('update:selectedEngineList', value)
})
</script>

<template>
  <n-layout-sider
    bordered
    :width="240"
    show-trigger
    :native-scrollbar="false"
    content-class="filter-sider-content"
    content-style="height: 100%; overflow: hidden;"
    class="filter-sider"
  >
    <div class="filter-panel">
      <div class="filter-top">
        <n-h3 class="filter-title">
          <n-icon :component="FunnelOutline"/>
          筛选条件
        </n-h3>
        <div class="filter-top-options">
          <n-checkbox v-if="showMissingFilter" v-model:checked="missingFileModel" class="filter-top-option">
            <span class="filter-top-option__label">资源失效</span>
            <n-tag type="error" :bordered="false" round size="small">{{ missingResourceCount }}</n-tag>
          </n-checkbox>
          <n-checkbox v-model:checked="favoriteOnlyModel" class="filter-top-option">
            <span class="filter-top-option__label">已收藏</span>
            <n-tag type="success" :bordered="false" round size="small">{{ favoriteResourceCount }}</n-tag>
          </n-checkbox>
          <n-checkbox v-if="showCompletedFilter" v-model:checked="completedOnlyModel" class="filter-top-option">
            <span class="filter-top-option__label">{{ completedStateLabel }}</span>
            <n-tag type="info" :bordered="false" round size="small">{{ completedResourceCount }}</n-tag>
          </n-checkbox>
          <n-checkbox v-if="showRunningFilter" v-model:checked="runningOnlyModel" class="filter-top-option">
            <span class="filter-top-option__label">运行中</span>
            <n-tag type="success" :bordered="false" round size="small">{{ runningResourceCount }}</n-tag>
          </n-checkbox>
        </div>
      </div>

      <div class="filter-sections" :style="filterSectionsStyle">
        <div v-if="showAuthorFilter" class="filter-section">
          <n-divider title-placement="left" style="margin-bottom: 5px;">
            {{ categorySettings.authorText || '作者筛选' }}
          </n-divider>
          <n-input
            v-model:value="authorSearchModel"
            :placeholder="`请输入${categorySettings.authorText || '作者'}名称`"
            class="author-search"
            clearable
          />
          <n-checkbox-group v-model:value="selectedAuthorListModel" class="filter-group">
            <AppScrollbar class="filter-list">
              <n-flex vertical class="filter-list__content">
              <n-checkbox v-for="author in filteredAuthorList" :key="author.id" :value="author.id">
                {{ author.name }}
                <n-tag type="primary" :bordered="false" round size="small">{{ author.count }}</n-tag>
              </n-checkbox>
              </n-flex>
            </AppScrollbar>
          </n-checkbox-group>
        </div>
        <div v-if="showActorFilter" class="filter-section">
          <n-divider title-placement="left" style="margin-bottom: 5px;">{{ actorFilterLabel }}筛选</n-divider>
          <n-input
            v-model:value="actorSearchModel"
            :placeholder="`请输入${actorFilterLabel}名称`"
            class="actor-search"
            clearable
          />
          <n-checkbox-group v-model:value="selectedActorListModel" class="filter-group">
            <AppScrollbar class="filter-list">
              <n-flex vertical class="filter-list__content">
              <n-checkbox v-for="actor in filteredActorList" :key="actor.id" :value="actor.id">
                {{ actor.name }}
                <n-tag type="success" :bordered="false" round size="small">{{ actor.count }}</n-tag>
              </n-checkbox>
              </n-flex>
            </AppScrollbar>
          </n-checkbox-group>
        </div>
        <div v-if="isAudioCategory" class="filter-section">
          <n-divider title-placement="left" style="margin-bottom: 5px;">专辑筛选</n-divider>
          <n-input
            v-model:value="albumSearchModel"
            placeholder="请输入专辑名称"
            class="album-search"
            clearable
          />
          <n-checkbox-group v-model:value="selectedAlbumListModel" class="filter-group">
            <AppScrollbar class="filter-list">
              <n-flex vertical class="filter-list__content">
              <n-checkbox v-for="album in filteredAlbumList" :key="album.name" :value="album.name">
                {{ album.name }}
                <n-tag type="success" :bordered="false" round size="small">{{ album.count }}</n-tag>
              </n-checkbox>
              </n-flex>
            </AppScrollbar>
          </n-checkbox-group>
        </div>
        <div class="filter-section">
          <n-divider title-placement="left" style="margin-bottom: 5px;">标签筛选</n-divider>
          <n-input v-model:value="tagSearchModel" placeholder="请输入标签名称" class="tag-search" clearable />
          <n-checkbox-group v-model:value="selectedTagListModel" class="filter-group">
            <AppScrollbar class="filter-list">
              <n-flex vertical class="filter-list__content">
              <n-checkbox v-for="tag in filteredTagList" :key="tag.id" :value="tag.id">
                {{ tag.name }}
                <n-tag type="info" :bordered="false" round size="small">{{ tag.count }}</n-tag>
              </n-checkbox>
              </n-flex>
            </AppScrollbar>
          </n-checkbox-group>
        </div>
        <div v-if="!detailIsAsmr" class="filter-section">
          <n-divider title-placement="left" style="margin-bottom: 5px;">分类筛选</n-divider>
          <n-input v-model:value="typeSearchModel" placeholder="请输入分类名称" class="type-search" clearable />
          <n-checkbox-group v-model:value="selectedTypeListModel" class="filter-group">
            <AppScrollbar class="filter-list">
              <n-flex vertical class="filter-list__content">
              <n-checkbox v-for="type in filteredTypeList" :key="type.id" :value="type.id">
                {{ type.name }}
                <n-tag type="warning" :bordered="false" round size="small">{{ type.count }}</n-tag>
              </n-checkbox>
              </n-flex>
            </AppScrollbar>
          </n-checkbox-group>
        </div>
        <div v-if="showEngineFilter" class="filter-section">
          <n-divider title-placement="left" style="margin-bottom: 5px;">引擎筛选</n-divider>
          <n-checkbox-group v-model:value="selectedEngineListModel" class="filter-group">
            <AppScrollbar class="filter-list">
              <n-flex vertical class="filter-list__content">
              <n-checkbox v-for="engine in filteredEngineList" :key="engine.id" :value="engine.id">
                <span v-if="engine.icon" class="filter-engine-option">
                  <img :src="engine.icon" :alt="engine.name" class="filter-engine-option__icon" />
                  <span>{{ engine.name }}</span>
                </span>
                <span v-else>{{ engine.name }}</span>
                <n-tag type="success" :bordered="false" round size="small">{{ engine.count }}</n-tag>
              </n-checkbox>
              </n-flex>
            </AppScrollbar>
          </n-checkbox-group>
        </div>
      </div>

      <div class="filter-bottom">
        <n-button quaternary size="small" type="warning" class="reset-btn" @click="emit('reset-selected')">
          重置筛选
        </n-button>
      </div>
    </div>
  </n-layout-sider>
</template>

<style scoped>
.filter-sider {
  height: 100%;
}

.filter-sider :deep(.n-scrollbar) {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.filter-sider :deep(.filter-sider-scroll-container) {
  height: 100%;
  overflow: hidden;
}

.filter-sider :deep(.filter-sider-content) {
  height: 100%;
  overflow: hidden;
}

.filter-sider :deep(.n-layout-sider-children) {
  height: 100%;
  overflow: hidden;
}

.filter-sider :deep(.n-layout-sider-scroll-container) {
  height: 100%;
  overflow: hidden;
}

.filter-panel {
  height: 100%;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding: 12px;
  min-height: 0;
  gap: 12px;
  overflow: hidden;
}

.filter-top {
  flex: none;
}

.filter-top-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}

.filter-top-option {
  min-width: 0;
}

.filter-top-option :deep(.n-checkbox-box-wrapper) {
  flex: 0 0 auto;
}

.filter-top-option :deep(.n-checkbox__label) {
  width: 100%;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.filter-top-option :deep(.n-tag) {
  margin-left: 6px;
  flex: 0 0 auto;
}

.filter-top-option__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
}

.filter-title {
  flex: none;
  margin: 0;
}

.filter-sections {
  min-height: 0;
  display: grid;
  overflow: hidden;
}

.filter-section {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.filter-group {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.filter-list {
  height: 100%;
  min-height: 0;
}

.filter-list__content {
  flex-wrap: nowrap;
}

.filter-list__content :deep(.n-checkbox) {
  flex: none;
}

.filter-engine-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: 1;
}

.filter-engine-option__icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  display: block;
}

.filter-section :deep(.n-checkbox__label) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.filter-section :deep(.n-tag) {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}

.filter-list::-webkit-scrollbar {
  width: 6px;
}

.filter-list::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.45);
  border-radius: 999px;
}

.filter-list::-webkit-scrollbar-track {
  background: transparent;
}

.filter-bottom {
  align-self: stretch;
}

.reset-btn {
  width: 100%;
}

.author-search,
.actor-search,
.album-search,
.tag-search,
.type-search {
  margin-top: 5px;
  margin-bottom: 10px;
}
</style>
