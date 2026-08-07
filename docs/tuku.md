---
title: 图库
description: 收集的各种图片 —— 建筑、插画与其它
layout: home
sidebar: false
outline: false
pageClass: gallery-page
---

<script setup lang="ts">
import PhotoWall from './.vitepress/theme/components/PhotoWall.vue'
import { data } from './.vitepress/theme/pic.data'
</script>

平时看到的各种图片：建筑、插画、海报…… 慢慢攒。

<PhotoWall :gallery="data" group />
