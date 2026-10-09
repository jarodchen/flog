// VitePress 配置扩展 - 自动更新各板块首页 / 归档页 / 分类页 / 标签页 / 站点首页
import { getSectionPostsMetadata, generateSectionSidebar, getAllRewrites } from './sidebar-generator'
import { SITE_BASE } from './base'
import { updateAllCategoryPages, updateAllCategoryPagesAllSections } from './category-generator'
import { updateAllTagPages, updateAllTagPagesAllSections } from './tag-generator'
import { SECTIONS, getSection, sectionUrl, sectionPath, BLOG_SECTION, STUDY_SECTIONS } from './sections'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 防抖定时器，避免频繁触发
let updateTimer: NodeJS.Timeout | null = null;
let isUpdating = false;

/**
 * 全量重新生成：所有板块的（首页 / 归档 / 分类 / 标签）+ 站点首页
 * 由 config.ts 在启动时显式调用
 */
export function regenerateAll() {
  try {
    SECTIONS.forEach(section => {
      updateSectionIndexPage(section.key)
      updateSectionArchivesPage(section.key)
    })
    updateAllCategoryPagesAllSections()
    updateAllTagPagesAllSections()
    updateHomePage()
  } catch (error) {
    console.error('⚠️  初始化生成页面失败:', error.message)
  }
}

// 仅在开发模式下启动文件监听器（避免阻塞 CI/CD 构建）
const isDevMode = process.env.NODE_ENV !== 'production' && !process.argv.includes('build')

if (isDevMode) {
  // 监听所有板块目录变化，自动重新生成（排除自动生成的文件）
  SECTIONS.forEach(section => {
    const sectionDir = path.resolve(__dirname, '../' + section.key)
    if (!fs.existsSync(sectionDir)) return

    try {
      fs.watch(sectionDir, { recursive: true }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return;

        // 排除自动生成的文件，避免循环触发
        const excludedFiles = ['index.md', 'archives.md'];

        // 检查是否在自动生成目录中（categories / tags）
        if (
          filename.includes('categories\\') || filename.includes('categories/') ||
          filename.includes('tags\\') || filename.includes('tags/')
        ) {
          return;
        }

        // 检查是否是排除的文件（自动生成的）
        if (excludedFiles.includes(filename)) {
          return;
        }

        console.log(`\n📝 检测到「${section.name}」文章变化: ${filename}`);

        // 使用防抖，500ms 后再执行更新，避免频繁触发
        if (updateTimer) {
          clearTimeout(updateTimer);
        }

        updateTimer = setTimeout(() => {
          if (!isUpdating) {
            isUpdating = true;
            updateSectionIndexPage(section.key)
            updateSectionArchivesPage(section.key)
            updateAllCategoryPages(section.key)
            updateAllTagPages(section.key)
            updateHomePage()
            console.log('✨ 页面已自动更新\n');
            isUpdating = false;
          }
        }, 500);
      })
    } catch (error) {
      console.error(`⚠️  「${section.name}」文件监听失败:`, error.message)
    }
  })
  console.log('👀 正在监听各板块文章变化...（仅监听手动创建的文章文件）\n')
}

// 重新导出函数供 config.ts 使用
export { generateSectionSidebar, getAllRewrites }

/**
 * markdown 链接（[text](href)）用：不带 base 的站点根绝对路径。
 * VitePress 渲染 markdown 链接时会自动补上 base；
 * 若写成 /flog/... 会被判定为 dead link 并导致构建失败。
 */
function mdHref(link: string): string {
  return link.startsWith('/') ? link : '/' + link
}

/**
 * 原生 HTML <a href> 用：VitePress 不处理原生 HTML 的 href，必须自己拼上 base。
 */
