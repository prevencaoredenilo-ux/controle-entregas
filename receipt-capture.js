const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
let tesseractWorkerPromise;

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function normalizeNeighborhood(value = '') {
  return normalize(value).replace(/[^a-z0-9]/g, '').replace(/^(?:bairro|barro)/, '').replace(/^arro(?=vermelho)/, '');
}

function titleCasePortuguese(value = '') {
  const particles = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
  return String(value).replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR').split(' ').map((word, index) => (
    index > 0 && particles.has(word) ? word : word.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase('pt-BR'))
  )).join(' ');
}

function normalizeStreet(value = '') {
  return titleCasePortuguese(value)
    .replace(/^(?:Av(?:enida)?|Bv)\.?\s+/i, 'Av. ')
    .replace(/^(?:R(?:ua)?\.?)\s+/i, 'Rua ')
    .replace(/^(?:Tv|Travessa)\.?\s+/i, 'Travessa ');
}

function longestSpan(flags, maxGap = 3) {
  let start = -1;
  let last = -1;
  let best = null;
  flags.forEach((qualified, index) => {
    if (qualified) {
      if (start < 0) start = index;
      last = index;
    } else if (start >= 0 && index - last > maxGap) {
      if (!best || last - start > best.end - best.start) best = { start, end: last };
      start = -1;
      last = -1;
    }
  });
  if (start >= 0 && (!best || last - start > best.end - best.start)) best = { start, end: last };
  return best;
}

export function findReceiptPaperBounds(rgba, width, height) {
  if (!rgba || !width || !height || rgba.length < width * height * 4) return null;
  const mask = new Uint8Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const red = rgba[offset]; const green = rgba[offset + 1]; const blue = rgba[offset + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    if (luminance >= 145 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 85) mask[pixel] = 1;
  }
  const centerLeft = Math.floor(width * 0.28);
  const centerRight = Math.ceil(width * 0.72);
  const rowFlags = Array.from({ length: height }, (_, y) => {
    let hits = 0;
    for (let x = centerLeft; x < centerRight; x += 1) hits += mask[y * width + x];
    return hits / Math.max(1, centerRight - centerLeft) >= 0.45;
  });
  const rows = longestSpan(rowFlags, 4);
  if (!rows || rows.end - rows.start + 1 < height * 0.18) return null;
  const columnFlags = Array.from({ length: width }, (_, x) => {
    let hits = 0;
    for (let y = rows.start; y <= rows.end; y += 1) hits += mask[y * width + x];
    return hits / (rows.end - rows.start + 1) >= 0.40;
  });
  const columns = longestSpan(columnFlags, 3);
  if (!columns || columns.end - columns.start + 1 < width * 0.35) return null;
  const boxWidth = columns.end - columns.start + 1;
  const boxHeight = rows.end - rows.start + 1;
  const aspectRatio = boxWidth / boxHeight;
  if (aspectRatio < 0.25 || aspectRatio > 1.5) return null;
  const padX = Math.max(2, Math.round(boxWidth * 0.025));
  const padY = Math.max(2, Math.round(boxHeight * 0.025));
  return {
    x: Math.max(0, columns.start - padX), y: Math.max(0, rows.start - padY),
    width: Math.min(width, columns.end + padX + 1) - Math.max(0, columns.start - padX),
    height: Math.min(height, rows.end + padY + 1) - Math.max(0, rows.start - padY),
  };
}

export function getTesseractApi(module) {
  const api = typeof module?.createWorker === 'function' ? module : module?.default;
  if (typeof api?.createWorker !== 'function') throw new Error('A biblioteca OCR não disponibilizou createWorker.');
  return api;
}

export async function configureReceiptWorker(worker, pageSegMode = '6') {
  if (typeof worker?.setParameters === 'function') {
    await worker.setParameters({ tessedit_pageseg_mode: String(pageSegMode) });
  }
  return worker;
}

function trimOcrArtifacts(value) {
  return String(value || '').replace(/[\s|_~—–-]+$/u, '').trim();
}

function lineAfterLabel(text, labels) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const cleaned = normalize(line).replace(/[|]/g, 'I');
    for (const label of labels) {
      const match = cleaned.match(new RegExp(`\\b${label}\\s*[:.]?\\s*(.+)$`, 'i'));
      if (match?.[1]?.trim() && !/^[:.]+$/.test(match[1].trim())) {
        return trimOcrArtifacts(line.slice(Math.max(0, line.toLowerCase().indexOf(match[1].toLowerCase()))));
      }
      const labelMatch = cleaned.match(new RegExp(`\\b${label}\\s*[:.]?\\s*$`, 'i'));
      if (labelMatch) {
        const index = lines.indexOf(line);
        const nextLine = lines[index + 1];
        if (nextLine && !/^\p{L}[\p{L}\p{N}\s()./-]*\s*:/u.test(nextLine)) return trimOcrArtifacts(nextLine);
      }
    }
  }
  return '';
}

