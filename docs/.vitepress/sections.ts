import { SITE_BASE } from './base'

/**
 * 站点内容板块注册表（单一真源）。
 *
 * 站点内容分为两类：
 * - blog：随笔（目录与 URL 沿用 /blog/，显示名为「随笔」）
 * - study：学习板块（英语 / 经济 / 法律）
 *
 * 四个板块在目录与 URL 上【平级】：docs/<key>/ → /<key>/...
 * 导航上则把三个学习板块收拢到「学习」下拉里，便于浏览。
 *
 * 新增板块只需在这里追加一项，侧边栏 / 分类 / 标签 / 归档 / 首页
 * 全部由脚本按此表自动生成，无需改其它文件。
 */

export type SectionGroup = 'blog' | 'study'

export interface SectionConfig {
  /** 目录名，同时也是 URL 段：docs/<key>/ → /<key>/ */
  key: string
  /** 导航 / 侧边栏显示名 */
  name: string
  /** 板块图标 */
  emoji: string
  /** 板块简介（用于板块首页与首页卡片） */
  description: string
  /** 所属分组 */
  group: SectionGroup
}

export const SECTIONS: SectionConfig[] = [
  {
    // 随笔板块沿用原有目录名 blog（URL 仍是 /blog/...），显示名为「随笔」
    key: 'blog',
    name: '随笔',
    emoji: '📝',
    description: '读书、观影与生活随想',
    group: 'blog',
  },
  {
    key: 'english',
    name: '英语',
    emoji: '🔤',
    description: '英语学习笔记与积累',
    group: 'study',
  },
  {
    key: 'economics',
    name: '经济',
    emoji: '📈',
    description: '经济学阅读与思考',
    group: 'study',
  },
  {
    key: 'law',
    name: '法律',
    emoji: '⚖️',
    description: '法律知识学习与整理',
    group: 'study',
  },
]

/** 随笔板块（站点主内容，目录与 URL 为 /blog/） */
export const BLOG_SECTION: SectionConfig = SECTIONS[0]

/** 学习板块（英语 / 经济 / 法律） */
export const STUDY_SECTIONS: SectionConfig[] = SECTIONS.filter(s => s.group === 'study')

/** 按 key 取板块配置，未注册则抛错（尽早暴露拼写错误） */
export function getSection(key: string): SectionConfig {
  const found = SECTIONS.find(s => s.key === key)
  if (!found) {
    throw new Error(`未注册的板块 key: "${key}"，请检查 docs/.vitepress/sections.ts`)
  }
  return found
}

/**
 * 板块内路径的【站点根绝对路径】（不带 base），例如 /blog/archives。
 *
 * 重要：VitePress 的内部路由不含 base，markdown 里的链接（[x](y)）必须写成
 * 不带 base 的形式，VitePress 渲染时会自动补上 base；写成 /flog/... 会被
 * 判定为 dead link 导致构建失败。
 */
export function sectionPath(sectionKey: string, ...segments: string[]): string {
  const parts = [sectionKey, ...segments.filter(Boolean)]
  return '/' + parts.join('/')
}

/** 板块根目录的站点绝对路径（带 base，用于 markdown 里的 <a href>） */
export function sectionUrl(sectionKey: string, ...segments: string[]): string {
  const parts = [sectionKey, ...segments.filter(Boolean)]
  return SITE_BASE + parts.join('/')
}

/** 分类 / 标签名 → URL 安全片段（与生成器共用，避免各处正则不一致） */
export function slugifyName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')
}
