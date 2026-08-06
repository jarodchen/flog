/**
 * 站点 base 单一真源。
 *
 * 本项目部署在 GitHub Pages 的二级目录 /flog/，所有需要拼接 base 的地方
 * （VitePress 配置、照片 URL、favicon、RSS 等）都必须从这里取，
 * 改路径时只改这一处，避免漏改导致资源 404。
 */
export const SITE_BASE = '/flog/'
