# 贡献指南

感谢你愿意为 flog 出一份力。这是一个个人博客与影集站点，但代码部分完全开源，
欢迎任何形式的参与：报告问题、改进文档、修复缺陷、提出新想法。

参与本项目即表示你同意遵守[行为准则](CODE_OF_CONDUCT.md)。

## 目录

- [我可以做什么](#我可以做什么)
- [开发环境](#开发环境)
- [开发流程](#开发流程)
- [提交规范](#提交规范)
- [代码风格](#代码风格)
- [Pull Request 检查清单](#pull-request-检查清单)

## 我可以做什么

| 类型 | 说明 |
| --- | --- |
| 🐛 报告缺陷 | 发现页面错乱、构建失败、加载异常，请提 Issue |
| ✨ 功能建议 | 想要的新能力，先开 Issue 讨论再动手，避免白做 |
| 📝 改进文档 | 错别字、表述不清、示例过时，欢迎直接提 PR |
| ⚡ 性能优化 | 尤其是影集的加载与渲染，欢迎带上实测数据 |
| ♿ 可访问性 | 键盘操作、屏幕阅读器、对比度等改进 |

> 内容类改动（文章正文、照片）通常不接受外部 PR，因为那属于作者的个人记录。

## 开发环境

### 环境要求

- [Node.js](https://nodejs.org/) 20 或更高版本（CI 使用 22，建议保持一致）
- npm 10 或更高版本

仓库根目录提供了 `.nvmrc`，使用 [nvm](https://github.com/nvm-sh/nvm) 的话直接：

```bash
nvm use
```

### 起步

```bash
# 1. Fork 本仓库后克隆你的副本
git clone https://github.com/<你的用户名>/flog.git
cd flog

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

打开 <http://localhost:5173> 即可看到站点。修改源码会自动热更新。

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建，提交前务必跑一次 |
| `npm run preview` | 预览构建产物 |
| `npm run photos:thumb` | 生成影集缩略图与占位图 |

## 开发流程

1. **先开 Issue**。除了错别字这类小改动，动手前请先开 Issue 说明你要做什么，
   避免重复劳动或方向不一致。
2. **建分支**。从 `main` 切出一个语义化的分支名：

   ```bash
   git switch -c feat/photo-wall-keyboard-nav
   ```

   常用前缀：`feat/`、`fix/`、`docs/`、`perf/`、`refactor/`、`chore/`。
3. **小步提交**。一个提交只做一件事，方便审查和回溯。
4. **自测**。至少确认 `npm run build` 通过，并在浏览器里实际点一遍受影响的页面。
5. **提 PR**。填写 PR 模板，说清楚改了什么、为什么改、怎么验证的。

## 提交规范

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：

```text
<类型>(<可选范围>): <简短描述>

<可选正文>

<可选脚注>
```

### 类型

| 类型 | 用于 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档改动 |
| `style` | 格式调整，不影响逻辑 |
| `refactor` | 重构，既不加功能也不修缺陷 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `build` | 构建系统或依赖变更 |
| `ci` | CI 配置变更 |
| `chore` | 其他杂项 |

### 示例

```text
feat(gallery): 影集大图查看器支持方向键翻页

fix(blog): 修复分类页在无分类文章时报错

perf(gallery): 作品墙改用虚拟滚动，千张照片下滚动不再掉帧

docs: 补充影集 album.json 字段说明
```

### 破坏性变更

在类型后加 `!`，并在脚注中用 `BREAKING CHANGE:` 说明：

```text
feat(config)!: 影集照片目录调整为 docs/public/photos

BREAKING CHANGE: 原先放在 docs/public/gallery 下的照片需要手动迁移。
```

## 代码风格

项目没有强制的 lint 工具，但请保持与现有代码一致：

### 通用

- 缩进 2 个空格，不使用 Tab
- 语句末尾不写分号
- 字符串优先使用单引号
- 文件以 LF 换行、UTF-8 编码结尾留一个空行（`.editorconfig` 已配置）

### TypeScript / Vue

- 组件使用 `<script setup lang="ts">`
- 优先显式声明 props 类型，避免 `any`
- 组件文件名用 PascalCase，如 `PhotoWall.vue`
- 样式默认写在 `<style scoped>` 里，需要穿透时单独开一个非 scoped 块并写清用途

### 注释

- 注释解释**为什么**这么做，而不是复述代码在做什么
- 复杂算法（比如作品墙的排版与虚拟滚动）在文件或函数头部写一段说明
- 中文注释即可，与现有代码保持一致

### 性能

影集相关的改动请特别注意：

- 动画只用 `transform` 和 `opacity`，避免触发重排
- 滚动、resize 等高频事件要合帧（`requestAnimationFrame`）并使用 `passive` 监听
- 能在构建期算好的东西（尺寸、EXIF）不要放到运行时算

## Pull Request 检查清单

提交前请逐项确认：

- [ ] `npm run build` 通过，没有新增警告
- [ ] 在浏览器里实际验证过改动，必要时附上截图
- [ ] 提交信息符合 Conventional Commits
- [ ] 涉及用法变化时同步更新了 `README.md`
- [ ] 重要改动已记入 `CHANGELOG.md` 的「未发布」小节
- [ ] 没有提交构建产物、`node_modules` 或个人配置文件
- [ ] 没有提交与本次改动无关的文件

## 有疑问？

开一个 [Issue](https://github.com/jarodchen/flog/issues) 就好，我会尽快回复。
