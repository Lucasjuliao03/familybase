const fs = require('fs');
const path = require('path');

/**
 * Redimensiona e comprime JPEG para visualização em ecrã (não impressão).
 * Largura máx. 1400px, qualidade ~78%, mantém legibilidade de receitas em telemóvel.
 */
async function optimizeHealthImage(inputPath) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    return inputPath;
  }

  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const outPath = path.join(dir, `${base}.jpg`);
  const tmpPath = `${outPath}.tmp`;

  try {
    await sharp(inputPath)
      .rotate()
      .resize({
        width: 1400,
        height: 1400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 78,
        mozjpeg: true,
        chromaSubsampling: '4:4:4',
      })
      .toFile(tmpPath);

    fs.renameSync(tmpPath, outPath);
    if (inputPath !== outPath && fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }
    return outPath;
  } catch (e) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch { /* ignore */ }
    console.warn('optimizeHealthImage:', e.message);
    return inputPath;
  }
}

module.exports = { optimizeHealthImage };
