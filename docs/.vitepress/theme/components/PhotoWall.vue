<script setup lang="ts">
/**
 * 摄影作品墙
 *
 * 性能要点（保证几百上千张图也不卡）：
 * 1. 版面在构建期就知道每张图的宽高比 —— 直接算好「等高瀑布流」，图片加载前后布局不变，无重排抖动；
 * 2. 虚拟滚动 —— 只渲染视口上下各一屏内的行，DOM 节点常年维持在几十个；
 * 3. 图片 `loading="lazy"` + `decoding="async"`，解码不阻塞主线程；
 * 4. 滚动 / 缩放事件全部走 requestAnimationFrame 合帧，且监听器 passive；
 * 5. 动效只用 transform / opacity，不触发 layout；
 * 6. 有缩略图用缩略图（_thumbs），有 LQIP 用模糊占位，视觉上「秒开」。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { data as gallery } from '../photos.data'
import type { PhotoItem } from '../photos.data'
import PhotoLightbox from './PhotoLightbox.vue'

const props = withDefaults(
  defineProps<{
    /** 只显示某个相册（目录名），默认全部 */
    album?: string
    /** 图片间距 */
    gap?: number
  }>(),
  { album: '', gap: 12 }
)

/**
 * 挂载前（SSR / hydration 阶段）用纯 CSS 弹性布局占位：
 * 行内各图按宽高比分配宽度，自然等高且随容器自适应，因此换到 JS 精确排版时不会跳版。
 * 这一阶段只输出首屏若干张，HTML 体积可控。
 */
const SSR_WIDTH = 1100
const SSR_VIEWPORT = 900
const SSR_LIMIT = 24

const albums = gallery.albums
const activeAlbum = ref(props.album || 'all')

const photos = computed<PhotoItem[]>(() =>
  activeAlbum.value === 'all'
    ? gallery.photos
    : gallery.photos.filter((p) => p.album === activeAlbum.value)
)

/* ----------------------------- 尺寸与滚动状态 ----------------------------- */

const wrapEl = ref<HTMLElement | null>(null)
const containerWidth = ref(SSR_WIDTH)
const viewportH = ref(SSR_VIEWPORT)
const scrollY = ref(0)
const wallTop = ref(0)
/** 是否已挂载：挂载后才启用「精确排版 + 虚拟滚动」 */
const mounted = ref(false)

/** 目标行高：窄屏矮一点，宽屏高一点 */
const targetRowHeight = computed(() => {
  const w = containerWidth.value
  if (w < 520) return 150
  if (w < 820) return 200
  if (w < 1200) return 240
  return 280
})

interface Cell {
  p: PhotoItem
  w: number
  h: number
}
interface Row {
  key: string
  top: number
  height: number
  /** 末行不拉伸铺满 */
  last: boolean
  cells: Cell[]
}

/** 参与排版的照片：挂载前只排首屏若干张 */
const layoutList = computed<PhotoItem[]>(() =>
  mounted.value ? photos.value : photos.value.slice(0, SSR_LIMIT)
)

/** 等高瀑布流（Flickr / Google Photos 式）行排版 */
const rows = computed<Row[]>(() => {
  const list = layoutList.value
  const width = containerWidth.value
  const gap = props.gap
  const target = targetRowHeight.value
  const result: Row[] = []
  if (!list.length || width <= 0) return result

  let buffer: PhotoItem[] = []
  let ratioSum = 0

  const flush = (isLast: boolean) => {
    if (!buffer.length) return
    const avail = width - gap * (buffer.length - 1)
    const raw = avail / ratioSum
    // 末行不拉伸铺满，避免只剩一张图时被放大到全屏宽
    const height = Math.round(isLast ? Math.min(target, raw) : raw)
    const cells: Cell[] = buffer.map((p) => ({
      p,
      w: Math.floor(p.ratio * height),
      h: height
    }))
    if (!isLast) {
      // 抹平取整误差，保证整行严丝合缝
      const used = cells.reduce((s, c) => s + c.w, 0)
      cells[cells.length - 1].w += avail - used
    }
    result.push({ key: `${buffer[0].id}:${buffer.length}`, top: 0, height, last: isLast, cells })
    buffer = []
    ratioSum = 0
  }

  for (const p of list) {
    buffer.push(p)
    ratioSum += p.ratio
    const avail = width - gap * (buffer.length - 1)
    if (avail / ratioSum <= target) flush(false)
  }
  flush(true)

  let top = 0
  for (const row of result) {
    row.top = top
    top += row.height + gap
  }
  return result
})