function setField(form, name, value, { onlyIfBlank = true } = {}) {
  const field = form.elements.namedItem(name);
  const clean = String(value || '').trim();
  if (!field || !clean || (onlyIfBlank && field.value.trim())) return false;
  field.value = clean;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function parseReceiptTimestamp(text) {
  const match = String(text || '').match(/\b(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, day, month, rawYear, hour, minute, second = '0'] = match;
  const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
  const desiredUtc = Date.UTC(year, Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const offsetAt = (instant, zone) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - instant;
  };
  let instant = desiredUtc;
  for (let i = 0; i < 3; i += 1) instant = desiredUtc - offsetAt(instant, 'America/Cuiaba');
  const brasilia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(brasilia.map(({ type, value }) => [type, value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function parseCooNumber(text) {
  const source = String(text || '');
  const match = source.match(/\bCOO\s*[:.]?\s*(\d{1,10})/i)
    || source.match(/\bC\s*[O0Q]\s*[O0QD]\s*[:.]?\s*(\d{1,10})/i);
  if (match?.[1]) return match[1];
  const operatorLine = source.split(/\r?\n/).find((line) => /\bOPERADOR\b/i.test(line));
  const contextualMatch = operatorLine?.match(/\b(\d{4,10})\s*[,;:.]?\s*P[DO0][VUW]\s*[:.]?\s*\d{1,6}\b/i);
  return contextualMatch?.[1] || '';
}

export function parseDeliveryReceiptText(text) {
  const result = {};
  const pdv = String(text || '').match(/\bPDV\s*[:.]?\s*(\d{1,6})/i);
  if (pdv) result.pdv = pdv[1];
  const coo = parseCooNumber(text);
  if (coo) result.doc = coo;
  const client = lineAfterLabel(text, ['cliente']);
  if (client) result.clientName = titleCasePortuguese(client.replace(/^cliente\s*[:.]?\s*/i, ''));
  const phone = lineAfterLabel(text, ['fone(?:s|\\(s\\))', 'telefone']);
  if (phone && phone.replace(/\D/g, '').length >= 8) {
    result.phone = phone.replace(/^(?:fone(?:s|\(s\))?|telefone)\s*[:.]?\s*/i, '').trim();
  }
  const address = lineAfterLabel(text, ['logradouro']);
  if (address) {
    const cleaned = address.replace(/^logradouro\s*[:.]?\s*/i, '').replace(/\s+[|_~—–-]+\s*[\p{L}]?\s*$/u, '').trim();
    const number = cleaned.match(/\s+(\d+[A-Za-z]?)\s*$/);
    if (number) {
      result.street = normalizeStreet(cleaned.slice(0, number.index));
      result.houseNumber = number[1];
    } else if (/\bS\s*\/?\s*N\.?\s*$/i.test(cleaned)) {
      result.street = normalizeStreet(cleaned.replace(/\s+S\s*\/?\s*N\.?\s*$/i, ''));
      result.houseNumber = 's/n';
    } else result.street = normalizeStreet(cleaned);
  }
  const neighborhood = lineAfterLabel(text, ['bairro']);
  if (neighborhood) result.neighborhood = titleCasePortuguese(neighborhood.replace(/^bairro\s*[:.]?\s*/i, ''));
  const timestamp = parseReceiptTimestamp(text);
  if (timestamp) Object.assign(result, { operationDate: timestamp.date, entryTimeOnly: timestamp.time });
  return result;
}

export function parseCouponText(text) {
  const match = String(text || '').match(/NFC\s*[-–]?\s*e\s*(?:n[º°.]?\s*)?(\d{5,})/i)
    || String(text || '').match(/\bNFC\s*[-–]?\s*e\b[^\d]{0,24}(\d{5,})/i);
  if (!match) return {};
  const fields = { coupon: match[1] };
  const coo = parseCooNumber(text);
  if (coo) fields.doc = coo;
  return fields;
}

export function mergeOcrCandidates(kind, candidates = []) {
  const parse = kind === 'coupon' ? parseCouponText : parseDeliveryReceiptText;
  const parsed = candidates.map((candidate) => ({
    ...candidate,
    fields: parse(candidate?.text || ''),
    confidence: Number.isFinite(Number(candidate?.confidence)) ? Number(candidate.confidence) : 50,
  }));
  const keys = [...new Set(parsed.flatMap((candidate) => Object.keys(candidate.fields)))];
  const fields = {};
  const uncertain = [];
  for (const key of keys) {
    const groups = new Map();
    for (const candidate of parsed) {
      const value = candidate.fields[key];
      if (!value) continue;
      const canonical = normalize(value).replace(/[^a-z0-9]/g, '');
      if (!canonical) continue;
      const group = groups.get(canonical) || { value, votes: 0, bestConfidence: 0, candidate };
      group.votes += 1;
      group.bestConfidence = Math.max(group.bestConfidence, candidate.confidence);
      if (candidate.confidence > group.candidate.confidence) group.candidate = candidate;
      groups.set(canonical, group);
    }
    const ranked = [...groups.values()].sort((a, b) => (b.votes * 30 + b.bestConfidence * 0.25) - (a.votes * 30 + a.bestConfidence * 0.25));
    if (!ranked.length) continue;
    const winner = ranked[0];
    const runnerUp = ranked[1];
    if (winner.bestConfidence < 30 || (runnerUp && winner.votes === runnerUp.votes)) {
      uncertain.push({ field: key, candidates: ranked.map((item) => item.value) });
      continue;
    }
    fields[key] = winner.value;
  }
  const bestCandidate = [...parsed].sort((a, b) => (
    Object.keys(b.fields).length * 100 + b.confidence - (Object.keys(a.fields).length * 100 + a.confidence)
  ))[0] || { fields: {}, data: null };
  return { fields, uncertain, bestCandidate, attempts: parsed.length };
}

const TRACE_SPECS = {
  delivery: [
    ['pdv', 'PDV', /\bPDV\b/i, '#2563eb'],
    ['doc', 'COO → DOC', /\bC\s*[O0Q]\s*[O0QD]\b/i, '#9333ea'],
    ['clientName', 'Cliente', /\bCLIENTE\b/i, '#0891b2'],
    ['phone', 'Telefone', /\b(?:FONE|TELEFONE)\b/i, '#ea580c'],
    ['street', 'Endereço', /\b(?:LOGRADOURO|RUA|AVENIDA|AV\.)\b/i, '#16a34a'],
    ['houseNumber', 'Número', /\b(?:LOGRADOURO|RUA|AVENIDA|AV\.)\b/i, '#65a30d'],
    ['neighborhood', 'Bairro', /\bBAIRRO\b/i, '#db2777'],
    ['operationDate', 'Data', /\b\d{2}\/\d{2}\/\d{2,4}\b/, '#ca8a04'],
    ['entryTimeOnly', 'Hora', /\b\d{2}:\d{2}(?::\d{2})?\b/, '#dc2626'],
  ],
  coupon: [
    ['coupon', 'NFC-e → Cupom', /\bNFC\s*[-–]?\s*E\b/i, '#2563eb'],
    ['doc', 'COO → DOC', /\bC\s*[O0Q]\s*[O0QD]\b/i, '#9333ea'],
  ],
};

export function findReceiptTraceBoxes(kind, lines, fields) {
  const specs = TRACE_SPECS[kind] || [];
  return specs.flatMap(([key, label, labelPattern, color]) => {
    const value = normalize(fields?.[key] || '').replace(/[^a-z0-9]/g, '');
    if (!value) return [];
    const line = (lines || []).find((item) => {
      const text = String(item?.text || '');
      const normalizedText = normalize(text).replace(/[^a-z0-9]/g, '');
      return labelPattern.test(text) && value.length >= 2 && normalizedText.includes(value);
    });
    const bbox = line?.bbox;
    if (!bbox || ![bbox.x0, bbox.y0, bbox.x1, bbox.y1].every(Number.isFinite) || bbox.x1 <= bbox.x0 || bbox.y1 <= bbox.y0) return [];
    return [{ key, label, color, x0: bbox.x0, y0: bbox.y0, x1: bbox.x1, y1: bbox.y1 }];
  });
}

function getOcrLines(data) {
  if (Array.isArray(data?.lines) && data.lines.length) return data.lines;
  const nestedLines = (data?.blocks || []).flatMap((block) => (block.paragraphs || []).flatMap((paragraph) => paragraph.lines || []));
  if (nestedLines.length) return nestedLines;
  return data?.words || [];
}

function scaleOcrDataBoxes(data, scaleX = 1, scaleY = 1) {
  const lines = getOcrLines(data).map((line) => ({
    ...line,
    bbox: line?.bbox ? {
      ...line.bbox,
      x0: line.bbox.x0 * scaleX, x1: line.bbox.x1 * scaleX,
      y0: line.bbox.y0 * scaleY, y1: line.bbox.y1 * scaleY,
    } : line?.bbox,
  }));
  return { ...data, lines };
}

export function mergeOcrLinesWithVerticalOffset(primary, secondary, offsetY) {
  const primaryLines = getOcrLines(primary);
  const secondaryLines = getOcrLines(secondary).map((line) => ({
    ...line,
    bbox: line?.bbox ? { ...line.bbox, y0: line.bbox.y0 + offsetY, y1: line.bbox.y1 + offsetY } : line?.bbox,
  }));
  return { ...primary, lines: [...primaryLines, ...secondaryLines] };
}

async function getOcr() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = import(TESSERACT_URL)
      .then((module) => getTesseractApi(module).createWorker('por', 1))
      .then((worker) => configureReceiptWorker(worker))
      .catch((error) => {
        tesseractWorkerPromise = null;
        throw error;
      });
  }
  return tesseractWorkerPromise;
}

function sharpenCanvas(context, canvas) {
  if (canvas.width * canvas.height > 4_000_000) return;
  try {
    const original = context.getImageData(0, 0, canvas.width, canvas.height);
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = canvas.width;
    blurCanvas.height = canvas.height;
    const blurContext = blurCanvas.getContext('2d');
    if (!blurContext) return;
    blurContext.filter = 'blur(0.8px)';
    blurContext.drawImage(canvas, 0, 0);
    const blurred = blurContext.getImageData(0, 0, canvas.width, canvas.height);
    for (let offset = 0; offset < original.data.length; offset += 4) {
      const difference = original.data[offset] - blurred.data[offset];
      if (Math.abs(difference) < 5) continue;
      const value = Math.max(0, Math.min(255, Math.round(original.data[offset] + difference * 0.65)));
      original.data[offset] = value;
      original.data[offset + 1] = value;
      original.data[offset + 2] = value;
    }
    context.putImageData(original, 0, 0);
  } catch (error) {
    console.debug('Realce de nitidez ignorado; seguindo com contraste local:', error);
  }
}

function estimatePaperRotation(rgba, width, bounds) {
  if (!rgba || !bounds || !width) return 0;
  const centerForBand = (from, to) => {
    let sum = 0; let count = 0;
    for (let y = from; y <= to; y += 1) {
      let left = width; let right = -1;
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const offset = (y * width + x) * 4;
        const r = rgba[offset]; const g = rgba[offset + 1]; const b = rgba[offset + 2];
        if ((r + g + b) / 3 > 145 && Math.max(r, g, b) - Math.min(r, g, b) <= 85) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
      if (right >= left) { sum += (left + right) / 2; count += 1; }
    }
    return count ? sum / count : null;
  };
  const band = Math.max(1, Math.floor(bounds.height * 0.12));
  const top = centerForBand(bounds.y + 2, Math.min(bounds.y + band, bounds.y + bounds.height - 1));
  const bottom = centerForBand(Math.max(bounds.y, bounds.y + bounds.height - band), bounds.y + bounds.height - 2);
  if (top == null || bottom == null) return 0;
  const slope = (bottom - top) / Math.max(1, bounds.height - band);
  const angle = Math.atan(slope);
  return Math.abs(angle) <= 0.22 ? angle : 0;
}

export function getReceiptProcessingScale(width, height) {
  if (!(width > 0) || !(height > 0)) return 1;
  return Math.min(2, 4000 / Math.max(width, height), Math.sqrt(2_450_000 / (width * height)));
}

async function prepareImageForOcr(image) {
  if (typeof createImageBitmap !== 'function') {
    const dimensions = await new Promise((resolve) => {
      const url = URL.createObjectURL(image);
      const probe = new Image();
      probe.onload = () => { URL.revokeObjectURL(url); resolve({ width: probe.naturalWidth, height: probe.naturalHeight }); };
      probe.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0 }); };
      probe.src = url;
    });
    return { image, ...dimensions };
  }
  const bitmap = await createImageBitmap(image);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const probeWidth = Math.min(160, bitmap.width);
  const probeHeight = Math.max(1, Math.round(bitmap.height * probeWidth / bitmap.width));
  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = probeWidth;
  probeCanvas.height = probeHeight;
  const probeContext = probeCanvas.getContext('2d', { willReadFrequently: true });
  probeContext?.drawImage(bitmap, 0, 0, probeWidth, probeHeight);
  const probePixels = probeContext?.getImageData(0, 0, probeWidth, probeHeight).data;
  const paper = probePixels ? findReceiptPaperBounds(probePixels, probeWidth, probeHeight) : null;
  const sourceX = paper ? Math.floor(paper.x * bitmap.width / probeWidth) : 0;
  const sourceY = paper ? Math.floor(paper.y * bitmap.height / probeHeight) : 0;
  const sourceWidth = paper ? Math.min(bitmap.width - sourceX, Math.ceil(paper.width * bitmap.width / probeWidth)) : bitmap.width;
  const sourceHeight = paper ? Math.min(bitmap.height - sourceY, Math.ceil(paper.height * bitmap.height / probeHeight)) : bitmap.height;
  const angle = paper && probePixels ? estimatePaperRotation(probePixels, probeWidth, paper) : 0;
  const rotatedWidth = Math.ceil(Math.abs(sourceWidth * Math.cos(angle)) + Math.abs(sourceHeight * Math.sin(angle)));
  const rotatedHeight = Math.ceil(Math.abs(sourceHeight * Math.cos(angle)) + Math.abs(sourceWidth * Math.sin(angle)));
  const scale = getReceiptProcessingScale(rotatedWidth, rotatedHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rotatedWidth * scale));
  canvas.height = Math.max(1, Math.round(rotatedHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close?.(); return { image, width: originalWidth, height: originalHeight }; }
  context.imageSmoothingQuality = 'high';
  context.filter = 'grayscale(1) contrast(1.28) brightness(1.04)';
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(-angle);
  context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, -sourceWidth * scale / 2, -sourceHeight * scale / 2, sourceWidth * scale, sourceHeight * scale);
  sharpenCanvas(context, canvas);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob
    ? { image: blob, width: canvas.width, height: canvas.height, cropped: Boolean(paper) }
    : { image, width: originalWidth, height: originalHeight, cropped: false };
}

