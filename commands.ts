import { AttachmentBuilder, Message, EmbedBuilder } from 'discord.js';
import { getEventIdFromSlug, escapeMarkdown } from './utils.js';
import { fetchGraphQL1 } from './fetchResults.js';
import { activeEventIntervals } from './state.js';
import { predictChange, fetchSlippiProfile, getRank } from './slippiPredictor.js';
import { getAllTags, getTag, setTag } from './tagStore.js';
import path from 'path';
import fs from 'fs';
import { getEmojiIdForName, getCharacterEmoji } from './emojis.js';

const ADMIN_USER_ID = process.env.ADMIN_USER_ID!;

export async function handleLinkCommand(message: Message): Promise<void> {
  const parts = message.content.trim().split(/\s+/);

  if (parts.length !== 2 || !parts[1].includes('#')) {
    await message.reply('Usage: `!link TAG#000`');
    return;
  }

  const slippiTag = parts[1].replace('#', '-').toLowerCase(); // Slippi URLs are lowercase
  const url = `<https://slippi.gg/user/${slippiTag}>`;

  await message.reply(url);
}


export async function handleResultsCommand(message: Message): Promise<void> {
  const url = message.content.split(' ')[1];
  if (!url) {
    await message.reply('Provide a StartGG event URL.');
    return;
  }

  const match = url.match(/start.gg\/(tournament\/.+\/event\/.+)/i);
  if (!match) {
    await message.reply('Invalid StartGG URL format.');
    return;
  }

  const slug = match[1];
  try {
    const eventId = await getEventIdFromSlug(slug);
    const key = `${message.channel.id}:${eventId}`;

    if (activeEventIntervals.has(key)) {
      await message.reply('Already live updating this event in this channel.');
      return;
    }

    await message.reply(`Tracking results for event ID: ${eventId}`);
    if (message.channel.isTextBased() && (message.channel.isThread() || message.channel.type === 0)) {
      const validChannel = message.channel; // TS now knows it's safe
      await fetchGraphQL1(eventId, validChannel);

      const interval = setInterval(() => {
        fetchGraphQL1(eventId, validChannel);
      }, 15000);

      activeEventIntervals.set(key, interval);
    } else {
      await message.reply('This command only works in text channels or threads.');
    }

  } catch (err) {
    console.error(err);
    await message.reply('Failed to fetch results from StartGG.');
  }
}

export function handleStopResultsCommand(message: Message): void {
  const parts = message.content.split(' ');
  const eventId = parts[1];
  const key = `${message.channel.id}:${eventId}`;

  if (activeEventIntervals.has(key)) {
    clearInterval(activeEventIntervals.get(key));
    activeEventIntervals.delete(key);
    message.reply(`Stopped tracking event ID ${eventId}.`);
  } else {
    message.reply(`No active tracking for event ID ${eventId} in this channel.`);
  }
}

export function handleTagCommand(message: Message): void {
  const tag = message.content.split(' ')[1];
  if (!tag || !tag.includes('#')) {
    message.reply('Usage: `!tag MEOW#83`');
    return;
  }

  setTag(message.author.id, tag);
  message.reply(`✅ Slippi tag \`${tag}\` saved for <@${message.author.id}>`);
}

