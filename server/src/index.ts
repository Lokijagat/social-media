import { connectDb } from './config/db.js'
import { env } from './config/env.js'
import { createApp } from './app.js'

async function main() {
  await connectDb()
  createApp().listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`)
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
