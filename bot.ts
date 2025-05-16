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
  handleBalanceCommand
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



client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  const isAdmin = message.author.id === ADMIN_USER_ID;
  const isInAllowedChannel = message.channel.id === ALLOWED_CHANNEL_ID;

  if (!isInAllowedChannel && !isAdmin) return;

  const command = message.content.trim().split(/\s+/)[0].toLowerCase();

  switch (command) {
    case '!results':
      await handleResultsCommand(message);
      break;
    case '!stopresults':
      // await handleStopResultsCommand(message);
      break;
    case '!predict':
      await handlePredictCommand(message);
      break;
    case '!tag':
      handleTagCommand(message);
      break;
    case '!leaderboard':
      await handleLeaderboardCommand(message);
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
