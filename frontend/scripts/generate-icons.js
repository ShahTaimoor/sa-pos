/**
 * Icon Generation Script
 * 
 * This script helps generate PWA icons from a source image.
 * 
 * Requirements:
 * - Install sharp: npm install sharp --save-dev
 * - Place a source icon (512x512px) at frontend/public/source-icon.png
 * 
 * Usage:
 * node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const publicDir = path.join(__dirname, '../public');
const sourceIcon = path.join(publicDir, 'source-icon.png');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.error('❌ Sharp is not installed.');
  console.error('💡 Install it with: npm install sharp --save-dev');
  console.error('💡 Or use an online tool: https://www.pwabuilder.com/imageGenerator');
  process.exit(1);
}

// Check if source icon exists
if (!fs.existsSync(sourceIcon)) {
  console.error('❌ Source icon not found at:', sourceIcon);
  console.error('💡 Please place a 512x512px PNG image at: frontend/public/source-icon.png');
  console.error('💡 Or use an online tool: https://www.pwabuilder.com/imageGenerator');
  process.exit(1);
}

async function generateIcons() {
  console.log('🎨 Generating PWA icons...\n');

  try {
    for (const size of sizes) {
      const outputPath = path.join(publicDir, `icon-${size}x${size}.png`);
      
      await sharp(sourceIcon)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Generated icon-${size}x${size}.png`);
    }

    console.log('\n🎉 All icons generated successfully!');
    console.log('📁 Icons are in: frontend/public/');
    console.log('\n💡 Next steps:');
    console.log('   1. Review the generated icons');
    console.log('   2. Build the app: npm run build');
    console.log('   3. Test PWA installation');
  } catch (error) {
    console.error('❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();

