<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { data } from '../photos.data'

const props = withDefaults(
  defineProps<{
    /** 展示最近几张，默认 3 */
    count?: number
    /** 自动轮播间隔（毫秒），0 关闭 */
    interval?: number
  }>(),
  { count: 3, interval: 5000 }
)

/** 照片已按日期倒序排好，取前 N 张即为「最近」 */
const slides = computed(() => data.photos.slice(0, props.count))

const current = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function go(i: number) {
  const n = slides.value.length
  if (!n) return
  current.value = (i + n) % n
}
function next() {
  go(current.value + 1)
}
function prev() {
  go(current.value - 1)
}
function start() {
  if (props.interval > 0 && slides.value.length > 1) {
    timer = setInterval(next, props.interval)
  }
}
function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
function replay() {
  stop()
  start()
}

/** 跳转影集页（照片来源是 photos 图库） */
const yingjiHref = withBase('/yingji')

onMounted(start)
onBeforeUnmount(stop)
</script>

<template>
  <div
    v-if="slides.length"
    class="hc"
    @mouseenter="stop"
    @mouseleave="replay"
  >
    <a
      v-for="(p, i) in slides"
      :key="p.id"
      class="hc-slide"
      :class="{ active: i === current }"
      :href="yingjiHref"
      :aria-label="`查看 ${p.title}`"
    >
      <img
        class="hc-img"
        :src="p.thumb"
        :alt="p.title"
        loading="lazy"
        decoding="async"
      />
      <div class="hc-cap">
        <span class="hc-album">{{ p.albumTitle }}</span>
        <span class="hc-title">{{ p.title }}</span>
      </div>
    </a>

    <button
      v-if="slides.length > 1"
      class="hc-arrow hc-prev"
      type="button"
      aria-label="上一张"
      @click.prevent="prev"
    >
      ‹
    </button>
    <button
      v-if="slides.length > 1"
      class="hc-arrow hc-next"
      type="button"
      aria-label="下一张"
      @click.prevent="next"
    >
      ›
    </button>

    <div v-if="slides.length > 1" class="hc-dots">
      <button
        v-for="(p, i) in slides"
        :key="p.id"
        class="hc-dot"
        type="button"
        :class="{ active: i === current }"
        :aria-label="`第 ${i + 1} 张`"
        @click.prevent="go(i)"
      />
    </div>
  </div>
</template>

<style scoped>
.hc {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  background: var(--vp-c-bg-soft);
}

.hc-slide {
  position: absolute;
  inset: 0;
  display: block;
  opacity: 0;
  transform: scale(1.04);
  transition: opacity 0.6s ease, transform 0.6s ease;
  pointer-events: none;
  text-decoration: none;
}

.hc-slide.active {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

.hc-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hc-cap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 28px 16px 14px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0));
  color: #fff;
}

.hc-album {
  font-size: 12px;
  opacity: 0.8;
}

.hc-title {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hc-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  line-height: 1;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease, background-color 0.2s ease;
}

.hc:hover .hc-arrow {
  opacity: 1;
}

.hc-arrow:hover {
  background: rgba(0, 0, 0, 0.6);
}

.hc-prev {
  left: 10px;
}

.hc-next {
  right: 10px;
}

.hc-dots {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 10px;
  display: flex;
  justify-content: center;
  gap: 8px;
}

.hc-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.hc-dot.active {
  background: #fff;
  transform: scale(1.25);
}
</style>
