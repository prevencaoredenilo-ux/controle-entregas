export function normalizeCouponNumber(value = '') {
  const compact = String(value ?? '').replace(/[\s.-]/g, '');
  return compact.replace(/^0+(?=\d)/, '');
}

export function normalizeCouponSeries(value = '') {
  return String(value ?? '').replace(/[\s.-]/g, '').replace(/^0+(?=\d)/, '');
}

export function couponsMatch(first, second) {
  const firstNumber = normalizeCouponNumber(first?.coupon);
  const secondNumber = normalizeCouponNumber(second?.coupon);
  if (!firstNumber || firstNumber !== secondNumber) return false;
  const firstSeries = normalizeCouponSeries(first?.couponSeries);
  const secondSeries = normalizeCouponSeries(second?.couponSeries);
  return firstSeries ? firstSeries === secondSeries : true;
}
