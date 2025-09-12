# Image, PDF, and Excel to PDF Converter

A Node.js web app to convert and merge images, PDFs, and Excel files into a single PDF. Features drag-and-drop UI, batch processing, and universal page sizing.

## Features
- Drag and drop images (JPG, PNG, BMP), PDFs, and Excel (.xlsx) files
- Converts each image to a PDF page (page size matches image size)
- Converts each Excel sheet to a PDF page (table format)
- Merges all files into one downloadable PDF
- Works locally and can be deployed to cloud platforms


## Live Demo

This app is deployed for free on Render:

[https://image-to-pdf-converter-yjnq.onrender.com/](https://image-to-pdf-converter-yjnq.onrender.com/)

You can use the drag-and-drop UI to convert and merge images, PDFs, and Excel files into a single PDF online.

---

## How to Use Locally

1. **Install dependencies:**
   ```
   npm install
   ```
2. **Start the server:**
   ```
   npm start
   ```
3. **Open the app:**
   Visit [http://localhost:3000](http://localhost:3000) in your browser.
4. **Upload files:**
   - Drag and drop images, PDFs, or Excel files into the dropzone
   - Click "Convert & Merge" to generate the PDF
   - Download the merged PDF from the link


## Project Structure
```
img-pdf-converter/
├── public/         # Frontend UI (index.html)
├── uploads/        # Temporary uploaded files (gitignored)
├── output/         # Generated PDFs (gitignored)
├── index.js        # Main server code
├── package.json    # Dependencies and scripts
├── .gitignore      # Files to exclude from git
```

