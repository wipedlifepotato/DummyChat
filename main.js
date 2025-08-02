const { app, BrowserWindow, ipcMain } = require('electron/main')
const path = require('node:path')
const express = require('express');
const cors = require('cors');
const samRoutes = require('./api/routes/sam');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./api/swagger');
require('dotenv').config()
const ApiApp = express();
const PORT = Number(process.env.PORT||3001);

ApiApp.use(cors());
ApiApp.use(express.json());
ApiApp.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
ApiApp.use('/api/sam', samRoutes);
ApiApp.use('/', express.static(path.join(__dirname, 'api/public')))
ApiApp.use('/static', express.static(path.join(__dirname, 'api/public')));
ApiApp.listen(PORT, () => {
  console.log(`API server runs http://localhost:${PORT}`);
});

const createWindow = () => {
  console.log('Create Window')
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })
  win.setMenuBarVisibility(false);
  win.removeMenu();
  //win.loadFile('ui/index.html')
  win.loadURL(`http://localhost:${PORT}`)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.whenReady().then(() => {
  //ipcMain.handle('ping', () => 'pong')
  createWindow()
})
