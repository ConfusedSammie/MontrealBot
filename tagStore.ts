import fs from 'fs';

const TAG_FILE = './tags.json';

type TagRecord = {
  tags: string[];
  timbucks: number;
};

export function getAllTags(): Record<string, TagRecord> {
  try {
    const raw = fs.readFileSync(TAG_FILE, 'utf8');
    return JSON.parse(raw) as Record<string, TagRecord>;
  } catch {
    return {};
  }
}

export function getTag(discordId: string): string[] | null {
  const tags = getAllTags();
  const entry = tags[discordId];
  if (!entry || !Array.isArray(entry.tags)) return null;
  return entry.tags;
}

export function setTag(discordId: string, slippiTag: string): void {
  const tags = getAllTags();
  const normalized = slippiTag.toUpperCase();

  if (!tags[discordId]) {
    tags[discordId] = {
      tags: [normalized],
      timbucks: 1000,
    };
  } else if (!tags[discordId].tags.includes(normalized)) {
    tags[discordId].tags.push(normalized);
  }

  fs.writeFileSync(TAG_FILE, JSON.stringify(tags, null, 2), 'utf8');
}

export function removeTag(discordId: string, index: number): string | null {
  const tags = getAllTags();
  if (!tags[discordId] || !tags[discordId].tags[index]) return null;

  const removed = tags[discordId].tags.splice(index, 1)[0];

  if (tags[discordId].tags.length === 0) {
    delete tags[discordId];
  }

  fs.writeFileSync(TAG_FILE, JSON.stringify(tags, null, 2), 'utf8');
  return removed;
}
