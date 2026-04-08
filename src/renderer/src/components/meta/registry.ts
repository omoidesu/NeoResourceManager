import { defineAsyncComponent, markRaw } from 'vue'

const GameMetaForm = defineAsyncComponent(() => import('./GameMetaForm.vue'))
const AsmrMetaForm = defineAsyncComponent(() => import('./AsmrMetaForm.vue'))
const SoftwareMetaForm = defineAsyncComponent(() => import('./SoftwareMetaForm.vue'))
const SingleImageMetaForm = defineAsyncComponent(() => import('./SingleImageMetaForm.vue'))
const MultiImageMetaForm = defineAsyncComponent(() => import('./MultiImageMetaForm.vue'))

export const META_FORM_COMPONENTS: Record<string, any> = {
  game_meta: markRaw(GameMetaForm),
  asmr_meta: markRaw(AsmrMetaForm),
  software_meta: markRaw(SoftwareMetaForm),
  single_image_meta: markRaw(SingleImageMetaForm),
  multi_image_meta: markRaw(MultiImageMetaForm)
}

export const resolveMetaFormComponent = (extendTable: string) => {
  return META_FORM_COMPONENTS[String(extendTable ?? '').trim()] ?? null
}
