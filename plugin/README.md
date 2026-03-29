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
