const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
let tesseractModulePromise;

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

export function parseDeliveryReceiptText(text) {
  const result = {};
  const pdv = String(text || '').match(/\bPDV\s*[:.]?\s*(\d{1,6})/i);
  if (pdv) result.pdv = pdv[1];
  const doc = String(text || '').match(/\bC\s*[O0Q]\s*[O0Q]\s*[:.]?\s*(\d{1,10})/i);
  if (doc) result.doc = doc[1];
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
  return match ? { coupon: match[1] } : {};
}

async function getOcr() {
  if (!tesseractModulePromise) tesseractModulePromise = import(TESSERACT_URL);
  const module = await tesseractModulePromise;
  return getTesseractApi(module).createWorker('por', 1);
}

async function prepareImageForOcr(image) {
  if (typeof createImageBitmap !== 'function') return image;
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(1, 2800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close?.(); return image; }
  context.filter = 'grayscale(1) contrast(1.35)';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || image), 'image/jpeg', 0.96));
}

export function initDeliveryReceiptCapture(form) {
  const panel = form.querySelector('#receiptCapturePanel');
  const video = panel?.querySelector('video');
  const preview = panel?.querySelector('#receiptCapturePreview');
  const status = panel?.querySelector('#receiptCaptureStatus');
  const startButton = panel?.querySelector('[data-camera-start]');
  const captureButton = panel?.querySelector('[data-camera-capture]');
  const stopButton = panel?.querySelector('[data-camera-stop]');
  if (!panel || !video || !status) return;

  let stream = null;
  let activeReceipt = 'delivery';
  let workerPromise = null;
  let previewUrl = null;
  const setStatus = (message) => { status.textContent = message; };
  const setPreview = (image) => {
    if (!preview) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(image);
    preview.src = previewUrl;
    preview.hidden = false;
  };
  const stopCamera = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    video.hidden = true;
    captureButton.hidden = true;
    stopButton.hidden = true;
    startButton.hidden = false;
  };
  const applyRecognized = (kind, text) => {
    const fields = kind === 'coupon' ? parseCouponText(text) : parseDeliveryReceiptText(text);
    let applied = 0;
    Object.entries(fields).forEach(([name, value]) => {
      if (name === 'neighborhood') {
        const select = form.elements.namedItem('neighborhoodId');
        const expected = normalize(value).replace(/[^a-z0-9]/g, '');
        const option = [...(select?.options || [])].find((item) => normalize(item.textContent).replace(/[^a-z0-9]/g, '') === expected);
        if (option && setField(form, 'neighborhoodId', option.value)) applied += 1;
      } else {
        const replaceDefault = ['operationDate', 'entryTimeOnly'].includes(name);
        if (setField(form, name, value, { onlyIfBlank: !replaceDefault })) applied += 1;
      }
    });
    setStatus(applied ? `Leitura concluída: ${applied} campo(s) preenchido(s). Confira e corrija antes de registrar.` : 'Não encontrei campos com segurança. Tente outra foto ou preencha manualmente.');
  };
  const recognize = async (image, kind) => {
    setStatus('Preparando o leitor de texto em português…');
    try {
      workerPromise ||= getOcr();
      const worker = await workerPromise;
      setStatus('Lendo a imagem no navegador… aguarde.');
      const preparedImage = await prepareImageForOcr(image);
      const { data } = await worker.recognize(preparedImage);
      applyRecognized(kind, data.text || '');
    } catch (error) {
      workerPromise = null;
      console.error('OCR local falhou:', error);
      setStatus('Não foi possível iniciar a leitura. Verifique a internet para carregar o leitor OCR ou use o preenchimento manual. A imagem não foi enviada.');
    }
  };
  panel.querySelectorAll('button[data-receipt-kind]').forEach((button) => button.addEventListener('click', () => {
    activeReceipt = button.dataset.receiptKind;
    panel.querySelectorAll('[data-receipt-kind]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    setStatus(activeReceipt === 'delivery' ? 'Comprovante selecionado: relatório de entrega.' : 'Comprovante selecionado: cupom fiscal (NFC-e).');
  }));
  startButton?.addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Webcam indisponível neste navegador. Abra o site por HTTPS ou selecione uma foto abaixo.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      startButton.hidden = true;
      captureButton.hidden = false;
      stopButton.hidden = false;
      setStatus('Posicione o comprovante inteiro, bem iluminado e sem inclinação.');
    } catch (error) {
      console.warn('Webcam não pôde ser aberta:', error);
      setStatus('Não consegui acessar a webcam. Autorize o acesso no navegador ou escolha uma foto.');
    }
  });
  stopButton?.addEventListener('click', stopCamera);
  captureButton?.addEventListener('click', async () => {
    if (!video.videoWidth) return setStatus('Aguarde a imagem da câmera aparecer.');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const image = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    setPreview(image);
    await recognize(image, activeReceipt);
  });
  panel.querySelectorAll('input[type="file"][data-receipt-kind]').forEach((input) => input.addEventListener('change', async () => {
    const image = input.files?.[0];
    if (!image) return;
    activeReceipt = input.dataset.receiptKind;
    setPreview(image);
    await recognize(image, activeReceipt);
    input.value = '';
  }));
  form.addEventListener('reset', stopCamera);
  const observer = new MutationObserver(() => {
    if (!form.isConnected) {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (workerPromise) Promise.resolve(workerPromise).then((worker) => worker.terminate()).catch(() => {});
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
