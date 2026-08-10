<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export interface HotCategory {
  name: string
  icon: string
  count: number
  link: string
  latest: string[]
}

const props = withDefaults(
  defineProps<{
    categories: HotCategory[]
    /** 标题，默认「热门分类」 */
    title?: string
    /** 自动轮播间隔（毫秒），0 关闭 */
    interval?: number
  }>(),
  { title: '热门分类', interval: 5000 }
)

const slides = computed(() => props.categories)
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

onMounted(start)
onBeforeUnmount(stop)
</script>

<template>
  <section
    v-if="slides.length"
    class="cc"
    @mouseenter="stop"
    @mouseleave="replay"
  >
    <div class="cc-head">
      <span class="cc-title">{{ title }}</span>
      <span class="cc-sub">文章数最多的 {{ slides.length }} 个分类</span>
    </div>

    <div class="cc-track">
      <a
        v-for="(c, i) in slides"
        :key="c.name"
        class="cc-slide"
        :class="{ active: i === current }"
        :href="c.link"
        :aria-label="`查看 ${c.name} 分类`"
      >
        <span class="cc-icon">{{ c.icon }}</span>
        <span class="cc-info">
          <span class="cc-name">{{ c.name }}</span>
          <span class="cc-count">{{ c.count }} 篇文章</span>
          <span v-if="c.latest.length" class="cc-latest">
            <span
              v-for="t in c.latest"
              :key="t"
              class="cc-latest-item"
            >{{ t }}</span>
          </span>
        </span>
      </a>

      <button
        v-if="slides.length > 1"
        class="cc-arrow cc-prev"
        type="button"
        aria-label="上一个分类"
        @click.prevent="prev"
      >‹</button>
      <button
        v-if="slides.length > 1"
        class="cc-arrow cc-next"
        type="button"
        aria-label="下一个分类"
        @click.prevent="next"
      >›</button>
    </div>

    <div v-if="slides.length > 1" class="cc-dots">
      <button
        v-for="(c, i) in slides"
        :key="c.name"
        class="cc-dot"
        type="button"
        :class="{ active: i === current }"
        :aria-label="`第 ${i + 1} 个分类`"
        @click.prevent="go(i)"
      />
    </div>
  </section>
</template>

<style scoped>
.cc {
  margin: 28px 0 8px;
}

.cc-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 14px;
}

.cc-title {
  font-size: 1.15em;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.cc-sub {
  font-size: 0.8em;
  color: var(--vp-c-text-3);
}

.cc-track {
  position: relative;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
  min-height: 132px;
}

.cc-slide {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px 28px;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.5s ease, transform 0.5s ease;
  pointer-events: none;
  text-decoration: none;
  color: inherit;
}

.cc-slide.active {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.cc-icon {
  font-size: 44px;
  line-height: 1;
  flex: 0 0 auto;
}

.cc-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.cc-name {
  font-size: 1.2em;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.cc-count {
  font-size: 0.85em;
  color: var(--vp-c-brand);
  font-weight: 600;
}

.cc-latest {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}

.cc-latest-item {
  font-size: 0.85em;
  color: var(--vp-c-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cc-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  line-height: 1;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}

.cc:hover .cc-arrow {
  opacity: 1;
}

.cc-arrow:hover {
  border-color: var(--vp-c-brand);
  color: var(--vp-c-brand);
}

.cc-prev {
  left: 10px;
}

.cc-next {
  right: 10px;
}

.cc-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
}

.cc-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--vp-c-divider);
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.cc-dot.active {
  background: var(--vp-c-brand);
  transform: scale(1.25);
}
</style>