const totalHeight = computed(() => {
  const list = rows.value
  if (!list.length) return 0
  const last = list[list.length - 1]
  return last.top + last.height
})

/** 只渲染视口上下各一屏内的行 */
const visibleRows = computed<Row[]>(() => {
  const list = rows.value
  if (!list.length) return list
  const vh = viewportH.value
  const offset = scrollY.value - wallTop.value
  const min = offset - vh
  const max = offset + vh * 2
  const out: Row[] = []
  for (const row of list) {
    if (row.top + row.height < min) continue
    if (row.top > max) break
    out.push(row)
  }
  return out
})

/** 实际渲染的行：挂载后走虚拟滚动 */
const displayRows = computed<Row[]>(() => (mounted.value ? visibleRows.value : rows.value))

function rowStyle(row: Row) {
  return mounted.value
    ? {
        transform: `translate3d(0, ${row.top}px, 0)`,
        height: row.height + 'px',
        gap: props.gap + 'px'
      }
    : { marginBottom: props.gap + 'px', gap: props.gap + 'px' }
}

function cellStyle(row: Row, cell: Cell) {
  const bg = cell.p.lqip ? `url(${cell.p.lqip})` : undefined
  if (mounted.value) {
    return { width: cell.w + 'px', height: cell.h + 'px', backgroundImage: bg }
  }
  // 未挂载：整行按比例弹性分配宽度，天然等高且随容器自适应
  return row.last
    ? { flex: '0 0 auto', height: cell.h + 'px', aspectRatio: String(cell.p.ratio), backgroundImage: bg }
    : { flex: `${cell.p.ratio} 1 0%`, aspectRatio: String(cell.p.ratio), backgroundImage: bg }
}

/* --------------------------------- 加载态 -------------------------------- */

const loaded = reactive(new Set<string>())
function onImgLoad(id: string) {
  loaded.add(id)
}

/* ------------------------------ 测量与事件 ------------------------------- */

let frame = 0
function schedule(fn: () => void) {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    fn()
  })
}

function measure() {
  const el = wrapEl.value
  if (!el) return
  containerWidth.value = el.clientWidth
  wallTop.value = el.getBoundingClientRect().top + window.scrollY
  viewportH.value = window.innerHeight
  scrollY.value = window.scrollY
}

function onScroll() {
  schedule(() => {
    scrollY.value = window.scrollY
  })
}

let ro: ResizeObserver | null = null

