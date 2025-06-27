const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let isDev = process.argv.includes('--dev');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    fullscreen: !isDev,
    frame: isDev,
    autoHideMenuBar: true
  });

  mainWindow.loadFile('src/index.html');

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('get-camera-stream', async () => {
  return { success: true };
});

ipcMain.handle('capture-photo', async (event, imageData) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `photo_${timestamp}.png`;
    const filepath = path.join(__dirname, '..', 'photos', filename);
    
    // Ensure photos directory exists
    const photosDir = path.dirname(filepath);
    if (!fs.existsSync(photosDir)) {
      fs.mkdirSync(photosDir, { recursive: true });
    }
    
    // Remove data URL prefix and save
    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(filepath, base64Data, 'base64');
    
    return { success: true, filepath, filename };
  } catch (error) {
    console.error('Error saving photo:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('apply-template', async (event, { photoDataUrl, photoDataUrls, templateName }) => {
  try {
    // Load template
    const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.json`);
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    
    // Return template data for client-side processing
    return { 
      success: true, 
      template: template,
      photoDataUrl: photoDataUrl,
      photoDataUrls: photoDataUrls
    };
  } catch (error) {
    console.error('Error loading template:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('print-photo', async (event, { imagePath, printerName, paperSize, quality, copies }) => {
  try {
    const { exec } = require('child_process');
    
    if (process.platform === 'win32') {
      // Tạo command in với các tùy chọn
      let printCommand = `powershell -Command "Get-WmiObject -Class Win32_Printer | Where-Object {$_.Name -eq '${printerName}'} | ForEach-Object {$_.PrintTestPage()}"`;
      
      // Nếu có printer cụ thể, sử dụng nó
      if (printerName) {
        // Sử dụng mspaint để in với máy in cụ thể
        printCommand = `mspaint /pt "${imagePath}" "${printerName}"`;
      } else {
        // Sử dụng photo viewer mặc định
        printCommand = `rundll32.exe shimgvw.dll,ImageView_PrintTo "${imagePath}"`;
      }
      
      exec(printCommand, (error, stdout, stderr) => {
        if (error) {
          console.error('Print error:', error);
        }
      });
    } else {
      // For other platforms
      const lpCommand = printerName ? `lp -d "${printerName}" "${imagePath}"` : `lp "${imagePath}"`;
      exec(lpCommand);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error printing photo:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-templates', async () => {
  try {
    const templatesDir = path.join(__dirname, '..', 'templates');
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
    }
    
    const files = fs.readdirSync(templatesDir)
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
    
    return { success: true, templates: files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-printers', async () => {
  try {
    const { exec } = require('child_process');
    
    return new Promise((resolve) => {
      // Lấy danh sách máy in từ Windows
      exec('wmic printer get name,status /format:csv', (error, stdout, stderr) => {
        if (error) {
          console.error('Error getting printers:', error);
          resolve({ success: false, printers: [] });
          return;
        }
        
        const lines = stdout.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
        const printers = [];
        
        lines.forEach(line => {
          const parts = line.split(',');
          if (parts.length >= 2) {
            const name = parts[1]?.trim();
            const status = parts[2]?.trim();
            if (name && name !== 'Name') {
              printers.push({
                name: name,
                status: status || 'Unknown',
                isDefault: false
              });
            }
          }
        });
        
        // Lấy máy in mặc định
        exec('wmic printer where default=true get name /format:csv', (err, out) => {
          if (!err && out) {
            const defaultLines = out.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
            if (defaultLines.length > 0) {
              const defaultName = defaultLines[0].split(',')[1]?.trim();
              const defaultPrinter = printers.find(p => p.name === defaultName);
              if (defaultPrinter) {
                defaultPrinter.isDefault = true;
              }
            }
          }
          
          resolve({ success: true, printers });
        });
      });
    });
  } catch (error) {
    console.error('Error getting printers:', error);
    return { success: false, printers: [] };
  }
});

ipcMain.handle('save-final-image', async (event, imageDataUrl) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `final_${timestamp}.png`;
    const filepath = path.join(__dirname, '..', 'output', filename);
    
    // Ensure output directory exists
    const outputDir = path.dirname(filepath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Remove data URL prefix and save
    const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(filepath, base64Data, 'base64');
    
    return { success: true, filepath, filename };
  } catch (error) {
    console.error('Error saving final image:', error);
    return { success: false, error: error.message };
  }
});
