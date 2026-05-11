// Gera ícones PNG para o PWA usando Canvas API (rodado via Node.js com canvas)
// Execute: node generate-icons.js (requer: npm install canvas -g ou via npx)
// 
// ALTERNATIVA SIMPLES: Use https://realfavicongenerator.net/ ou https://pwa-asset-generator
// Para usar pwa-asset-generator: npx pwa-asset-generator logo.png ./public/icons

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Tenta usar canvas se disponível
try {
  const { createCanvas } = require('canvas');
  const fs = require('fs');
  const path = require('path');

  const dir = path.join(__dirname, 'public', 'icons');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#6C5CE7');
    gradient.addColorStop(1, '#a29bfe');
    ctx.fillStyle = gradient;

    // Rounded rectangle
    const radius = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // Text emoji
    const emoji = '🏠';
    ctx.font = `${size * 0.55}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2 + size * 0.03);

    const buffer = canvas.toBuffer('image/png');
    const filename = path.join(dir, `icon-${size}.png`);
    fs.writeFileSync(filename, buffer);
    console.log(`✅ Generated ${filename}`);
  }
  console.log('\n🎉 All icons generated!');
} catch (err) {
  console.log('⚠️  canvas module not available. Use npx pwa-asset-generator instead:');
  console.log('');
  console.log('  npx pwa-asset-generator public/logo.png public/icons --background "#6C5CE7" --padding "10%"');
  console.log('');
  console.log('  Or upload your logo to https://realfavicongenerator.net/ and place icons in public/icons/');
}
