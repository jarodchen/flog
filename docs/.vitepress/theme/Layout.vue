<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData, useRoute } from 'vitepress'
import { computed, defineAsyncComponent, watch, nextTick } from 'vue'
import BackToTop from './components/BackToTop.vue'
import { SITE_BASE } from '../base'
import { SECTIONS, BLOG_SECTION } from '../sections'

const { Layout } = DefaultTheme
const { frontmatter, page } = useData()

// 桌面端滚动容器改成了 .Layout（而非整窗）。VitePress 内置的滚动复位依赖 window 滚动，
// 对 .Layout 无效，故这里在路由切换（非锚点跳转）时手动把 .Layout 滚回顶部。
const route = useRoute()
watch(
  () => route.path,
  () => {
    if (route.hash) return // 带锚点的跳转交给 VitePress 自行定位
    nextTick(() => {
      const el = document.querySelector<HTMLElement>('.Layout')
      if (el) el.scrollTop = 0
    })
  }
)

// 仅博客文章页显示元信息（有 title + date 视为文章页）
const isPost = computed(
  () => !!frontmatter.value.date && frontmatter.value.layout !== 'home'
)

const banner = computed(() =>  SITE_BASE + frontmatter.value.banner)


/**
 * 标签链接指向【当前文章所属板块】的标签页。
 * 板块由当前页面的源文件路径推断（blog / english / economics / law），
 * 推断不到时回退到随笔板块。
 */
function tagLink(tag: string) {
  const relPath = (page.value?.relativePath || page.value?.filePath || '').replace(/\\/g, '/')
  const sectionKey =
    SECTIONS.find(section => relPath.startsWith(section.key + '/'))?.key || BLOG_SECTION.key
  return SITE_BASE + `${sectionKey}/tags/${tag.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')}`
}

// Mermaid 平移缩放：该插件依赖 svg-pan-zoom（模块顶层引用 window / MutationObserver），
// 无法在 SSR 阶段执行，故通过 <ClientOnly> + 异步组件只在浏览器端加载。
const MermaidEnhancer = defineAsyncComponent(
  () => import('./components/MermaidEnhancer.vue')
)
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-before>
      <img
        v-if="frontmatter.banner"
        class="post-banner"
        :src="banner"
        :alt="'横幅：' + (frontmatter.title || '')"
      />
      <div v-if="isPost" class="post-meta">
        <span v-if="frontmatter.category" class="post-category">
          {{ frontmatter.category }}
        </span>
        <span v-if="frontmatter.date" class="post-date">{{ frontmatter.date }}</span>
      </div>
      <div v-if="isPost && frontmatter.tags && frontmatter.tags.length" class="post-tags">
        <a
          v-for="tag in frontmatter.tags"
          :key="tag"
          class="post-tag"
          :href="tagLink(tag)"
        >{{ tag }}</a>
      </div>
    </template>
  </DefaultTheme.Layout>

  <ClientOnly>
    <MermaidEnhancer />
  </ClientOnly>

  <BackToTop />
</template>

<style scoped>
.post-banner {
  display: block;
  width: 100%;
  max-height: 320px;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 20px;
}

.post-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
}

.post-category {
  color: var(--vp-c-brand);
  background: var(--vp-c-brand-soft);
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 12px;
}

.post-date {
  color: var(--vp-c-text-3);
}

.post-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.post-tag {
  display: inline-block;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--vp-c-brand);
  background: var(--vp-c-brand-soft);
  border-radius: 12px;
  text-decoration: none;
  transition: all 0.2s ease;
}

.post-tag:hover {
  background: var(--vp-c-brand);
  color: #fff;
}
</style>

<!-- 首页「文章分类」卡片样式 -->
<style>
.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin: 24px 0;
}

.cat-card {
  display: flex;
  flex-direction: column;
  padding: 16px 18px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
}

.cat-card:hover {
  border-color: var(--vp-c-brand);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  transform: translateY(-3px);
}

.cat-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}

.cat-card-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--vp-c-text-1);
  text-decoration: none;
}

.cat-card-title:hover {
  color: var(--vp-c-brand);
}

.cat-card-count {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-brand);
  background: var(--vp-c-brand-soft);
  padding: 2px 8px;
  border-radius: 10px;
}

.cat-card-list {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  line-height: 1.9;
}

.cat-card-list a {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.2s ease;
}

.cat-card-list a:hover {
  color: var(--vp-c-brand);
}

.cat-card-more {
  font-size: 12px;
}

.cat-foot {
  margin: 4px 0 0;
  text-align: center;
  color: var(--vp-c-text-2);
  font-size: 13px;
}
</style>

<!-- 全站滚动细化：细滚动条 + 平滑滚动 -->
<style>
/* 首页「最新文章」：轮播浮动在列表右侧，列表保持原 markdown 样式 */
.recent-carousel {
  float: right;
  width: 340px;
  max-width: 42%;
  margin: 4px 80px 20px 28px;
}

.recent-clear {
  clear: both;
}

@media (max-width: 860px) {
  .recent-carousel {
    float: none;
    width: 100%;
    max-width: 420px;
    margin: 16px 0;
  }
}

html {
  scroll-behavior: smooth;
}

/* Firefox 细滚动条 */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--vp-c-divider) transparent;
}

/* WebKit（Chrome / Edge / Safari）细滚动条 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background-color: var(--vp-c-divider);
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

::-webkit-scrollbar-thumb:hover {
  background-color: var(--vp-c-text-3);
}

/* 桌面端：滚动容器改为整个 .Layout（绝对定位到 header 以下，铺满剩余视口）
   - 整窗不再滚动（overflow: hidden），唯一滚动容器是 .Layout
   - 滚动条只在 header 以下，不穿过 header
   - 页脚 .VPFooter 是 .Layout 的子节点，随内容一起滚到末尾、自然排布（不再钉死在视口底）
   - .VPContent 回到默认文档流（不再单独定高 / overflow）；
     图片墙虚拟滚动、回到顶部等基于“此滚动容器”的逻辑统一改挂到 .Layout（见 PhotoWall / BackToTop） */
@media (min-width: 960px) {
  html,
  body {
    height: 100%;
    overflow: hidden;
  }

  /* 注意：VitePress 默认 .Layout 带 min-height:100vh 且选择器带了 [data-v-*] 后缀、
     特异性比这里高。用 .Layout.Layout 提升特异性把它压住，并显式 min-height:0，
     否则容器会被撑成 100vh 高、从 nav 处往下延伸，底部 nav 高度被视口裁掉，页脚显示不全。 */
  .Layout.Layout {
    position: absolute;
    top: var(--vp-nav-height);
    left: 0;
    right: 0;
    bottom: 0;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
  }

  /* .Layout 已从 header 下方开始，内容不再需要额外下移 */
  .VPContent {
    margin-top: 0 !important;
    padding-top: 0 !important;
  }

  /* 锚点滚动后标题与 header 留一点间隔即可（header 已由 .Layout 顶边承担） */
  .VPContent :is(h1, h2, h3, h4, h5, h6) {
    scroll-margin-top: 16px;
  }
}
</style>
