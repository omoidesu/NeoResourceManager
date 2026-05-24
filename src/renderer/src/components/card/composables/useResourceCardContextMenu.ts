import {computed, h, ref, type ComputedRef} from 'vue'
import {NIcon} from 'naive-ui'
import { Icon, addCollection } from '@iconify/vue'
import materialSymbolsLightIcons from '@iconify-json/material-symbols-light/icons.json'
import mdiIcons from '@iconify-json/mdi/icons.json'
import {
  AlertCircleOutline,
  ArchiveOutline,
  CheckmarkCircleOutline,
  CheckmarkDoneOutline,
  CreateOutline,
  FolderOpenOutline,
  HeartDislikeOutline,
  HeartOutline,
  ImageOutline,
  InformationCircleOutline,
  Play,
  SquareOutline,
  TrashOutline
} from '@vicons/ionicons5'

addCollection(materialSymbolsLightIcons)
addCollection(mdiIcons)
addCollection({
  prefix: 'icon-park-outline',
  icons: {
    'to-top': {
      body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M24.008 14.1V42M12 26l12-12l12 12M12 6h24"/>',
      width: 48,
      height: 48
    }
  }
})
addCollection({
  prefix: 'fluent',
  icons: {
    'pin-24-regular': {
      body: '<path fill="currentColor" d="m16.243 2.932l4.825 4.826a2.75 2.75 0 0 1-.715 4.404l-4.87 2.435a.75.75 0 0 0-.374.426l-1.44 4.166a1.25 1.25 0 0 1-2.065.476L8.5 16.561L4.06 21H3v-1.062L7.44 15.5l-3.105-3.104a1.25 1.25 0 0 1 .476-2.066l4.166-1.439a.75.75 0 0 0 .426-.374l2.435-4.87a2.75 2.75 0 0 1 4.405-.715m3.765 5.886l-4.826-4.825a1.25 1.25 0 0 0-2.002.324l-2.435 4.871a2.25 2.25 0 0 1-1.278 1.12l-3.789 1.31l6.705 6.704l1.308-3.788a2.25 2.25 0 0 1 1.12-1.278l4.872-2.436a1.25 1.25 0 0 0 .325-2.002"/>',
      width: 24,
      height: 24
    },
    'pin-off-24-regular': {
      body: '<path fill="currentColor" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l5.905 5.905L4.81 10.33a1.25 1.25 0 0 0-.476 2.065L7.439 15.5L3 19.94V21h1.06l4.44-4.44l3.105 3.105a1.25 1.25 0 0 0 2.065-.476l1.145-3.313l5.905 5.904a.75.75 0 0 0 1.06-1.06zm10.355 12.476l-1.252 3.626l-6.705-6.705l3.626-1.252zm6.048-3.876l-3.787 1.894l1.118 1.118l3.34-1.67a2.75 2.75 0 0 0 .714-4.404l-4.825-4.826a2.75 2.75 0 0 0-4.405.715l-1.67 3.34l1.118 1.117l1.894-3.787a1.25 1.25 0 0 1 2.002-.325l4.826 4.826a1.25 1.25 0 0 1-.325 2.002"/>',
      width: 24,
      height: 24
    }
  }
})