async function createOcrVariant(image, mode) {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: mode === 'threshold' });
    if (!context) return null;
    if (mode === 'threshold') {
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const histogram = new Uint32Array(256);
      for (let i = 0; i < pixels.data.length; i += 4) histogram[Math.round(pixels.data[i] * 0.2126 + pixels.data[i + 1] * 0.7152 + pixels.data[i + 2] * 0.0722)] += 1;
      const total = canvas.width * canvas.height;
      let totalLuminance = 0;
      for (let value = 0; value < 256; value += 1) totalLuminance += value * histogram[value];
      let backgroundWeight = 0;
      let backgroundLuminance = 0;
      let bestVariance = -1;
      let threshold = 150;
      for (let value = 0; value < 256; value += 1) {
        backgroundWeight += histogram[value];
        if (!backgroundWeight) continue;
        const foregroundWeight = total - backgroundWeight;
        if (!foregroundWeight) break;
        backgroundLuminance += value * histogram[value];
        const meanBackground = backgroundLuminance / backgroundWeight;
        const meanForeground = (totalLuminance - backgroundLuminance) / foregroundWeight;
        const variance = backgroundWeight * foregroundWeight * (meanBackground - meanForeground) ** 2;
        if (variance > bestVariance) { bestVariance = variance; threshold = value; }
      }
      for (let i = 0; i < pixels.data.length; i += 4) {
        const luminance = pixels.data[i] * 0.2126 + pixels.data[i + 1] * 0.7152 + pixels.data[i + 2] * 0.0722;
        const value = luminance >= threshold ? 255 : 0;
        pixels.data[i] = value; pixels.data[i + 1] = value; pixels.data[i + 2] = value;
      }
      context.putImageData(pixels, 0, 0);
    } else {
      context.filter = 'grayscale(1) contrast(1.18) brightness(1.06)';
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? { image: blob, width: canvas.width, height: canvas.height } : null;
  } finally {
    bitmap.close?.();
  }
}

async function prepareLowerReceiptCrop(image, width, height) {
  if (typeof createImageBitmap !== 'function' || !width || !height) return null;
  const bitmap = await createImageBitmap(image);
  const top = Math.floor(height * 0.48);
  const cropHeight = height - top;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = cropHeight;
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close?.(); return null; }
  context.drawImage(bitmap, 0, top, width, cropHeight, 0, 0, width, cropHeight);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? { image: blob, top } : null;
}

export function assessFrameQuality(imageData) {
  const { data, width, height } = imageData || {};
  if (!data || !width || !height) return { readable: false, message: 'Aguardando imagem da webcam…' };
  const left = Math.floor(width * 0.30);
  const right = Math.ceil(width * 0.70);
  const top = Math.floor(height * 0.06);
  const bottom = Math.ceil(height * 0.94);
  const luminance = (x, y) => {
    const offset = (y * width + x) * 4;
    return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
  };
  let sum = 0;
  let sumSquares = 0;
  let bright = 0;
  let edges = 0;
  let count = 0;
  for (let y = top; y < bottom - 1; y += 1) {
    for (let x = left; x < right - 1; x += 1) {
      const value = luminance(x, y);
      const horizontal = Math.abs(value - luminance(x + 1, y));
      const vertical = Math.abs(value - luminance(x, y + 1));
      sum += value;
      sumSquares += value * value;
      if (value > 180) bright += 1;
      if (horizontal + vertical > 55) edges += 1;
      count += 1;
    }
  }
  const mean = sum / count;
  const contrast = Math.sqrt(Math.max(0, sumSquares / count - mean * mean));
  const brightRatio = bright / count;
  const edgeRatio = edges / count;
  if (mean < 60) return { readable: false, message: 'Está escuro: aumente a iluminação.' };
  if (mean > 246) return { readable: false, message: 'Há claridade/reflexo demais: mude o ângulo.' };
  if (brightRatio < 0.2) return { readable: false, message: 'Centralize o papel dentro da moldura.' };
  if (contrast < 13 || edgeRatio < 0.008) return { readable: false, message: 'Ajuste a distância até as letras ficarem nítidas.' };
  return { readable: true, message: 'Enquadramento bom — mantenha imóvel.' };
}

