<script setup lang="ts">
/**
 * 影集大图查看器
 *
 * 加载策略：先用列表里已经在缓存中的缩略图立刻铺满（模糊但零等待），
 * 原图在后台加载完成后再淡入替换；同时空闲时预取前后各一张，翻页几乎无等待。
 * 缩放 / 拖拽只改 transform，不触发重排。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PhotoItem } from '../photos.data'

const props = defineProps<{
  modelValue: number
  photos: PhotoItem[]
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>()

const open = computed(() => props.modelValue >= 0 && props.modelValue < props.photos.length)
const current = computed<PhotoItem | undefined>(() => props.photos[props.modelValue])

const winW = ref(typeof window === 'undefined' ? 1200 : window.innerWidth)
const winH = ref(typeof window === 'undefined' ? 800 : window.innerHeight)

/** 按窗口与图片比例算出展示框，避免图片加载后再撑开导致跳动 */
const box = computed(() => {
  const p = current.value
  if (!p) return { width: '0px', height: '0px' }
  const maxW = winW.value * (winW.value < 720 ? 1 : 0.92)
  const maxH = winH.value * 0.86
  let w = maxW
  let h = maxW / p.ratio
  if (h > maxH) {
    h = maxH
    w = maxH * p.ratio
  }
  return { width: Math.round(w) + 'px', height: Math.round(h) + 'px' }
})

/* -------------------------------- 缩放平移 ------------------------------- */

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)
const fullLoaded = ref(false)
const showInfo = ref(true)

const frameStyle = computed(() => ({
  transform: `translate3d(${tx.value}px, ${ty.value}px, 0) scale(${scale.value})`,
  transition: dragging.value ? 'none' : 'transform 0.22s ease'
}))

function resetTransform() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

function zoom(delta: number, focal?: { x: number; y: number }) {
  const next = Math.min(5, Math.max(1, Number((scale.value + delta).toFixed(2))))
  if (next === scale.value) return
  if (next === 1) {
    resetTransform()
    return
  }
  if (focal) {
    // 以指针为中心缩放
    const k = next / scale.value
    tx.value = focal.x - (focal.x - tx.value) * k
    ty.value = focal.y - (focal.y - ty.value) * k
  }
  scale.value = next
}

function onWheel(e: WheelEvent) {
  const stage = e.currentTarget as HTMLElement
  const rect = stage.getBoundingClientRect()
  zoom(e.deltaY > 0 ? -0.3 : 0.3, {
    x: e.clientX - rect.left - rect.width / 2,
    y: e.clientY - rect.top - rect.height / 2
  })
}

function toggleZoom() {
  scale.value > 1 ? resetTransform() : (scale.value = 2)
}

let startX = 0
let startY = 0
let originX = 0
let originY = 0
let pointerId = -1

function onPointerDown(e: PointerEvent) {
  pointerId = e.pointerId
  dragging.value = true
  startX = e.clientX
  startY = e.clientY
  originX = tx.value
  originY = ty.value
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pointerId) return
  if (scale.value <= 1) return
  tx.value = originX + (e.clientX - startX)
  ty.value = originY + (e.clientY - startY)
}

function onPointerUp(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  // 未放大时横向滑动即翻页（移动端手势）
  if (scale.value === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
    dx < 0 ? next() : prev()
  }
}

/* --------------------------------- 翻页 --------------------------------- */

function go(index: number) {
  const total = props.photos.length
  if (!total) return
  emit('update:modelValue', (index + total) % total)
}

function prev() {
  go(props.modelValue - 1)
}
function next() {
  go(props.modelValue + 1)
}
function close() {
  emit('update:modelValue', -1)
}

/** 空闲时预取相邻原图 */
function preload(index: number) {
  const total = props.photos.length
  if (!total) return
  const idle: (cb: () => void) => void =
    (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 200))
  idle(() => {
    for (const i of [index + 1, index - 1]) {
      const p = props.photos[(i + total) % total]
      if (!p) continue
      const img = new Image()
      img.decoding = 'async'
      img.src = p.src
    }
  })
}

watch(
  () => props.modelValue,
  (v) => {
    resetTransform()
    fullLoaded.value = false
    if (v >= 0) preload(v)
  }
)

/* ------------------------------- 键盘与滚动 ------------------------------ */

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  switch (e.key) {
    case 'Escape':
      close()
      break
    case 'ArrowLeft':
      prev()
      break
    case 'ArrowRight':
      next()
      break
    case '+':
    case '=':
      zoom(0.5)
      break
    case '-':
      zoom(-0.5)
      break
    case 'i':
    case 'I':
      showInfo.value = !showInfo.value
      break
  }
}

function onResize() {
  winW.value = window.innerWidth
  winH.value = window.innerHeight
}

let prevOverflow = ''
let prevPadding = ''

function lockScroll(lock: boolean) {
  const body = document.body
  if (lock) {
    prevOverflow = body.style.overflow
    prevPadding = body.style.paddingRight
    const gap = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (gap > 0) body.style.paddingRight = `${gap}px`
  } else {
    body.style.overflow = prevOverflow
    body.style.paddingRight = prevPadding
  }
}

