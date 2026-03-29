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
  engine!: string
  gameId!: string
  language!: string
  nameEn!: string
  nameJp!: string
  nameZh!: string
  nickname!: string
  version!: string
  website!: string
  websiteType!: string
}

export class ResourceStoreItem {
  website!: string
  websiteType!: string
  workId!: string
}

export class FetchResourceInfoResult {
  name!: string
  author!: string
  cover: string = ''
  tag: string[] = []
  type: string[] = []
}
