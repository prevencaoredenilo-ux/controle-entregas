const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
let tesseractWorkerPromise;

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function normalizeNeighborhood(value = '') {
  return normalize(value).replace(/[^a-z0-9]/g, '').replace(/^bairro/, '');
}

export function getTesseractApi(module) {
  const api = typeof module?.createWorker === 'function' ? module : module?.default;
  if (typeof api?.createWorker !== 'function') throw new Error('A biblioteca OCR não disponibilizou createWorker.');
  return api;
}

function lineAfterLabel(text, labels) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const cleaned = normalize(line).replace(/[|]/g, 'I');
    for (const label of labels) {
      const match = cleaned.match(new RegExp(`\\b${label}\\s*[:.]?\\s*(.+)$`, 'i'));
      if (match?.[1]?.trim() && !/^[:.]+$/.test(match[1].trim())) {
        return line.slice(Math.max(0, line.toLowerCase().indexOf(match[1].toLowerCase()))).trim();
      }
      const labelMatch = cleaned.match(new RegExp(`\\b${label}\\s*[:.]?\\s*$`, 'i'));
      if (labelMatch) {
        const index = lines.indexOf(line);
        const nextLine = lines[index + 1];
        if (nextLine && !/^\p{L}[\p{L}\p{N}\s()./-]*\s*:/u.test(nextLine)) return nextLine.trim();
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
  const match = String(text || '').match(/\bCOO\s*[:.]?\s*(\d{1,10})/i)
    || String(text || '').match(/\bC\s*[O0Q]\s*[O0Q]\s*[:.]?\s*(\d{1,10})/i);
  return match?.[1] || '';
}

export function parseDeliveryReceiptText(text) {
  const result = {};
  const pdv = String(text || '').match(/\bPDV\s*[:.]?\s*(\d{1,6})/i);
  if (pdv) result.pdv = pdv[1];
  const coo = parseCooNumber(text);
  if (coo) result.doc = coo;
  const client = lineAfterLabel(text, ['cliente']);
  if (client) result.clientName = client.replace(/^cliente\s*[:.]?\s*/i, '').trim();
  const phone = lineAfterLabel(text, ['fone(?:s|\\(s\\))?', 'telefone']);
  if (phone) result.phone = phone.replace(/^(?:fone(?:s|\(s\))?|telefone)\s*[:.]?\s*/i, '').trim();
  const address = lineAfterLabel(text, ['logradouro']);
  if (address) {
    const cleaned = address.replace(/^logradouro\s*[:.]?\s*/i, '').trim();
    const number = cleaned.match(/\s+(\d+[A-Za-z]?)\s*$/);
    if (number) {
      result.street = cleaned.slice(0, number.index).trim();
      result.houseNumber = number[1];
    } else if (/\bS\s*\/?\s*N\.?\s*$/i.test(cleaned)) {
      result.street = cleaned.replace(/\s+S\s*\/?\s*N\.?\s*$/i, '').trim();
      result.houseNumber = 's/n';
    } else result.street = cleaned;
  }
  const neighborhood = lineAfterLabel(text, ['bairro']);
  if (neighborhood) result.neighborhood = neighborhood.replace(/^bairro\s*[:.]?\s*/i, '').trim();
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

const TRACE_SPECS = {
  delivery: [
    ['pdv', 'PDV', /\bPDV\b/i, '#2563eb'],
    ['doc', 'COO → DOC', /\bC\s*[O0Q]\s*[O0Q]\b/i, '#9333ea'],
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
    ['doc', 'COO → DOC', /\bC\s*[O0Q]\s*[O0Q]\b/i, '#9333ea'],
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
      return labelPattern.test(text) || (value.length >= 3 && normalizedText.includes(value));
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

async function getOcr() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = import(TESSERACT_URL)
      .then((module) => getTesseractApi(module).createWorker('por', 1))
      .catch((error) => {
        tesseractWorkerPromise = null;
        throw error;
      });
  }
  return tesseractWorkerPromise;
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
  const scale = Math.min(1, 2800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close?.(); return { image, width: originalWidth, height: originalHeight }; }
  context.filter = 'grayscale(1) contrast(1.35)';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.96));
  return blob
    ? { image: blob, width: canvas.width, height: canvas.height }
    : { image, width: originalWidth, height: originalHeight };
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
  const autoReadToggle = panel?.querySelector('[data-camera-auto]');
  const startButton = panel?.querySelector('[data-camera-start]');
  const captureButton = panel?.querySelector('[data-camera-capture]');
  const stopButton = panel?.querySelector('[data-camera-stop]');
  if (!panel || !video || !cameraStage || !status) return;

  let stream = null;
  let activeReceipt = 'delivery';
  let previewUrl = null;
  let qualityTimer = null;
  let readableSince = 0;
  let autoReadDone = false;
  let waitingForReframe = false;
  let captureBusy = false;
  const qualityCanvas = document.createElement('canvas');
  qualityCanvas.width = 160;
  qualityCanvas.height = 90;
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
    qualityTimer = null;
    readableSince = 0;
    waitingForReframe = false;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    cameraStage.hidden = true;
    captureButton.hidden = true;
    stopButton.hidden = true;
    startButton.hidden = false;
  };
  const applyRecognized = (kind, text) => {
    const fields = kind === 'coupon' ? parseCouponText(text) : parseDeliveryReceiptText(text);
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
    setStatus(applied ? `Leitura concluída: ${applied} campo(s) preenchido(s). Confira e corrija antes de registrar.` : found ? 'Leitura concluída, mas os campos já tinham valor. Confira e corrija antes de registrar.' : 'Não encontrei campos com segurança. Tente outra foto ou preencha manualmente.');
    return { fields, found: found > 0 };
  };
  const recognize = async (image, kind) => {
    setStatus('Preparando o leitor de texto em português…');
    try {
      const [worker, prepared] = await Promise.all([getOcr(), prepareImageForOcr(image)]);
      setStatus('Lendo a imagem no navegador… aguarde.');
      const { data } = await worker.recognize(prepared.image);
      const result = applyRecognized(kind, data.text || '');
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
  const captureFrame = async (kind = activeReceipt, { automatic = false } = {}) => {
    if (!video.videoWidth || captureBusy) return;
    captureBusy = true;
    autoReadDone = true;
    if (captureButton) captureButton.disabled = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const image = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!image) throw new Error('Não consegui capturar a imagem da webcam.');
      setPreview(image);
      const recognized = await recognize(image, kind);
      if (automatic) {
        waitingForReframe = !recognized;
        cameraStage.dataset.quality = recognized ? 'good' : 'bad';
        if (frameStatus) frameStatus.textContent = recognized ? 'Leitura concluída — confira os campos.' : 'Não encontrei os dados esperados. Retire e reposicione o documento para tentar novamente.';
      }
      return recognized;
    } catch (error) {
      console.error('Captura da webcam falhou:', error);
      setStatus('Não consegui capturar a imagem. Tente novamente ou selecione uma foto.');
      if (automatic) {
        waitingForReframe = true;
        cameraStage.dataset.quality = 'bad';
        if (frameStatus) frameStatus.textContent = 'Captura falhou. Retire e reposicione o documento para tentar novamente.';
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
      const quality = assessFrameQuality(qualityContext.getImageData(0, 0, qualityCanvas.width, qualityCanvas.height));
      if (!quality.readable) {
        if (waitingForReframe || autoReadDone) {
          waitingForReframe = false;
          autoReadDone = false;
        }
        cameraStage.dataset.quality = 'bad';
        if (frameStatus) frameStatus.textContent = quality.message;
        readableSince = 0;
        return;
      }
      if (waitingForReframe) {
        cameraStage.dataset.quality = 'bad';
        if (frameStatus) frameStatus.textContent = 'Retire e reposicione o documento para tentar outra vez.';
        readableSince = 0;
        return;
      }
      cameraStage.dataset.quality = quality.readable ? 'good' : 'bad';
      if (frameStatus) frameStatus.textContent = quality.message;
      if (quality.readable && autoReadToggle?.checked && !autoReadDone) {
        if (!readableSince) readableSince = performance.now();
        if (performance.now() - readableSince >= 1000) {
          autoReadDone = true;
          setStatus(activeReceipt === 'coupon' ? 'Cupom enquadrado. Lendo o número da NFC-e…' : 'Comprovante enquadrado. Lendo e preenchendo os campos…');
          void captureFrame(activeReceipt, { automatic: true });
        } else if (frameStatus) frameStatus.textContent = 'Enquadramento adequado — mantenha imóvel para leitura automática.';
      } else readableSince = 0;
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
    waitingForReframe = false;
    panel.querySelectorAll('[data-receipt-kind]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    setStatus(activeReceipt === 'delivery' ? 'Relatório selecionado: o COO será preenchido no campo DOC.' : 'Cupom NFC-e selecionado: o número do cupom será preenchido no campo Cupom.');
  }));
  autoReadToggle?.addEventListener('change', () => { readableSince = 0; autoReadDone = false; waitingForReframe = false; });
  startButton?.addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Webcam indisponível neste navegador. Abra o site por HTTPS ou selecione uma foto abaixo.');
      return;
    }
    const warmup = getOcr().catch((error) => {
      console.warn('Leitor OCR não pôde ser pré-carregado:', error);
      return null;
    });
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      cameraStage.hidden = false;
      cameraStage.dataset.quality = 'bad';
      startButton.hidden = true;
      captureButton.hidden = false;
      stopButton.hidden = false;
      if (previewWrap) previewWrap.hidden = true;
      resetTracker(activeReceipt);
      autoReadDone = false;
      readableSince = 0;
      if (qualityTimer) clearInterval(qualityTimer);
      inspectFrame();
      qualityTimer = setInterval(inspectFrame, 250);
      setStatus(autoReadToggle?.checked ? (activeReceipt === 'coupon' ? 'Coloque somente o cupom NFC-e inteiro na moldura; mantenha-o imóvel quando ela ficar verde.' : 'Coloque o comprovante inteiro na moldura; mantenha-o imóvel quando ela ficar verde para preencher os campos.') : 'Enquadre o documento inteiro na moldura e use “Tirar foto e ler”.');
      warmup.then((worker) => {
        if (worker && stream && !captureBusy) setStatus(autoReadToggle?.checked ? 'Leitor pronto. Centralize o documento; a leitura começa automaticamente quando a moldura ficar verde.' : 'Leitor pronto. Enquadre o documento e use “Tirar foto e ler”.');
      });
    } catch (error) {
      console.warn('Webcam não pôde ser aberta:', error);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      setStatus('Não consegui acessar a webcam. Autorize o acesso no navegador ou escolha uma foto.');
    }
  });
  stopButton?.addEventListener('click', stopCamera);
  captureButton?.addEventListener('click', () => captureFrame(activeReceipt));
  panel.querySelectorAll('input[type="file"][data-receipt-kind]').forEach((input) => input.addEventListener('change', async () => {
    const image = input.files?.[0];
    if (!image) return;
    activeReceipt = input.dataset.receiptKind;
    readableSince = 0;
    autoReadDone = false;
    waitingForReframe = false;
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
