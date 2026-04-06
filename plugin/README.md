# Plugin Directory

开发环境下，应用会从项目根目录的 `plugin/` 加载插件。  
打包后，应用会从安装目录旁边的 `plugin/` 加载插件。

支持两种插件写法：

1. 导出继承内部 `FetchInfo` 的类
2. 直接导出普通对象

推荐第三方开发者使用普通对象方式，这样不需要依赖项目源码。

对象插件最少需要导出：

```js
module.exports = {
  websiteName: '网站名称',
  async fetchInfo(resourceId) {
    return {
      name: '',
      author: '',
      cover: '',
      tag: [],
      type: []
    }
  }
}
```

可选生命周期：

```js
beforeEnable() {}
afterEnable() {}
beforeDisable() {}
afterDisable() {}
```

返回值字段说明：

- `name`: 资源名称
- `author`: 作者/社团名
- `cover`: 封面图片 URL
- `tag`: 标签数组
- `type`: 分类数组

## Pixiv 插件说明

仓库内新增了 `plugin/pixivFetchInfo.js`，实现方式与 `dlsiteFetchInfo.js` 一致，走 Pixiv Web Ajax 接口：

- 作品详情：`https://www.pixiv.net/ajax/illust/{id}`

输入支持两种格式：

- 纯作品 ID，例如 `101024077`
- 作品链接，例如 `https://www.pixiv.net/artworks/101024077`

插件会返回：

- `name`: 作品标题
- `author`: 画师名
- `cover`: 作品封面图地址
- `tag`: 标签数组，包含原始标签，若有英文翻译也会一并收集
- `type`: 作品类型，例如 `illustration`、`manga`、`ugoira`、`R-18`

注意事项：

- Pixiv 并没有稳定公开的官方开发者文档，这里使用的是社区长期实践的 Web Ajax 接口。
- 部分作品需要登录后才能访问；如遇 `403` 或特定作品始终不可见，可设置环境变量 `PIXIV_COOKIE` 后再启动应用。
- 已删除作品、无权限作品或当前网络环境不可访问的作品，通常无法通过该接口获取信息。

## ComicMeta 插件说明

仓库内新增了 `plugin/comicMetaFetch.js`，用于给漫画目录按标题搜索并回填基础信息。

搜索顺序固定为：

- `e-hentai`
- `nhentai`

输入建议：

- 漫画目录名
- 漫画标题
- 作者 + 标题

返回字段：

- `name`: 命中的漫画标题
- `author`: 作者或社团
- `cover`: 封面图地址
- `website`: 命中的作品链接
- `tag`: 标签数组
- `type`: 来源站点与分类数组

注意事项：

- 这是聚合搜索插件，不依赖单个站点 ID，而是使用搜索词逐站尝试。
- 若前几个站点未收录该作品，插件会自动继续尝试后续站点。
