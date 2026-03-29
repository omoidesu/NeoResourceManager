import {createRouter, createWebHashHistory} from "vue-router";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {path: '/', name: 'dashboard', component: () => import('../views/dashboard/index.vue')},
    {path: '/search', name: 'search', component: () => import('../views/search/index.vue')},
    {path: '/setting', name: 'setting', component: () => import('../views/setting/index.vue')},
    {
      path: '/category/:id',
      name: 'category',
      component: () => import('../views/CategoryDetail.vue'),
      props: true
    }
  ]
})

export default router
