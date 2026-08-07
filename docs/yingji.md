---
title: 影集
description: 摄影作品墙 —— 记录光影里的日常
sidebar: false
outline: false
# pageClass: gallery-page
layout: home
---

<script setup>
import PhotoWall from './.vitepress/theme/components/PhotoWall.vue'
</script>

# 影集

<!-- <p style="color: var(--vp-c-text-2); margin-top: -8px;">
按下 <kbd>←</kbd> <kbd>→</kbd> 翻页，<kbd>Esc</kbd> 关闭，滚轮或双击可放大。
</p> -->

按下 ← →  翻页，Esc  关闭，滚轮或双击可放大

<PhotoWall />

<!-- ::: details 怎么往墙上加照片？
1. 把照片丢进 `docs/public/photos/`，刷新即可看到；
2. 想分相册就建子目录，例如 `docs/public/photos/2026-西藏/`，目录名会变成筛选标签；
3. 想自定义相册名 / 单张照片标题，在相册目录里放一个 `album.json`：

```json
{
  "title": "2026 · 西藏",
  "desc": "海拔 4000 米以上的光",
  "order": 1,
  "photos": {
    "DSC_0012.jpg": { "title": "纳木错的清晨", "desc": "日出前 20 分钟" }
  }
}
```

4. 照片较多（或都是几 MB 的直出原图）时，先跑一次：

```bash
npm i -D sharp     # 只需装一次
npm run photos:thumb
```

会在 `docs/public/photos/_thumbs/` 生成 WebP 缩略图，并生成模糊占位图，
列表加载量通常能降到原来的 1/10 左右；点开大图时才会去取原图。

> 照片的宽高、拍摄参数（相机 / 光圈 / 快门 / ISO）都在构建期从文件里读好了，
> 页面运行时不需要解析图片，也就不会卡。
::: -->
