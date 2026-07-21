import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// @base44/vite-plugin installs its own dev-server proxy that forwards every
// /api/* request to the real Base44 backend — that's correct for the old
// Base44-hosted functions, but it also swallows our OWN /api/* Vercel
// serverless functions (api/*.js) before they ever get a chance to run
// locally, since Vite's plain dev server doesn't execute those on its own
// (only `vercel dev` or a real Vercel deployment does). This plugin runs
// them directly in-process instead, so `npm run dev` behaves the same as
// production for anything under /api — no need to switch to `vercel dev`.
// Registered with enforce: 'pre' so its middleware runs before base44's,
// intercepting our routes first; anything not matching a real api/*.js file
// falls through to next() (and eventually base44's own proxy) unchanged.
function localApiFunctionsPlugin() {
  const apiDir = path.resolve(__dirname, 'api')

  return {
    name: 'local-api-functions',
    enforce: 'pre',
    configureServer(server) {
      // process.env in THIS Node process (the Vite dev server itself) is
      // what api/*.js's `process.env.X` reads at request time — Vite only
      // auto-populates import.meta.env for the CLIENT bundle, not this
      // server-side process, so .env has to be loaded here explicitly.
      const envPath = path.resolve(__dirname, '.env')
      if (fs.existsSync(envPath)) {
        fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
          const match = line.match(/^([A-Z_0-9]+)=(.*)$/)
          if (match && process.env[match[1]] === undefined) {
            process.env[match[1]] = match[2].trim()
          }
        })
      }

      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || '').split('?')[0]
        if (!urlPath.startsWith('/api/')) return next()

        const routeName = urlPath.slice('/api/'.length)
        const filePath = path.join(apiDir, `${routeName}.js`)
        if (!fs.existsSync(filePath)) return next()

        try {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const rawBody = Buffer.concat(chunks).toString('utf8')
          req.body = rawBody ? JSON.parse(rawBody) : {}
        } catch {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
          return
        }

        try {
          const mod = await server.ssrLoadModule(filePath)
          const handler = mod.default
          let statusCode = 200
          const vercelRes = {
            status(code) { statusCode = code; return this },
            json(payload) {
              res.statusCode = statusCode
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(payload))
            },
          }
          await handler(req, vercelRes)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [
    localApiFunctionsPlugin(),
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
  ]
});
