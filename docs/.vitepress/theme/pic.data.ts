/**
 * 图库（收集的其它图片）数据加载器（VitePress 构建期数据）
 *
 * 与 photos.data.ts 同构，只是扫描 docs/public/pic 目录，
 * 站点访问前缀为 /pic/。开发模式下往 docs/public/pic 增删图片会自动热更新。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineLoader } from 'vitepress'
import { loadGallery } from '../photo-utils'
import type { GalleryData, PhotoAlbum, PhotoExif, PhotoItem } from '../photo-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 注意：本文件在 .vitepress/theme/ 下，要比 photos.data.ts 多上一级才能到 docs/public/pic
const PIC_ROOT = path.resolve(__dirname, '../../public/pic')

export type { GalleryData, PhotoAlbum, PhotoExif, PhotoItem }

declare const data: GalleryData
export { data }

export default defineLoader({
  watch: ['../../public/pic/**/*'],
  load(): GalleryData {
    const gallery = loadGallery(PIC_ROOT, 'pic')
    console.log(`🖼️  图库：共载入 ${gallery.total} 张图片，${gallery.albums.length} 个相册`)
    return gallery
  }
})
