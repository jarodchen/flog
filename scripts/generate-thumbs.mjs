/**
 * 影集缩略图 / 模糊占位图生成脚本（可选，但强烈建议跑）
 *
 * 用法：
 *   npm i -D sharp
 *   npm run photos:thumb
 *
 * 产物：
 *   docs/public/photos/_thumbs/**.webp   列表用缩略图（长边 1200，WebP）
 *   docs/.vitepress/photo-lqip.json      20px 模糊占位图（base64），用于「秒出图」
 *
 * 增量执行：源文件没变就跳过，重复运行很快。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PHOTO_ROOT = path.resolve(__dirname, '../docs/public/photos')
const THUMB_ROOT = path.join(PHOTO_ROOT, '_thumbs')
const LQIP_FILE = path.resolve(__dirname, '../docs/.vitepress/photo-lqip.json')

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])
const THUMB_MAX = 1200
const THUMB_QUALITY = 76
const CONCURRENCY = 4

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('\n❌ 未安装 sharp，无法生成缩略图。\n   请先执行：npm i -D sharp\n')
  process.exit(1)
}

function walk(dir, base = '') {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '_thumbs') continue
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel))
    else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) out.push(rel)
  }
  return out
}

function thumbPathOf(rel) {
  return path.join(THUMB_ROOT, rel.replace(/\.[^.]+$/, '.webp'))
}

async function processOne(rel, lqipMap) {
  const src = path.join(PHOTO_ROOT, rel)
  const dest = thumbPathOf(rel)
  const srcStat = fs.statSync(src)
  const fresh = fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= srcStat.mtimeMs

  if (!fresh) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    await sharp(src)
      .rotate() // 按 EXIF 方向摆正
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toFile(dest)
  }

  if (!fresh || !lqipMap[rel]) {
    const buf = await sharp(src)
      .rotate()
      .resize({ width: 20, height: 20, fit: 'inside' })
      .webp({ quality: 40 })
      .toBuffer()
    lqipMap[rel] = `data:image/webp;base64,${buf.toString('base64')}`
  }

  return fresh
}

async function run() {
  if (!fs.existsSync(PHOTO_ROOT)) {
    console.log(`📁 目录不存在：${PHOTO_ROOT}，先放几张照片再来吧。`)
    return
  }

  const files = walk(PHOTO_ROOT)
  if (!files.length) {
    console.log('📷 没有找到照片，跳过。')
    return
  }

  const lqipMap = fs.existsSync(LQIP_FILE)
    ? JSON.parse(fs.readFileSync(LQIP_FILE, 'utf-8'))
    : {}

  // 清理已删除照片的残留数据
  const alive = new Set(files)
  for (const key of Object.keys(lqipMap)) if (!alive.has(key)) delete lqipMap[key]

  let done = 0
  let skipped = 0
  let cursor = 0

  const worker = async () => {
    while (cursor < files.length) {
      const rel = files[cursor++]
      try {
        const fresh = await processOne(rel, lqipMap)
        fresh ? skipped++ : done++
        process.stdout.write(`\r🖼️  处理中 ${cursor}/${files.length}   `)
      } catch (e) {
        console.warn(`\n⚠️  跳过 ${rel}：${e.message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  fs.writeFileSync(LQIP_FILE, JSON.stringify(lqipMap, null, 0))
  console.log(`\n✅ 完成：新生成 ${done} 张，跳过 ${skipped} 张（未变化）`)
  console.log(`   缩略图目录：${THUMB_ROOT}`)
  console.log(`   占位图数据：${LQIP_FILE}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
