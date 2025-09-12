
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const ExcelJS = require('exceljs');
const PDFMerger = require('pdf-merger-js');


const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(express.static(path.join(__dirname, 'public')));

app.post('/convert', upload.array('files'), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).send('No files uploaded.');
    }
  const imageFiles = files.filter(f => /\.(jpg|jpeg|png|bmp)$/i.test(f.originalname));
  const pdfFiles = files.filter(f => /\.pdf$/i.test(f.originalname));
  const excelFiles = files.filter(f => /\.xlsx$/i.test(f.originalname));

    let imagesPdfPath = null;
    let tempFiles = [];
    if (imageFiles.length > 0) {
      const pdfDoc = await PDFDocument.create();
      // A4 size in points: 595 x 842
      const A4_WIDTH = 595;
      const A4_HEIGHT = 842;
      for (const imgFile of imageFiles) {
        try {
          const imgBytes = fs.readFileSync(imgFile.path);
          let img;
          let dims;
          if (/\.jpe?g$/i.test(imgFile.originalname)) {
            img = await pdfDoc.embedJpg(imgBytes);
            dims = img.scale(1);
          } else if (/\.png$/i.test(imgFile.originalname)) {
            img = await pdfDoc.embedPng(imgBytes);
            dims = img.scale(1);
          } else {
            console.error(`Unsupported image type: ${imgFile.originalname}`);
            continue;
          }
          if (!dims.width || !dims.height || dims.width <= 0 || dims.height <= 0) {
            console.error(`Invalid image dimensions for: ${imgFile.originalname}`);
            continue;
          }
          const page = pdfDoc.addPage([dims.width, dims.height]);
          page.drawImage(img, {
            x: 0,
            y: 0,
            width: dims.width,
            height: dims.height,
          });
        } catch (err) {
          console.error(`Error processing image ${imgFile.originalname}: ${err.message}`);
          continue;
        }
      }
      const pdfBytes = await pdfDoc.save();
      imagesPdfPath = path.join('uploads', `images_${Date.now()}.pdf`);
      fs.writeFileSync(imagesPdfPath, pdfBytes);
      tempFiles.push(imagesPdfPath);
    }

    const pdfsToMerge = [];
    if (imagesPdfPath) pdfsToMerge.push(imagesPdfPath);

    // Convert Excel files to PDF and add to merge list
    for (const excelFile of excelFiles) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(excelFile.path);
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const A4_WIDTH = 595;
      const A4_HEIGHT = 842;
      workbook.eachSheet((worksheet, sheetId) => {
        const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        let y = A4_HEIGHT - 40;
        page.drawText(`Sheet: ${worksheet.name}`, { x: 40, y, size: 16, font, color: rgb(0,0,0) });
        y -= 30;
        worksheet.eachRow((row, rowNumber) => {
          let rowText = row.values
            .map(v => (v === null || v === undefined) ? '' : v.toString())
            .join(' | ');
          page.drawText(rowText, { x: 40, y, size: 12, font, color: rgb(0,0,0) });
          y -= 20;
          if (y < 40) {
            y = A4_HEIGHT - 40;
            pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
          }
        });
      });
      const excelPdfPath = path.join('uploads', `excel_${Date.now()}_${excelFile.originalname}.pdf`);
      fs.writeFileSync(excelPdfPath, await pdfDoc.save());
      tempFiles.push(excelPdfPath);
      pdfsToMerge.push(excelPdfPath);
    }

    for (const pdf of pdfFiles) {
      pdfsToMerge.push(pdf.path);
    }

    if (pdfsToMerge.length === 0) {
      return res.status(400).send('No images or PDFs to process.');
    }

    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    const finalFilename = `final_${Date.now()}.pdf`;
    const finalPdfPath = path.join(outputDir, finalFilename);
    const merger = new PDFMerger();
    for (const pdf of pdfsToMerge) {
      await merger.add(pdf);
    }
    await merger.save(finalPdfPath);

    // Read file and encode to base64
    const fileBuffer = fs.readFileSync(finalPdfPath);
    const fileBase64 = fileBuffer.toString('base64');

    // Clean up temp files (except output)
    [...files.map(f => f.path), ...tempFiles].forEach(f => {
      fs.unlink(f, () => {});
    });

    res.status(200).json({
      success: true,
      filename: finalFilename,
      data: fileBase64
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
