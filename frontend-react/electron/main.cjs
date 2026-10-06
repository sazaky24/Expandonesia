const { app, BrowserWindow, protocol, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const isDevelopment = !app.isPackaged
const developmentUrl = process.env.EXPANDONESIA_DESKTOP_URL
const appScheme = 'app'
const appHost = 'expandonesia'
const distDirectory = path.resolve(__dirname, '..', 'dist')

protocol.registerSchemesAsPrivileged([
  {
    scheme: appScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
}

async function serveAppAsset(requestUrl) {
  const url = new URL(requestUrl)
  if (url.hostname !== appHost) return new Response('Not found', { status: 404 })

  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return new Response('Invalid URL', { status: 400 })
  }
  if (pathname === '/') pathname = '/index.html'

  const filePath = path.resolve(distDirectory, `.${pathname}`)
  if (!filePath.startsWith(`${distDirectory}${path.sep}`)) {
    return new Response('Not found', { status: 404 })
  }

  try {
    const contents = await fs.readFile(filePath)
    const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    return new Response(new Uint8Array(contents), {
      headers: { 'Content-Type': contentType },
    })
  } catch (error) {
    if (error && error.code === 'ENOENT') return new Response('Not found', { status: 404 })
    throw error
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 850,
    minWidth: 760,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: '#f1f5f9',
    title: 'Expandonesia Mobile',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const isAppPage = url.startsWith(`${appScheme}://${appHost}/`)
    const isDevServer = developmentUrl && url.startsWith(developmentUrl)
    if (!isAppPage && !isDevServer) event.preventDefault()
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`Expandonesia Mobile failed to load ${validatedUrl}: ${errorDescription} (${errorCode})`)
  })
  window.webContents.on('console-message', (_event, details) => {
    if (details.level >= 2) {
      console.error(`Renderer console error (${details.source}:${details.line}): ${details.message}`)
    }
  })

  const page = isDevelopment && developmentUrl
    ? window.loadURL(developmentUrl)
    : window.loadURL(`${appScheme}://${appHost}/index.html`)

  page.catch((error) => {
    console.error('Expandonesia Mobile window failed to load:', error)
  })
}

app.whenReady().then(() => {
  protocol.handle(appScheme, (request) => serveAppAsset(request.url))
  app.setAppUserModelId('com.expandonesia.mobile')
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
