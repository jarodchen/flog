/**
 * 影集（摄影作品墙）构建期工具
 *
 * 作用：在 VitePress 构建 / 开发启动时扫描 `docs/public/photos` 目录，
 * 直接从图片文件头解析出「宽 / 高 / EXIF」，把这些信息随页面一起静态输出。
 *
 * 为什么要在构建期做：
 * 1. 前端拿到宽高 => 可以先算好版面（等高瀑布流），图片加载完不会引起回流抖动（避免 CLS）；
 * 2. 前端拿到宽高 => 可以做虚拟滚动，只渲染视口附近的图片，几千张图也不卡；
 * 3. EXIF（相机 / 光圈 / 快门 / ISO）在浏览器端解析要下载整张原图，构建期做完全零成本。
 *
 * 不依赖任何第三方图形库，纯 Node 读文件头。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SITE_BASE } from './base'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 照片根目录：docs/public/photos → 站点访问路径 /photos/** */
export const PHOTO_ROOT = path.resolve(__dirname, '../public/photos')
/** 缩略图目录名（由 `npm run photos:thumb` 生成，可选） */
const THUMB_DIR = '_thumbs'
/** 模糊占位图（LQIP）数据文件，可选 */
const LQIP_FILE = path.resolve(__dirname, 'photo-lqip.json')

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'])
/** 只读文件头部若干字节即可拿到尺寸与 EXIF */
const HEADER_BYTES = 256 * 1024

export interface PhotoExif {
  camera?: string
  lens?: string
  focal?: string
  aperture?: string
  shutter?: string
  iso?: string
  taken?: string
}

export interface PhotoItem {
  id: string
  /** 原图地址 */
  src: string
  /** 列表用图（存在 _thumbs 时为缩略图，否则回退原图） */
  thumb: string
  /** 极小模糊占位图（base64），可选 */
  lqip?: string
  width: number
  height: number
  /** 宽高比，前端排版直接用 */
  ratio: number
  album: string
  albumTitle: string
  title: string
  desc?: string
  /** 拍摄日期（优先 EXIF，回退文件修改时间） */
  date?: string
  /** 文件大小，KB */
  sizeKB: number
  exif?: PhotoExif
}

export interface PhotoAlbum {
  key: string
  title: string
  desc?: string
  count: number
  cover?: string
}

export interface GalleryData {
  photos: PhotoItem[]
  albums: PhotoAlbum[]
  total: number
  /** 目录不存在或没有图片时为 true，页面展示引导文案 */
  empty: boolean
}

/* -------------------------------------------------------------------------- */
/* 基础工具                                                                     */
/* -------------------------------------------------------------------------- */

function readHeader(file: string, max = HEADER_BYTES): Buffer {
  const fd = fs.openSync(file, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const len = Math.min(max, size)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, 0)
    return buf
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * 把相对路径转成可直接访问的 URL（中文 / 空格需要转义）。
 * 拼接 SITE_BASE（如 /flog/），否则部署在二级目录时图片会 404。
 */
function toUrl(rel: string): string {
  return SITE_BASE + 'photos/' + rel.split('/').map(encodeURIComponent).join('/')
}

/* -------------------------------------------------------------------------- */
/* 图片尺寸解析（jpg / png / gif / webp / avif）                                 */
/* -------------------------------------------------------------------------- */

interface RawSize {
  width: number
  height: number
  exifApp1?: Buffer
}

function sizeOfJpeg(buf: Buffer): RawSize | null {
  let offset = 2
  let exifApp1: Buffer | undefined
  while (offset + 4 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buf[offset + 1]
    // 无长度字段的标记
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    // 扫描到压缩数据说明后面没有元信息了
    if (marker === 0xda || marker === 0xd9) break

    const len = buf.readUInt16BE(offset + 2)
    if (len < 2) break

    // SOF0~SOF15（排除 DHT/JPG/DAC）里带着真实宽高
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSOF && offset + 9 <= buf.length) {
      return {
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
        exifApp1
      }
    }
    if (marker === 0xe1 && !exifApp1) {
      exifApp1 = buf.subarray(offset + 4, Math.min(offset + 2 + len, buf.length))
    }
    offset += 2 + len
  }
  return null
}

function sizeOfPng(buf: Buffer): RawSize | null {
  if (buf.length < 24) return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function sizeOfGif(buf: Buffer): RawSize | null {
  if (buf.length < 10) return null
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
}

function sizeOfWebp(buf: Buffer): RawSize | null {
  if (buf.length < 30) return null
  const chunk = buf.toString('ascii', 12, 16)
  if (chunk === 'VP8X') {
    const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1
    const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1
    return { width, height }
  }
  if (chunk === 'VP8 ') {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff
    }
  }
  if (chunk === 'VP8L') {
    const b0 = buf[21]
    const b1 = buf[22]
    const b2 = buf[23]
    const b3 = buf[24]
    return {
      width: (((b1 & 0x3f) << 8) | b0) + 1,
      height: (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) + 1
    }
  }
  return null
}

