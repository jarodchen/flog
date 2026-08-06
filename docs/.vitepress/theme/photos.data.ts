/**
 * 影集数据加载器（VitePress 构建期数据）
 *
 * 由 VitePress 在构建 / 开发时执行 `load()`，结果被序列化进页面。
 * 前端只 `import { data } from './photos.data'` 即可拿到全部照片元信息，
 * 运行时零请求、零解析，不会阻塞首屏。
 *
 * 开发模式下往 docs/public/photos 里增删图片会自动热更新。
 */
import { defineLoader } from 'vitepress'
import { loadGallery } from '../photo-utils'
import type { GalleryData, PhotoAlbum, PhotoExif, PhotoItem } from '../photo-utils'

export type { GalleryData, PhotoAlbum, PhotoExif, PhotoItem }

declare const data: GalleryData
export { data }

export default defineLoader({
  watch: ['../../public/photos/**/*'],
  load(): GalleryData {
    const gallery = loadGallery()
    console.log(`📷 影集：共载入 ${gallery.total} 张照片，${gallery.albums.length} 个相册`)
    return gallery
  }
})
