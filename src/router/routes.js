const routes = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('pages/IndexPage.vue') },
      { path: 'device/:deviceid', component: () => import('pages/MediaExplorer.vue'), props: true }
    ]
  },

  {
    path: '/',
    component: () => import('layouts/MediaPlayerLayout.vue'),
    children: [
      { path: 'uuid/:uuid', component: () => import('pages/MediaPlayer.vue'), props: true }
    ]
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue')
  }
]

export default routes