export const useResourceCardContextMenu = (params: {
  resource: ComputedRef<any>
  categoryName: ComputedRef<string>
  startText: ComputedRef<string>
  selected: ComputedRef<boolean>
  showDefaultAppPlay: ComputedRef<boolean>
  defaultAppActionText: ComputedRef<string>
  showAddToPlaylist: ComputedRef<boolean>
  showMtoolLaunch: ComputedRef<boolean>
  canMtoolLaunch: ComputedRef<boolean>
  showZoneLaunch: ComputedRef<boolean>
  canZoneLaunch: ComputedRef<boolean>
  showAdminLaunch: ComputedRef<boolean>
  showModifyOrder: ComputedRef<boolean>
  showCompletedToggle: ComputedRef<boolean>
  showScreenshotFolder: ComputedRef<boolean>
  isWebsiteCategory: ComputedRef<boolean>
  archiveEnabled: ComputedRef<boolean>
  completedStateLabel: ComputedRef<string>
  canLaunch: ComputedRef<boolean>
  canToggleFavorite: ComputedRef<boolean>
  canToggleCompleted: ComputedRef<boolean>
  handleLaunch: () => void
  handleToggleFavorite: () => void
  handleToggleCompleted: () => void
  handleToggleTop: () => void
  handleToggleHomePin: () => void
  handleToggleSelect: () => void
  onZoneLaunch: (resource: any) => void
  onAdminLaunch: (resource: any) => void
  onMtoolLaunch: (resource: any) => void
  onShowDetail: (resource: any) => void
  onEdit: (resource: any) => void
  onOpenFolder: (resource: any) => void
  onModifyOrder: (resource: any) => void
  onDefaultAppPlay: (resource: any) => void
  onAddToPlaylist: (resource: any) => void
  onOpenScreenshotFolder: (resource: any) => void
  onArchive: (resource: any) => void
  onDelete: (resource: any) => void
  onDeleteFiles: (resource: any) => void
}) => {
  const {
    resource,
    categoryName,
    startText,
    selected,
    showDefaultAppPlay,
    defaultAppActionText,
    showAddToPlaylist,
    showMtoolLaunch,
    canMtoolLaunch,
    showZoneLaunch,
    canZoneLaunch,
    showAdminLaunch,
    showModifyOrder,
    showCompletedToggle,
    showScreenshotFolder,
    isWebsiteCategory,
    archiveEnabled,
    completedStateLabel,
    canLaunch,
    canToggleFavorite,
    canToggleCompleted,
    handleLaunch,
    handleToggleFavorite,
    handleToggleCompleted,
    handleToggleTop,
    handleToggleHomePin,
    handleToggleSelect,
    onZoneLaunch,
    onAdminLaunch,
    onMtoolLaunch,
    onShowDetail,
    onEdit,
    onOpenFolder,
    onModifyOrder,
    onDefaultAppPlay,
    onAddToPlaylist,
    onOpenScreenshotFolder,
    onArchive,
    onDelete,
    onDeleteFiles
  } = params

  const showContextMenu = ref(false)
  const contextMenuX = ref(0)
  const contextMenuY = ref(0)

  const renderMenuIcon = (icon: any) => () => h(NIcon, null, {default: () => h(icon)})
  const renderIconifyMenuIcon = (icon: string) => () => h(NIcon, null, {
    default: () => h(Icon, {
      icon
    })
  })
  const renderDangerLabel = (label: string) => () => h('span', {
    style: {
      color: '#ff7875',
      fontWeight: 700
    }
  }, label)

  const contextMenuOptions = computed(() => ([
    {
      label: startText.value || '启动',
      key: 'launch',
      disabled: !canLaunch.value,
      icon: renderMenuIcon(Play)
    },
    ...(showDefaultAppPlay.value ? [{
      label: defaultAppActionText.value || '使用默认应用打开',
      key: 'default-app-play',
      disabled: !Boolean(resource.value?.basePath) || Boolean(resource.value?.missingStatus),
      icon: renderMenuIcon(Play)
    }] : []),
    ...(showAddToPlaylist.value ? [{
      label: '加入播放列表',
      key: 'add-to-playlist',
      disabled: !Boolean(resource.value?.basePath) || Boolean(resource.value?.missingStatus),
      icon: renderMenuIcon(Play)
    }] : []),
    ...(showMtoolLaunch.value ? [{
      label: '通过 MTool 启动',
      key: 'mtool-launch',
      disabled: !canMtoolLaunch.value || !canLaunch.value,
      icon: renderMenuIcon(Play)
    }] : []),
    ...(showZoneLaunch.value ? [{
      label: '转区启动',
      key: 'zone-launch',
      disabled: !canZoneLaunch.value || !canLaunch.value,
      icon: renderMenuIcon(Play)
    }] : []),
    ...(showAdminLaunch.value ? [{
      label: '以管理员身份运行',
      key: 'admin-launch',
      disabled: !canLaunch.value,
      icon: renderMenuIcon(AlertCircleOutline)
    }] : []),
    {
      label: '详细信息',
      key: 'detail',
      icon: renderMenuIcon(InformationCircleOutline)
    },
    {
      label: '修改信息',
      key: 'edit',
      icon: renderMenuIcon(CreateOutline)
    },
    ...(showModifyOrder.value ? [{
      label: '修改顺序',
      key: 'modify-order',
      disabled: !Boolean(resource.value?.basePath) || Boolean(resource.value?.missingStatus),
      icon: renderMenuIcon(CreateOutline)
    }] : []),
    {
      label: selected.value ? '取消多选' : '多选',
      key: 'toggle-select',
      icon: renderMenuIcon(selected.value ? CheckmarkDoneOutline : SquareOutline)
    },
    {
      label: resource.value?.ifFavorite ? '取消收藏' : '收藏',
      key: 'toggle-favorite',
      disabled: !canToggleFavorite.value,
      icon: renderMenuIcon(resource.value?.ifFavorite ? HeartDislikeOutline : HeartOutline)
    },
    ...(showCompletedToggle.value ? [{
      label: resource.value?.isCompleted ? `取消${completedStateLabel.value}` : completedStateLabel.value,
      key: 'toggle-completed',
      disabled: !canToggleCompleted.value,
      icon: renderMenuIcon(CheckmarkCircleOutline)
    }] : []),
    {
      label: resource.value?.ifTop ? '取消置顶' : '置顶',
      key: 'toggle-top',
      icon: renderIconifyMenuIcon('icon-park-outline:to-top')
    },
    {
      label: resource.value?.homePinnedAt ? '取消快速启动' : '添加至快速启动',
      key: 'toggle-home-pin',
      icon: renderIconifyMenuIcon(resource.value?.homePinnedAt ? 'fluent:pin-off-24-regular' : 'fluent:pin-24-regular')
    },
    ...(!isWebsiteCategory.value ? [{
      label: '打开文件夹',
      key: 'open-folder',
      disabled: !Boolean(resource.value?.basePath) || Boolean(resource.value?.missingStatus),
      icon: renderMenuIcon(FolderOpenOutline)
    }] : []),
    ...(showScreenshotFolder.value ? [{
      label: '打开截图文件夹',
      key: 'open-screenshot-folder',
      disabled: !Boolean(resource.value?.id),
      icon: renderMenuIcon(ImageOutline)
    }] : []),
    {
      type: 'divider',
      key: 'danger-divider'
    },
    {
      label: renderDangerLabel(`删除${categoryName.value || '资源'}`),
      key: 'delete',
      icon: renderMenuIcon(TrashOutline)
    },
    ...(!isWebsiteCategory.value ? [{
      label: renderDangerLabel('删除本地文件'),
      key: 'delete-files',
      disabled: Boolean(resource.value?.missingStatus) || !Boolean(resource.value?.basePath),
      icon: renderMenuIcon(TrashOutline)
    }] : []),
    ...(archiveEnabled.value ? [{
      label: renderDangerLabel('删除文件并归档'),
      key: 'archive',
      disabled: Boolean(resource.value?.missingStatus) || !Boolean(resource.value?.basePath) || !Boolean(resource.value?.id),
      icon: renderMenuIcon(ArchiveOutline)
    }] : [])
  ].filter((item: any) => item?.label !== null)))

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault()
    showContextMenu.value = false
    contextMenuX.value = event.clientX
    contextMenuY.value = event.clientY
    requestAnimationFrame(() => {
      showContextMenu.value = true
    })
  }

  const handleSelectMenu = (key: string) => {
    showContextMenu.value = false

    if (key === 'launch') {
      handleLaunch()
      return
    }

    if (key === 'zone-launch') {
      onZoneLaunch(resource.value)
      return
    }

    if (key === 'admin-launch') {
      onAdminLaunch(resource.value)
      return
    }

    if (key === 'mtool-launch') {
      onMtoolLaunch(resource.value)
      return
    }

    if (key === 'detail') {
      onShowDetail(resource.value)
      return
    }

    if (key === 'edit') {
      onEdit(resource.value)
      return
    }

    if (key === 'open-folder') {
      onOpenFolder(resource.value)
      return
    }

    if (key === 'modify-order') {
      onModifyOrder(resource.value)
      return
    }

    if (key === 'default-app-play') {
      onDefaultAppPlay(resource.value)
      return
    }

    if (key === 'add-to-playlist') {
      onAddToPlaylist(resource.value)
      return
    }

    if (key === 'open-screenshot-folder') {
      onOpenScreenshotFolder(resource.value)
      return
    }

    if (key === 'archive') {
      onArchive(resource.value)
      return
    }

    if (key === 'toggle-favorite') {
      handleToggleFavorite()
      return
    }

    if (key === 'toggle-select') {
      handleToggleSelect()
      return
    }

    if (key === 'toggle-completed') {
      handleToggleCompleted()
      return
    }

    if (key === 'toggle-top') {
      handleToggleTop()
      return
    }

    if (key === 'toggle-home-pin') {
      handleToggleHomePin()
      return
    }

    if (key === 'delete') {
      onDelete(resource.value)
      return
    }

    if (key === 'delete-files') {
      onDeleteFiles(resource.value)
    }
  }

  return {
    showContextMenu,
    contextMenuX,
    contextMenuY,
    contextMenuOptions,
    handleContextMenu,
    handleSelectMenu
  }
}