export async function handlePredictCommand(message: Message): Promise<void> {
  const parts = message.content.trim().split(/\s+/);

  // Normalize tags: allow both TAG#000 and TAG-000
  const normalizeTag = (tag: string) => tag.replace('-', '#');

  // Case 1: !predict opponentTag
  if (parts.length === 2) {
    const opponentTag = normalizeTag(parts[1]);
    if (!opponentTag.includes('#')) {
      await message.reply('Usage: `!predict OPPONENT#000` or `!predict PLAYER1#000 PLAYER2#000`');
      return;
    }

    const yourTags = getTag(message.author.id);
    if (!yourTags || yourTags.length === 0) {
      await message.reply('⚠️ You must register your Slippi tag first using `!tag YOURTAG#000`');
      return;
    }

    if (yourTags.length > 1) {
      const promptLines = yourTags.map((tag, i) => `**${i + 1}.** \`${tag}\``).join('\n');
      const promptMessage = await message.reply(
        `⚠️ You have multiple tags saved. Please reply with the number of the tag you'd like to use:\n${promptLines}\n\n_Pro tip: next time you can just use \`!predict YOURTAG#000 OPPONENT#000\` to skip this._`
      );

      const filter = (m: Message) =>
        m.author.id === message.author.id &&
        !isNaN(parseInt(m.content.trim())) &&
        parseInt(m.content.trim()) >= 1 &&
        parseInt(m.content.trim()) <= yourTags.length;

      try {
        if (!message.channel || !('awaitMessages' in message.channel)) {
          await promptMessage.delete().catch(() => { });
          await message.reply('❌ Cannot prompt for input in this type of channel.');
          return;
        }

        const collected = await message.channel.awaitMessages({
          filter,
          max: 1,
          time: 15000,
          errors: ['time'],
        });

        await promptMessage.delete().catch(() => { });

        const selectedIndex = parseInt(collected.first()!.content.trim(), 10) - 1;
        const selectedTag = yourTags[selectedIndex];

        const result = await handlePredictionResponse(selectedTag, opponentTag);
        await message.reply(result);
      } catch {
        await promptMessage.delete().catch(() => { });
        await message.reply('❌ You didn’t respond in time. Try the command again.');
      }

      return;
    }

    const result = await handlePredictionResponse(yourTags[0], opponentTag);
    await message.reply(result);
    return;
  }

  // Case 2: !predict player1#000 player2#000
  if (parts.length === 3) {
    const tag1 = normalizeTag(parts[1]);
    const tag2 = normalizeTag(parts[2]);

    if (!tag1.includes('#') || !tag2.includes('#')) {
      await message.reply('Usage: `!predict OPPONENT#000` or `!predict PLAYER1#000 PLAYER2#000`');
      return;
    }

    const result = await handlePredictionResponse(tag1, tag2);
    await message.reply(result);
    return;
  }

  await message.reply('Usage: `!predict OPPONENT#000` or `!predict PLAYER1#000 PLAYER2#000`');
}


async function handlePredictionResponse(playerCode: string, opponentCode: string): Promise<string> {
  try {
    const result = await predictChange(opponentCode, playerCode);

    const currentEmoji = getEmojiIdForName(result.currentRankEmojiName) || '';
    const winEmoji = getEmojiIdForName(result.winRankEmojiName) || '';
    const lossEmoji = getEmojiIdForName(result.lossRankEmojiName) || '';
    const opponentEmoji = getEmojiIdForName(result.opponentRankEmojiName) || '';

    const promoNote =
      result.winRank !== result.currentRank
        ? ` | 🟢 **Promotes to** ${winEmoji} ${result.winRank}`
        : '';
    const demoNote =
      result.lossRank !== result.currentRank
        ? ` | 🔴 **Demotes to** ${lossEmoji} ${result.lossRank}`
        : '';

    return (
      `**${result.player}** (${result.playerOrdinal.toFixed(1)}) ${currentEmoji} ` +
      `vs **${result.opponent}** (${result.opponentOrdinal.toFixed(1)}) ${opponentEmoji}\n` +
      `Win: +${result.deltaWin.toFixed(1)} ${promoNote}\n` +
      `Loss: ${result.deltaLoss.toFixed(1)} ${demoNote}`
    );
  } catch (err: any) {
    return `Prediction failed: ${err.message}`;
  }
}






function rankToEmoji(rank: string) {
  // E.g. Bronze II -> :BronzeII:
  const nospaces = rank.replace(" ", "");
  return getEmojiIdForName(nospaces);
}

