import { defineStore } from 'pinia'
import { SessionStorage } from 'quasar'

// SessionStorage.getItem('user')
export const useAuthStore = () => {
  const innerStore = defineStore('auth', {
    state: () => ({
      token: '',
      info: null,
      blocked: false,
      region: null,
      connected: false
    }),
    getters: {
      // doubleCount: (state) => state.counter * 2
    },
    actions: {
      setBlocked (blocked) {
        this.blocked = blocked
      },
      setTokenInfo (info) {
        this.info = info
      },
      loginRedirect () {

      },
      restorePath () {

      },
      increment () {
        // this.counter++
      },
      init () {
        this.region = this.$region
      },
      setToken (token) {
        this.region = this.$region
        // commit('clean')
        this.$connector.socket.off('error')
        this.$connector.socket.on('error', (e) => {
          if (e && (e.code === 2 || e.code === 135 || e.code === 134)) {
            // commit('loginRedirect')
            // commit('setBlocked', false)
            this.blocked = false
          }
          if (e && (e.code === 138 || e.code === 151)) {
            // commit('setBlocked', true)
            this.blocked = true
          }
          this.connected = false
        })
        this.$connector.socket.off('connect')
        this.$connector.socket.on('connect', (e) => {
          this.info = JSON.parse(e.properties.userProperties.token)
          this.blocked = false
          this.connected = true
          // commit('setTokenInfo', JSON.parse(e.properties.userProperties.token))
          // commit('setBlocked', false)
          // dispatch('subscribeInitial')
        })

        if (token.length === 0) {
          // commit('loginRedirect')
          SessionStorage.remove('token')
          this.token = ''
        } else {
          if (token.indexOf('FlespiToken') >= 0) {
            this.$connector.token = token
            // commit('setToken', token)
            this.token = token
          } else {
            this.$connector.token = `FlespiToken ${token}`
            // commit('setToken', `FlespiToken ${token}`)
            this.token = token
          }
          SessionStorage.set('token', this.token)
          // commit('restorePath')
          // commit('clearLog')
        }
      }
    }
  })
  const s = innerStore()
  const token = SessionStorage.getItem('token')
  if (token && !s.token) {
    s.setToken(token)
  }
  return s
}
