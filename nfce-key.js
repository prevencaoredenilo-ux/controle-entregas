export function extractAccessKey(text) {
  const source = String(text ?? '');
  const parameter = source.match(/[?&]p=([^&#\s]+)/i);
  if (parameter) {
    let value = parameter[1];
    try { value = decodeURIComponent(value); } catch { /* conserva o texto original para extração numérica */ }
    value = value.split('|', 1)[0];
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 44) return digits.slice(0, 44);
  }
  const direct = source.match(/(?:^|\D)(\d{44})(?=\D|$)/);
  if (direct) return direct[1];
  const longRun = source.match(/\d{44,}/);
  return longRun ? longRun[0].slice(0, 44) : null;
}

export function validateAccessKey(key) {
  const value = String(key ?? '');
  if (!/^\d{44}$/.test(value)) return false;
  let sum = 0;
  let weight = 2;
  for (let index = 42; index >= 0; index -= 1) {
    sum += Number(value[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? 0 : 11 - remainder;
  return checkDigit === Number(value[43]);
}

export function parseAccessKey(key) {
  const value = String(key ?? '');
  if (!validateAccessKey(value)) return null;
  const year = 2000 + Number(value.slice(2, 4));
  const month = value.slice(4, 6);
  return {
    series: value.slice(22, 25),
    number: value.slice(25, 34),
    issueMonth: `${year}-${month}`,
    cnpj: value.slice(6, 20),
    model: value.slice(20, 22),
  };
}

export function couponFromQrText(text) {
  const accessKey = extractAccessKey(text);
  const parsed = accessKey && parseAccessKey(accessKey);
  return parsed ? { ...parsed, coupon: parsed.number, accessKey } : null;
}
