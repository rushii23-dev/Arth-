import { serve } from '@hono/node-server'
import { initializeApp } from 'firebase-admin/app'
import { createApp } from './app.js'
import { firebaseVerifier } from './auth.js'
import { loadConfig } from './config.js'
import { firestoreStore } from './store/firestore.js'
import { memoryStore } from './store/memory.js'

const config = loadConfig()
// On Cloud Run the service account supplies credentials; locally, token checks need only the project ID.
initializeApp({ projectId: config.firebaseProjectId })

const store = config.store === 'firestore' ? firestoreStore() : memoryStore()
const app = createApp({ config, store, verifyToken: firebaseVerifier() })

serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(JSON.stringify({ severity: 'INFO', msg: 'arth backend listening', port: info.port, store: config.store }))
})
