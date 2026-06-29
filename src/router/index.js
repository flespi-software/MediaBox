import { route } from 'quasar/wrappers'
import { createRouter, createMemoryHistory, createWebHistory, createWebHashHistory } from 'vue-router'
import routes from './routes'
import { useAuthStore } from '../stores/auth'

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default route(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : (process.env.VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory)

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(process.env.VUE_ROUTER_BASE)
  })

  // Apply a `?token=` query param on any route. The app uses hash routing, so
  // the query is read from after the '#' (e.g. /#/uuid/abc?token=...). Centralised
  // here so the token works everywhere, not just on the device page.
  Router.beforeEach((to) => {
    const token = to.query.token
    if (token) {
      try {
        const auth = useAuthStore()
        if (auth.token !== token) auth.setToken(token)
      } catch (e) {
        console.error('Failed to apply token from URL', e)
      }
    }
  })

  return Router
})
