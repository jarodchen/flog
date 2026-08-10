import DefaultTheme from 'vitepress/theme'
import type { EnhanceAppContext } from 'vitepress'
import Layout from './Layout.vue'
import HomeCarousel from './components/HomeCarousel.vue'
import CategoryCarousel from './components/CategoryCarousel.vue'
import CategoryHeroCarousel from './components/CategoryHeroCarousel.vue'
import 'vitepress-plugin-mermaid-pan-zoom/dist/style.css'

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
  }
}
