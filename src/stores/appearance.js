import { defineStore } from 'pinia'

export const useAppearanceStore = defineStore('appearance', {
  state: () => ({
    color: 'blue-grey'
  }),
  getters: {
    // doubleCount: (state) => state.counter * 2
  },
  actions: {
    setColor (color) {
      this.color = color
    }
  }
})
