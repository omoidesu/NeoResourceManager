<script setup lang="ts">
import { computed, inject } from 'vue'
import type { ComputedRef } from 'vue'
import { Icon, addCollection } from '@iconify/vue'
import mdiIcons from '@iconify-json/mdi/icons.json'

addCollection(mdiIcons)

const APP_VERSION = __APP_VERSION__
const injectedIsDark = inject<ComputedRef<boolean>>('appIsDark', computed(() => true))
const isDark = computed(() => injectedIsDark?.value ?? true)

const featureList = [
  '统一管理游戏、音声、漫画、视频与网站资源',
  '支持站点信息抓取、标签整理与详情统计',
  '围绕本地资源收藏、启动、回填与浏览体验设计'
]

const linkList = [
  {
    title: '项目地址',
    project: '',
    description: 'GitHub 仓库与后续更新入口',
    href: 'https://github.com/omoidesu/NeoResourceManager',
    label: '打开仓库'
  },
  {
    title: '灵感来源',
    project: 'GreenResourcesManager',
    description: '界面和资源管理思路参考项目',
    href: 'https://github.com/klsdf/GreenResourcesManager',
    label: '查看来源'
  }
]

const pageTextColor = computed(() => isDark.value ? 'rgba(255, 255, 255, 0.92)' : 'rgba(32, 37, 44, 0.92)')
const mutedTextColor = computed(() => isDark.value ? 'rgba(255, 255, 255, 0.62)' : 'rgba(68, 76, 86, 0.78)')
const softTextColor = computed(() => isDark.value ? 'rgba(255, 255, 255, 0.44)' : 'rgba(91, 99, 110, 0.72)')
const strongTextColor = computed(() => isDark.value ? 'rgba(255, 255, 255, 0.82)' : 'rgba(33, 39, 47, 0.88)')
const sectionCardBackground = computed(() => isDark.value ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.72)')
const sectionCardBorder = computed(() => isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(138, 148, 160, 0.2)')
const heroBorderColor = computed(() => isDark.value ? 'rgba(255, 255, 255, 0.08)' : 'rgba(138, 148, 160, 0.22)')
const heroBackground = computed(() => isDark.value
  ? 'linear-gradient(140deg, rgba(18, 18, 24, 0.96), rgba(18, 26, 30, 0.92)), rgba(255, 255, 255, 0.03)'
  : 'linear-gradient(140deg, rgba(255, 255, 255, 0.96), rgba(239, 246, 248, 0.94)), rgba(255, 255, 255, 0.78)')
const heroBadgeBackground = computed(() => isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(51, 65, 85, 0.08)')
const panelBackground = computed(() => isDark.value ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.58)')
const linkHoverShadow = computed(() => isDark.value ? '0 16px 34px rgba(0, 0, 0, 0.18)' : '0 14px 28px rgba(120, 134, 156, 0.16)')
</script>

<template>
  <div class="about-page">
    <section class="about-hero">
      <div class="about-hero__badge">ABOUT</div>
      <div class="about-hero__grid">
        <div class="about-hero__main">
          <div class="about-hero__title-row">
            <div class="about-hero__mark">NR</div>
            <div>
              <h1 class="about-hero__title">Neo Resource Manager</h1>
              <p class="about-hero__subtitle">面向本地资源收藏、整理与播放体验的桌面管理器</p>
            </div>
          </div>

          <div class="about-hero__chips">
            <n-tag size="small" round :bordered="false" type="success">v{{ APP_VERSION }}</n-tag>
            <n-tag size="small" round :bordered="false">Electron + Vue</n-tag>
            <n-tag size="small" round :bordered="false">Local-first</n-tag>
          </div>
        </div>

        <div class="about-hero__panel">
          <div class="about-panel__label">定位</div>
          <div class="about-panel__text">
            把零散的本地资源整理成清晰、可检索、可回填、可播放的一套资料库。
          </div>
        </div>
      </div>
    </section>

    <section class="about-section">
      <div class="about-section__header">
        <div class="about-section__eyebrow">Features</div>
        <h2 class="about-section__title">这个项目在做什么</h2>
      </div>
      <div class="about-feature-list">
        <div v-for="feature in featureList" :key="feature" class="about-feature-card">
          <div class="about-feature-card__dot"></div>
          <div class="about-feature-card__text">{{ feature }}</div>
        </div>
      </div>
    </section>

    <section class="about-section">
      <div class="about-section__header">
        <div class="about-section__eyebrow">Links</div>
        <h2 class="about-section__title">项目与来源</h2>
      </div>
      <div class="about-link-grid">
        <a
          v-for="link in linkList"
          :key="link.href"
          :href="link.href"
          target="_blank"
          rel="noreferrer"
          class="about-link-card"
        >
          <div class="about-link-card__top">
            <div class="about-link-card__github">
              <Icon icon="mdi:github" />
            </div>
            <div class="about-link-card__project">{{ link.project }}</div>
          </div>
          <div class="about-link-card__title">{{ link.title }}</div>
          <div class="about-link-card__description">{{ link.description }}</div>
          <div class="about-link-card__action">{{ link.label }}</div>
        </a>
      </div>
    </section>

    <section class="about-section about-section--compact">
      <div class="about-credit-card">
        <div class="about-credit-card__label">Thanks</div>
        <div class="about-credit-card__text">
          灵感来源于 GreenResourcesManager，也感谢所有帮助这个项目逐步长成现在样子的想法、反馈与使用场景。
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.about-page {
  min-height: 100%;
  padding: 28px 30px 40px;
  color: v-bind(pageTextColor);
  background:
    radial-gradient(circle at top left, rgba(118, 75, 162, 0.2), transparent 28%),
    radial-gradient(circle at right 20%, rgba(99, 226, 183, 0.12), transparent 24%);
  overflow: auto;
}

.about-hero {
  position: relative;
  padding: 24px;
  border-radius: 26px;
  border: 1px solid v-bind(heroBorderColor);
  background: v-bind(heroBackground);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}

.about-hero::after {
  content: '';
  position: absolute;
  top: -56px;
  right: -56px;
  width: 180px;
  height: 180px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(99, 226, 183, 0.16), transparent 68%);
  pointer-events: none;
}

.about-hero__badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: v-bind(heroBadgeBackground);
  color: v-bind(mutedTextColor);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.about-hero__grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(260px, 0.9fr);
  gap: 18px;
}

