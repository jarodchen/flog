# flog

> 局外人 —— 基于 [VitePress](https://vitepress.dev/) 构建的个人博客与摄影影集站点。

[![Deploy](https://github.com/jarodchen/flog/actions/workflows/deploy.yml/badge.svg)](https://github.com/jarodchen/flog/actions/workflows/deploy.yml)
[![Checks](https://github.com/jarodchen/flog/actions/workflows/ci.yml/badge.svg)](https://github.com/jarodchen/flog/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![VitePress](https://img.shields.io/badge/VitePress-1.6-brightgreen.svg)](https://vitepress.dev/)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933.svg)](https://nodejs.org/)

写字、记录、拍照。这个仓库同时是站点的源码和内容仓库：Markdown 写文章，照片直接丢进目录，
推送到 `main` 后由 GitHub Actions 自动构建并发布到 GitHub Pages。

## 目录

- [特性](#特性)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [写文章](#写文章)
- [影集：摄影作品墙](#影集摄影作品墙)
- [部署](#部署)
- [常见问题](#常见问题)
- [参与贡献](#参与贡献)
- [许可证](#许可证)

## 特性

### 博客

- **零配置侧边栏** —— 扫描 `docs/blog/` 自动生成侧边栏，无需手工维护配置
- **分类 / 标签 / 归档** —— 三套索引页在构建时自动生成
- **RSS 订阅** —— 构建产物自带 feed
- **本地全文搜索** —— 不依赖任何第三方服务，离线可用
- **Mermaid 图表** —— 支持流程图、时序图、类图，并可平移缩放
- **双向链接** —— 支持 `[[wiki-link]]` 语法互相引用文章

### 影集

- **自动上墙** —— 照片放进目录即可显示，子目录自动成为相册分类
- **等高瀑布流** —— Flickr / Google Photos 式排版，宽高比在构建期算好，加载不跳版
- **虚拟滚动** —— 只渲染视口附近的图片，几千张照片也不卡
- **EXIF 展示** —— 构建期读取相机、焦距、光圈、快门、ISO，运行时零解析开销
- **大图查看器** —— 键盘翻页、滚轮缩放、拖拽平移、相邻图片预取

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 20 或更高版本（CI 使用 22）
- npm 10 或更高版本

### 本地运行

```bash
# 克隆仓库
git clone https://github.com/jarodchen/flog.git
cd flog

# 安装依赖
npm install

# 启动开发服务器，默认 http://localhost:5173
npm run dev
```

### 可用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器，支持热更新 |
| `npm run build` | 构建静态站点到 `docs/.vitepress/dist` |
| `npm run preview` | 本地预览构建产物 |
| `npm run photos:thumb` | 为影集生成缩略图与模糊占位图 |

## 目录结构

```text
flog/
├── docs/                             # VitePress 站点根目录
│   ├── .vitepress/
│   │   ├── config.ts                 # 站点配置：导航、侧边栏、Markdown、插件
│   │   ├── blog-utils.ts             # 博客索引页生成入口
│   │   ├── sidebar-generator.ts      # 侧边栏自动生成
│   │   ├── category-generator.ts     # 分类索引页生成
│   │   ├── tag-generator.ts          # 标签索引页生成
│   │   ├── archives-generator.ts     # 归档页生成
│   │   ├── photo-utils.ts            # 影集：扫描照片、解析尺寸与 EXIF
│   │   └── theme/
│   │       ├── index.ts              # 主题入口
│   │       ├── Layout.vue            # 自定义布局
│   │       ├── photos.data.ts        # 影集构建期数据加载器
│   │       └── components/           # BackToTop、PhotoWall、PhotoLightbox 等
│   ├── blog/                         # 博客文章，按年份分目录
│   │   └── 2026/
│   ├── public/
│   │   ├── images/                   # 站点图片
│   │   └── photos/                   # 影集照片，子目录即相册
│   ├── about.md                      # 关于我
│   └── yingji.md                     # 影集页面
├── scripts/
│   └── generate-thumbs.mjs           # 缩略图与占位图生成脚本
└── .github/workflows/                # CI 与 GitHub Pages 部署
```

> 说明：`docs/index.md`、`docs/blog/index.md`、`docs/blog/categories/`、`docs/blog/tags/`
> 由脚本在构建时自动生成，已加入 `.gitignore`，请不要手工编辑或提交。

## 写文章

在 `docs/blog/<年份>/` 下新建 Markdown 文件，写好 frontmatter 即可：

```markdown
---
title: 文章标题
date: 2026-08-06
category: 技术
categories: [技术, 随笔]
tags: [VitePress, 前端]
description: 一句话摘要，会显示在列表页和搜索结果里
banner: /images/cover.webp
---

正文从这里开始。
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 文章标题 |
| `date` | 是 | 发布日期，用于排序与归档 |
| `category` | 否 | 主分类（单值） |
| `categories` | 否 | 附加分类（数组），会与 `category` 合并去重 |
| `tags` | 否 | 标签数组 |
| `description` | 否 | 摘要 |
| `banner` | 否 | 封面图路径 |

保存后侧边栏、分类页、标签页、归档页会自动刷新，无需改任何配置。

## 影集：摄影作品墙

### 添加照片

1. 把照片放进 `docs/public/photos/`，刷新页面即可看到；
2. 建子目录就是建相册，例如 `docs/public/photos/2026-西藏/`，目录名会成为筛选标签；
3. 支持 `jpg`、`png`、`webp`、`gif`、`avif`。

### 自定义相册信息

在相册目录里放一个 `album.json`：

```json
{
  "title": "2026 · 西藏",
  "desc": "海拔 4000 米以上的光",
  "order": 1,
  "photos": {
    "DSC_0012.jpg": {
      "title": "纳木错的清晨",
      "desc": "日出前 20 分钟"
    }
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `title` | 相册显示名，默认用目录名 |
| `desc` | 相册描述 |
| `order` | 排序权重，数字越小越靠前 |
| `photos` | 逐张覆盖标题与描述，键为文件名 |

### 生成缩略图（推荐）

直出原图动辄好几 MB，直接上墙会很吃流量。跑一次脚本即可生成 WebP 缩略图和模糊占位图：

```bash
npm run photos:thumb
```

产物：

- `docs/public/photos/_thumbs/` —— 长边 1200 的 WebP 缩略图，列表使用
- `docs/.vitepress/photo-lqip.json` —— 20px 模糊占位图，图片未加载时先顶上

两者都已加入 `.gitignore`，属于本地构建产物。脚本是增量的，源文件没变就跳过。
点开大图时才会去请求原图。

### 键盘与手势

| 操作 | 效果 |
| --- | --- |
| `←` / `→` | 上一张 / 下一张 |
| `Esc` | 关闭查看器 |
| `+` / `-` | 放大 / 缩小 |
| `i` | 显示或隐藏照片信息 |
| 滚轮 | 以指针为中心缩放 |
| 双击 | 快速放大或还原 |
| 左右滑动 | 移动端翻页 |

## 部署

推送到 `main` 分支后，[deploy.yml](.github/workflows/deploy.yml) 会自动构建并发布到 GitHub Pages。

首次使用需要在仓库的 **Settings → Pages → Build and deployment** 中，
把 **Source** 设为 **GitHub Actions**。

也可以在 Actions 页面手动触发（该工作流启用了 `workflow_dispatch`）。

### 部署到子路径

如果站点不在域名根目录（例如 `https://<用户名>.github.io/flog/`），
需要在 `docs/.vitepress/config.ts` 中补上 `base`：

```ts
export default withMermaid(defineConfig({
  base: '/flog/',
  // ...
}))
```

## 常见问题

**改了文章但侧边栏没更新？**

索引页在开发服务器启动时生成一次。新增文章目录或改动 frontmatter 后，重启 `npm run dev` 即可。

**影集页面是空的？**

确认照片放在 `docs/public/photos/` 下，且扩展名受支持。构建时终端会打印
`影集：共载入 N 张照片`，可据此判断是否扫描到。

**照片方向不对？**

竖拍照片的方向记录在 EXIF 里，构建期会自动换算。若原图本身没有 EXIF 方向信息，
请先用图片工具实际旋转后再放入目录。

**构建时提示解析图片失败？**

该照片会以默认尺寸兜底显示，不会中断构建。通常是文件损坏或格式不受支持，
用 `npm run photos:thumb` 重新生成一份 WebP 通常可以解决。

## 参与贡献

欢迎提 Issue 和 Pull Request。提交前请先阅读：

- [贡献指南](CONTRIBUTING.md)
- [行为准则](CODE_OF_CONDUCT.md)
- [安全策略](SECURITY.md)

版本变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

- **代码**：基于 [MIT 许可证](LICENSE) 开源，可自由使用、修改和分发。
- **内容**：`docs/` 下的文章与 `docs/public/photos/` 下的摄影作品版权归作者所有，
  未经许可请勿转载或用于商业用途。

---

Copyright © 2026 Jarod Chen
