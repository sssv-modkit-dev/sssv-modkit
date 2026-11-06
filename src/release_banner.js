/* Shared, dependency-free canvas renderer for the composer and command line. */
(function (root) {
  'use strict';
  // Quotation marks by typographic tradition, not by one language or country:
  // anglo \u201c \u201d (English-speaking world), romance \u00ab \u00bb (Spanish, Italian, Portuguese, Catalan...),
  // francophone \u00ab \u00bb with thin spaces, central-european \u201e \u201c (German, Czech, Slovak, Baltic...),
  // east-asian \u300c \u300d (Japanese, traditional Chinese).
  const quotes = {
    anglo: ['\u201c', '\u201d'], francophone: ['\u00ab\u202f', '\u202f\u00bb'],
    romance: ['\u00ab', '\u00bb'], 'central-european': ['\u201e', '\u201c'],
    'east-asian': ['\u300c', '\u300d']
  };
  // Old language names still work.
  const aliases = {english: 'anglo', french: 'francophone', spanish: 'romance', german: 'central-european', japanese: 'east-asian'};
  const styleOf = name => quotes[name] ? name : (aliases[name] || 'anglo');
  function randomStyle() {
    const styles = Object.keys(quotes);
    return styles[Math.floor(Math.random() * styles.length)];
  }
  // These masks apply only to the verified 256px bear raster.
  function recolorPixels(pixels, width, accent, mode) {
    const target = accent.slice(1).match(/../g).map(v => parseInt(v, 16));
    for (let i = 0; i < pixels.length; i += 4) {
      if (!pixels[i + 3]) continue;
      const [red, green, blue] = pixels.slice(i, i + 3);
      const y = Math.floor(i / 4 / width);
      let factor = 0;
      if (blue > red * 1.5 && blue > green * 1.25 && ['head', 'both'].includes(mode))
        factor = .65 * blue / 128;
      if (y < 40 && red > blue && green >= blue && ['ears', 'both'].includes(mode))
        factor = .9 * Math.max(red, green) / 200;
      if (factor > 0) for (let c = 0; c < 3; c++)
        pixels[i + c] = Math.min(255, Math.round(target[c] * factor));
    }
  }
  const rgb = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16));
  const luma = (r, g, b) => .299 * r + .587 * g + .114 * b;
  const sat = (r, g, b) => { const hi = Math.max(r, g, b); return hi ? (hi - Math.min(r, g, b)) / hi : 0; };
  // Per-head pixel roles: 'body' takes the bold colour, 'accent' the light one, anything else keeps its colour.
  // Rules are written for the bundled renders (bear icon 256 px; dog/fox/seagull/sheep demo heads 128 px).
  const HEAD_ROLES = {
    bear: (r, g, b, y) => b > r * 1.5 && b > g * 1.25 ? 'body' : (y < 40 && r > b && g >= b ? 'accent' : null),
    fox: (r, g, b) => r > 100 && sat(r, g, b) > .6 ? 'body' : (luma(r, g, b) > 110 && sat(r, g, b) < .2 ? 'accent' : null),
    dog: (r, g, b) => r > 100 && g > 100 && b < r * .7 ? 'body' : (luma(r, g, b) < 40 ? 'accent' : null),
    seagull: (r, g, b) => sat(r, g, b) < .3 && luma(r, g, b) > 90 ? 'body' : (r > 120 && g > 120 && b < 60 ? 'accent' : null),
    sheep: (r, g, b) => sat(r, g, b) < .15 && luma(r, g, b) > 90 ? 'body' : null,
  };
  // Two tones with the original shading kept: each pixel's brightness relative to its role's mean scales the tone.
  function twoTonePixels(pixels, width, head, bold, light) {
    const rule = HEAD_ROLES[head];
    if (!rule) throw new Error('Unknown head: ' + head);
    const roles = new Array(pixels.length / 4), sum = {body: 0, accent: 0}, count = {body: 0, accent: 0};
    for (let i = 0; i < pixels.length; i += 4) {
      if (!pixels[i + 3]) continue;
      const role = rule(pixels[i], pixels[i + 1], pixels[i + 2], Math.floor(i / 4 / width));
      if (!role) continue;
      roles[i / 4] = role; sum[role] += luma(pixels[i], pixels[i + 1], pixels[i + 2]); count[role]++;
    }
    const tone = {body: rgb(bold), accent: rgb(light)};
    for (let i = 0; i < pixels.length; i += 4) {
      const role = roles[i / 4];
      if (!role) continue;
      const mean = sum[role] / count[role] || 1;
      const f = Math.max(.55, Math.min(1.35, luma(pixels[i], pixels[i + 1], pixels[i + 2]) / mean));
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.min(255, Math.round(tone[role][c] * f));
    }
    return count;
  }
  function recolor(image, accent, mode, tones) {
    if (tones) {
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      twoTonePixels(data.data, canvas.width, tones.head, tones.bold, tones.light);
      ctx.putImageData(data, 0, 0);
      return canvas;
    }
    if (mode === 'original') return image;
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    recolorPixels(data.data, canvas.width, accent, mode);
    ctx.putImageData(data, 0, 0);
    return canvas;
  }
  // Bounding box of non-transparent pixels, so small renders with empty margins still fill the head slot.
  function opaqueBox(image) {
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
    const x = c.getContext('2d'); x.drawImage(image, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++)
      if (d[(y * c.width + i) * 4 + 3] > 8) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return x1 < 0 ? {x: 0, y: 0, w: image.width, h: image.height} : {x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1};
  }
  function draw(canvas, settings, head) {
    const ctx = canvas.getContext('2d');
    canvas.width = 1500; canvas.height = 250;
    ctx.fillStyle = settings.background || '#111b29'; ctx.fillRect(0, 0, 1500, 250);
    ctx.fillStyle = settings.accent;
    ctx.font = '500 18px system-ui'; ctx.fillText('SSSV MODKIT', 70, 70);
    const pair = quotes[styleOf(settings.style)];
    const title = pair[0] + settings.name + pair[1] + ' edition';
    let size = 48;
    do {
      ctx.font = `italic 500 ${size}px system-ui`;
      if (ctx.measureText(title).width <= 890 || size <= 12) break;
      size--;
    } while (true);
    ctx.fillText(title, 70, 135, 890);
    ctx.fillStyle = settings.muted || '#9ba9b9'; ctx.font = '400 15px system-ui';
    ctx.fillText(String(settings.version).toLowerCase(), 70, 172, 890);
    ctx.fillStyle = settings.rule || '#26384b'; ctx.fillRect(70, 205, 890, 1);
    ctx.fillStyle = settings.accent; ctx.fillRect(70, 205, 64, 2);
    if (head) {
      const tones = settings.head && settings.bold ? {head: settings.head, bold: settings.bold, light: settings.light || settings.accent} : null;
      const image = recolor(head, settings.accent, settings.recolor || 'original', tones);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      const box = settings.head ? opaqueBox(image) : {x: 0, y: 0, w: image.width, h: image.height};
      const scale = Math.min(200 / box.w, 200 / box.h, settings.head ? 2.2 : Infinity);
      ctx.drawImage(image, box.x, box.y, box.w, box.h, 1230 - box.w * scale / 2, 125 - box.h * scale / 2,
        box.w * scale, box.h * scale);
    }
  }
  const api = {quotes, aliases, styleOf, randomStyle, recolorPixels, twoTonePixels, HEAD_ROLES, draw};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReleaseBanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