onMounted(() => {
  measure()
  // 量到真实宽度后再切到精确排版，避免布局跳动
  mounted.value = true
  window.addEventListener('scroll', onScroll, { passive: true })
  if (typeof ResizeObserver !== 'undefined' && wrapEl.value) {
    ro = new ResizeObserver(() => schedule(measure))
    ro.observe(wrapEl.value)
  } else {
    window.addEventListener('resize', measure, { passive: true })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', measure)
  ro?.disconnect()
  if (frame) cancelAnimationFrame(frame)
})

/* -------------------------------- 大图查看 ------------------------------- */

const viewerIndex = ref(-1)
function openViewer(photo: PhotoItem) {
  viewerIndex.value = photos.value.findIndex((p) => p.id === photo.id)
}

function switchAlbum(key: string) {
  if (activeAlbum.value === key) return
  activeAlbum.value = key
  schedule(measure)
}
</script>

<template>
  <div class="photo-wall">
    <!-- 相册筛选 -->
    <div v-if="albums.length > 1" class="pw-tabs">
      <button
        class="pw-tab"
        type="button"
        :class="{ active: activeAlbum === 'all' }"
        @click="switchAlbum('all')"
      >
        全部 <span class="pw-tab-num">{{ gallery.total }}</span>
      </button>
      <button
        v-for="a in albums"
        :key="a.key"
        class="pw-tab"
        type="button"
        :class="{ active: activeAlbum === a.key }"
        @click="switchAlbum(a.key)"
      >
        {{ a.title }} <span class="pw-tab-num">{{ a.count }}</span>
      </button>
    </div>

    <!-- 空状态引导 -->
    <div v-if="gallery.empty" class="pw-empty">
      <p class="pw-empty-title">📷 影集还是空的</p>
      <p>
        把照片放进 <code>docs/public/photos/</code> 即可自动上墙；<br />
        建子目录（如 <code>docs/public/photos/2026-西藏/</code>）会自动变成一个相册分类。
      </p>
      <p class="pw-empty-tip">
        照片较多时建议先执行 <code>npm run photos:thumb</code> 生成缩略图与模糊占位图，加载会快很多。
      </p>
    </div>

    <!-- 作品墙 -->
    <div
      v-else
      ref="wrapEl"
      class="pw-canvas"
      :class="{ 'is-virtual': mounted }"
      :style="mounted ? { height: totalHeight + 'px' } : undefined"
    >
      <div v-for="row in displayRows" :key="row.key" class="pw-row" :style="rowStyle(row)">
        <figure
          v-for="cell in row.cells"
          :key="cell.p.id"
          class="pw-cell"
          :style="cellStyle(row, cell)"
          role="button"
          tabindex="0"
          :aria-label="cell.p.title"
          @click="openViewer(cell.p)"
          @keydown.enter.prevent="openViewer(cell.p)"
        >
          <img
            class="pw-img"
            :class="{ 'is-loaded': loaded.has(cell.p.id) }"
            :src="cell.p.thumb"
            :alt="cell.p.title"
            :width="cell.p.width"
            :height="cell.p.height"
            loading="lazy"
            decoding="async"
            @load="onImgLoad(cell.p.id)"
            @error="onImgLoad(cell.p.id)"
          />
          <figcaption class="pw-caption">
            <span class="pw-caption-title">{{ cell.p.title }}</span>
            <span v-if="cell.p.exif?.camera" class="pw-caption-sub">{{ cell.p.exif.camera }}</span>
          </figcaption>
        </figure>
      </div>
    </div>

    <ClientOnly>
      <PhotoLightbox v-model="viewerIndex" :photos="photos" />
    </ClientOnly>
  </div>
</template>

<style scoped>
.photo-wall {
  margin: 24px 0 48px;
}

/* ------------------------------- 相册筛选 ------------------------------- */
.pw-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.pw-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.pw-tab:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.pw-tab.active {
  color: #fff;
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.pw-tab-num {
  font-size: 11px;
  opacity: 0.75;
}

/* -------------------------------- 作品墙 -------------------------------- */
.pw-canvas {
  position: relative;
  width: 100%;
}

.pw-row {
  display: flex;
  width: 100%;
}

/* 虚拟滚动模式：行绝对定位，只改 transform，不引起重排 */
.pw-canvas.is-virtual .pw-row {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

.pw-cell {
  position: relative;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border-radius: 8px;
  background-color: var(--vp-c-bg-alt);
  background-size: cover;
  background-position: center;
  cursor: zoom-in;
  contain: paint;
}

.pw-canvas.is-virtual .pw-cell {
  flex: none;
}

.pw-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transform: scale(1.001);
  transition: opacity 0.4s ease, transform 0.45s ease;
}

.pw-img.is-loaded {
  opacity: 1;
}

.pw-cell:hover .pw-img.is-loaded {
  transform: scale(1.05);
}

.pw-caption {
  position: absolute;
  inset: auto 0 0 0;
  padding: 22px 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #fff;
  font-size: 12px;
  line-height: 1.5;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.68), rgba(0, 0, 0, 0));
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.25s ease, transform 0.25s ease;
  pointer-events: none;
}

.pw-cell:hover .pw-caption,
.pw-cell:focus-visible .pw-caption {
  opacity: 1;
  transform: translateY(0);
}

.pw-caption-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.pw-caption-sub {
  font-size: 11px;
  opacity: 0.8;
}

/* -------------------------------- 空状态 -------------------------------- */
.pw-empty {
  padding: 40px 24px;
  text-align: center;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 2;
  background: var(--vp-c-bg-soft);
  border: 1px dashed var(--vp-c-divider);
  border-radius: 12px;
}

.pw-empty-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.pw-empty-tip {
  margin-bottom: 0;
  font-size: 13px;
  color: var(--vp-c-text-3);
}

@media (prefers-reduced-motion: reduce) {
  .pw-img,
  .pw-caption {
    transition: none;
  }
}
</style>

<!-- 影集页放宽正文容器（配合 frontmatter 的 pageClass: gallery-page） -->
<style>
.gallery-page .VPDoc:not(.has-sidebar) .container {
  max-width: 1440px;
}

.gallery-page .VPDoc:not(.has-sidebar) .content {
  max-width: 100%;
}

.gallery-page .VPDoc .content-container {
  max-width: 100%;
}
</style>