watch(open, (v) => lockScroll(v))

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize, { passive: true })
  onResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
  if (open.value) lockScroll(false)
})

const exifLine = computed(() => {
  const e = current.value?.exif
  if (!e) return ''
  return [e.focal, e.aperture, e.shutter, e.iso].filter(Boolean).join(' · ')
})
</script>

<template>
  <Teleport to="body">
    <Transition name="pv">
      <div v-if="open && current" class="pv-mask" role="dialog" aria-modal="true" @click.self="close">
        <button class="pv-btn pv-close" type="button" aria-label="关闭" @click="close">✕</button>

        <button
          v-if="photos.length > 1"
          class="pv-btn pv-nav pv-prev"
          type="button"
          aria-label="上一张"
          @click.stop="prev"
        >
          ‹
        </button>
        <button
          v-if="photos.length > 1"
          class="pv-btn pv-nav pv-next"
          type="button"
          aria-label="下一张"
          @click.stop="next"
        >
          ›
        </button>

        <div
          class="pv-stage"
          :style="box"
          :class="{ zoomed: scale > 1 }"
          @wheel.prevent="onWheel"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @dblclick="toggleZoom"
        >
          <div class="pv-frame" :style="frameStyle">
            <!-- 先显示缩略图（多半已在缓存里），原图加载完成后淡出 -->
            <img
              class="pv-img pv-thumb"
              :class="{ hidden: fullLoaded }"
              :src="current.thumb"
              :alt="current.title"
              draggable="false"
            />
            <img
              class="pv-img pv-full"
              :class="{ show: fullLoaded }"
              :src="current.src"
              :alt="current.title"
              decoding="async"
              draggable="false"
              @load="fullLoaded = true"
              @error="fullLoaded = true"
            />
          </div>
          <span v-if="!fullLoaded" class="pv-loading">原图加载中…</span>
        </div>

        <div v-if="showInfo" class="pv-info" @click.stop>
          <div class="pv-info-main">
            <span class="pv-title">{{ current.title }}</span>
            <span class="pv-count">{{ modelValue + 1 }} / {{ photos.length }}</span>
          </div>
          <div class="pv-info-sub">
            <span v-if="current.albumTitle" class="pv-chip">{{ current.albumTitle }}</span>
            <span v-if="current.date">{{ current.date }}</span>
            <span v-if="current.exif?.camera">{{ current.exif.camera }}</span>
            <span v-if="exifLine">{{ exifLine }}</span>
            <span>{{ current.width }}×{{ current.height }}</span>
            <a :href="current.src" target="_blank" rel="noopener" class="pv-link">查看原图</a>
          </div>
          <p v-if="current.desc" class="pv-desc">{{ current.desc }}</p>
        </div>

        <button class="pv-btn pv-toggle" type="button" @click.stop="showInfo = !showInfo">
          {{ showInfo ? '隐藏信息' : '显示信息' }}
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pv-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.92);
  backdrop-filter: blur(4px);
  user-select: none;
}

.pv-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: zoom-in;
  touch-action: pan-y;
}

.pv-stage.zoomed {
  cursor: grab;
}

.pv-frame {
  position: absolute;
  inset: 0;
  will-change: transform;
}

.pv-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pv-thumb {
  filter: blur(6px);
  transform: scale(1.02);
  transition: opacity 0.3s ease;
}

.pv-thumb.hidden {
  opacity: 0;
}

.pv-full {
  opacity: 0;
  transition: opacity 0.3s ease;
}

.pv-full.show {
  opacity: 1;
}

.pv-loading {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.45);
  border-radius: 999px;
}

.pv-btn {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.pv-btn:hover {
  background: rgba(255, 255, 255, 0.26);
}

.pv-close {
  top: 16px;
  right: 20px;
  width: 36px;
  height: 36px;
  font-size: 16px;
}

.pv-nav {
  top: 50%;
  width: 44px;
  height: 44px;
  margin-top: -22px;
  font-size: 26px;
  line-height: 1;
}

.pv-prev {
  left: 16px;
}
.pv-next {
  right: 16px;
}

.pv-toggle {
  top: 16px;
  left: 20px;
  padding: 6px 14px;
  font-size: 12px;
}

.pv-info {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  max-width: min(92vw, 900px);
  padding: 10px 18px;
  text-align: center;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
}

.pv-info-main {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
}

.pv-count {
  font-size: 12px;
  opacity: 0.6;
}

.pv-info-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 12px;
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.75;
}

.pv-chip {
  padding: 1px 8px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
}

.pv-link {
  color: #fff;
  text-decoration: underline;
  opacity: 0.9;
}

.pv-desc {
  margin: 6px 0 0;
  font-size: 12px;
  opacity: 0.7;
}

.pv-enter-active,
.pv-leave-active {
  transition: opacity 0.22s ease;
}

.pv-enter-from,
.pv-leave-to {
  opacity: 0;
}

@media (max-width: 720px) {
  .pv-nav {
    width: 36px;
    height: 36px;
    font-size: 22px;
  }
  .pv-info {
    bottom: 8px;
    padding: 8px 12px;
  }
}
</style>
