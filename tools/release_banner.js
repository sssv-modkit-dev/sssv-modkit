/* Shared, dependency-free canvas renderer for the composer and command line. */
(function (root) {
  'use strict';
  const quotes = {
    english: ['\u201c', '\u201d'], french: ['\u00ab\u202f', '\u202f\u00bb'],
    spanish: ['\u00ab', '\u00bb'], german: ['\u201e', '\u201c'],
    japanese: ['\u300c', '\u300d']
  };
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
  function recolor(image, accent, mode) {
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
  function draw(canvas, settings, head) {
    const ctx = canvas.getContext('2d');
    canvas.width = 1500; canvas.height = 500;
    ctx.fillStyle = '#111b29'; ctx.fillRect(0, 0, 1500, 500);
    ctx.fillStyle = settings.accent; ctx.fillRect(70, 76, 32, 3);
    ctx.font = '500 21px system-ui'; ctx.fillText('SSSV MODKIT', 70, 120);
    const pair = quotes[settings.style];
    const title = pair[0] + settings.name + pair[1] + ' edition';
    let size = 60;
    do {
      ctx.font = `italic 500 ${size}px system-ui`;
      if (ctx.measureText(title).width <= 890 || size <= 12) break;
      size--;
    } while (true);
    ctx.fillText(title, 70, 265, 890);
    ctx.fillStyle = '#9ba9b9'; ctx.font = '400 21px system-ui';
    ctx.fillText(settings.version, 70, 335, 890);
    ctx.fillStyle = '#26384b'; ctx.fillRect(70, 382, 890, 1);
    ctx.fillStyle = settings.accent; ctx.fillRect(70, 382, 64, 2);
    if (head) {
      const image = recolor(head, settings.accent, settings.recolor || 'original');
      const scale = Math.min(340 / image.width, 340 / image.height);
      ctx.drawImage(image, 1230 - image.width * scale / 2, 250 - image.height * scale / 2,
        image.width * scale, image.height * scale);
    }
  }
  const api = {quotes, randomStyle, recolorPixels, draw};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReleaseBanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