function sizeOfAvif(buf: Buffer): RawSize | null {
  const idx = buf.indexOf('ispe')
  if (idx < 0 || idx + 16 > buf.length) return null
  return { width: buf.readUInt32BE(idx + 8), height: buf.readUInt32BE(idx + 12) }
}

function readImageMeta(file: string): RawSize | null {
  const buf = readHeader(file)
  if (buf.length < 16) return null
  // 根据魔数判断真实类型，不信任扩展名
  if (buf[0] === 0xff && buf[1] === 0xd8) return sizeOfJpeg(buf)
  if (buf.toString('ascii', 1, 4) === 'PNG') return sizeOfPng(buf)
  if (buf.toString('ascii', 0, 3) === 'GIF') return sizeOfGif(buf)
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return sizeOfWebp(buf)
  }
  if (buf.toString('ascii', 4, 8) === 'ftyp') return sizeOfAvif(buf)
  return null
}

/* -------------------------------------------------------------------------- */
/* EXIF 解析（JPEG APP1 / TIFF）                                                */
/* -------------------------------------------------------------------------- */

const TYPE_SIZE: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8
}

const TAG_MAKE = 0x010f
const TAG_MODEL = 0x0110
const TAG_ORIENTATION = 0x0112
const TAG_EXIF_IFD = 0x8769
const TAG_EXPOSURE = 0x829a
const TAG_FNUMBER = 0x829d
const TAG_ISO = 0x8827
const TAG_DATE = 0x9003
const TAG_FOCAL = 0x920a
const TAG_LENS = 0xa434

interface ExifRaw {
  tags: Record<number, string | number>
  orientation: number
}

function parseExif(app1?: Buffer): ExifRaw | null {
  if (!app1 || app1.length < 16) return null
  if (app1.toString('ascii', 0, 4) !== 'Exif') return null
  const tiff = app1.subarray(6)
  if (tiff.length < 8) return null

  const order = tiff.toString('ascii', 0, 2)
  if (order !== 'II' && order !== 'MM') return null
  const le = order === 'II'

  const u16 = (o: number) => (o + 2 <= tiff.length ? (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o)) : 0)
  const u32 = (o: number) => (o + 4 <= tiff.length ? (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o)) : 0)

  if (u16(2) !== 42) return null

  const tags: Record<number, string | number> = {}
  const wanted = new Set([
    TAG_MAKE,
    TAG_MODEL,
    TAG_ORIENTATION,
    TAG_EXIF_IFD,
    TAG_EXPOSURE,
    TAG_FNUMBER,
    TAG_ISO,
    TAG_DATE,
    TAG_FOCAL,
    TAG_LENS
  ])

  const readValue = (type: number, count: number, valueOffset: number): string | number | undefined => {
    const unit = TYPE_SIZE[type]
    if (!unit) return undefined
    const total = unit * count
    const base = total <= 4 ? valueOffset : u32(valueOffset)
    if (base < 0 || base + total > tiff.length) return undefined
    if (type === 2) {
      return tiff.toString('ascii', base, base + count).replace(/\0.*$/, '').trim()
    }
    if (type === 3) return u16(base)
    if (type === 4) return u32(base)
    if (type === 5 || type === 10) {
      const num = u32(base)
      const den = u32(base + 4)
      if (!den) return 0
      return num / den
    }
    return undefined
  }

  const readIFD = (start: number, depth = 0) => {
    if (depth > 2 || start <= 0 || start + 2 > tiff.length) return
    const count = u16(start)
    if (count <= 0 || count > 512) return
    for (let i = 0; i < count; i++) {
      const entry = start + 2 + i * 12
      if (entry + 12 > tiff.length) break
      const tag = u16(entry)
      if (!wanted.has(tag)) continue
      const value = readValue(u16(entry + 2), u32(entry + 4), entry + 8)
      if (value === undefined) continue
      if (tag === TAG_EXIF_IFD) {
        readIFD(Number(value), depth + 1)
      } else {
        tags[tag] = value
      }
    }
  }

  readIFD(u32(4))
  return { tags, orientation: Number(tags[TAG_ORIENTATION] || 1) }
}

function formatShutter(v: number): string {
  if (!v || v <= 0) return ''
  if (v >= 1) return `${Number(v.toFixed(1))}s`
  return `1/${Math.round(1 / v)}s`
}

function buildExif(raw: ExifRaw | null): PhotoExif | undefined {
  if (!raw) return undefined
  const t = raw.tags
  const make = String(t[TAG_MAKE] || '').trim()
  const model = String(t[TAG_MODEL] || '').trim()
  // 机型里常常已经包含厂商名，避免出现 "SONY SONY ILCE-7M3"
  const camera = model
    ? model.toLowerCase().startsWith(make.toLowerCase()) || !make
      ? model
      : `${make} ${model}`
    : make

  const exif: PhotoExif = {}
  if (camera) exif.camera = camera
  const lens = String(t[TAG_LENS] || '').trim()
  if (lens) exif.lens = lens
  if (t[TAG_FOCAL]) exif.focal = `${Math.round(Number(t[TAG_FOCAL]))}mm`
  if (t[TAG_FNUMBER]) exif.aperture = `f/${Number(Number(t[TAG_FNUMBER]).toFixed(1))}`
  if (t[TAG_EXPOSURE]) exif.shutter = formatShutter(Number(t[TAG_EXPOSURE]))
  if (t[TAG_ISO]) exif.iso = `ISO ${Number(t[TAG_ISO])}`
  const date = String(t[TAG_DATE] || '')
  const m = date.match(/^(\d{4}):(\d{2}):(\d{2})/)
  if (m) exif.taken = `${m[1]}-${m[2]}-${m[3]}`

  return Object.keys(exif).length ? exif : undefined
}

