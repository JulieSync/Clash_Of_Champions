const fetch = require('node-fetch');
const Canvas = require('canvas');
const path = require('path');

const IS_MAINTENANCE = false;

const ipCache = new Map();
const RATE_LIMIT = 6;
const TIME_WINDOW = 1 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const record = ipCache.get(ip) || { count: 0, startTime: now };

  if (now - record.startTime > TIME_WINDOW) {
    ipCache.set(ip, { count: 1, startTime: now });
    return false;
  }

  if (record.count >= RATE_LIMIT) return true;

  record.count += 1;
  ipCache.set(ip, record);
  return false;
}

let globalRequestCount = 0;
let globalStartTime = Date.now();
const GLOBAL_RATE_LIMIT = 20;
const GLOBAL_TIME_WINDOW = 2 * 60 * 1000;

function isGloballyRateLimited() {
  const now = Date.now();
  if (now - globalStartTime > GLOBAL_TIME_WINDOW) {
    globalStartTime = now;
    globalRequestCount = 1;
    return false;
  }

  if (globalRequestCount >= GLOBAL_RATE_LIMIT) return true;

  globalRequestCount += 1;
  return false;
}

Canvas.registerFont(path.join(__dirname, '..\media\fonts\moby-reg.ttf'), { family: 'default' });

function wrapText(ctx, text, centerX, startY, maxWidth, lineHeight) {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = line + (line ? ' ' : '') + word;
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth <= maxWidth) {
      line = testLine;
    } else {
      if (line) {
        lines.push(line);
        line = word;
      } else {
        let subLine = '';
        for (const char of word) {
          const testSub = subLine + char;
          if (ctx.measureText(testSub).width > maxWidth) {
            lines.push(subLine);
            subLine = char;
          } else {
            subLine = testSub;
          }
        }
        if (subLine) lines.push(subLine);
        line = '';
      }
    }
  }

  if (line) lines.push(line);

  for (let i = 0; i < lines.length; i++) {
    const textLine = lines[i];
    const lineWidth = ctx.measureText(textLine).width;
    const x = centerX - lineWidth / 2;
    const y = startY + i * lineHeight;
    ctx.fillText(textLine, x, y);
  }
}

module.exports = async (req, res) => {
  if (IS_MAINTENANCE) {
    return res.status(503).json({
      message: "Server sedang dalam proses maintenance, Harap coba lagi beberapa saat."
    });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || req.socket.remoteAddress;

  if (isGloballyRateLimited()) {
    return res.status(503).json({
      message: 'Server menerima terlalu banyak permintaan. Coba lagi sebentar lagi.'
    });
  }

  if (isRateLimited(ip)) {
    return res.status(429).json({
      message: 'Terlalu banyak permintaan dari IP ini. Coba lagi nanti.'
    });
  }

  const { profile, name, highSchool, jurusan, descBronze, descSilver } = req.body;

  if (!profile || !name || !highSchool || !jurusan || !descBronze || !descSilver) {
    return res.status(400).json({ message: 'Semua parameter wajib diisi.' });
  }

  const imageUrl = profile?.trim();
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Gagal mengambil gambar profil.');

  if (name.length > 7) {
    return res.status(400).json({ message: 'Nama tidak boleh lebih dari 7 karakter.' });
  }

  if (highSchool.length > 5) {
    return res.status(400).json({ message: 'Nama sekolah tidak boleh lebih dari 9 karakter.' });
  }

  if (jurusan.length > 20) {
    return res.status(400).json({ message: 'Jurusan tidak boleh lebih dari 20 karakter.' });
  }

  if (descBronze.length > 100) {
    return res.status(400).json({ message: 'Deskripsi Bronze tidak boleh lebih dari 100 karakter.' });
  }

  if (descSilver.length > 100) {
    return res.status(400).json({ message: 'Deskripsi Silver tidak boleh lebih dari 100 karakter.' });
  }

  try {
    const img = await Canvas.loadImage(path.join(__dirname, '../media/image/template.jpg'));
    const canvas = Canvas.createCanvas(800, 600);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, 800, 600);

    ctx.fillStyle = '#000';
    ctx.font = 'bold 40px default';
    wrapText(ctx, name, 400, 50, 700, 50);

    ctx.font = 'bold 30px default';
    wrapText(ctx, highSchool, 400, 120, 700, 40);
    
    ctx.font = 'bold 30px default';
    wrapText(ctx, jurusan, 400, 180, 700, 40);

    ctx.font = 'italic 20px default';
    wrapText(ctx, descBronze, 400, 240, 700, 30);
    
    ctx.font = 'italic 20px default';
    wrapText(ctx, descSilver, 400, 280, 700, 30);

    const buffer = canvas.toBuffer('image/png');
    
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error('Error generate-image:', err);
    res.status(500).json({ message: 'Gagal memproses gambar.' });
  }
};
      
