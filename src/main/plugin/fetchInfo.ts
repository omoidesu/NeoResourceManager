import {FetchResourceInfoResult} from "../model/models";
import {DatabaseService} from "../service/database.service"
import {DictType} from "../../common/constants";
import {createLogger} from "../util/logger"
import {generateId} from "../util/id-generator";

export abstract class FetchInfo {
  private websiteId!: string
  // 对应dict_data表中name字段
  protected abstract readonly websiteName: string
  protected logger: any

  public constructor() {
    this.logger = createLogger(this.constructor.name)
  }

  public async init() {
    if (!this.websiteName) {
      throw new Error(`${this.constructor.name}: websiteName field cannot be empty`);
    }

    const dictType = await DatabaseService.getDictTypeByName(DictType.STORE_WEBSITE_TYPE);
    let typeId
    if (!dictType) {
      // 字典类型不存在 直接重建类型
      typeId = generateId()
      await DatabaseService.insertDictType({
        id: typeId,
        name: DictType.STORE_WEBSITE_TYPE,
        description: '贩售网站'
      })
    } else {
      typeId = dictType.id
    }
    const dictData = await DatabaseService.getDictDataByTypeAndDataName(typeId, this.websiteName);

    if (!dictData) {
      throw new Error(`${this.websiteName} is not registered in the database`);
    }

    this.websiteId = dictData.id;
  }

  public match(websiteId: string) {
    return websiteId === this.websiteId
  }

  public async fetch(resourceId: string) {
    return this.fetchInfo(resourceId)
  }

  public async enable(): Promise<boolean> {
    let result = true;
    try {
      await this.beforeEnable()
      await this.updateWebsiteEnableStatus(this.websiteId, true)
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
      await this.updateWebsiteEnableStatus(this.websiteId, false)
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

  protected abstract fetchInfo(resourceId: string): Promise<FetchResourceInfoResult>

  protected abstract beforeEnable(): Promise<void>

  protected abstract afterEnable(): Promise<void>

  protected abstract beforeDisable(): Promise<void>

  protected abstract afterDisable(): Promise<void>
}