type LeaderboardSnapshot = Record<string, Record<string, number>>;
const HISTORY_FILE = './last_leaderboard.json';
function loadLastLeaderboard(): LeaderboardSnapshot {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function saveLeaderboard(snapshot: LeaderboardSnapshot): void {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
}

export async function handleLeaderboardCommand(message: Message): Promise<void> {
  try {
    const tags = getAllTags();
    const lastLeaderboard = loadLastLeaderboard();
    const newSnapshot: LeaderboardSnapshot = {};

    const results: {
      name: string;
      tag: string;
      ordinal: number;
      rank: string;
      emoji: string;
      games: string;
      characters: string;
      delta: string;
    }[] = [];

    for (const [discordId, tagList] of Object.entries(tags)) {
      const tagArray = Array.isArray(tagList) ? tagList : [tagList];

      for (const slippiTag of tagArray) {
        try {
          const profile = await fetchSlippiProfile(slippiTag);
          const rank = getRank(profile.ordinal).toUpperCase().replace(' ', '');
          const emoji = rankToEmoji(rank);
          const games = `(W:${profile.wins} / L:${profile.losses})`;
          const characters = profile.characters.map(getCharacterEmoji).join(' ');

          const previous = lastLeaderboard[discordId]?.[slippiTag];
          let delta = typeof previous === 'number'
            ? (() => {
              const diff = profile.ordinal - previous;
              const symbol = diff > 0 ? '🔺' : diff < 0 ? '🔻' : '';
              return symbol ? `${symbol} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)})` : '';
            })()
            : '🆕';

          if (!newSnapshot[discordId]) newSnapshot[discordId] = {};
          newSnapshot[discordId][slippiTag] = profile.ordinal;

          results.push({
            name: `<@${discordId}>`,
            tag: slippiTag,
            ordinal: profile.ordinal,
            rank,
            emoji,
            games,
            characters,
            delta
          });
        } catch {
          // skip failed
        }
      }
    }

    saveLeaderboard(newSnapshot);
    results.sort((a, b) => b.ordinal - a.ordinal);

    const previousPlacement: Record<string, number> = {};
    Object.entries(lastLeaderboard).flatMap(([discordId, tagMap]) =>
      Object.entries(tagMap).map(([tag, ordinal]) => ({
        key: `${discordId}::${tag}`,
        ordinal
      }))
    ).sort((a, b) => b.ordinal - a.ordinal).forEach((entry, index) => {
      previousPlacement[entry.key] = index;
    });

    results.forEach((r, index) => {
      const discordId = r.name.replace(/[<@>]/g, '');
      const key = `${discordId}::${r.tag}`;
      const oldIndex = previousPlacement[key];
      if (oldIndex !== undefined) {
        const movement = oldIndex - index;
        const posSymbol = movement > 0 ? '🔼' : movement < 0 ? '🔽' : '';
        r.delta += ` ${posSymbol}`;
      }
    });

    const lines = results.map((r, i) =>
      `**#${i + 1}** ${r.emoji} ${r.name} ${r.delta} — ${escapeMarkdown(r.tag)} — ${r.ordinal.toFixed(1)} ${r.games} ${r.characters}`
    );

    const MAX_CHARS = 4000;
    let buffer = '';
    let page = 1;
    const embeds: EmbedBuilder[] = [];

    for (const line of lines) {
      if ((buffer + '\n' + line).length > MAX_CHARS) {
        embeds.push(
          new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`🏆 Slippi Leaderboard${embeds.length > 0 ? ` — Page ${page++}` : ''}`)
            .setDescription(buffer)
            .setTimestamp()
        );
        buffer = line;
      } else {
        buffer += '\n' + line;
      }
    }

    if (buffer.length > 0) {
      embeds.push(
        new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle(`🏆 Slippi Leaderboard${embeds.length > 0 ? ` — Page ${page}` : ''}`)
          .setDescription(buffer)
          .setTimestamp()
      );
    }

    if (message.channel.isTextBased() && 'send' in message.channel) {
      for (const embed of embeds) {
        await message.channel.send({ embeds: [embed] });
      }
    } else {
      await message.reply('❌ This command must be used in a text or thread channel.');
    }
  } catch (err) {
    console.error(err);
    await message.reply('❌ Failed to generate leaderboard.');
  }
}


