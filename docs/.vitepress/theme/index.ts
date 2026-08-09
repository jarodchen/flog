import DefaultTheme from 'vitepress/theme'
import type { EnhanceAppContext } from 'vitepress'
import Layout from './Layout.vue'
import HomeCarousel from './components/HomeCarousel.vue'
import 'vitepress-plugin-mermaid-pan-zoom/dist/style.css'

export default {
  ...DefaultTheme,
  Layout,
  enhanceApp({ app }: EnhanceAppContext) {
    // 供首页 markdown 通过 <HomeCarousel /> 直接调用（浮动在文章列表右侧）
    app.component('HomeCarousel', HomeCarousel)
  }
}
