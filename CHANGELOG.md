# 更新日志

本项目的所有重要变更都会记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 新增

- 仓库基础文档：`README.md`、`LICENSE`、`CONTRIBUTING.md`、
  `CODE_OF_CONDUCT.md`、`SECURITY.md`、`CHANGELOG.md`
- Issue 模板（缺陷报告、功能建议）与 Issue 入口配置
- `.editorconfig` 与 `.nvmrc`，统一编辑器格式与 Node 版本
- `tsconfig.json` 与 `@types/node`，修复 TypeScript 无法解析 Node 内置模块的问题

### 变更

- 链接检查忽略本仓库自身与 `localhost` 地址，避免误报

### 修复

- 移除 `config.ts` 中冗余的 `aside: 'right'`（该值本就是默认值，且不符合类型定义）

## [1.0.0] - 2026-08-06

### 新增

- **影集功能**
  - 新增 `/yingji` 影集页面与顶部导航入口
  - 摄影作品墙 `PhotoWall`：等高瀑布流排版、相册筛选、虚拟滚动、图片懒加载
  - 大图查看器 `PhotoLightbox`：键盘翻页、滚轮缩放、拖拽平移、相邻图片预取
  - 构建期照片扫描 `photo-utils.ts`：解析图片尺寸与 EXIF（相机、焦距、光圈、快门、ISO），
    自动按目录分组为相册，支持 `album.json` 自定义相册与单张照片信息
  - 构建期数据加载器 `photos.data.ts`，开发模式下增删照片自动热更新
  - 缩略图脚本 `npm run photos:thumb`：生成 WebP 缩略图与模糊占位图，支持增量执行

- **博客功能**
  - 基于 VitePress 的站点框架与自定义主题
  - 侧边栏、分类页、标签页、归档页自动生成
  - RSS 订阅、本地全文搜索
  - Mermaid 图表支持，可平移缩放
  - 双向链接语法支持
  - 回到顶部组件

- **工程化**
  - GitHub Actions 自动构建并部署到 GitHub Pages
  - CI 检查：依赖审查、链接检查、必需文件校验、拼写检查、许可证检查

[未发布]: https://github.com/jarodchen/flog/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jarodchen/flog/releases/tag/v1.0.0