export async function handleUpsetsCommand(message: Message): Promise<void> {
  const url = message.content.split(' ')[1];
  if (!url) {
    await message.reply('Usage: `!upsets start.gg/event_link`');
    return;
  }

  const bracketMatch = url.match(/brackets\/\d+\/(\d+)/);
  const phaseGroupId = bracketMatch ? parseInt(bracketMatch[1]) : null;

  const eventMatch = url.match(/start.gg\/tournament\/([^/]+(?:\/[^/]+)*)\/event\/([^/]+)/i);
  const slug = `tournament/${eventMatch[1]}/event/${eventMatch[2]}`;



  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.STARTGG_BEARER!}`,
  };

  try {
    let eventId: number | null = null;
    let eventName: string = 'Unknown Event';
    const entrants: Record<number, { name: string; seed: number }> = {};

    // If using a normal event link, get event ID from slug
    if (!phaseGroupId) {
      if (!slug) {
        await message.reply('❌ Missing valid event slug from the URL.');
        return;
      }

      try {
        eventId = await getEventIdFromSlug(slug);
      } catch (err) {
        console.error('❌ Failed to resolve slug to eventId:', slug, err);
        await message.reply('❌ Could not resolve event from this URL.');
        return;
      }
    }


    // Always try to fetch entrants via eventId
    if (eventId) {
      const entrantRes = await fetch('https://api.start.gg/gql/alpha', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `
            query Entrants($eventId: ID!) {
              event(id: $eventId) {
                name
                entrants(query: { perPage: 500 }) {
                  nodes {
                    id
                    name
                    seeds {
                      seedNum
                    }
                  }
                }
              }
            }
          `,
          variables: { eventId },
        }),
      });

      const entrantJson = await entrantRes.json();
      if (!entrantJson.data?.event?.entrants?.nodes) {
        await message.reply('❌ Failed to fetch entrants.');
        return;
      }

      eventName = entrantJson.data.event.name;
      for (const e of entrantJson.data.event.entrants.nodes) {
        entrants[e.id] = {
          name: e.name,
          seed: e.seeds?.[0]?.seedNum ?? 9999,
        };
      }
    }

    // Fetch sets
    let setsJson;
    if (phaseGroupId) {
      const setsRes = await fetch('https://api.start.gg/gql/alpha', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `
            query Sets($phaseGroupId: ID!) {
              phaseGroup(id: $phaseGroupId) {
                sets(perPage: 500, page: 1) {
                  nodes {
                    id
                    winnerId
                    slots {
                      entrant { id name }
                    }
                  }
                }
              }
            }
          `,
          variables: { phaseGroupId },
        }),
      });

      const rawSets = await setsRes.json();
      if (!rawSets.data?.phaseGroup?.sets?.nodes) {
        await message.reply('❌ Failed to fetch phase group sets.');
        return;
      }
      setsJson = { nodes: rawSets.data.phaseGroup.sets.nodes };
    } else if (eventId) {
      const setsRes = await fetch('https://api.start.gg/gql/alpha', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `
            query Sets($eventId: ID!) {
              event(id: $eventId) {
                sets(perPage: 500, page: 1) {
                  nodes {
                    id
                    winnerId
                    slots {
                      entrant { id name }
                    }
                  }
                }
              }
            }
          `,
          variables: { eventId },
        }),
      });

      const rawJson = await setsRes.json();
      if (!rawJson.data?.event?.sets?.nodes) {
        await message.reply('❌ Failed to fetch event sets.');
        return;
      }
      setsJson = { nodes: rawJson.data.event.sets.nodes };
    } else {
      await message.reply('❌ Could not fetch event or phase group data.');
      return;
    }

    // Analyze upsets
    const upsets: string[] = [];

    for (const set of setsJson.nodes) {
      const [slot1, slot2] = set.slots;
      if (!slot1 || !slot2 || !slot1.entrant || !slot2.entrant) continue;

      const p1 = entrants[slot1.entrant.id];
      const p2 = entrants[slot2.entrant.id];
      const winner = entrants[set.winnerId];
      const loser = set.winnerId === slot1.entrant.id ? p2 : p1;

      if (!p1 || !p2 || !winner || !loser) continue;

      if (winner.seed > loser.seed) {
        const diff = winner.seed - loser.seed;
        upsets.push(
          `**${winner.name}** (Seed ${winner.seed}) upset **${loser.name}** (Seed ${loser.seed}) ${diff >= 20 ? '🔥' : ''}`
        );
      }
    }

    if (upsets.length === 0) {
      await message.reply('✅ No upsets found in this bracket.');
      return;
    }

    const chunks = chunkArray(upsets, 100);
    for (let i = 0; i < chunks.length; i++) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(`🎯 Upsets — ${eventName}${phaseGroupId ? ' (Phase)' : ''}`)
        .setDescription(chunks[i].join('\n'))
        .setFooter({ text: `Page ${i + 1} of ${chunks.length}` })
        .setTimestamp();

      if (message.channel.isTextBased() && 'send' in message.channel) {
        await message.channel.send({ embeds: [embed] });
      }
    }

  } catch (err) {
    console.error('Error in !upsets:', err);
    await message.reply('❌ Failed to fetch or process upsets.');
  }
}


function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}



export async function handleRemoveCommand(message: Message): Promise<void> {
  const allTags = getAllTags();
  const userId = message.author.id;
  const yourTags = allTags[userId];

  if (!yourTags || yourTags.length === 0) {
    await message.reply('❌ You don’t have any tags saved.');
    return;
  }

  if (yourTags.length === 1) {
    const confirmMsg = await message.reply(`⚠️ You only have one tag saved: \`${yourTags[0]}\`.\nAre you sure you want to delete it? Reply with \`yes\` to confirm or \`no\` to cancel.`);

    const filter = (m: Message) =>
      m.author.id === userId &&
      ['yes', 'no'].includes(m.content.trim().toLowerCase());

    try {
      if (!message.channel.isTextBased() || !('awaitMessages' in message.channel)) {
        await message.reply('❌ Cannot prompt for input in this type of channel.');
        return;
      }

      const collected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 15000,
        errors: ['time'],
      });


      await confirmMsg.delete().catch(() => { });
      const response = collected.first()!.content.trim().toLowerCase();

      if (response === 'yes') {
        delete allTags[userId];
        fs.writeFileSync('./tags.json', JSON.stringify(allTags, null, 2));
        await message.reply('✅ Your only tag was deleted.');
      } else {
        await message.reply('❌ Deletion cancelled.');
      }
    } catch {
      await confirmMsg.delete().catch(() => { });
      await message.reply('❌ You didn’t respond in time. Try `!remove` again.');
    }

    return;
  }


  const promptLines = yourTags.map((tag, i) => `**${i + 1}.** \`${tag}\``).join('\n');
  const promptMessage = await message.reply(
    `🗑️ You have multiple tags saved. Reply with the number of the tag you'd like to remove:\n${promptLines}`
  );

  const filter = (m: Message) =>
    m.author.id === userId &&
    !isNaN(parseInt(m.content.trim())) &&
    parseInt(m.content.trim()) >= 1 &&
    parseInt(m.content.trim()) <= yourTags.length;

  try {
    if (!message.channel.isTextBased() || !('awaitMessages' in message.channel)) {
      await promptMessage.delete().catch(() => { });
      await message.reply('❌ Cannot prompt for input in this type of channel.');
      return;
    }

    const collected = await message.channel.awaitMessages({
      filter,
      max: 1,
      time: 15000,
      errors: ['time'],
    });

    await promptMessage.delete().catch(() => { });

    const selectedIndex = parseInt(collected.first()!.content.trim(), 10) - 1;
    const removedTag = yourTags[selectedIndex];

    const newTagList = yourTags.filter((_, i) => i !== selectedIndex);
    allTags[userId] = newTagList;

    fs.writeFileSync('./tags.json', JSON.stringify(allTags, null, 2));

    await message.reply(`✅ Removed tag \`${removedTag}\` from your saved list.`);
  } catch {
    await promptMessage.delete().catch(() => { });
    await message.reply('❌ You didn’t respond in time. Try `!remove` again.');
  }
}


