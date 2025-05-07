import fs from 'fs';
const TAG_FILE = './tags.json';

export function getAllTags(): Record<string, string> {
  try {
    const raw = fs.readFileSync(TAG_FILE, 'utf8');
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}


export function getTag(discordId) {
  const tags = getAllTags();
  return tags[discordId] || null;
}

export function setTag(discordId, slippiTag) {
  const tags = getAllTags();
  tags[discordId] = slippiTag.toUpperCase();
  fs.writeFileSync(TAG_FILE, JSON.stringify(tags, null, 2), 'utf8');
}
