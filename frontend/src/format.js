// 1250 -> ৳1,250
export function formatPrice(amount) {
  return `৳${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
