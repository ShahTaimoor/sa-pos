# PWA Icon Generation Guide

## Required Icons

The PWA manifest requires the following icon sizes:

- 72x72px
- 96x96px
- 128x128px
- 144x144px
- 152x152px
- 192x192px (required)
- 384x384px
- 512x512px (required)

## Quick Generation Options

### Option 1: Online Tool
1. Visit: https://www.pwabuilder.com/imageGenerator
2. Upload a 512x512px source image
3. Download all generated icons
4. Place them in `frontend/public/` directory

### Option 2: Using ImageMagick (Command Line)
```bash
# Install ImageMagick first
# Then run:
convert source-icon.png -resize 72x72 icon-72x72.png
convert source-icon.png -resize 96x96 icon-96x96.png
convert source-icon.png -resize 128x128 icon-128x128.png
convert source-icon.png -resize 144x144 icon-144x144.png
convert source-icon.png -resize 152x152 icon-152x152.png
convert source-icon.png -resize 192x192 icon-192x192.png
convert source-icon.png -resize 384x384 icon-384x384.png
convert source-icon.png -resize 512x512 icon-512x512.png
```

### Option 3: Using Node.js Script
Create a simple script to generate icons from a source image.

## Icon Design Guidelines

- **Format:** PNG with transparency
- **Style:** Simple, recognizable icon
- **Colors:** Should work on light and dark backgrounds
- **Maskable:** Icon should be safe area (80% of canvas) for maskable icons

## Temporary Solution

Until icons are created, the app will still work but may show default browser icons. The PWA will function correctly once icons are added.

## Placement

All icons should be placed in:
```
frontend/public/
├── icon-72x72.png
├── icon-96x96.png
├── icon-128x128.png
├── icon-144x144.png
├── icon-152x152.png
├── icon-192x192.png
├── icon-384x384.png
└── icon-512x512.png
```

