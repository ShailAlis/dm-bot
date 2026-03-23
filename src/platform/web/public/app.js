import { boot } from './app/boot.js'

boot().catch((error) => {
  console.error(error)
})
