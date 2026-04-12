export const createEmptyMetaByType = (extendTable: string) => {
  switch (String(extendTable ?? '').trim()) {
    case 'game_meta':
      return {
        nickname: '',
        nameZh: '',
        nameJp: '',
        nameEn: '',
        language: '',
        version: '1.0.0',
        engine: '',
        websiteType: '',
        gameId: '',
        website: '',
        additionalStores: [] as Array<{ websiteType: string; workId: string; website: string }>
      }
    case 'software_meta':
      return {
        version: '1.0.0',
        commandLineArgs: ''
      }
    case 'asmr_meta':
      return {
        additionalStores: [] as Array<{ websiteType: string; workId: string; website: string }>,
        gameId: '',
        illust: '',
        language: '',
        scenario: '',
        website: '',
        websiteType: ''
      }
    case 'audio_meta':
      return {
        artist: '',
        album: '',
        lyricsPath: '',
        duration: 0,
        lastPlayTime: 0
      }
    case 'single_image_meta':
      return {
        pixivId: '',
        resolution: '',
        format: '',
        websiteType: '',
        gameId: '',
        website: ''
      }
    case 'multi_image_meta':
      return {
        lastReadPage: 0,
        translator: '',
        websiteType: '',
        gameId: '',
        website: ''
      }
    default:
      return {}
  }
}
