import { AttachmentBuilder, Message, EmbedBuilder } from 'discord.js';
import { getEventIdFromSlug, escapeMarkdown } from './utils.js';
import { fetchGraphQL1 } from './fetchResults.js';
import { activeEventIntervals } from './state.js';
import { predictChange, fetchSlippiProfile, getRank } from './slippiPredictor.js';
import { getAllTags, getTag, setTag } from './tagStore.js';
import path from 'path';
import fs from 'fs';
import { getEmojiIdForName, getCharacterEmoji } from './emojis.js';

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
          let delta = '';

          if (typeof previous === 'number') {
            const diff = profile.ordinal - previous;
            const symbol = diff > 0 ? '🔺' : diff < 0 ? '🔻' : '';
            if (symbol)
              delta = `${symbol} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)})`;
          } else {
            delta = '🆕';
          }

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
          // skip invalid or failed lookups
        }

      }
    }

    // Save the current snapshot
    saveLeaderboard(newSnapshot);

    results.sort((a, b) => b.ordinal - a.ordinal);

    const lines = results.map((r, i) =>
      `**#${i + 1}** ${r.emoji} ${r.name} ${r.delta} — ${escapeMarkdown(r.tag)} — ${r.ordinal.toFixed(1)} ${r.games}  ${r.characters}`
    );

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🏆 Slippi Leaderboard')
      .setDescription(lines.join('\n'))
      .setTimestamp();

    if ('send' in message.channel) {
      await message.channel.send({ embeds: [embed] });
    } else {
      await message.reply('❌ This command must be used in a text or thread channel.');
    }
  } catch (err) {
    console.error(err);
    await message.reply('❌ Failed to generate leaderboard.');
  }
}