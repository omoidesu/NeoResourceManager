export class ResourceForm {
  author!: string
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
  commandLineArgs!: string
  duration?: number
  engine!: string
  gameId!: string
  illust: string = ''
  language!: string
  nameEn!: string
  nameJp!: string
  nameZh!: string
  nickname!: string
  pixivId!: string
  resolution!: string
  format!: string
  scenario: string = ''
  translator!: string
  version!: string
  website!: string
  websiteType!: string
  lastReadPage: number = 0
}

export class ResourceStoreItem {
  website!: string
  websiteType!: string
  workId!: string
}

export class FetchResourceInfoResult {
  name!: string
  author!: string
  cv: string = ''
  illust: string = ''
  scenario: string = ''
  lastPlayFile?: string
  lastPlayTime?: number
  translator: string = ''
  cover: string = ''
  website: string = ''
  tag: string[] = []
  type: string[] = []
}