.about-hero__title-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.about-hero__mark {
  width: 72px;
  height: 72px;
  flex: 0 0 72px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(99, 226, 183, 0.92), rgba(118, 75, 162, 0.88));
  color: #ffffff;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0.08em;
  box-shadow: 0 16px 34px rgba(84, 183, 153, 0.22);
}

.about-hero__title {
  margin: 0;
  font-size: 30px;
  line-height: 1.08;
  font-weight: 800;
  color: v-bind(pageTextColor);
}

.about-hero__subtitle {
  margin: 10px 0 0;
  max-width: 720px;
  color: v-bind(mutedTextColor);
  font-size: 14px;
  line-height: 1.7;
}

.about-hero__chips {
  margin-top: 22px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.about-hero__panel {
  position: relative;
  padding: 18px 18px 20px;
  border-radius: 20px;
  background: v-bind(panelBackground);
  border: 1px solid v-bind(heroBorderColor);
}

.about-panel__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: v-bind(softTextColor);
}

.about-panel__text {
  margin-top: 10px;
  font-size: 15px;
  line-height: 1.8;
  color: v-bind(strongTextColor);
}

.about-section {
  margin-top: 24px;
}

.about-section--compact {
  margin-top: 18px;
}

.about-section__header {
  margin-bottom: 14px;
}

.about-section__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: v-bind(softTextColor);
}

.about-section__title {
  margin: 8px 0 0;
  font-size: 22px;
  font-weight: 700;
  color: v-bind(pageTextColor);
}

.about-feature-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.about-feature-card {
  display: flex;
  gap: 12px;
  padding: 16px 16px 18px;
  border-radius: 18px;
  border: 1px solid v-bind(sectionCardBorder);
  background: v-bind(sectionCardBackground);
}

.about-feature-card__dot {
  width: 10px;
  height: 10px;
  flex: 0 0 10px;
  margin-top: 7px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(99, 226, 183, 0.95), rgba(118, 75, 162, 0.9));
}

.about-feature-card__text {
  font-size: 14px;
  line-height: 1.8;
  color: v-bind(strongTextColor);
}

.about-link-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.about-link-card {
  display: block;
  padding: 18px;
  border-radius: 20px;
  border: 1px solid v-bind(sectionCardBorder);
  background: v-bind(sectionCardBackground);
  text-decoration: none;
  color: inherit;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.about-link-card:hover {
  transform: translateY(-2px);
  border-color: rgba(99, 226, 183, 0.28);
  box-shadow: v-bind(linkHoverShadow);
}

.about-link-card__title {
  margin-top: 14px;
  font-size: 17px;
  font-weight: 700;
  color: v-bind(pageTextColor);
}

.about-link-card__top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.about-link-card__github {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.88);
  color: #ffffff;
  font-size: 16px;
  line-height: 1;
}

.about-link-card__project {
  font-size: 12px;
  font-weight: 700;
  color: v-bind(softTextColor);
}

.about-link-card__description {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: v-bind(mutedTextColor);
}

.about-link-card__action {
  margin-top: 18px;
  font-size: 12px;
  font-weight: 700;
  color: rgb(125, 232, 196);
}

.about-credit-card {
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid v-bind(sectionCardBorder);
  background: v-bind(sectionCardBackground);
}

.about-credit-card__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: v-bind(softTextColor);
}

.about-credit-card__text {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.8;
  color: v-bind(strongTextColor);
}

@media (max-width: 980px) {
  .about-page {
    padding: 18px 18px 28px;
  }

  .about-hero__grid,
  .about-feature-list,
  .about-link-grid {
    grid-template-columns: 1fr;
  }

  .about-hero__title {
    font-size: 24px;
  }

  .about-hero__title-row {
    align-items: flex-start;
  }

  .about-hero__mark {
    width: 60px;
    height: 60px;
    flex-basis: 60px;
    border-radius: 18px;
    font-size: 20px;
  }
}
</style>
