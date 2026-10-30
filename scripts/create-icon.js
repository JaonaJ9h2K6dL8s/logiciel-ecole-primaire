const fs = require('fs');
const path = require('path');

// Create a simple ICO file (256x256) with a shopping cart icon
// ICO format: Header + Directory Entry + BMP data

function createSimpleIco() {
  // We'll create a minimal 256x256 ICO with a simple design
  const size = 256;
  const bpp = 32; // bits per pixel (BGRA)
  
  // BMP info header (40 bytes)
  const infoHeader = Buffer.alloc(40);
  infoHeader.writeUInt32LE(40, 0);        // biSize
  infoHeader.writeInt32LE(size, 4);        // biWidth
  infoHeader.writeInt32LE(size * 2, 8);    // biHeight (doubled for ICO)
  infoHeader.writeUInt16LE(1, 12);         // biPlanes
  infoHeader.writeUInt16LE(bpp, 14);       // biBitCount
  infoHeader.writeUInt32LE(0, 16);         // biCompression
  const imageSize = size * size * 4;
  infoHeader.writeUInt32LE(imageSize, 20); // biSizeImage

  // Create pixel data (BGRA format, bottom-up)
  const pixels = Buffer.alloc(imageSize);
  
  // Colors
  const bg = { b: 46, g: 26, r: 26, a: 255 };       // #1a1a2e
  const accent = { b: 96, g: 69, r: 233, a: 255 };   // #e94560
  const white = { b: 255, g: 255, r: 255, a: 255 };
  
  function setPixel(x, y, color) {
    // Bottom-up format
    const row = (size - 1 - y);
    const offset = (row * size + x) * 4;
    pixels[offset] = color.b;
    pixels[offset + 1] = color.g;
    pixels[offset + 2] = color.r;
    pixels[offset + 3] = color.a;
  }

  // Fill background with rounded look
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x - size / 2 + 0.5;
      const cy = y - size / 2 + 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      if (dist < size / 2 - 1) {
        setPixel(x, y, bg);
      } else {
        setPixel(x, y, { b: 0, g: 0, r: 0, a: 0 }); // transparent
      }
    }
  }

  // Draw a simple "V" letter for "Vente"
  for (let i = 0; i < 14; i++) {
    // Left stroke of V
    const lx = 8 + Math.floor(i * 0.5);
    const ly = 8 + i;
    for (let dx = 0; dx < 3; dx++) {
      if (lx + dx < size && ly < size) setPixel(lx + dx, ly, accent);
    }
    // Right stroke of V
    const rx = 24 - Math.floor(i * 0.5);
    for (let dx = -2; dx <= 0; dx++) {
      if (rx + dx >= 0 && ly < size) setPixel(rx + dx, ly, accent);
    }
  }

  // Draw underline
  for (let x = 10; x <= 22; x++) {
    setPixel(x, 25, white);
    setPixel(x, 26, white);
  }

  // AND mask (all zeros = fully visible)
  const andMask = Buffer.alloc(size * Math.ceil(size / 8));

  // ICO Header (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);    // Reserved
  header.writeUInt16LE(1, 2);    // Type: ICO
  header.writeUInt16LE(1, 4);    // Number of images

  // Directory Entry (16 bytes)
  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(size === 256 ? 0 : size, 0);   // Width
  dirEntry.writeUInt8(size === 256 ? 0 : size, 1);   // Height
  dirEntry.writeUInt8(0, 2);      // Color palette
  dirEntry.writeUInt8(0, 3);      // Reserved
  dirEntry.writeUInt16LE(1, 4);   // Color planes
  dirEntry.writeUInt16LE(bpp, 6); // Bits per pixel
  const dataSize = infoHeader.length + pixels.length + andMask.length;
  dirEntry.writeUInt32LE(dataSize, 8);  // Size of image data
  dirEntry.writeUInt32LE(header.length + dirEntry.length, 12); // Offset

  const ico = Buffer.concat([header, dirEntry, infoHeader, pixels, andMask]);
  
  const outputPath = path.join(__dirname, '..', 'electron', 'icon.ico');
  fs.writeFileSync(outputPath, ico);
  console.log('✅ Icône ICO créée:', outputPath);
}

createSimpleIco();
