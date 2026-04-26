<script setup lang="ts">
import { computed, ref } from 'vue'

defineOptions({
  name: 'BangumiDirectory'
})

type BangumiDirectoryNode = {
  key?: string | number
  label?: string
  path?: string
  isDirectory?: boolean
  kind?: string
  children?: BangumiDirectoryNode[]
  coverPreviewSrc?: string
  sortOrderLabel?: string | number
}

const props = withDefaults(defineProps<{
  nodes: BangumiDirectoryNode[]
  depth?: number
}>(), {
  depth: 0
})

const emit = defineEmits<{
  (event: 'play', node: BangumiDirectoryNode): void
  (event: 'item-contextmenu', domEvent: MouseEvent, node: BangumiDirectoryNode): void
}>()

const collapsedKeys = ref<Set<string>>(new Set())

const normalizedNodes = computed(() => Array.isArray(props.nodes) ? props.nodes : [])

const resolveNodeKey = (node: BangumiDirectoryNode, index = 0) =>
  String(node?.key ?? node?.path ?? `${props.depth}-${index}-${String(node?.label ?? '')}`)

const isDirectoryExpanded = (node: BangumiDirectoryNode, index = 0) => !collapsedKeys.value.has(resolveNodeKey(node, index))

const toggleDirectory = (node: BangumiDirectoryNode, index = 0) => {
  const next = new Set(collapsedKeys.value)
  const key = resolveNodeKey(node, index)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  collapsedKeys.value = next
}

const handlePlay = (node: BangumiDirectoryNode) => {
  emit('play', node)
}

const handleItemContextMenu = (event: MouseEvent, node: BangumiDirectoryNode) => {
  emit('item-contextmenu', event, node)
}
</script>

<template>
  <div class="bangumi-directory" :style="{ '--bangumi-directory-depth': String(depth) }">
    <template v-for="(node, index) in normalizedNodes" :key="resolveNodeKey(node, index)">
      <div v-if="node?.isDirectory" class="bangumi-directory__group">
        <button
          type="button"
          class="bangumi-directory__folder"
          @click="toggleDirectory(node, index)"
        >
          <span
            class="bangumi-directory__folder-caret"
            :class="{ 'bangumi-directory__folder-caret--collapsed': !isDirectoryExpanded(node, index) }"
          >
            ▾
          </span>
          <span class="bangumi-directory__folder-icon">📁</span>
          <span class="bangumi-directory__folder-label">{{ node.label }}</span>
        </button>

        <div v-show="isDirectoryExpanded(node, index)" class="bangumi-directory__children">
          <BangumiDirectory
            :nodes="node.children ?? []"
            :depth="depth + 1"
            @play="handlePlay"
            @item-contextmenu="handleItemContextMenu"
          />
        </div>
      </div>

      <div
        v-else
        class="bangumi-directory__episode"
        @contextmenu="handleItemContextMenu($event, node)"
      >
        <div class="bangumi-directory__episode-main">
          <span v-if="node?.sortOrderLabel" class="bangumi-directory__order-index">
            {{ String(node.sortOrderLabel).padStart(2, '0') }}
          </span>

          <div class="bangumi-directory__cover-shell">
            <img
              v-if="node?.coverPreviewSrc"
              :src="String(node.coverPreviewSrc)"
              alt=""
              class="bangumi-directory__cover"
              draggable="false"
            />
            <div v-else class="bangumi-directory__cover bangumi-directory__cover--empty">VIDEO</div>
          </div>

          <div class="bangumi-directory__episode-text">
            <div class="bangumi-directory__episode-title">{{ node.label }}</div>
          </div>
        </div>

        <button
          v-if="node?.path"
          type="button"
          class="bangumi-directory__play"
          aria-label="播放视频"
          @click.stop="handlePlay(node)"
        >
          ▶
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bangumi-directory {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.bangumi-directory__group {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.bangumi-directory__folder {
  width: 100%;
  appearance: none;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 2px;
  color: rgba(229, 233, 240, 0.92);
  cursor: pointer;
  text-align: left;
  min-width: 0;
}

.bangumi-directory__folder-caret {
  width: 14px;
  color: rgba(229, 233, 240, 0.62);
  transition: transform 0.18s ease;
  flex: 0 0 14px;
}

.bangumi-directory__folder-caret--collapsed {
  transform: rotate(-90deg);
}

.bangumi-directory__folder-icon {
  flex: 0 0 auto;
}

.bangumi-directory__folder-label {
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.bangumi-directory__children {
  padding-left: 18px;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}

.bangumi-directory__episode {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.bangumi-directory__episode-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.bangumi-directory__order-index {
  width: 40px;
  flex: 0 0 40px;
  text-align: center;
  font-size: 30px;
  line-height: 1;
  font-weight: 300;
  letter-spacing: -0.04em;
  color: rgba(229, 233, 240, 0.5);
  font-variant-numeric: tabular-nums;
}

.bangumi-directory__cover-shell {
  width: 106px;
  height: 60px;
  border-radius: 10px;
  overflow: hidden;
  flex: 0 0 auto;
  background: rgba(255, 255, 255, 0.06);
}

.bangumi-directory__cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.bangumi-directory__cover--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(216, 221, 229, 0.42);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.bangumi-directory__episode-text {
  min-width: 0;
  display: flex;
  align-items: center;
}

.bangumi-directory__episode-title {
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(229, 233, 240, 0.94);
  word-break: break-word;
}

.bangumi-directory__play {
  appearance: none;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.86);
  cursor: pointer;
  transition: transform 0.18s ease, background 0.18s ease;
  flex: 0 0 auto;
}

.bangumi-directory__play:hover {
  transform: translateY(-1px);
  background: rgb(99, 226, 183);
  color: #fff;
}

.bangumi-directory__play:active {
  transform: scale(0.96);
}

@media (max-width: 720px) {
  .bangumi-directory__episode {
    align-items: flex-start;
  }

  .bangumi-directory__episode-main {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
