const { app, BrowserWindow } = require('electron');
const path = require('path');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const ExcelJS = require('exceljs');
const PDFMerger = require('pdf-merger-js');
const heicConvert = require('heic-convert');

let mainWindow;

// --- Use a writable directory outside ASAR ---
const baseDir = path.join(app.getPath('userData'), 'img-pdf-converter');
const uploadsDir = path.join(baseDir, 'uploads');
const outputDir = path.join(baseDir, 'output');

// Ensure directories exist
[baseDir, uploadsDir, outputDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.loadURL(`http://localhost:3000`);

  mainWindow.on('closed', () => mainWindow = null);
}

// --- Express server setup ---
const serverApp = express();
const upload = multer({ dest: uploadsDir });
serverApp.use(express.static(path.join(__dirname, 'public')));

function safeUnlink(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) console.warn(`Could not delete ${filePath}: ${err.message}`);
  });
}

// POST /convert route (keep your existing logic)
serverApp.post('/convert', upload.array('files'), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ success: false, message: 'No files uploaded.' });

    const sortOrder = req.body.sortOrder || 'asc';
    const orderIndexes = req.body.fileOrder;
    let sortedFiles = files;

    if (orderIndexes) {
      const orderArray = Array.isArray(orderIndexes) ? orderIndexes.map(Number) : [Number(orderIndexes)];
      sortedFiles = orderArray.map((_, i) => files[i]);
    } else {
      sortedFiles = sortOrder === 'asc' ? files : [...files].reverse();
    }

    const tempFiles = [];
    const pdfsToMerge = [];

    for (const file of sortedFiles) {
      const ext = path.extname(file.originalname).toLowerCase();
      let fileBuffer = fs.readFileSync(file.path);

      // Image → PDF
      if (['.jpg', '.jpeg', '.png', '.bmp', '.heic', '.heif'].includes(ext)) {
        if (['.heic', '.heif'].includes(ext)) {
          fileBuffer = await heicConvert({ buffer: fileBuffer, format: 'JPEG', quality: 1 });
        }

        const pdfDoc = await PDFDocument.create();
        let img;
        const isPng = fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50;
        const isJpg = fileBuffer[0] === 0xFF && fileBuffer[1] === 0xD8;

        if (isPng) img = await pdfDoc.embedPng(fileBuffer);
        else if (isJpg) img = await pdfDoc.embedJpg(fileBuffer);
        else continue;

        const { width, height } = img.scale(1);
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(img, { x: 0, y: 0, width, height });

        const outPath = path.join(uploadsDir, `${Date.now()}_${file.originalname}.pdf`);
        fs.writeFileSync(outPath, await pdfDoc.save());
        pdfsToMerge.push(outPath);
        tempFiles.push(outPath);
      }

      // Excel → PDF
      else if (ext === '.xlsx') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(file.path);
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const A4_WIDTH = 595, A4_HEIGHT = 842;

        workbook.eachSheet((sheet) => {
          let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
          let y = A4_HEIGHT - 40;
          page.drawText(`Sheet: ${sheet.name}`, { x: 40, y, size: 14, font, color: rgb(0,0,0) });
          y -= 25;

          sheet.eachRow((row) => {
            const rowText = row.values.map(v => (v || '').toString()).join(' | ');
            if (y < 40) { page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]); y = A4_HEIGHT - 40; }
            page.drawText(rowText, { x: 40, y, size: 11, font, color: rgb(0,0,0) });
            y -= 18;
          });
        });

        const excelPdfPath = path.join(uploadsDir, `${Date.now()}_${file.originalname}.pdf`);
        fs.writeFileSync(excelPdfPath, await pdfDoc.save());
        pdfsToMerge.push(excelPdfPath);
        tempFiles.push(excelPdfPath);
      }

      // PDF → Merge
      else if (ext === '.pdf') pdfsToMerge.push(file.path);
    }

    if (pdfsToMerge.length === 0) return res.status(400).json({ success: false, message: 'No valid files to merge.' });

    const finalFilename = `final_${Date.now()}.pdf`;
    const finalPdfPath = path.join(outputDir, finalFilename);

    const merger = new PDFMerger();
    for (const pdf of pdfsToMerge) await merger.add(pdf);
    await merger.save(finalPdfPath);

    const base64Data = fs.readFileSync(finalPdfPath).toString('base64');

    files.forEach(f => safeUnlink(f.path));
    tempFiles.forEach(f => safeUnlink(f));

    res.json({ success: true, filename: finalFilename, data: base64Data });
  } catch (err) {
    console.error('Conversion error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Serve index.html
serverApp.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start Electron app and server ---
app.whenReady().then(() => {
  const PORT = process.env.PORT || 3000;
  serverApp.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
    createWindow(); // Only now create BrowserWindow
  });
});

// Quit app when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
