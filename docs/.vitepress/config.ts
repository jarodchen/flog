import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { generateBlogSidebar, updateArchivesPage, updateBlogIndexPage } from './blog-utils'
import { RssPlugin } from 'vitepress-plugin-rss'
import { BiDirectionalLinks } from '@nolebase/markdown-it-bi-directional-links' // [!code ++]
import { SITE_BASE } from './base'


// 启动时自动生成博客首页和归档页面（仅执行一次）
updateBlogIndexPage()
updateArchivesPage()

// RSS 配置
const rssOptions = {
  title: "局外人",
  // VitePress 的 base('/flog/') 会被 RSS 插件自动拼到 URL 前，
  // 这里只写站点根域名，否则会出现 /flog/flog/ 重复路径。
  baseUrl: "https://jarodchen.github.io",
  copyright: 'Copyright © 2026 Jarod Chen',
}

export default withMermaid(defineConfig({
  // GitHub Pages 项目站点部署在二级目录 /flog/，必须设置 base，
  // 否则所有 JS/CSS/图片资源都会请求到根目录而 404。
  base: SITE_BASE,

  title: "局外人",
  description: '技术学习历程、项目实践和知识分享',

  // Mermaid 图表配置（流程图、时序图、类图等）
  mermaid: {
    // 默认主题，可针对暗色模式在客户端进一步调整
    theme: 'default',
  },
  
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '博客', link: '/blog/categories/' },
      { text: '影集', link: '/yingji' },
      { text: '图库', link: '/tuku' },
      { text: '技术博客', link: 'https://jarodchen.github.io/', target: '_blank' },
      { text: '关于我', link: '/about' },
    ],
    
    sidebar: {
      '/': [
        {
          text: '概览',
          items: [
            { text: '首页', link: '/' },
            { text: '博客', link: '/blog/categories/' },
            { text: '影集', link: '/yingji' },
            { text: '图库', link: '/tuku' },
            { text: '技术博客', link: 'https://jarodchen.github.io/', target: '_blank' },
            { text: '关于我', link: '/about' }
          ]
        }
      ],
      '/blog/': generateBlogSidebar()
    },
    
    socialLinks: [
      { icon: 'github', link: 'https://github.com/jarodchen' }
    ],
    
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Jarod Chen'
    },
    
    editLink: {
      pattern: 'https://github.com/jarodchen/flog/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页'
    },
    
    lastUpdated: {
      text: '最后更新于',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'medium'
      }
    },
    
    // 文章目录（页面导航）默认在右侧；改为 'left' 可挪到左侧，false 为隐藏
    // aside: 'left',

    outline: {
      level: [2, 3],
      label: '页面导航'
    },
    
    search: {
      provider: 'local'
    }
  },
  
  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    config: (md) => {
      md.use(BiDirectionalLinks({
        dir: './docs',          // 链接解析的根目录，默认文档根目录
        includesPatterns: ['**/*.md'] // 匹配文件模式
      }) as any)
    }
  },
  
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: SITE_BASE + 'favicon.svg' }],
    ['meta', { name: 'keywords', content: 'Jarod Chen, GitHub Pages, Portfolio, .NET, JavaScript' }]
  ],
  
  vite: {
    plugins: [RssPlugin(rssOptions)]
  }
}))

// Auto-update: 2026-04-28T13:57:02.459Z