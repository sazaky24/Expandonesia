const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

const isDevelopment = !app.isPackaged
const developmentUrl = process.env.FASTWORK_DESKTOP_URL

function createWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 850,
    minWidth: 760,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: '#f1f5f9',
    title: 'FastWork Mobile',
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
    const isLocalFile = url.startsWith('file://')
    const isDevServer = developmentUrl && url.startsWith(developmentUrl)
    if (!isLocalFile && !isDevServer) event.preventDefault()
  })

  const page = isDevelopment && developmentUrl
    ? window.loadURL(developmentUrl)
    : window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  page.catch((error) => {
    console.error('FastWork Mobile window failed to load:', error)
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.fastwork.mobile')
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