function htmlHref(link: string): string {
  return SITE_BASE + link.replace(/^\//, '')
}

/** 按年份分组 */
function groupByYear(posts: ReturnType<typeof getSectionPostsMetadata>) {
  const postsByYear: Record<string, typeof posts> = {}
  posts.forEach(post => {
    if (!postsByYear[post.year]) postsByYear[post.year] = []
    postsByYear[post.year].push(post)
  })
  return postsByYear
}

/** 取最新（最大）的有效数字年份；没有则返回 undefined */
function pickLatestYear(postsByYear: Record<string, unknown[]>): string | undefined {
  const numericYears = Object.keys(postsByYear).filter(y => /^\d{4}$/.test(y))
  if (!numericYears.length) return undefined
  return numericYears.sort((a, b) => parseInt(b) - parseInt(a))[0]
}

/** 生成「分类卡片网格」的 markdown */
function buildCategoryGrid(
  sectionKey: string,
  posts: ReturnType<typeof getSectionPostsMetadata>
): string {
  const postsByCategory: Record<string, typeof posts> = {}
  posts.forEach(post => {
    const category = post.category || '未分类'
    if (!postsByCategory[category]) postsByCategory[category] = []
    postsByCategory[category].push(post)
  })

  let grid = '<div class="cat-grid">\n\n'

  Object.keys(postsByCategory).forEach(category => {
    const categoryPosts = postsByCategory[category]
    const categoryLink = sectionUrl(sectionKey, 'categories', category.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-'))

    grid += `<div class="cat-card">
  <h4 class="cat-card-head">
    <a href="${categoryLink}" class="cat-card-title">📁 ${category}</a>
    <span class="cat-card-count">${categoryPosts.length} 篇</span>
  </h4>
  <ul class="cat-card-list">
`

    categoryPosts.slice(0, 3).forEach(post => {
      grid += `    <li><a href="${htmlHref(post.link)}">${post.title}</a></li>\n`
    })

    if (categoryPosts.length > 3) {
      grid += `    <li><a href="${categoryLink}" class="cat-card-more">... 查看更多 (${categoryPosts.length - 3} 篇)</a></li>\n`
    }

    grid += `  </ul>
</div>

`
  })

  grid += '</div>\n'
  return grid
}

/**
 * 生成【指定板块】的目录页（docs/<key>/index.md）
 * 仅作为文章目录（按年份列出全部文章 + 分类入口），不是首页。
 * 全站只有一个首页：站点根 /（由 updateHomePage 生成）。
 */
export function updateSectionIndexPage(sectionKey: string) {
  try {
    const section = getSection(sectionKey)
    const posts = getSectionPostsMetadata(sectionKey)
    const postsByYear = groupByYear(posts)

    let content = `---
title: ${section.name}
description: ${section.description}
---

# ${section.emoji} ${section.name}（${posts.length} 篇）

浏览「${section.name}」板块的全部文章，按年份归档，或用下方的分类 / 标签筛选。

`

    // 按年份完整列出文章（目录页：展示全部，而不像首页只挑最新几篇）
    const years = Object.keys(postsByYear).sort((a, b) => {
      const na = parseInt(a)
      const nb = parseInt(b)
      if (isNaN(na)) return 1
      if (isNaN(nb)) return -1
      return nb - na
    })

    if (years.length === 0) {
      content += `*本板块暂无文章，在 \`docs/${sectionKey}/\` 下新建 .md 即可自动收录。*\n\n`
    }

    years.forEach(year => {
      const yearPosts = postsByYear[year]
      content += `## ${year} 年（${yearPosts.length} 篇）\n\n`
      yearPosts.forEach(post => {
        content += `- [${post.title}](${mdHref(post.link)})`
        if (post.date) {
          content += ` <span style="color: #999; font-size: 0.85em;">${post.date}</span>`
        }
        if (post.category) {
          content += ` <span style="color: var(--vp-c-brand); font-size: 0.85em;">[${post.category}]</span>`
        }
        content += '\n'
      })
      content += '\n'
    })

    // 分类列表（普通 bullet，区别于首页的卡片网格）
    const postsByCategory: Record<string, typeof posts> = {}
    posts.forEach(post => {
      const category = post.category || '未分类'
      if (!postsByCategory[category]) postsByCategory[category] = []
      postsByCategory[category].push(post)
    })
    const categories = Object.keys(postsByCategory).sort(
      (a, b) => postsByCategory[b].length - postsByCategory[a].length
    )
    if (categories.length) {
      content += `---\n\n## 分类\n\n`
      categories.forEach(category => {
        const link = sectionPath(sectionKey, 'categories', category.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-'))
        content += `- [${category}](${link})（${postsByCategory[category].length} 篇）\n`
      })
      content += '\n'
    }

    content += `---\n\n[📚 文章归档](${sectionPath(sectionKey, 'archives')}) | [🏷️ 标签索引](${sectionPath(sectionKey, 'tags')}) | [📁 分类索引](${sectionPath(sectionKey, 'categories')}/)\n\n`

    content += `<!--
  注意：此文件由 content-utils.ts 自动生成，请勿手动编辑。
  如需修改，请更新 docs/.vitepress/content-utils.ts 中的 updateSectionIndexPage() 函数。
-->
`

    const outputPath = path.resolve(__dirname, `../${sectionKey}/index.md`)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, content, 'utf-8')

    console.log(`✅ 「${section.name}」目录页已更新 (${posts.length} 篇文章)`)
  } catch (error) {
    console.error(`❌ 更新目录页失败 (${sectionKey}):`, error.message)
  }
}


/**
 * 生成【指定板块】的归档页（docs/<key>/archives.md）
 */
export function updateSectionArchivesPage(sectionKey: string) {
  try {
    const section = getSection(sectionKey)
    const posts = getSectionPostsMetadata(sectionKey)
    const postsByYear = groupByYear(posts)

    let content = `---
title: ${section.name} · 文章归档
description: 按时间顺序浏览${section.name}板块的所有文章
---

# ${section.emoji} ${section.name} · 文章归档

按时间顺序查看「${section.name}」板块的全部文章，方便快速定位和回顾。

`

    const years = Object.keys(postsByYear).sort((a, b) => {
      const na = parseInt(a)
      const nb = parseInt(b)
      // 「未知」等非法年份排最后
      if (isNaN(na)) return 1
      if (isNaN(nb)) return -1
      return nb - na
    })

    if (years.length === 0) {
      content += '*本板块暂无文章。*\n\n'
    }

    years.forEach(year => {
      const yearPosts = postsByYear[year]
      content += `## ${year} 年（${yearPosts.length} 篇）\n\n`

      yearPosts.forEach(post => {
        content += `- [${post.title}](${mdHref(post.link)})`
        if (post.date) {
          content += ` <span style="color: #999; font-size: 0.85em;">${post.date}</span>`
        }
        // 只在有分类时显示
        if (post.category) {
          content += ` <span style="color: var(--vp-c-brand); font-size: 0.85em;">[${post.category}]</span>`
        }
        content += '\n'
      })

      content += '---\n\n'
    })

    const totalPosts = posts.length
    const currentYear = new Date().getFullYear().toString()
    const thisYearPosts = postsByYear[currentYear]?.length || 0
    const latestPost = posts[0]

    content += `## 统计信息

- **总文章数**: ${totalPosts} 篇
- **今年发布**: ${thisYearPosts} 篇
- **最近一篇**: ${latestPost?.date || '暂无'}

---

[← 返回${section.name}首页](${sectionPath(sectionKey)}/)

<!--
  注意：此文件由 content-utils.ts 自动生成，请勿手动编辑。
-->
`

    const outputPath = path.resolve(__dirname, `../${sectionKey}/archives.md`)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, content, 'utf-8')

    console.log(`✅ 「${section.name}」归档页已更新 (${totalPosts} 篇文章)`)
  } catch (error) {
    console.error(`❌ 更新归档页失败 (${sectionKey}):`, error.message)
  }
}

/**
 * 生成站点首页（docs/index.md）
 * 结构：hero → 随笔最新文章 → 学习板块（英语 / 经济 / 法律）→ 随笔分类 → 订阅
 */
export function updateHomePage() {
  try {
    const posts = getSectionPostsMetadata(BLOG_SECTION.key)
    const postsByYear = groupByYear(posts)
    const latestYear = pickLatestYear(postsByYear)
    const recentPosts = latestYear ? postsByYear[latestYear] : []
    const displayPosts = recentPosts.slice(0, 5)
    const hasMorePosts = recentPosts.length > 5

    let content = `---
layout: home
title: 局外人
description: ${BLOG_SECTION.description} · ${STUDY_SECTIONS.map(s => s.name).join(' · ')}
sidebar: false
hero:
  name: 局外人
  tagline: 身在局内，心在局外，莫向外求，不装，不演，不厌
---

# 最新随笔 {#recent}

<div class="recent-carousel">
<HomeCarousel :count="3" />
</div>

`

    if (displayPosts.length > 0) {
      content += `### ${latestYear} 年（${recentPosts.length} 篇，显示最新 ${displayPosts.length} 篇）\n\n`

      displayPosts.forEach(post => {
        content += `- [${post.title}](${mdHref(post.link)})`
        if (post.date) {
          content += ` <span style="color: #999; font-size: 0.9em;">${post.date}</span>`
        }
        content += '\n'
      })

      if (hasMorePosts) {
        content += `\n*还有 ${recentPosts.length - 5} 篇随笔，请查看[归档页面](${sectionPath(BLOG_SECTION.key, 'archives')})*\n\n`
      }

      content += `\n[📚 查看更多随笔 →](${sectionPath(BLOG_SECTION.key, 'archives')})\n\n`
    } else {
      content += '*暂无随笔*\n\n'
    }

    content += `<div class="recent-clear"></div>

---

# 学习板块 {#study}

<div class="cat-grid">

`

    // 三个学习板块卡片
    STUDY_SECTIONS.forEach(section => {
      const sectionPosts = getSectionPostsMetadata(section.key)
      const sectionHome = sectionUrl(section.key) + '/'

      content += `<div class="cat-card">
  <h4 class="cat-card-head">
    <a href="${sectionHome}" class="cat-card-title">${section.emoji} ${section.name}</a>
    <span class="cat-card-count">${sectionPosts.length} 篇</span>
  </h4>
  <ul class="cat-card-list">
`

      if (sectionPosts.length > 0) {
        sectionPosts.slice(0, 3).forEach(post => {
          content += `    <li><a href="${htmlHref(post.link)}">${post.title}</a></li>\n`
        })
        if (sectionPosts.length > 3) {
          content += `    <li><a href="${sectionUrl(section.key, 'archives')}" class="cat-card-more">... 查看更多 (${sectionPosts.length - 3} 篇)</a></li>\n`
        }
      } else {
        content += `    <li style="color: var(--vp-c-text-3);">暂无文章，敬请期待</li>\n`
      }

      content += `  </ul>
</div>

`
    })

    content += `</div>

<p class="cat-foot">
  👆 进入板块查看完整文章列表、分类与标签
</p>

---

# 随笔分类 {#categories}

${buildCategoryGrid(BLOG_SECTION.key, posts)}

<p class="cat-foot">
  👆 点击分类查看该分类下的所有随笔 |
  <a href="${sectionUrl(BLOG_SECTION.key, 'categories')}/">查看完整分类索引</a>
</p>

---

# 订阅与关注

- 💻 GitHub：[@jarodchen](https://github.com/jarodchen)
- 📋 [随笔归档](${sectionPath(BLOG_SECTION.key, 'archives')}) - 查看所有历史随笔

<!--
  注意：此文件由 content-utils.ts 自动生成，请勿手动编辑。
  如需修改，请更新 docs/.vitepress/content-utils.ts 中的 updateHomePage() 函数。
-->
`

    const outputPath = path.resolve(__dirname, '../index.md')
    fs.writeFileSync(outputPath, content, 'utf-8')

    console.log(`✅ 站点首页已更新`)
  } catch (error) {
    console.error('❌ 更新站点首页失败:', error.message)
  }
}
