import fs from 'fs';
const TAG_FILE = './tags.json';

export function getAllTags(): Record<string, string[]> {
  try {
    const raw = fs.readFileSync(TAG_FILE, 'utf8');
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return {};
  }
}

export function getTag(discordId: string): string[] | null {
  const tags = getAllTags();
  const entry = tags[discordId];

  if (!entry) return null;

  return Array.isArray(entry) ? entry : [entry];
}


export function setTag(discordId: string, slippiTag: string): void {
  const tags = getAllTags();

  const normalizedTag = slippiTag.toUpperCase();

  if (!Array.isArray(tags[discordId])) {
    tags[discordId] = [];
  }

  if (!tags[discordId].includes(normalizedTag)) {
    tags[discordId].push(normalizedTag);
  }

  fs.writeFileSync(TAG_FILE, JSON.stringify(tags, null, 2), 'utf8');
}
