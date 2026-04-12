<script setup lang="ts">
import { notify } from '../../utils/notification'

const props = defineProps({
  metaData: {
    type: Object,
    required: true
  },
  basePath: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    default: ''
  }
})

const handleSelectLyricsFile = async () => {
  try {
    const lyricsPath = await window.api.dialog.selectFile(['lrc', 'srt', 'vtt'])
    if (lyricsPath) {
      props.metaData.lyricsPath = lyricsPath
    }
  } catch (error) {
    notify('error', '选择失败', error instanceof Error ? error.message : '选择歌词文件失败')
  }
}

const handleFetchLyrics = async () => {
  try {
    notify('info', '获取歌词', '正在获取歌词，请稍候')

    const fetchAudioLyrics = window.api?.service?.fetchAudioLyrics
    if (typeof fetchAudioLyrics !== 'function') {
      notify('error', '获取歌词', '当前窗口尚未加载最新接口，请重启应用后再试')
      return
    }

    const payload = {
      basePath: String(props.basePath ?? ''),
      title: String(props.title ?? ''),
      album: String(props.metaData?.album ?? ''),
      artist: String(props.metaData?.artist ?? ''),
    }

    const result = await fetchAudioLyrics(payload)

    if (result?.type === 'success' && result?.data?.lyricsPath) {
      props.metaData.lyricsPath = String(result.data.lyricsPath)
      notify('success', '获取歌词', result?.message ?? '已获取歌词')
      return
    }

    notify(result?.type ?? 'warning', '获取歌词', result?.message ?? '获取歌词失败')
  } catch (error) {
    notify('error', '获取歌词', error instanceof Error ? error.message : '获取歌词失败')
  }
}
</script>

<template>
  <n-form-item label="专辑">
    <n-input v-model:value="props.metaData.album" placeholder="请输入专辑名" />
  </n-form-item>

  <n-form-item label="歌词路径">
    <div class="music-meta-path-field">
      <n-input
        :value="props.metaData.lyricsPath"
        placeholder="请选择或获取歌词文件"
        readonly
      />
      <div class="music-meta-path-field__actions">
        <n-button @click="handleSelectLyricsFile">选择文件</n-button>
        <n-button :disabled="!basePath" @click="handleFetchLyrics">获取歌词</n-button>
      </div>
    </div>
  </n-form-item>
</template>

<style scoped>
.music-meta-path-field {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
}

.music-meta-path-field__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
