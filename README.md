# NeoResourceManager

NeoResourceManager 是一个面向本地资源整理与启动管理的桌面应用，适合管理游戏、软件、图集等资源，并为 Galgame / 同人游戏场景补充引擎识别、启动辅助和信息整理能力。

当前版本：`0.5.0`

## 项目简介

这个项目基于 Electron、Vue 3 和 TypeScript 构建，目标是提供一套更贴近本地资源收纳习惯的资源管理方案。除了基础的资源录入、分类、筛选、启动与统计能力，也在逐步补齐对游戏引擎识别、MTool、Locale Emulator、资源失效定位等更偏实际使用场景的支持。

## 当前功能

- 资源录入、编辑、删除与分类管理
- 标签、分类、作者、引擎等多维筛选
- 资源卡片启动、停止、收藏、通关标记
- 游戏资源详情维护
- 自动检测游戏启动文件
- 自动识别部分常见游戏引擎
- 支持通过 MTool 启动兼容游戏
- 支持通过 Locale Emulator 启动需要转区的游戏
- 多选模式下批量删除、批量添加/移除标签、批量添加/移除分类
- 资源失效监听与自动重定位能力
- 批量导入游戏目录
- 音声目录树浏览、字幕播放与播放进度记录
- 音乐资源管理、批量导入、歌词匹配、专辑封面获取与专辑筛选
- 音乐全局播放器、播放队列、顺序/循环/随机/单曲循环模式与通知中心迷你播放器
- 小说资源管理，支持 TXT、Markdown、PDF、EPUB、MOBI、AZW3 等文件格式识别与阅读
- 小说阅读进度记录、PDF 首页封面生成、电子书封面/ISBN 元数据提取
- 小说 ISBN 信息插件，可通过国家图书馆 ISBN 信息来源回填作者、译者、出版社、发行年、ISBN、简介和标签

## 已支持的部分游戏能力

- RPG Maker 系列引擎识别
- Kirikiri / Kirikiri Z 识别
- Wolf RPG Editor 版本段识别
- Ren'Py 识别
- SMILE GAME BUILDER 识别
- Pixel Game Maker MV / Bakin 等部分引擎识别
- MTool 可用性判定与 Hook 对应信息整理

## 技术栈

- Electron
- Vue 3
- TypeScript
- Naive UI
- better-sqlite3
- drizzle-orm
- electron-builder

## 开发环境

推荐使用：

- [VSCode](https://code.visualstudio.com/)
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## 本地开发

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

类型检查：

```bash
npm run typecheck
```

## 构建

Windows：

```bash
npm run build:win
```

macOS：

```bash
npm run build:mac
```

Linux：

```bash
npm run build:linux
```

## 更新记录

版本更新记录见：

- [CHANGELOG.md](./CHANGELOG.md)

## 灵感来源

本项目在资源管理思路上参考了：

- [GreenResourcesManager](https://github.com/klsdf/GreenResourcesManager)
