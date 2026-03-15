import type { ItemRecord } from "@/lib/types";

export function formatItemLabel(item: Partial<ItemRecord>) {
  const category = item?.category || "Item";
  const name = item?.name || "Unknown";
  const color = item?.color || "Unknown";
  return `${category}: ${name} (${color})`;
}

export function getItemIcon(item: Partial<ItemRecord>) {
  const category = (item?.category || "").toLowerCase();
  const name = (item?.name || "").toLowerCase();

  if (category.includes("top") || name.includes("shirt") || name.includes("blouse")) return "👕";
  if (category.includes("bottom") || name.includes("jean") || name.includes("pant")) return "👖";
  if (category.includes("shoe") || name.includes("sneaker") || name.includes("boot")) return "👟";
  if (category.includes("outer") || name.includes("jacket") || name.includes("coat")) return "🧥";
  if (category.includes("dress")) return "👗";
  if (category.includes("eyewear") || name.includes("sunglass")) return "🕶";
  if (category.includes("jewelry") || name.includes("necklace") || name.includes("ring")) return "💍";
  if (name.includes("hat") || name.includes("cap")) return "🧢";
  if (name.includes("bag")) return "👜";
  return "✨";
}
