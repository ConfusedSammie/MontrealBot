import { AttachmentBuilder, Message, EmbedBuilder } from 'discord.js';
import { getEventIdFromSlug, escapeMarkdown } from './utils.js';
import { fetchGraphQL1 } from './fetchResults.js';
import { activeEventIntervals } from './state.js';
import { predictChange, fetchSlippiProfile, getRank } from './slippiPredictor.js';
import { getAllTags, getTag, setTag } from './tagStore.js';
import path from 'path';
import fs from 'fs/promises';
import { getEmojiIdForName, getCharacterEmoji } from './emojis.ts';


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
  const parts = message.content.split(' ');
  const opponentTag = parts[1];

  if (!opponentTag || !opponentTag.includes('#')) {
    await message.reply('Usage: `!predict OPPONENT#000`\nOr: Register with `!tag YOURTAG#000` first.');
    return;
  }

  const yourTag = getTag(message.author.id);
  if (!yourTag) {
    await message.reply('⚠️ You must register your Slippi tag first using `!tag YOURTAG#000`');
    return;
  }

  try {
    const result = await predictChange(opponentTag, yourTag);

    const promoNote = result.winRank !== result.currentRank ? ` | 🟢 **Promotes to** ${result.winRank}` : ``;
    const demoNote = result.lossRank !== result.currentRank ? ` | 🔴 **Demotes to** ${result.lossRank}` : ``;

    await message.reply(
      `📊 ${result.opponent} (${result.opponentOrdinal.toFixed(1)})\n` +
      `Win: +${result.deltaWin.toFixed(1)} ${promoNote}\n` +
      `Loss: ${result.deltaLoss.toFixed(1)} ${demoNote}`
    );
  } catch (err: any) {
    await message.reply(`Prediction failed: ${err.message}`);
  }
}

function rankToEmoji(rank: string) {
  // E.g. Bronze II -> :BronzeII:
  const nospaces = rank.replace(" ", "");
  return getEmojiIdForName(nospaces);
}

export async function handleLeaderboardCommand(message: Message): Promise<void> {
  try {
    const tags = getAllTags();

    const results: {
      name: string;
      tag: string;
      ordinal: number;
      rank: string;
      emoji: string;
      games: string;
      characters: string;
    }[] = [];

    for (const [discordId, slippiTag] of Object.entries(tags)) {
      try {
        const profile = await fetchSlippiProfile(slippiTag as string);
        const rank = getRank(profile.ordinal).toUpperCase().replace(' ', '');
        const emoji = rankToEmoji(rank);
        const games = '(W:'+profile.wins + ' / L:' + profile.losses+')';
        const characters = profile.characters.map(getCharacterEmoji).join(' ');


        results.push({
          name: `<@${discordId}>`,
          tag: slippiTag,
          ordinal: profile.ordinal,
          rank,
          emoji,
          games,
          characters
        });
      } catch {
        // skip invalid tags or fetch failures
      }
    }

    results.sort((a, b) => b.ordinal - a.ordinal);

   /* const lines = results.map((r, i) =>
      `**#${i + 1}** ${r.emoji} ${r.name} (${escapeMarkdown(r.tag)}) — ${r.ordinal.toFixed(1)} *${r.rank}*`
    );*/

    const lines = results.map((r, i) =>
      `**#${i + 1}** ${r.emoji} ${r.name} — ${escapeMarkdown(r.tag)} —  ${r.ordinal.toFixed(1)} ${r.games} | ${r.characters}`
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