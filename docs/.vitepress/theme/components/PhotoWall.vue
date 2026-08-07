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
import { data as photosData } from '../photos.data'
import type { GalleryData, PhotoItem } from '../photos.data'
import PhotoLightbox from './PhotoLightbox.vue'

const props = withDefaults(
  defineProps<{
    /** 作品墙数据；不传则默认用「影集（photos）」数据（影集页用法） */
    gallery?: GalleryData
    /** 只显示某个相册（目录名），默认全部 */
    album?: string
    /** 图片间距 */
    gap?: number
    /** 分组模式：按文件夹分组、每组带标题平铺（否则为标签页筛选 + 单一虚拟滚动墙） */
    group?: boolean
  }>(),
  { album: '', gap: 12, gallery: undefined, group: false }
)

/** 解析后的数据源：优先用页面传入的（如图库页），回退到影集 */
const gallery = props.gallery ?? photosData

/**
 * 挂载前（SSR / hydration 阶段）用纯 CSS 弹性布局占位：
 * 行内各图按宽高比分配宽度，自然等高且随容器自适应，因此换到 JS 精确排版时不会跳版。
 * 这一阶段只输出首屏若干张，HTML 体积可控。
 */
const SSR_WIDTH = 1100
const SSR_VIEWPORT = 900
const SSR_LIMIT = 24

const albums = gallery.albums
/** 分组模式一次只看一个相册：默认选中第一个；非分组模式默认「全部」 */
const activeAlbum = ref(props.album || (props.group ? albums[0]?.key ?? 'all' : 'all'))

const photos = computed<PhotoItem[]>(() =>
  activeAlbum.value === 'all'
    ? gallery.photos
    : gallery.photos.filter((p) => p.album === activeAlbum.value)
)

/* ----------------------------- 尺寸与滚动状态 ----------------------------- */

const wrapEl = ref<HTMLElement | null>(null)
/** 根容器：分组模式下没有单一 wrapEl，宽度从这里量 */
const rootEl = ref<HTMLElement | null>(null)
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
function buildRows(list: PhotoItem[]): Row[] {
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
}

/** 非分组模式：按当前选中相册排版（挂载前只排首屏若干张，挂载后走虚拟滚动） */
const rows = computed<Row[]>(() => buildRows(layoutList.value))

/** 分组模式：每个相册一组（一页只展示当前选中的那一组，避免一次性渲染所有图）。 */

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

/** 分组模式下，按该组相对页面的绝对偏移做组内虚拟滚动（只渲染视口上下各一屏内的行） */
function secVisible(sec: { rows: Row[]; canvasTop: number; end?: number }): Row[] {
  const list = sec.rows
  if (!mounted.value || !list.length) return list
  const vh = viewportH.value
  const offset = scrollY.value
  // 视口顶 / 底 映射到页面绝对坐标
  const viewTop = offset
  const viewBottom = offset + vh
  // 该组可视判定：组 canvas 起点距视口顶、终点距视口底，留一屏缓冲
  const min = viewTop - vh - sec.canvasTop
  const max = viewBottom + vh - sec.canvasTop
  const out: Row[] = []
  for (const row of list) {
    if (row.top + row.height < min) continue
    if (row.top > max) break
    out.push(row)
  }
  return out
}

/** 分组模式：只算「当前选中的那个相册组」（一页一组，避免一次性渲染所有图） */
const albumIndex = computed(() => albums.findIndex((a) => a.key === activeAlbum.value))
const activeSection = computed(() => {
  if (!props.group) return null
  const a = albums[albumIndex.value]
  if (!a) return null
  const list = gallery.photos.filter((p) => p.album === a.key)
  const r = buildRows(list)
  const total = r.length ? r[r.length - 1].top + r[r.length - 1].height : 0
  return { album: a, rows: r, total }
})

/** 分组模式：每个相册的封面（首张缩略图）+ 名称 + 张数，用于组选择器预览 */
const albumCovers = computed(() =>
  albums.map((a) => {
    const cover = gallery.photos.find((p) => p.album === a.key)
    return { key: a.key, title: a.title, count: a.count, cover: cover?.thumb ?? '' }
  })
)

