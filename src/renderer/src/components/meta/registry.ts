import { defineAsyncComponent, markRaw, type Component } from 'vue'

const GameMetaForm = defineAsyncComponent(() => import('./GameMetaForm.vue'))
const AsmrMetaForm = defineAsyncComponent(() => import('./AsmrMetaForm.vue'))
const MusicMetaForm = defineAsyncComponent(() => import('./MusicMetaForm.vue'))
const SoftwareMetaForm = defineAsyncComponent(() => import('./SoftwareMetaForm.vue'))
const SingleImageMetaForm = defineAsyncComponent(() => import('./SingleImageMetaForm.vue'))
const MultiImageMetaForm = defineAsyncComponent(() => import('./MultiImageMetaForm.vue'))
const NovelMetaForm = defineAsyncComponent(() => import('./NovelMetaForm.vue'))

export const META_FORM_COMPONENTS: Record<string, Component> = {
  game_meta: markRaw(GameMetaForm),
  asmr_meta: markRaw(AsmrMetaForm),
  audio_meta: markRaw(MusicMetaForm),
  software_meta: markRaw(SoftwareMetaForm),
  single_image_meta: markRaw(SingleImageMetaForm),
  multi_image_meta: markRaw(MultiImageMetaForm),
  novel_meta: markRaw(NovelMetaForm)
}

export const resolveMetaFormComponent = (extendTable: string): Component | null => {
  return META_FORM_COMPONENTS[String(extendTable ?? '').trim()] ?? null
}
