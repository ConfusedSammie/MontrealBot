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
  handleUpsetsCommand,
  handleRemoveCommand,
  handleCommandsCommand,
  handleEventsCommand,
  handleAddEventCommand,
  handleDeleteEventCommand,
  handleBalanceCommand,
  handleWeeklyCommand
} from './commands.js';

import {
  handlePredictionsCommand,
  handleBetCommand,
  handleResolvePredictionCommand,
  handleCreatePredictionCommand,
  handleMyBetsCommand
} from './predictionSystem.js';

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

const commandChannelPermissions: Record<string, string[]> = {
  '!events': ['1015762373396660304', '1015405446808473683', '1369381559249010799'],
  '!leaderboard': ['1369381559249010799', '1052036450360758344'], // override default for specific command
  // add more as needed
};


client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  const isAdmin = message.author.id === ADMIN_USER_ID;
  const command = message.content.trim().split(/\s+/)[0].toLowerCase();

  const allowedChannels = commandChannelPermissions[command] || [ALLOWED_CHANNEL_ID];
  const isInAllowedChannel = allowedChannels.includes(message.channel.id);

  if (!isInAllowedChannel && !isAdmin) return;

  switch (command) {
    case '!results':
      await handleResultsCommand(message);
      break;
    case '!stopresults':
      // await handleStopResultsCommand(message);
      break;
    case '!predict':
    case '!p':
      await handlePredictCommand(message);
      break;
    case '!tag':
      handleTagCommand(message);
      break;
    case '!leaderboard':
    case '!l':
      await handleLeaderboardCommand(message);
      break;
    case '!weekly':
    case '!w':
      //await handleWeeklyCommand(message);
      break;
    case '!link':
      await handleLinkCommand(message);
      break;
    case '!upsets':
      await handleUpsetsCommand(message);
      break;
    case '!remove':
      await handleRemoveCommand(message);
      break;
    case '!commands':
      await handleCommandsCommand(message);
      break;
    case '!events':
      case '!event':
      await handleEventsCommand(message);
      break;
    case '!addevent':
      await handleAddEventCommand(message);
      break;
    case '!deleteevent':
      await handleDeleteEventCommand(message);
      break;
    case '!balance':
      await handleBalanceCommand(message);
      break;
    case '!predictions':
      //await handlePredictionsCommand(message);
      break;
    case '!bet':
      //await handleBetCommand(message);
      break;
    case '!resolve':
      //await handleResolvePredictionCommand(message);
      break;
    case '!createprediction':
      //await handleCreatePredictionCommand(message);
      break;
    case '!bets':
      //await handleMyBetsCommand(message);
      break;

  }
});


client.login(process.env.DISCORD_TOKEN);