export async function handleCommandsCommand(message: Message): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📜 Commands')
    .setDescription(
      [
        '**__Commands__**',
        '1. Add your tag to the bot: `!tag MEOW#83` — you can have multiple tags.',
        '2. Show the current leaderboard: `!leaderboard`.',
        '3. Predict rating change vs an opponent: `!predict SAND#511`.',
        '4. Simulate ranked game between two players: `!predict MEOW#83 SAND#511` (shows result for MEOW).',
        '5. Get direct Slippi link: `!link MEOW#83`.',
        '6. Remove one of your tags: `!remove`.',
        '7. View upcoming events `!events`.'
      ].join('\n')
    )
    .setTimestamp();

  if (message.channel.isTextBased() && 'send' in message.channel) {
    await message.channel.send({ embeds: [embed] });
  } else {
    await message.reply('❌ This command must be used in a text or thread channel.');
  }
}


export async function handleEventsCommand(message: Message): Promise<void> {
  const raw = fs.readFileSync('./events.json', 'utf-8');
  const events = JSON.parse(raw) as {
    title: string;
    date: string;
    location: string;
    url: string;
    sortDate: string;
  }[];

  if (!events.length) {
    await message.reply('📭 No upcoming events found.');
    return;
  }

  // ✅ Sort by sortDate ascending
  events.sort((a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime());

  const lines = events.map((e, i) => `${i + 1}. [${e.title} | ${e.date} | ${e.location}](${e.url})`);

  const embed = new EmbedBuilder()
    .setTitle('📅 Upcoming Events')
    .setColor(0x00bfff)
    .setDescription(lines.join('\n'))
    .setTimestamp();

  await message.channel.send({ embeds: [embed] });
}

export async function handleAddEventCommand(message: Message): Promise<void> {
  if (message.author.id !== ADMIN_USER_ID) {
    await message.reply('❌ You are not authorized to add events.');
    return;
  }

  const args = message.content.slice('!addevent'.length).trim();

  // Match with optional 5th argument (sortDate)
  const match = args.match(/\[(.+?)\]\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(https?:\/\/\S+)(?:\s*\|\s*(\d{4}-\d{2}-\d{2}))?/);

  if (!match) {
    await message.reply('⚠️ Invalid format.\nUse: `!addevent [Title] | Date | Location | URL | YYYY-MM-DD` (last part optional)');
    return;
  }

  const [, title, date, location, url, sortDate] = match;

  const raw = fs.readFileSync('./events.json', 'utf-8');
  const events = JSON.parse(raw) as {
    title: string;
    date: string;
    location: string;
    url: string;
    sortDate?: string;
  }[];

  events.push({ title, date, location, url, ...(sortDate ? { sortDate } : {}) });

  fs.writeFileSync('./events.json', JSON.stringify(events, null, 2));

  await message.reply(`✅ Added event: **${title}** | ${date} | ${location}${sortDate ? ` | 🗓️ ${sortDate}` : ''}`);
}


export async function handleDeleteEventCommand(message: Message): Promise<void> {
  if (message.author.id !== ADMIN_USER_ID) {
    await message.reply('❌ You are not authorized to delete events.');
    return;
  }

  const raw = fs.readFileSync('./events.json', 'utf-8');
  const events = JSON.parse(raw) as { title: string; date: string; location: string; url: string }[];

  if (!events.length) {
    await message.reply('📭 No events to delete.');
    return;
  }

  const list = events.map((e, i) => `**${i + 1}.** [${e.title} | ${e.date} | ${e.location}](${e.url})`).join('\n');
  const prompt = await message.reply(`🗑️ Reply with the number of the event you want to delete:\n${list}`);

  const filter = (m: Message) =>
    m.author.id === message.author.id &&
    !isNaN(Number(m.content.trim())) &&
    Number(m.content.trim()) >= 1 &&
    Number(m.content.trim()) <= events.length;

  try {
    if (!message.channel.isTextBased() || !('awaitMessages' in message.channel)) {
      await message.reply('❌ Cannot prompt for input in this type of channel.');
      return;
    }

    const collected = await message.channel.awaitMessages({
      filter,
      max: 1,
      time: 20000,
      errors: ['time'],
    });

    await prompt.delete().catch(() => { });
    const index = Number(collected.first()!.content.trim()) - 1;
    const removed = events.splice(index, 1)[0];

    fs.writeFileSync('./events.json', JSON.stringify(events, null, 2));

    await message.reply(`✅ Removed event: **${removed.title} | ${removed.date} | ${removed.location}**`);
  } catch {
    await prompt.delete().catch(() => { });
    await message.reply('❌ You didn’t respond in time. Try `!deleteevent` again.');
  }
}