/** 分组模式：上 / 下一组循环切换 */
function stepAlbum(dir: 1 | -1) {
  const i = albumIndex.value
  if (i < 0 || !albums.length) return
  const next = (i + dir + albums.length) % albums.length
  switchAlbum(albums[next].key)
}

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
  const el = rootEl.value ?? wrapEl.value
  if (!el) return
  containerWidth.value = el.clientWidth
  const topEl = wrapEl.value ?? rootEl.value
  wallTop.value = (topEl ? topEl.getBoundingClientRect().top : 0) + window.scrollY
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
  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    ro = new ResizeObserver(() => schedule(measure))
    ro.observe(rootEl.value)
  } else {
    window.addEventListener('resize', measure, { passive: true })
  }
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', measure)
  window.removeEventListener('keydown', onKeydown)
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
  // 切组后滚回墙顶，确保新组从标题开始显示
  if (props.group && typeof window !== 'undefined') {
    window.scrollTo({ top: wallTop.value - 8, behavior: 'smooth' })
  }
}

/* ------------------------------ 组选择器浮层 ------------------------------ */
/** 点击组名弹出所有组的预览，点哪个跳到哪组 */
const pickerOpen = ref(false)
function togglePicker() {
  pickerOpen.value = !pickerOpen.value
}
function pickAlbum(key: string) {
  pickerOpen.value = false
  switchAlbum(key)
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') pickerOpen.value = false
}
</script>

<template>
  <div ref="rootEl" class="photo-wall">
    <!-- 相册筛选（非分组模式） -->
    <div v-if="!group && albums.length > 1" class="pw-tabs">
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
      <p class="pw-empty-title">📷 这里还没有图片</p>
      <p>
        把图片放进 <code>docs/public/photos/</code> 或 <code>docs/public/pic/</code> 子目录即可自动上墙；<br />
        建子目录（如 <code>docs/public/pic/插画/</code>）会自动变成一组。
      </p>
      <p class="pw-empty-tip">
        照片较多时建议先执行 <code>npm run photos:thumb</code> 生成缩略图与模糊占位图，加载会快很多。
      </p>
    </div>

    <!-- 分组模式：按相册分组，但一页只展示当前选中的那一组 + 上/下一组导航 -->
    <div v-else-if="group" class="pw-groups">
      <!-- 吸顶工具条：组名标签条 + 上/下一组导航（点击标签或组名预览都能切组） -->
      <div class="pw-bar">
        <!-- 组名标签条：点哪个标签就显示哪组 -->
        <div v-if="albums.length > 1" class="pw-album-tags">
          <button
            v-for="a in albums"
            :key="a.key"
            class="pw-album-tag"
            type="button"
            :class="{ active: a.key === activeAlbum }"
            @click="switchAlbum(a.key)"
          >
            {{ a.title }}
            <span class="pw-album-tag-num">{{ a.count }}</span>
          </button>
        </div>

        <div v-if="activeSection" class="pw-pager">
        <button
          class="pw-pager-btn"
          type="button"
          :disabled="albums.length <= 1"
          :title="albums[(albumIndex + albums.length - 1) % albums.length]?.title"
          @click="stepAlbum(-1)"
        >
          ‹ 上一组
        </button>
        <button class="pw-pager-info" type="button" @click="togglePicker">
          <strong>{{ activeSection.album.title }}</strong>
          <span class="pw-pager-num">{{ activeSection.album.count }} 张</span>
          <span class="pw-pager-idx">第 {{ albumIndex + 1 }} / {{ albums.length }} 组 ▾</span>
        </button>
        <button
          class="pw-pager-btn"
          type="button"
          :disabled="albums.length <= 1"
          :title="albums[(albumIndex + 1) % albums.length]?.title"
          @click="stepAlbum(1)"
        >
          下一组 ›
        </button>
      </div>
      </div>

      <!-- 组选择器：点击组名弹出所有组的封面预览，点哪个跳到哪组 -->
      <Teleport to="body">
        <div v-if="pickerOpen" class="pw-picker-backdrop" @click="pickerOpen = false">
          <div class="pw-picker" role="dialog" aria-label="选择相册" @click.stop>
            <div class="pw-picker-head">
              <span>选择相册 · 共 {{ albums.length }} 组</span>
              <button class="pw-picker-close" type="button" aria-label="关闭" @click="pickerOpen = false">✕</button>
            </div>
            <div class="pw-picker-grid">
              <button
                v-for="c in albumCovers"
                :key="c.key"
                class="pw-pick-card"
                :class="{ active: c.key === activeAlbum }"
                type="button"
                @click="pickAlbum(c.key)"
              >
                <div class="pw-pick-cover">
                  <img v-if="c.cover" :src="c.cover" :alt="c.title" loading="lazy" decoding="async" />
                </div>
                <div class="pw-pick-meta">
                  <span class="pw-pick-title">{{ c.title }}</span>
                  <span class="pw-pick-count">{{ c.count }} 张</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <section v-if="activeSection" class="pw-group">
        <div
          class="pw-canvas"
          :class="{ 'is-virtual': mounted }"
          :style="mounted ? { height: activeSection.total + 'px' } : undefined"
        >
          <div v-for="row in secVisible({ rows: activeSection.rows, canvasTop: wallTop })" :key="row.key" class="pw-row" :style="rowStyle(row)">
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
      </section>
    </div>

    <!-- 非分组模式：单一作品墙 + 虚拟滚动 -->
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

