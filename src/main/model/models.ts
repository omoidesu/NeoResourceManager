export class ResourceForm {
  author!: string
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
  engine!: string
  gameId!: string
  language!: string
  nameEn!: string
  nameJp!: string
  nameZh!: string
  nickname!: string
  pixivId!: string
  resolution!: string
  format!: string
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
  translator: string = ''
  cover: string = ''
  website: string = ''
  tag: string[] = []
  type: string[] = []
}
