const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../public/icons/icon.svg');
const publicDir = path.join(__dirname, '../public');

const sizes = [
  { width: 192, height: 192, name: 'icons/icon-192x192.png' },
  { width: 512, height: 512, name: 'icons/icon-512x512.png' },
  { width: 180, height: 180, name: 'icons/apple-touch-icon.png' },
  { width: 32, height: 32, name: 'favicon.png' }
];

async function generateIcons() {
  if (!fs.existsSync(svgPath)) {
    console.error('Error: icon.svg not found at', svgPath);
    process.exit(1);
  }

  console.log('Reading SVG from:', svgPath);
  const svgBuffer = fs.readFileSync(svgPath);

  for (const size of sizes) {
    const outputPath = path.join(publicDir, size.name);
    const dir = path.dirname(outputPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    console.log(`Generating ${size.name}...`);
    
    await sharp(svgBuffer)
      .resize(size.width, size.height)
      .png()
      .toFile(outputPath);
      
    console.log(`Generated ${size.name}`);
  }
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
