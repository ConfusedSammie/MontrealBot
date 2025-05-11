import dotenv from 'dotenv';
dotenv.config();

import { Client, GatewayIntentBits, Message, SlashCommandBuilder } from 'discord.js';
import {
  handleResultsCommand,
  handleStopResultsCommand,
  handlePredictCommand,
  handleTagCommand,
  handleLeaderboardCommand,
  handleLinkCommand,
  handleUpsetsCommand
} from './commands.js';

const ALLOWED_CHANNEL_ID = process.env.ALLOWED_CHANNEL_ID!;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID!;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`);
});



client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  const isAdmin = message.author.id === ADMIN_USER_ID;
  const isInAllowedChannel = message.channel.id === ALLOWED_CHANNEL_ID;

  if (!isInAllowedChannel && !isAdmin) {
    return; // Ignore messages from unauthorized channels or users
  }

  if (message.content.startsWith('!results')) {
    await handleResultsCommand(message);
  } else if (message.content.startsWith('!stopresults')) {
    //handleStopResultsCommand(message);
  } else if (message.content.startsWith('!predict')) {
    await handlePredictCommand(message);
  } else if (message.content.startsWith('!tag')) {
    handleTagCommand(message);
  } else if (message.content.startsWith('!leaderboard')) {
    await handleLeaderboardCommand(message);
  } else if (message.content.startsWith('!link')) {
    await handleLinkCommand(message);
  } else if (message.content.startsWith('!upsets')) {
    await handleUpsetsCommand(message);
  }
});

client.login(process.env.DISCORD_TOKEN);
