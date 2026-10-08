import DefaultTheme from 'vitepress/theme'
import type { EnhanceAppContext } from 'vitepress'
import { defineAsyncComponent } from 'vue'
import Layout from './Layout.vue'
import HomeCarousel from './components/HomeCarousel.vue'
import CategoryCarousel from './components/CategoryCarousel.vue'
import CategoryHeroCarousel from './components/CategoryHeroCarousel.vue'
import 'vitepress-plugin-mermaid-pan-zoom/dist/style.css'
import 'vitepress-allyouneed/theme/styles/index.css'

// 关系图谱组件（与 jarodchen.github.io 同源）。
// VaultGraph：vitepress-allyouneed 自带原版；GraphView：带搜索 / 标签 / 分类
// 过滤与边类型开关的增强版，/graph 页面使用。两者依赖 d3，仅浏览器端有意义，
// 故用异步组件 + <ClientOnly> 加载。
const VaultGraph = defineAsyncComponent(
  () => import('vitepress-allyouneed/theme/components/VaultGraph.vue'),
)
const GraphView = defineAsyncComponent(() => import('./GraphView.vue'))

export default {
  ...DefaultTheme,
  Layout,
  enhanceApp({ app }: EnhanceAppContext) {
    // 供首页 markdown 通过 <HomeCarousel /> 直接调用（浮动在文章列表右侧）
    app.component('HomeCarousel', HomeCarousel)
    // 供分类索引页 markdown 通过 <CategoryCarousel /> 调用（热门分类精选轮播）
    app.component('CategoryCarousel', CategoryCarousel)
    // 供分类详情页 markdown 通过 <CategoryHeroCarousel /> 调用（网格首位的卡片式轮播）
    app.component('CategoryHeroCarousel', CategoryHeroCarousel)
    // 原版关系图谱（无过滤）
    app.component('VaultGraph', VaultGraph)
    // 增强版关系图谱（搜索 / 标签 / 分类过滤 + 边类型开关），/graph 页面使用
    app.component('GraphView', GraphView)
  }
}