/* ------------------------------- 分组（一页一组） ------------------------------- */
.pw-groups {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.pw-group {
  margin: 0;
}

/* 吸顶工具条：包裹标签条 + 上/下一组导航，整体吸顶避免重叠 */
.pw-bar {
  position: sticky;
  top: var(--vp-nav-height);
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  backdrop-filter: blur(6px);
}

/* 组名标签条：点哪个标签显示哪组 */
.pw-album-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pw-album-tag {
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

.pw-album-tag:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.pw-album-tag.active {
  color: #fff;
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.pw-album-tag-num {
  font-size: 11px;
  opacity: 0.75;
}

/* 上 / 下一组 导航 */
.pw-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pw-pager-btn {
  flex: none;
  padding: 6px 14px;
  font-size: 14px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.pw-pager-btn:hover:not(:disabled) {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.pw-pager-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pw-pager-info {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  max-width: 70%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 15px;
  font-family: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.pw-pager-info:hover {
  background: var(--vp-c-bg-soft);
}

.pw-pager-info strong {
  font-size: 18px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.pw-pager-num {
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.pw-pager-idx {
  font-size: 12px;
  color: var(--vp-c-text-2);
}

/* ------------------------------- 组选择器浮层 ------------------------------- */
.pw-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
}

.pw-picker {
  width: min(860px, 92vw);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.pw-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  border-bottom: 1px solid var(--vp-c-divider);
}

.pw-picker-close {
  width: 28px;
  height: 28px;
  font-size: 15px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  cursor: pointer;
}

.pw-picker-close:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.pw-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
  padding: 18px;
  overflow-y: auto;
}

.pw-pick-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  text-align: left;
  background: var(--vp-c-bg-soft);
  border: 2px solid transparent;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.15s ease;
}

.pw-pick-card:hover {
  transform: translateY(-2px);
  border-color: var(--vp-c-brand-2);
}

.pw-pick-card.active {
  border-color: var(--vp-c-brand-1);
}

.pw-pick-cover {
  aspect-ratio: 4 / 3;
  background: var(--vp-c-bg-alt);
  overflow: hidden;
}

.pw-pick-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.pw-pick-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px 10px;
}

.pw-pick-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pw-pick-count {
  flex: none;
  font-size: 12px;
  color: var(--vp-c-text-3);
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

<!-- 作品墙：回到 VitePress 默认 home 布局（.VPHome .container 自带 max-width 与左右边距、居中）。
     不再强制全宽铺满；这里仅给一个稳妥的居中上限，避免在非 home 场景里横向溢出。 -->
<style>
.photo-wall {
  max-width: 1280px;
  margin: 0 auto;
}
</style>
