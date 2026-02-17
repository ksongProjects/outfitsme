export function formatItemLabel(item) {
  const category = item?.category || "Item";
  const name = item?.name || "Unknown";
  const color = item?.color || "Unknown";
  return `${category}: ${name} (${color})`;
}