export function analyzeReceiptFrame(imageData) {
  const { data, width, height } = imageData || {};
  if (!data || !width || !height) return { state: 'bad', message: 'Aguardando imagem da webcam…', present: false, sharpness: 0 };
  const mask = new Uint8Array(width * height);
  const luminanceAt = (x, y) => {
    const offset = (y * width + x) * 4;
    return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const high = Math.max(data[offset], data[offset + 1], data[offset + 2]);
      const low = Math.min(data[offset], data[offset + 1], data[offset + 2]);
      if (luminanceAt(x, y) > 158 && high - low < 92) mask[y * width + x] = 1;
    }
  }
  const rowHits = Array.from({ length: height }, (_, y) => {
    let count = 0;
    for (let x = 0; x < width; x += 1) count += mask[y * width + x];
    return count;
  });
  const maxRow = Math.max(...rowHits);
  const rows = rowHits.map((hits) => hits >= Math.max(4, maxRow * 0.20));
  const rowSpan = longestSpan(rows, 2);
  if (!rowSpan || rowSpan.end - rowSpan.start < height * 0.28) {
    return { state: 'bad', message: 'Coloque o cupom dentro do retângulo', present: false, sharpness: 0 };
  }
  const colHits = Array.from({ length: width }, (_, x) => {
    let count = 0;
    for (let y = rowSpan.start; y <= rowSpan.end; y += 1) count += mask[y * width + x];
    return count;
  });
  const maxCol = Math.max(...colHits);
  const columns = colHits.map((hits) => hits >= Math.max(3, maxCol * 0.22));
  const colSpan = longestSpan(columns, 2);
  if (!colSpan) return { state: 'bad', message: 'Coloque o cupom dentro do retângulo', present: false, sharpness: 0 };
  const box = { x0: colSpan.start, x1: colSpan.end, y0: rowSpan.start, y1: rowSpan.end };
  const boxWidth = box.x1 - box.x0 + 1;
  const boxHeight = box.y1 - box.y0 + 1;
  const ratio = boxWidth / boxHeight;
  if (ratio > 0.9 || boxHeight < height * 0.28 || boxWidth < width * 0.035) {
    return { state: 'bad', message: 'Coloque o cupom em pé dentro do retângulo', present: false, sharpness: 0 };
  }
  const centerX = (box.x0 + box.x1) / (2 * width);
  const centerY = (box.y0 + box.y1) / (2 * height);
  const heightRatio = boxHeight / height;
  if (heightRatio < 0.60) return { state: 'near', message: 'Aproxime o cupom', present: true, box, sharpness: 0 };
  if (heightRatio > 0.94) return { state: 'near', message: 'Afaste o cupom', present: true, box, sharpness: 0 };
  if (centerX < 0.40) return { state: 'near', message: 'Mova para a direita', present: true, box, sharpness: 0 };
  if (centerX > 0.60) return { state: 'near', message: 'Mova para a esquerda', present: true, box, sharpness: 0 };
  if (centerY < 0.44) return { state: 'near', message: 'Mova para baixo', present: true, box, sharpness: 0 };
  if (centerY > 0.56) return { state: 'near', message: 'Mova para cima', present: true, box, sharpness: 0 };
  let topCenter = 0; let bottomCenter = 0;
  for (let y = box.y0; y < box.y0 + boxHeight * 0.15; y += 1) {
    let sum = 0; let n = 0;
    for (let x = box.x0; x <= box.x1; x += 1) if (mask[y * width + x]) { sum += x; n += 1; }
    if (n) topCenter += sum / n;
  }
  for (let y = box.y1 - Math.floor(boxHeight * 0.15); y <= box.y1; y += 1) {
    let sum = 0; let n = 0;
    for (let x = box.x0; x <= box.x1; x += 1) if (mask[y * width + x]) { sum += x; n += 1; }
    if (n) bottomCenter += sum / n;
  }
  if (Math.abs(topCenter - bottomCenter) / Math.max(1, boxWidth) > 0.14) {
    return { state: 'near', message: 'Endireite o cupom', present: true, box, sharpness: 0 };
  }
  let luminanceSum = 0; let glare = 0; let edgeSum = 0; let edgeCount = 0;
  const xStart = Math.max(box.x0, Math.floor(width * 0.31));
  const xEnd = Math.min(box.x1, Math.ceil(width * 0.69));
  for (let y = box.y0 + 1; y < box.y1; y += 1) {
    for (let x = xStart + 1; x < xEnd; x += 1) {
      const value = luminanceAt(x, y);
      luminanceSum += value;
      if (value > 248) glare += 1;
      edgeSum += Math.abs(4 * value - luminanceAt(x - 1, y) - luminanceAt(x + 1, y) - luminanceAt(x, y - 1) - luminanceAt(x, y + 1));
      edgeCount += 1;
    }
  }
  const average = luminanceSum / Math.max(1, edgeCount);
  const glareRatio = glare / Math.max(1, edgeCount);
  const sharpness = edgeSum / Math.max(1, edgeCount);
  if (average < 70) return { state: 'near', message: 'Pouca luz', present: true, box, sharpness };
  if (glareRatio > 0.12 || average > 249) return { state: 'near', message: 'Reflexo no papel', present: true, box, sharpness };
  if (sharpness < 18) return { state: 'near', message: 'Fora de foco — afaste ou aproxime o cupom até ficar nítido', present: true, box, sharpness };
  return { state: 'good', message: 'Nítido — segure parado…', present: true, box, sharpness };
}

export function getCameraResolutionPreference(capabilities = {}) {
  const maxWidth = Number(capabilities.width?.max);
  const maxHeight = Number(capabilities.height?.max);
  return {
    width: Number.isFinite(maxWidth) && maxWidth > 0 ? Math.min(1920, Math.floor(maxWidth)) : 1920,
    height: Number.isFinite(maxHeight) && maxHeight > 0 ? Math.min(1080, Math.floor(maxHeight)) : 1080,
  };
}

export function getCameraFocusOptions(capabilities = {}) {
  const modes = Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [];
  const range = capabilities.focusDistance;
  const manualAvailable = modes.includes('manual')
    && Number.isFinite(Number(range?.min))
    && Number.isFinite(Number(range?.max))
    && Number(range.max) > Number(range.min);
  return {
    autoMode: modes.includes('continuous') ? 'continuous' : modes.includes('single-shot') ? 'single-shot' : null,
    manualAvailable,
    min: manualAvailable ? Number(range.min) : null,
    max: manualAvailable ? Number(range.max) : null,
    step: manualAvailable && Number(range.step) > 0 ? Number(range.step) : 0.01,
  };
}

export function buildCameraTrackConstraints(resolution = {}, { focusMode = null, focusDistance = null } = {}) {
  const constraints = {
    width: { ideal: Number(resolution.width) || 1920 },
    height: { ideal: Number(resolution.height) || 1080 },
    frameRate: { ideal: 30 },
  };
  if (focusMode) constraints.focusMode = { exact: focusMode };
  if (focusMode === 'manual' && focusDistance !== null && focusDistance !== '' && Number.isFinite(Number(focusDistance))) {
    constraints.focusDistance = { exact: Number(focusDistance) };
  }
  return constraints;
}

