export const DEFAULT_CATEGORIES = [
  { key: "food",          name: "Food & Drink",   icon: "🍕" },
  { key: "transport",     name: "Transport",       icon: "🚗" },
  { key: "home",          name: "Home & Rent",     icon: "🏠" },
  { key: "entertainment", name: "Entertainment",   icon: "🎬" },
  { key: "health",        name: "Health",          icon: "🏥" },
  { key: "shopping",      name: "Shopping",        icon: "🛒" },
  { key: "travel",        name: "Travel",          icon: "✈️" },
  { key: "utilities",     name: "Utilities",       icon: "💡" },
  { key: "education",     name: "Education",       icon: "📚" },
  { key: "work",          name: "Work",            icon: "💼" },
  { key: "gifts",         name: "Gifts",           icon: "🎁" },
  { key: "other",         name: "Other",           icon: "📦" },
] as const;

export type CategoryKey = (typeof DEFAULT_CATEGORIES)[number]["key"];

export type ResolvedCategory = { name: string; icon: string };

export function resolveCategory(
  key: string | null | undefined,
  customCategories: { id: string; name: string; icon: string | null }[]
): ResolvedCategory | null {
  if (!key) return null;
  if (key.startsWith("custom:")) {
    const id = key.slice(7);
    const cat = customCategories.find((c) => c.id === id);
    return cat ? { name: cat.name, icon: cat.icon ?? "📦" } : null;
  }
  const found = DEFAULT_CATEGORIES.find((c) => c.key === key);
  return found ? { name: found.name, icon: found.icon } : null;
}
