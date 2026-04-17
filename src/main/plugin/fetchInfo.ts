import {FetchResourceInfoResult} from "../model/models";
import {DatabaseService} from "../service/database.service"
import {DictType} from "../../common/constants";
import {createLogger} from "../util/logger"
import {generateId} from "../util/id-generator";

export abstract class FetchInfo {
  private websiteIds: string[] = []
  // 对应dict_data表中name字段
  protected abstract readonly websiteName: string
  protected readonly websiteTypeName?: string
  protected readonly websiteValue?: string
  protected readonly websiteDescription?: string
  protected readonly websiteExtra?: Record<string, unknown>
  protected logger: any

  public constructor() {
    this.logger = createLogger(this.constructor.name)
  }

  public async init() {
    if (!this.websiteName) {
      throw new Error(`${this.constructor.name}: websiteName field cannot be empty`);
    }

    const dictDataList = await this.resolveWebsiteDictDataList()

    if (!dictDataList.length) {
      throw new Error(`${this.websiteName} is not registered in the database`);
    }

    this.websiteIds = dictDataList.map((item) => item.id)
  }

  public match(websiteId: string) {
    const normalizedWebsiteId = String(websiteId ?? '').trim().toLowerCase()
    return (
      this.websiteIds.includes(websiteId) ||
      normalizedWebsiteId === String(this.websiteName ?? '').trim().toLowerCase() ||
      normalizedWebsiteId === String(this.websiteValue ?? '').trim().toLowerCase()
    )
  }

  public async fetch(resourceId: string) {
    return this.fetchInfo(resourceId)
  }

  public async enable(): Promise<boolean> {
    let result = true;
    try {
      await this.beforeEnable()
      await Promise.all(this.websiteIds.map((websiteId) => this.updateWebsiteEnableStatus(websiteId, true)))
      await this.afterEnable()
    } catch (e) {
      this.logger.error(e)
      result = false
    }

    return result
  }

  public async disable(): Promise<boolean> {
    let result = true;
    try {
      await this.beforeDisable()
      await Promise.all(this.websiteIds.map((websiteId) => this.updateWebsiteEnableStatus(websiteId, false)))
      await this.afterDisable()
    } catch (e) {
      this.logger.error(e)
      result = false
    }

    return result
  }

  private async updateWebsiteEnableStatus(dictDataId: string, enable: boolean) {
    const dictData = await DatabaseService.getDictDataById(dictDataId)
    if (!dictData) throw new Error(`${dictDataId} is not exist`)
    if (!dictData.extra) dictData.extra = {}
    dictData.extra.enableFetchInfo = enable
    await DatabaseService.updateDictData(dictData)
  }

  private async resolveWebsiteDictDataList() {
    const typeDefinitions = [
      { name: DictType.GAME_SITE_TYPE, description: '贩售网站' },
      { name: DictType.ASMR_SITE_TYPE, description: '音声网站' },
      { name: DictType.IMAGE_SITE_TYPE, description: '图片网站' },
      { name: DictType.MANGA_SITE_TYPE, description: '漫画网站' },
      { name: DictType.NOVEL_SITE_TYPE, description: '小说网站' }
    ]

    const prioritizedTypeDefinitions = this.websiteTypeName
      ? [
          ...typeDefinitions.filter((item) => item.name === this.websiteTypeName),
          ...typeDefinitions.filter((item) => item.name !== this.websiteTypeName)
        ]
      : typeDefinitions

    const result: any[] = []

    for (const definition of prioritizedTypeDefinitions) {
      const typeId = await this.ensureDictType(definition.name, definition.description)
      const dictData = await DatabaseService.getDictDataByTypeAndDataName(typeId, this.websiteName)
      if (dictData) {
        result.push(dictData)
        continue
      }

      if (definition.name === this.websiteTypeName) {
        const registeredData = await this.registerWebsiteDictData(typeId)
        if (registeredData) {
          result.push(registeredData)
        }
      }
    }

    return result
  }

  private async ensureDictType(typeName: string, description: string) {
    const dictType = await DatabaseService.getDictTypeByName(typeName)
    if (dictType) {
      return dictType.id
    }

    const typeId = generateId()
    await DatabaseService.insertDictType({
      id: typeId,
      name: typeName,
      description
    })
    return typeId
  }

  private async registerWebsiteDictData(typeId: string) {
    const websiteId = generateId()
    await DatabaseService.insertDictData({
      id: websiteId,
      typeId,
      name: this.websiteName,
      description: this.websiteDescription ?? '',
      value: this.websiteValue ?? this.websiteName.trim().toLowerCase().replace(/\s+/g, '-'),
      extra: {
        enableFetchInfo: true,
        ...(this.websiteExtra ?? {})
      }
    })

    return await DatabaseService.getDictDataById(websiteId)
  }

  protected abstract fetchInfo(resourceId: string): Promise<FetchResourceInfoResult>

  protected abstract beforeEnable(): Promise<void>

  protected abstract afterEnable(): Promise<void>

  protected abstract beforeDisable(): Promise<void>

  protected abstract afterDisable(): Promise<void>
}