export function initDeliveryReceiptCapture(form) {
  const panel = form.querySelector('#receiptCapturePanel');
  const video = panel?.querySelector('video');
  const cameraStage = panel?.querySelector('.receipt-camera-stage');
  const preview = panel?.querySelector('#receiptCapturePreview');
  const previewWrap = panel?.querySelector('[data-receipt-preview-wrap]');
  const traceOverlay = panel?.querySelector('[data-receipt-overlay]');
  const tracker = panel?.querySelector('[data-receipt-tracker]');
  const trackerSummary = panel?.querySelector('[data-tracking-summary]');
  const trackerRows = [...(panel?.querySelectorAll('[data-track-key]') || [])];
  const status = panel?.querySelector('#receiptCaptureStatus');
  const frameStatus = panel?.querySelector('[data-frame-status]');
  const focusHint = panel?.querySelector('[data-focus-hint]');
  const cameraDeviceField = panel?.querySelector('[data-camera-selector]');
  const cameraDeviceSelect = panel?.querySelector('[data-camera-device]');
  const cameraResolution = panel?.querySelector('[data-camera-resolution]');
  const focusControls = panel?.querySelector('[data-focus-controls]');
  const focusModeSelect = panel?.querySelector('[data-focus-mode]');
  const focusDistanceInput = panel?.querySelector('[data-focus-distance]');
  const focusDistanceValue = panel?.querySelector('[data-focus-distance-value]');
  const focusStatus = panel?.querySelector('[data-focus-status]');
  const autoReadToggle = panel?.querySelector('[data-camera-auto]');
  const startButton = panel?.querySelector('[data-camera-start]');
  const captureButton = panel?.querySelector('[data-camera-capture]');
  const stopButton = panel?.querySelector('[data-camera-stop]');
  if (!panel || !video || !cameraStage || !status) return;

  // Inicia o download do OCR enquanto o operador enquadra/prepara o comprovante.
  // getOcr() mantém uma única Promise/worker, também usada pela leitura de fotos.
  const ocrWarmup = getOcr().catch((error) => {
    console.warn('Leitor OCR não pôde ser pré-carregado:', error);
    return null;
  });

  let stream = null;
  let activeReceipt = 'delivery';
  let previewUrl = null;
  let qualityTimer = null;
  let readableSince = 0;
  let autoReadDone = false;
  let captureLocked = false;
  let noPaperSince = 0;
  let previousBox = null;
  let audioContext = null;
  let captureBusy = false;
  let cameraOpening = false;
  let activeTrack = null;
  let activeFocusOptions = getCameraFocusOptions();
  let activeFocusMode = null;
  let focusAdjustTimer = null;
  let activeResolutionPreference = { width: 1920, height: 1080 };
  const qualityCanvas = document.createElement('canvas');
  qualityCanvas.width = 320;
  qualityCanvas.height = 180;
  const qualityContext = qualityCanvas.getContext('2d', { willReadFrequently: true });
  const setStatus = (message) => { status.textContent = message; };
  const clearTraceOverlay = () => traceOverlay?.replaceChildren();
  const resetTracker = (kind = activeReceipt) => {
    if (!tracker) return;
    tracker.hidden = false;
    if (trackerSummary) trackerSummary.textContent = kind === 'coupon' ? 'Aguardando leitura do cupom NFC-e.' : 'Aguardando leitura do relatório.';
    trackerRows.forEach((row) => {
      row.hidden = row.dataset.trackMode !== kind;
      row.dataset.trackState = 'waiting';
      const value = row.querySelector('[data-track-value]');
      if (value) value.textContent = 'Aguardando leitura';
    });
    clearTraceOverlay();
  };
  const updateTracker = (kind, fields = {}, { error = false, traceCount = 0 } = {}) => {
    if (!tracker) return;
    tracker.hidden = false;
    const visibleRows = trackerRows.filter((row) => row.dataset.trackMode === kind);
    let found = 0;
    visibleRows.forEach((row) => {
      row.hidden = false;
      const value = String(fields[row.dataset.trackKey] || '').trim();
      const output = row.querySelector('[data-track-value]');
      if (value) {
        row.dataset.trackState = 'found';
        if (output) output.textContent = `Lido: ${value}`;
        found += 1;
      } else if (error) {
        row.dataset.trackState = 'waiting';
        if (output) output.textContent = 'Falha ao ler';
      } else if (row.dataset.trackRequired === 'true') {
        row.dataset.trackState = 'missing';
        if (output) output.textContent = 'Não localizado';
      } else {
        row.dataset.trackState = 'waiting';
        if (output) output.textContent = 'Não consta na imagem';
      }
    });
    if (trackerSummary) {
      trackerSummary.textContent = error
        ? 'OCR indisponível; tente novamente ou confira a foto.'
        : traceCount
          ? `${found} campo(s) lido(s) · ${traceCount} marcação(ões) colorida(s). Confira o formulário.`
          : found
            ? `${found} campo(s) lido(s); posição visual indisponível. Confira a lista e o formulário.`
            : 'Nenhum campo foi localizado. Ajuste o documento e tente outra vez.';
    }
  };
  const drawTraceOverlay = (kind, data, fields, width, height) => {
    if (!traceOverlay || !width || !height) return 0;
    const boxes = findReceiptTraceBoxes(kind, getOcrLines(data), fields);
    traceOverlay.replaceChildren();
    traceOverlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const namespace = 'http://www.w3.org/2000/svg';
    const fontSize = Math.max(16, width * 0.022);
    boxes.forEach((box) => {
      const rect = document.createElementNS(namespace, 'rect');
      rect.setAttribute('x', box.x0);
      rect.setAttribute('y', box.y0);
      rect.setAttribute('width', box.x1 - box.x0);
      rect.setAttribute('height', box.y1 - box.y0);
      rect.setAttribute('rx', Math.max(4, fontSize * 0.18));
      rect.setAttribute('fill', box.color);
      rect.setAttribute('fill-opacity', '0.12');
      rect.setAttribute('stroke', box.color);
      rect.setAttribute('stroke-width', Math.max(3, width * 0.003));
      rect.dataset.traceKey = box.key;
      traceOverlay.append(rect);
      const label = document.createElementNS(namespace, 'text');
      label.setAttribute('x', Math.max(2, box.x0 + fontSize * 0.15));
      label.setAttribute('y', Math.max(fontSize, box.y0 - fontSize * 0.25));
      label.setAttribute('font-size', fontSize);
      label.setAttribute('font-weight', '800');
      label.setAttribute('fill', box.color);
      label.setAttribute('stroke', '#ffffff');
      label.setAttribute('stroke-width', Math.max(3, fontSize * 0.18));
      label.setAttribute('paint-order', 'stroke');
      label.dataset.traceKey = box.key;
      label.textContent = box.label;
      traceOverlay.append(label);
    });
    return boxes.length;
  };
  const setPreview = (image) => {
    if (!preview || !previewWrap) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(image);
    preview.src = previewUrl;
    preview.hidden = false;
    previewWrap.hidden = false;
    resetTracker(activeReceipt);
  };
  const stopCamera = () => {
    if (qualityTimer) clearInterval(qualityTimer);
    clearTimeout(focusAdjustTimer);
    qualityTimer = null;
    readableSince = 0;
    captureLocked = false;
    noPaperSince = 0;
    previousBox = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    activeTrack = null;
    video.srcObject = null;
    cameraStage.hidden = true;
    captureButton.hidden = true;
    stopButton.hidden = true;
    startButton.hidden = false;
    if (cameraResolution) cameraResolution.textContent = 'Resolução efetiva: webcam fechada.';
    if (focusControls) focusControls.hidden = true;
    if (focusHint) focusHint.hidden = true;
  };
  const applyRecognized = (kind, fields, uncertain = [], attempts = 1) => {
    const found = Object.keys(fields).length;
    let applied = 0;
    Object.entries(fields).forEach(([name, value]) => {
      if (name === 'neighborhood') {
        const select = form.elements.namedItem('neighborhoodId');
        const expected = normalizeNeighborhood(value);
        const option = [...(select?.options || [])].find((item) => normalizeNeighborhood(item.textContent) === expected);
        if (option && setField(form, 'neighborhoodId', option.value)) applied += 1;
      } else {
        const replaceDefault = ['operationDate', 'entryTimeOnly'].includes(name);
        if (setField(form, name, value, { onlyIfBlank: !replaceDefault })) applied += 1;
      }
    });
    const fieldLabels = { pdv: 'PDV', doc: 'COO/DOC', clientName: 'Cliente', phone: 'Telefone', street: 'Logradouro', houseNumber: 'Número', neighborhood: 'Bairro', operationDate: 'Data', entryTimeOnly: 'Horário', coupon: 'NFC-e' };
    const uncertaintyNote = uncertain.length
      ? ` Leituras divergentes — confirme: ${uncertain.map(({ field, candidates }) => `${fieldLabels[field] || field}: ${candidates.join(' / ')}`).join('; ')}.`
      : '';
    const attemptNote = attempts > 1 ? ` Comparei ${attempts} leituras locais.` : '';
    setStatus(`${applied ? `Leitura concluída: ${applied} campo(s) preenchido(s).` : found ? 'Leitura concluída, mas os campos já tinham valor.' : 'Não encontrei campos com segurança. Tente outra foto ou preencha manualmente.'}${attemptNote}${uncertaintyNote} Confira e corrija antes de registrar.`);
    return { fields, found: found > 0, uncertain };
  };
  const recognize = async (image, kind) => {
    setStatus('Ajustando o enquadramento e realçando o texto localmente…');
    try {
      const [worker, prepared] = await Promise.all([getOcr(), prepareImageForOcr(image)]);
      setPreview(prepared.image);
      setStatus(prepared.cropped ? 'Papel recortado e texto realçado no aparelho. Lendo…' : 'Texto realçado no aparelho. Lendo…');
      await configureReceiptWorker(worker, '6');
      const first = await worker.recognize(prepared.image);
      const candidates = [{ text: first.data.text || '', confidence: first.data.confidence, data: first.data }];
      const firstFields = kind === 'coupon' ? parseCouponText(first.data.text || '') : parseDeliveryReceiptText(first.data.text || '');
      const anchorFields = kind === 'coupon' ? ['coupon'] : ['pdv', 'doc', 'clientName', 'phone', 'street', 'neighborhood', 'operationDate', 'entryTimeOnly'];
      const hasWeakAnchor = anchorFields.some((field) => !firstFields[field]);
      const firstConfidence = Number(first.data.confidence);
      // Sempre comparar uma segunda leitura independente: confiança global alta
      // não garante que cada campo (especialmente COO/DOC) foi lido corretamente.
      try {
        const variant = await createOcrVariant(prepared.image, 'contrast');
        if (variant) {
          await configureReceiptWorker(worker, '11');
          const result = await worker.recognize(variant.image);
          const mappedData = scaleOcrDataBoxes(result.data, prepared.width / variant.width, prepared.height / variant.height);
          candidates.push({ text: result.data.text || '', confidence: result.data.confidence, data: mappedData });
        }
      } catch (error) {
        console.debug('A leitura OCR independente não pôde ser processada; mantendo a primeira leitura:', error);
      }
      let decision = mergeOcrCandidates(kind, candidates);
      const weakAfterTwo = anchorFields.some((field) => !decision.fields[field]);
      const needsThird = !Number.isFinite(firstConfidence) || firstConfidence < 82 || hasWeakAnchor || weakAfterTwo;
      if (needsThird && !(kind === 'delivery' && !decision.fields.doc)) {
        setStatus('As leituras anteriores ficaram incertas. Testando outra versão local em português, com letras e números…');
        try {
          const variant = await createOcrVariant(prepared.image, 'threshold');
          if (variant) {
            await configureReceiptWorker(worker, '6');
            const result = await worker.recognize(variant.image);
            const mappedData = scaleOcrDataBoxes(result.data, prepared.width / variant.width, prepared.height / variant.height);
            candidates.push({ text: result.data.text || '', confidence: result.data.confidence, data: mappedData });
          }
        } catch (error) {
          console.debug('A variante OCR threshold não pôde ser processada; mantendo as leituras anteriores:', error);
        }
        decision = mergeOcrCandidates(kind, candidates);
      }
      let data = decision.bestCandidate.data || first.data;
      if (kind === 'delivery' && !decision.fields.doc && candidates.length < 3) {
        try {
          const lowerCrop = await prepareLowerReceiptCrop(prepared.image, prepared.width, prepared.height);
          if (lowerCrop) {
            await configureReceiptWorker(worker, '6');
            const { data: lowerData } = await worker.recognize(lowerCrop.image);
            const combined = mergeOcrLinesWithVerticalOffset(first.data, lowerData, lowerCrop.top);
            combined.text = [first.data.text, lowerData.text].filter(Boolean).join('\n');
            candidates.push({ text: combined.text, confidence: lowerData.confidence, data: combined });
            decision = mergeOcrCandidates(kind, candidates);
            data = decision.bestCandidate.data || combined;
          }
        } catch (error) {
          console.debug('A tentativa extra do rodapé falhou; mantendo o resultado das outras leituras:', error);
        }
      }
      data = { ...data, lines: candidates.flatMap((candidate) => getOcrLines(candidate.data)) };
      const result = applyRecognized(kind, decision.fields, decision.uncertain, decision.attempts);
      const traceCount = drawTraceOverlay(kind, data, result.fields, prepared.width, prepared.height);
      updateTracker(kind, result.fields, { traceCount });
      return result.found;
    } catch (error) {
      console.error('OCR local falhou:', error);
      clearTraceOverlay();
      updateTracker(kind, {}, { error: true });
      setStatus('Não foi possível iniciar a leitura. Verifique a internet para carregar o leitor OCR ou use o preenchimento manual. A imagem não foi enviada.');
      return false;
    }
  };
  const captureSharpestBurst = async () => {
    const frames = [];
    for (let index = 0; index < 5; index += 1) {
      if (!video.videoWidth || !video.videoHeight) break;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) break;
      context.drawImage(video, 0, 0);
      const image = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.96));
      if (image) {
        qualityContext.drawImage(video, 0, 0, qualityCanvas.width, qualityCanvas.height);
        const score = analyzeReceiptFrame(qualityContext.getImageData(0, 0, qualityCanvas.width, qualityCanvas.height)).sharpness;
        frames.push({ image, score });
      }
      if (index < 4) await new Promise((resolve) => setTimeout(resolve, 90));
    }
    frames.sort((first, second) => second.score - first.score);
    return frames[0]?.image || null;
  };
  const playCaptureFeedback = () => {
    try {
      if (audioContext?.state === 'running') {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.14, audioContext.currentTime + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.16);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.17);
      }
    } catch (error) { console.debug('Aviso sonoro indisponível:', error); }
    cameraStage.dataset.captureFlash = 'true';
    setTimeout(() => { delete cameraStage.dataset.captureFlash; }, 240);
  };
  const captureFrame = async (kind = activeReceipt, { automatic = false } = {}) => {
    if (!video.videoWidth || captureBusy) return;
    if (captureLocked) {
      if (frameStatus) frameStatus.textContent = 'Já capturei este cupom. Retire-o da frente da câmera para liberar outra foto.';
      return;
    }
    captureBusy = true;
    autoReadDone = true;
    captureLocked = true;
    if (frameStatus) frameStatus.textContent = 'Capturando 5 quadros — escolhendo o mais nítido…';
    if (captureButton) captureButton.disabled = true;
    try {
      playCaptureFeedback();
      const image = await captureSharpestBurst();
      if (!image) throw new Error('Não consegui capturar a imagem da webcam.');
      setPreview(image);
      const recognized = await recognize(image, kind);
      if (automatic) {
        cameraStage.dataset.quality = recognized ? 'good' : 'near';
        if (frameStatus) frameStatus.textContent = recognized ? 'Leitura concluída — retire o cupom para liberar outra captura.' : 'Não encontrei os dados esperados — confira a foto ou retire o cupom para tentar novamente.';
      }
      return recognized;
    } catch (error) {
      console.error('Captura da webcam falhou:', error);
      setStatus('Não consegui capturar a imagem. Tente novamente ou selecione uma foto.');
      if (automatic) {
        cameraStage.dataset.quality = 'near';
        if (frameStatus) frameStatus.textContent = 'Captura falhou. Retire o cupom e posicione novamente para liberar outra tentativa.';
      }
      return false;
    } finally {
      captureBusy = false;
      if (captureButton) captureButton.disabled = false;
    }
  };
  const inspectFrame = () => {
    if (!stream || video.readyState < 2 || !qualityContext) return;
    try {
      qualityContext.drawImage(video, 0, 0, qualityCanvas.width, qualityCanvas.height);
      const quality = analyzeReceiptFrame(qualityContext.getImageData(0, 0, qualityCanvas.width, qualityCanvas.height));
      if (!quality.present) {
        cameraStage.dataset.quality = 'bad';
        if (frameStatus) frameStatus.textContent = captureLocked ? 'Retire o cupom da frente da câmera para liberar a próxima captura.' : quality.message;
        if (captureLocked) {
          if (!noPaperSince) noPaperSince = performance.now();
          if (performance.now() - noPaperSince >= 650) {
            captureLocked = false;
            autoReadDone = false;
            noPaperSince = 0;
          }
        }
        previousBox = null;
        readableSince = 0;
        return;
      }
      noPaperSince = 0;
      if (captureLocked) {
        cameraStage.dataset.quality = 'good';
        if (frameStatus) frameStatus.textContent = 'Captura feita. Retire o cupom para liberar outra captura.';
        readableSince = 0;
        return;
      }
      cameraStage.dataset.quality = quality.state;
      if (frameStatus) frameStatus.textContent = quality.message;
      if (quality.state === 'good' && autoReadToggle?.checked && !autoReadDone) {
        const box = quality.box;
        const stable = previousBox && Math.abs((box.x0 + box.x1) - (previousBox.x0 + previousBox.x1)) < qualityCanvas.width * 0.035
          && Math.abs((box.y0 + box.y1) - (previousBox.y0 + previousBox.y1)) < qualityCanvas.height * 0.035
          && Math.abs((box.y1 - box.y0) - (previousBox.y1 - previousBox.y0)) < qualityCanvas.height * 0.04;
        if (!stable || !readableSince) readableSince = performance.now();
        previousBox = box;
        if (performance.now() - readableSince >= 1000) {
          autoReadDone = true;
          setStatus('Cupom estável. Capturando e lendo localmente…');
          void captureFrame(activeReceipt, { automatic: true });
        } else if (frameStatus) frameStatus.textContent = 'Segure parado…';
      } else {
        readableSince = 0;
        previousBox = quality.box || null;
      }
    } catch (error) {
      cameraStage.dataset.quality = 'bad';
      if (frameStatus) frameStatus.textContent = 'Aguardando imagem da webcam…';
      readableSince = 0;
    }
  };
  panel.querySelectorAll('button[data-receipt-kind]').forEach((button) => button.addEventListener('click', () => {
    activeReceipt = button.dataset.receiptKind;
    if (previewWrap) previewWrap.hidden = true;
    if (preview) preview.hidden = true;
    resetTracker(activeReceipt);
    readableSince = 0;
    autoReadDone = false;
    previousBox = null;
    panel.querySelectorAll('[data-receipt-kind]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    setStatus(activeReceipt === 'delivery' ? 'Relatório selecionado: o COO será preenchido no campo DOC.' : 'Cupom NFC-e selecionado: o número do cupom será preenchido no campo Cupom.');
  }));
  autoReadToggle?.addEventListener('change', () => { readableSince = 0; autoReadDone = false; previousBox = null; });
  const applyTrackSettings = async (track, { focusMode = activeFocusMode, focusDistance = null } = {}) => {
    await track.applyConstraints(buildCameraTrackConstraints(activeResolutionPreference, { focusMode, focusDistance }));
  };
  const showCurrentCameraSettings = () => {
    const settings = activeTrack?.getSettings?.() || {};
    if (cameraResolution) {
      if (settings.width && settings.height) {
        const belowPreferred = settings.width < 1280 || settings.height < 720;
        cameraResolution.textContent = belowPreferred
          ? `Resolução recebida: ${settings.width} × ${settings.height} px — abaixo do esperado; tente outra webcam no seletor.`
          : `Resolução recebida: ${settings.width} × ${settings.height} px`;
      } else cameraResolution.textContent = 'O navegador não informou a resolução efetiva da webcam.';
    }
    if (cameraDeviceSelect && settings.deviceId) cameraDeviceSelect.value = settings.deviceId;
  };
  const refreshCameraDevices = async () => {
    if (!cameraDeviceSelect || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
      const currentId = activeTrack?.getSettings?.().deviceId || cameraDeviceSelect.value;
      cameraDeviceSelect.replaceChildren(new Option('Seleção automática', ''));
      devices.forEach((device, index) => cameraDeviceSelect.add(new Option(device.label || `Câmera ${index + 1}`, device.deviceId)));
      if (cameraDeviceField) cameraDeviceField.hidden = devices.length < 2;
      cameraDeviceSelect.value = devices.some((device) => device.deviceId === currentId) ? currentId : '';
    } catch (error) {
      console.debug('Não foi possível listar as webcams:', error);
    }
  };
  const configureFocusControls = async (track) => {
    let capabilities = {};
    try { capabilities = track.getCapabilities?.() || {}; } catch (error) { console.debug('Capacidades de foco indisponíveis:', error); }
    activeFocusOptions = getCameraFocusOptions(capabilities);
    activeFocusMode = activeFocusOptions.autoMode || (activeFocusOptions.manualAvailable ? 'manual' : null);
    if (activeFocusOptions.autoMode) {
      try { await applyTrackSettings(track, { focusMode: activeFocusOptions.autoMode }); }
      catch (error) { console.debug('Foco automático contínuo indisponível; mantendo o padrão da câmera:', error); }
    } else if (activeFocusOptions.manualAvailable) {
      const initialDistance = (activeFocusOptions.min + activeFocusOptions.max) / 2;
      try { await applyTrackSettings(track, { focusMode: 'manual', focusDistance: initialDistance }); }
      catch (error) { console.debug('A câmera não aceitou o modo manual inicial:', error); }
    }
    const canChooseMode = activeFocusOptions.manualAvailable && activeFocusOptions.autoMode;
    const canAdjustManually = activeFocusOptions.manualAvailable;
    if (focusControls) focusControls.hidden = !canAdjustManually;
    if (focusModeSelect) focusModeSelect.hidden = !canChooseMode;
    if (focusModeSelect && canChooseMode) {
      focusModeSelect.replaceChildren(
        new Option(activeFocusOptions.autoMode === 'continuous' ? 'Automático contínuo' : 'Automático (um ajuste)', activeFocusOptions.autoMode),
        new Option('Manual', 'manual'),
      );
      focusModeSelect.value = activeFocusMode;
    }
    if (focusDistanceInput && canAdjustManually) {
      focusDistanceInput.min = String(activeFocusOptions.min);
      focusDistanceInput.max = String(activeFocusOptions.max);
      focusDistanceInput.step = String(activeFocusOptions.step);
      const currentDistance = Number(track.getSettings?.().focusDistance);
      focusDistanceInput.value = String(Number.isFinite(currentDistance)
        ? Math.min(activeFocusOptions.max, Math.max(activeFocusOptions.min, currentDistance))
        : (activeFocusOptions.min + activeFocusOptions.max) / 2);
      focusDistanceInput.disabled = activeFocusMode !== 'manual';
    }
    if (focusDistanceValue && focusDistanceInput) focusDistanceValue.textContent = focusDistanceInput.value;
    if (focusHint) {
      focusHint.hidden = Boolean(canAdjustManually);
      if (!canAdjustManually) focusHint.textContent = activeFocusOptions.autoMode
        ? 'O foco automático está ativo. Esta câmera/navegador não disponibiliza ajuste manual de distância.'
        : 'O navegador não expõe controles de foco para esta câmera; aproxime ou afaste o cupom até ficar nítido.';
    }
    if (focusStatus) focusStatus.textContent = canChooseMode
      ? 'Foco automático ativado. Se necessário, mude para Manual e ajuste a distância.'
      : canAdjustManually ? 'Ajuste manual disponível nesta câmera.' : '';
  };
  const startCamera = async (requestedDeviceId = cameraDeviceSelect?.value || '') => {
    if (cameraOpening) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Webcam indisponível neste navegador. Abra o site por HTTPS ou selecione uma foto abaixo.');
      return;
    }
    cameraOpening = true;
    try {
      const videoConstraints = {
        width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 },
        ...(requestedDeviceId ? { deviceId: { exact: requestedDeviceId } } : { facingMode: { ideal: 'environment' } }),
      };
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      activeTrack = stream.getVideoTracks()[0] || null;
      let capabilities = {};
      try { capabilities = activeTrack?.getCapabilities?.() || {}; } catch (error) { console.debug('Resolução máxima não informada:', error); }
      activeResolutionPreference = getCameraResolutionPreference(capabilities);
      if (activeTrack) {
        try { await applyTrackSettings(activeTrack, { focusMode: null }); }
        catch (error) { console.debug('Mantendo a melhor resolução inicial oferecida pela câmera:', error); }
        await configureFocusControls(activeTrack);
        showCurrentCameraSettings();
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!audioContext && AudioContextClass) audioContext = new AudioContextClass();
      await audioContext?.resume?.().catch(() => {});
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
        if (stream?.getTracks().some((activeTrack) => activeTrack.readyState === 'live')) return;
        if (qualityTimer) clearInterval(qualityTimer);
        qualityTimer = null;
        stream = null;
        activeTrack = null;
        video.srcObject = null;
        cameraStage.hidden = true;
        captureButton.hidden = true;
        stopButton.hidden = true;
        startButton.hidden = false;
        if (focusControls) focusControls.hidden = true;
        if (focusHint) focusHint.hidden = true;
        if (cameraResolution) cameraResolution.textContent = 'A webcam foi desconectada.';
        setStatus('A webcam foi encerrada pelo navegador ou pelo dispositivo. Toque em “Abrir webcam” para continuar; a foto capturada continua disponível.');
      }, { once: true }));
      video.srcObject = stream;
      await video.play();
      showCurrentCameraSettings();
      await refreshCameraDevices();
      cameraStage.hidden = false;
      cameraStage.dataset.quality = 'bad';
      startButton.hidden = true;
      captureButton.hidden = false;
      stopButton.hidden = false;
      if (previewWrap) previewWrap.hidden = true;
      resetTracker(activeReceipt);
      autoReadDone = false;
      captureLocked = false;
      noPaperSince = 0;
      readableSince = 0;
      previousBox = null;
      if (qualityTimer) clearInterval(qualityTimer);
      inspectFrame();
      qualityTimer = setInterval(inspectFrame, 250);
      setStatus(autoReadToggle?.checked ? 'Ligue a webcam e coloque o cupom inteiro dentro do retângulo; o sistema orienta e captura sozinho.' : 'Enquadre o documento inteiro e use “Tirar foto e ler”.');
      ocrWarmup.then((worker) => {
        if (worker && stream && !captureBusy) setStatus(autoReadToggle?.checked ? 'Leitor pronto. Posicione o cupom; a leitura começa automaticamente quando ele estiver nítido e imóvel.' : 'Leitor pronto. Enquadre o documento e use “Tirar foto e ler”.');
      });
    } catch (error) {
      console.warn('Webcam não pôde ser aberta:', error);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      activeTrack = null;
      if (cameraResolution) cameraResolution.textContent = 'Não foi possível obter a resolução da webcam.';
      setStatus('Não consegui acessar a webcam. Autorize o acesso no navegador ou escolha uma foto.');
    } finally {
      cameraOpening = false;
    }
  };
  startButton?.addEventListener('click', () => { void startCamera(); });
  cameraDeviceSelect?.addEventListener('change', () => {
    if (!stream) return;
    const requestedDeviceId = cameraDeviceSelect.value;
    stopCamera();
    void startCamera(requestedDeviceId);
  });
  focusModeSelect?.addEventListener('change', async () => {
    if (!activeTrack) return;
    const nextMode = focusModeSelect.value;
    const previousMode = activeFocusMode;
    const distance = Number(focusDistanceInput?.value);
    try {
      await applyTrackSettings(activeTrack, { focusMode: nextMode, focusDistance: distance });
      activeFocusMode = nextMode;
      if (focusDistanceInput) focusDistanceInput.disabled = nextMode !== 'manual';
      if (focusStatus) focusStatus.textContent = nextMode === 'manual' ? 'Foco manual ativo. Ajuste o controle até as letras ficarem nítidas.' : 'Foco automático ativado.';
      showCurrentCameraSettings();
    } catch (error) {
      console.warn('A câmera não aceitou o modo de foco selecionado:', error);
      focusModeSelect.value = previousMode || activeFocusOptions.autoMode;
      if (focusStatus) focusStatus.textContent = 'Não foi possível mudar o foco. A câmera manteve o ajuste anterior.';
    }
  });
  focusDistanceInput?.addEventListener('input', () => {
    if (focusDistanceValue) focusDistanceValue.textContent = focusDistanceInput.value;
    clearTimeout(focusAdjustTimer);
    focusAdjustTimer = setTimeout(async () => {
      if (!activeTrack || activeFocusMode !== 'manual') return;
      try {
        await applyTrackSettings(activeTrack, { focusMode: 'manual', focusDistance: Number(focusDistanceInput.value) });
        if (focusStatus) focusStatus.textContent = 'Foco manual atualizado.';
        showCurrentCameraSettings();
      } catch (error) {
        console.debug('A câmera não aceitou esse ajuste de foco:', error);
        if (focusStatus) focusStatus.textContent = 'A câmera não aceitou essa posição de foco.';
      }
    }, 140);
  });
  stopButton?.addEventListener('click', stopCamera);
  captureButton?.addEventListener('click', () => captureFrame(activeReceipt));
  panel.querySelectorAll('input[type="file"][data-receipt-kind]').forEach((input) => input.addEventListener('change', async () => {
    const image = input.files?.[0];
    if (!image) return;
    activeReceipt = input.dataset.receiptKind;
    readableSince = 0;
    autoReadDone = false;
    previousBox = null;
    setPreview(image);
    await recognize(image, activeReceipt);
    input.value = '';
  }));
  form.addEventListener('reset', stopCamera);
  const observer = new MutationObserver(() => {
    if (!form.isConnected) {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
