// predictionSystem.ts
import fs from 'fs';
import { Message, EmbedBuilder, TextChannel, NewsChannel, ThreadChannel } from 'discord.js';

const PREDICTIONS_FILE = './predictions.json';
const TAGS_FILE = './tags.json';
const ADMIN_ID = process.env.ADMIN_USER_ID!;

interface Prediction {
    question: string;
    options: string[];
    bets: Record<string, { optionIndex: number; amount: number }>;
    status: 'open' | 'closed' | 'resolved';
    winnerIndex?: number;
    maxBet: number;
    date: string;
    url: string;
}


function loadPredictions(): Record<string, Prediction> {
    try {
        return JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function savePredictions(predictions: Record<string, Prediction>) {
    fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(predictions, null, 2));
}

function loadTags(): Record<string, { tags: string[]; timbucks: number }> {
    try {
        return JSON.parse(fs.readFileSync(TAGS_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function saveTags(tags: Record<string, { tags: string[]; timbucks: number }>) {
    fs.writeFileSync(TAGS_FILE, JSON.stringify(tags, null, 2));
}

export async function handleCreatePredictionCommand(message: Message): Promise<void> {
    if (message.author.id !== ADMIN_ID) {
        await message.reply('❌ You are not authorized to use this command.');
        return;
    }

    const args = message.content.slice('!createprediction'.length).trim();
    const match = args.match(/^"([^"]+)"\s*\|\s*\[(.+?)\]\s*\|\s*(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(https?:\/\/\S+)/);

    if (!match) {
        await message.reply(`⚠️ Invalid format. Use:
\`\`\`
!createprediction "Title" | [Option1,Option2,...] | MaxBet | YYYY-MM-DD | https://start.gg/...
\`\`\``);
        return;
    }


    const [, question, optionList, maxBetStr, date, url] = match;
    const options = optionList.split(',').map(s => s.trim());
    const maxBet = parseInt(maxBetStr);

    if (options.length < 2 || isNaN(maxBet) || maxBet <= 0) {
        await message.reply('⚠️ Ensure at least 2 options and a positive number for max bet.');
        return;
    }

    const predictions = loadPredictions();
    const id = question.toLowerCase().replace(/[^a-z0-9]/gi, '_');

    if (predictions[id]) {
        await message.reply('⚠️ A prediction with this ID already exists. Choose a different title.');
        return;
    }

    predictions[id] = {
        question,
        options,
        bets: {},
        status: 'open',
        winnerIndex: undefined,
        maxBet,
        date,
        url
    } as Prediction & { maxBet: number; date: string; url: string }; // Extend dynamically

    savePredictions(predictions);

    const embed = new EmbedBuilder()
        .setTitle('✅ New Prediction Created')
        .setColor(0x2ecc71)
        .addFields(
            { name: 'Question', value: question },
            { name: 'Options', value: options.map((o, i) => `${i + 1}. ${o}`).join('\n') },
            { name: 'Max Bet', value: `${maxBet} Timbucks`, inline: true },
            { name: 'Event Date', value: date, inline: true },
            { name: 'StartGG URL', value: url }
        );

    if (
        message.channel instanceof TextChannel ||
        message.channel instanceof NewsChannel ||
        message.channel instanceof ThreadChannel
    ) {
        await message.channel.send({ embeds: [embed] });
    } else {
        await message.reply('❌ This command must be used in a server text channel or thread.');
    }
}

export async function handlePredictionsCommand(message: Message): Promise<void> {
  const predictions = loadPredictions();
  const openEntries = Object.entries(predictions).filter(([, p]) => p.status === 'open');

  if (!openEntries.length) {
    await message.reply('📭 No open predictions.');
    return;
  }

  const numbered = openEntries.map(([id, pred], i) => `**${i + 1}.** ${pred.question}`);
  const prompt = await message.reply(
    `🔮 **Available Predictions:**\n${numbered.join('\n')}\n\n_Reply with the number of a prediction to view details._`
  );

  const filter = (m: Message) =>
    m.author.id === message.author.id &&
    !isNaN(parseInt(m.content.trim())) &&
    parseInt(m.content.trim()) >= 1 &&
    parseInt(m.content.trim()) <= openEntries.length;

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

    await prompt.delete().catch(() => {});
    const index = parseInt(collected.first()!.content.trim()) - 1;
    const [id, selected] = openEntries[index];

    // Calculate total bets per option
    const betSums: number[] = new Array(selected.options.length).fill(0);
    for (const bet of Object.values(selected.bets)) {
      betSums[bet.optionIndex] += bet.amount;
    }

    const optionLines = selected.options.map((opt, i) =>
      `**${i + 1}.** ${opt} — 💰 ${betSums[i]} Timbucks`
    );

    const embed = new EmbedBuilder()
      .setTitle(`🔮 ${selected.question}`)
      .setColor(0xf1c40f)
      .setDescription([
        `**Prediction ID:** \`${id}\``,
        '',
        optionLines.join('\n'),
        '',
        `To bet: \`!bet ${id} OPTION_NUMBER AMOUNT\``
      ].join('\n'))
      .addFields(
        { name: 'Max Bet', value: `${selected.maxBet} Timbucks`, inline: true },
        { name: 'Event Date', value: selected.date, inline: true }
      )
      .setFooter({ text: selected.url });

    await message.channel.send({ embeds: [embed] });
  } catch {
    await prompt.delete().catch(() => {});
    await message.reply('❌ You didn’t respond in time. Try `!predictions` again.');
  }
}




export async function handleBetCommand(message: Message): Promise<void> {
  const parts = message.content.trim().split(/\s+/);
  const [id, optionStr, amountStr] = parts.slice(1);
  const predictions = loadPredictions();
  const userId = message.author.id;
  const tags = loadTags();
  const user = tags[userId];

  if (!user) {
    await message.reply('⚠️ You must register a tag first using `!tag YOURTAG#000`.');
    return;
  }

  if (!id || !optionStr || !amountStr) {
    await message.reply('❌ Usage: `!bet PREDICTION_ID OPTION_NUMBER AMOUNT`');
    return;
  }

  const pred = predictions[id];
  const optionIndex = parseInt(optionStr) - 1;
  const amount = parseInt(amountStr);

  if (!pred || pred.status !== 'open') {
    await message.reply('❌ Invalid prediction ID or it is closed.');
    return;
  }

  if (isNaN(optionIndex) || optionIndex < 0 || optionIndex >= pred.options.length) {
    await message.reply('❌ Invalid option number.');
    return;
  }

  if (isNaN(amount) || amount <= 0 || user.timbucks < amount) {
    await message.reply(`❌ Invalid or insufficient Timbucks. You currently have **${user.timbucks}**.`);
    return;
  }

  pred.bets[userId] = { optionIndex, amount };
  user.timbucks -= amount;

  savePredictions(predictions);
  saveTags(tags);

  await message.reply(`✅ Bet placed on **${pred.options[optionIndex]}** for **${amount}** Timbucks.`);
}


export async function handleResolvePredictionCommand(message: Message): Promise<void> {
    if (message.author.id !== ADMIN_ID) return;

    const parts = message.content.trim().split(/\s+/);
    const [id, winningIndexStr] = parts.slice(1);
    const predictions = loadPredictions();
    const tags = loadTags();

    const pred = predictions[id];
    const winnerIndex = parseInt(winningIndexStr);

    if (!pred || pred.status !== 'open') {
        await message.reply('❌ Invalid or already resolved prediction.');
        return;
    }

    pred.status = 'resolved';
    pred.winnerIndex = winnerIndex;

    const totalWinning = Object.values(pred.bets).filter(b => b.optionIndex === winnerIndex).reduce((acc, b) => acc + b.amount, 0);
    const totalLosing = Object.values(pred.bets).filter(b => b.optionIndex !== winnerIndex).reduce((acc, b) => acc + b.amount, 0);

    for (const [uid, { optionIndex, amount }] of Object.entries(pred.bets)) {
        if (optionIndex === winnerIndex && totalWinning > 0) {
            const share = amount / totalWinning;
            const reward = amount + share * totalLosing;
            tags[uid].timbucks += Math.floor(reward);
        }
    }

    savePredictions(predictions);
    saveTags(tags);

    await message.reply(`🎉 Prediction resolved! Winner: **${pred.options[winnerIndex]}**.`);
}


export async function handleMyBetsCommand(message: Message): Promise<void> {
  const predictions = loadPredictions();
  const userId = message.author.id;

  const activeBets = Object.entries(predictions)
    .filter(([, pred]) => pred.status === 'open' && pred.bets[userId])
    .map(([id, pred]) => {
      const bet = pred.bets[userId];
      return {
        id,
        question: pred.question,
        option: pred.options[bet.optionIndex],
        amount: bet.amount
      };
    });

  if (activeBets.length === 0) {
    await message.reply('🕵️ You have no active bets.');
    return;
  }

  const lines = activeBets.map(b =>
    `**${b.question}** (\`${b.id}\`)\n🟡 You bet **${b.amount}** on **${b.option}**\n`
  );

  const embed = new EmbedBuilder()
    .setTitle('🎲 Your Active Bets')
    .setColor(0x9b59b6)
    .setDescription(lines.join('\n'))
    .setTimestamp();

  if (message.channel.isTextBased() && 'send' in message.channel) {
    await message.channel.send({ embeds: [embed] });
  } else {
    await message.reply('❌ This command must be used in a text or thread channel.');
  }
}
