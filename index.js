const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const ExcelJS = require('exceljs');
const PDFMerger = require('pdf-merger-js');
const heicConvert = require('heic-convert'); // ✅ convert iPhone HEIC/HEIF images

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(express.static(path.join(__dirname, 'public')));

function safeUnlink(filePath) {
  fs.unlink(filePath, err => {
    if (err) console.warn(`Could not delete ${filePath}: ${err.message}`);
  });
}
app.post('/convert', upload.array('files'), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded.' });
    }

    // Capture sort order and order indexes from frontend
    const sortOrder = req.body.sortOrder || 'asc';
    const orderIndexes = req.body.fileOrder;

    let sortedFiles = files;

    // Ensure frontend order is respected
    if (orderIndexes) {
      const orderArray = Array.isArray(orderIndexes) ? orderIndexes.map(Number) : [Number(orderIndexes)];
      sortedFiles = orderArray.map((_, i) => files[i]);
    } else {
      // fallback: simple asc/desc if no explicit order sent
      sortedFiles = sortOrder === 'asc' ? files : [...files].reverse();
    }

    // then continue your conversion logic...

    const tempFiles = [];
    const pdfsToMerge = [];

    for (const file of sortedFiles) {
      const ext = path.extname(file.originalname).toLowerCase();
      const fileBuffer = fs.readFileSync(file.path);

      // ✅ Image → PDF
      if (['.jpg', '.jpeg', '.png', '.bmp', '.heic', '.heif'].includes(ext)) {
        const pdfDoc = await PDFDocument.create();
        let imgBytes = fileBuffer;

        // Convert HEIC → JPEG
        if (['.heic', '.heif'].includes(ext)) {
          imgBytes = await heicConvert({ buffer: imgBytes, format: 'JPEG', quality: 1 });
        }

        // 🔍 Detect actual type by file signature
        const isPng = imgBytes[0] === 0x89 && imgBytes[1] === 0x50 && imgBytes[2] === 0x4E && imgBytes[3] === 0x47;
        const isJpg = imgBytes[0] === 0xFF && imgBytes[1] === 0xD8;

        let img;
        if (isPng) {
          img = await pdfDoc.embedPng(imgBytes);
        } else if (isJpg) {
          img = await pdfDoc.embedJpg(imgBytes);
        } else {
          console.warn(`⚠️ Skipping unsupported image: ${file.originalname}`);
          continue;
        }

        const { width, height } = img.scale(1);
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(img, { x: 0, y: 0, width, height });

        const outPath = path.join('uploads', `${Date.now()}_${file.originalname}.pdf`);
        fs.writeFileSync(outPath, await pdfDoc.save());
        pdfsToMerge.push(outPath);
        tempFiles.push(outPath);
      }

      // ✅ Excel → PDF
      else if (ext === '.xlsx') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(file.path);
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const A4_WIDTH = 595, A4_HEIGHT = 842;

        workbook.eachSheet((sheet) => {
          let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
          let y = A4_HEIGHT - 40;
          page.drawText(`Sheet: ${sheet.name}`, { x: 40, y, size: 14, font, color: rgb(0, 0, 0) });
          y -= 25;

          sheet.eachRow((row) => {
            const rowText = row.values.map(v => (v || '').toString()).join(' | ');
            if (y < 40) {
              page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
              y = A4_HEIGHT - 40;
            }
            page.drawText(rowText, { x: 40, y, size: 11, font, color: rgb(0, 0, 0) });
            y -= 18;
          });
        });

        const excelPdfPath = path.join('uploads', `${Date.now()}_${file.originalname}.pdf`);
        fs.writeFileSync(excelPdfPath, await pdfDoc.save());
        pdfsToMerge.push(excelPdfPath);
        tempFiles.push(excelPdfPath);
      }

      // ✅ PDF → Merge directly
      else if (ext === '.pdf') {
        pdfsToMerge.push(file.path);
      }
    }

    if (pdfsToMerge.length === 0)
      return res.status(400).json({ success: false, message: 'No valid files to merge.' });

    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

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


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