/* -------------------------------------------------------------------------- */
/* 目录扫描                                                                     */
/* -------------------------------------------------------------------------- */

interface AlbumMeta {
  title?: string
  desc?: string
  order?: number
  photos?: Record<string, { title?: string; desc?: string }>
}

function readJson<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
  } catch {
    return null
  }
}

function walk(dir: string, base = ''): string[] {
  const out: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === THUMB_DIR) continue
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      out.push(...walk(path.join(dir, entry.name), rel))
    } else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(rel)
    }
  }
  return out
}

/**
 * 扫描照片目录，产出作品墙所需的全部静态数据
 */
export function loadGallery(): GalleryData {
  if (!fs.existsSync(PHOTO_ROOT)) {
    return { photos: [], albums: [], total: 0, empty: true }
  }

  const files = walk(PHOTO_ROOT)
  const lqipMap = readJson<Record<string, string>>(LQIP_FILE) || {}
  const albumMetaCache = new Map<string, AlbumMeta>()
  const photos: PhotoItem[] = []

  for (const rel of files) {
    const abs = path.join(PHOTO_ROOT, rel)
    const dir = path.posix.dirname(rel)
    const albumKey = dir === '.' ? 'default' : dir
    const fileName = path.posix.basename(rel)

    if (!albumMetaCache.has(albumKey)) {
      const metaFile =
        albumKey === 'default'
          ? path.join(PHOTO_ROOT, 'album.json')
          : path.join(PHOTO_ROOT, albumKey, 'album.json')
      albumMetaCache.set(albumKey, readJson<AlbumMeta>(metaFile) || {})
    }
    const meta = albumMetaCache.get(albumKey)!

    let width = 1600
    let height = 1200
    let exif: PhotoExif | undefined
    try {
      const raw = readImageMeta(abs)
      if (raw) {
        const parsed = raw.exifApp1 ? parseExif(raw.exifApp1) : null
        exif = buildExif(parsed)
        width = raw.width || width
        height = raw.height || height
        // 竖拍照片的 EXIF 方向需要换算，否则版面会横竖颠倒
        if (parsed && parsed.orientation >= 5 && parsed.orientation <= 8) {
          ;[width, height] = [height, width]
        }
      }
    } catch (e: any) {
      console.warn(`⚠️  影集：解析图片失败 ${rel} - ${e?.message || e}`)
    }

    let stat: fs.Stats | null = null
    try {
      stat = fs.statSync(abs)
    } catch {
      /* ignore */
    }

    const thumbAbs = path.join(
      PHOTO_ROOT,
      THUMB_DIR,
      dir === '.' ? '' : dir,
      fileName.replace(/\.[^.]+$/, '.webp')
    )
    const thumbRel = `${THUMB_DIR}/${dir === '.' ? '' : dir + '/'}${fileName.replace(/\.[^.]+$/, '.webp')}`
    const hasThumb = fs.existsSync(thumbAbs)

    const perPhoto = meta.photos?.[fileName] || {}
    const baseName = fileName.replace(/\.[^.]+$/, '')

    photos.push({
      id: rel,
      src: toUrl(rel),
      thumb: hasThumb ? toUrl(thumbRel) : toUrl(rel),
      lqip: lqipMap[rel],
      width,
      height,
      ratio: Number((width / Math.max(height, 1)).toFixed(4)),
      album: albumKey,
      albumTitle: meta.title || (albumKey === 'default' ? '未分类' : path.posix.basename(albumKey)),
      title: perPhoto.title || baseName,
      desc: perPhoto.desc,
      date: exif?.taken || (stat ? stat.mtime.toISOString().slice(0, 10) : undefined),
      sizeKB: stat ? Math.round(stat.size / 1024) : 0,
      exif
    })
  }

  // 新照片排前面
  photos.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id))

  const albumMap = new Map<string, PhotoAlbum>()
  for (const p of photos) {
    const album = albumMap.get(p.album)
    if (album) {
      album.count++
    } else {
      const meta = albumMetaCache.get(p.album) || {}
      albumMap.set(p.album, {
        key: p.album,
        title: p.albumTitle,
        desc: meta.desc,
        count: 1,
        cover: p.thumb
      })
    }
  }

  const albums = [...albumMap.values()].sort((a, b) => {
    const oa = albumMetaCache.get(a.key)?.order
    const ob = albumMetaCache.get(b.key)?.order
    if (oa != null || ob != null) return (oa ?? 999) - (ob ?? 999)
    return a.title.localeCompare(b.title, 'zh-CN')
  })

  return { photos, albums, total: photos.length, empty: photos.length === 0 }
}
