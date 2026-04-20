export class ResourceForm {
  author!: string
  authors?: string[]
  actors!: string[]
  basePath!: string
  categoryId!: string
  coverPath!: string
  description!: string
  name!: string
  tags!: string[]
  types!: string[]
  meta!: ResourceMeta
}

export class ResourceMeta {
  additionalStores!: ResourceStoreItem[]
  album?: string
  artist?: string
  bitrate?: number | null
  commandLineArgs!: string
  duration?: number
  engine!: string
  gameId!: string
  illust: string = ''
  language!: string
  lastPlayFile?: string
  lastPlayTime?: number
  lyricsPath?: string
  nameEn!: string
  nameJp!: string
  nameZh!: string
  nickname!: string
  pixivId!: string
  resolution!: string
  sampleRate?: number | null
  format!: string
  scenario: string = ''
  translator!: string
  isbn?: string
  publisher?: string
  year?: number | null
  version!: string
  website!: string
  websiteType!: string
  lastReadPage: number = 0
  lastReadPercent?: number = 0
}

export class ResourceStoreItem {
  website!: string
  websiteType!: string
  workId!: string
}

export class FetchResourceInfoResult {
  name!: string
  author!: string
  description: string = ''
  cv: string = ''
  illust: string = ''
  scenario: string = ''
  lastPlayFile?: string
  lastPlayTime?: number
  translator: string = ''
  isbn: string = ''
  publisher: string = ''
  year?: number | null
  cover: string = ''
  website: string = ''
  tag: string[] = []
  type: string[] = []
}
