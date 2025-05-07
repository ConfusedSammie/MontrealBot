# Slippi Discord Bot

A custom Discord bot that integrates with the Slippi and Start.gg APIs to display player rankings, match predictions, and live tournament tracking in Discord.

---

## 🔧 Features

- `/leaderboard` – Show ranked player list from saved Slippi tags
- `/predict` – Predict rank changes from hypothetical matches
- Live Start.gg event tracking
- Global emoji support for ranks and characters
- Tag saving per Discord user

---

## 🚀 Setup Instructions

### 1. Clone the Repo

```bash
git clone https://github.com/YOUR_USERNAME/slippi-bot.git
cd slippi-bot
```

### 2. Install Dependencies

```bash
npm install
```

Make sure you're using **Node.js v18+**

### 3. Create `.env` File

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Fill in the required values:

```
STARTGG_API_URL=https://api.start.gg/gql/alpha
STARTGG_BEARER=your_api_token_here
ALLOWED_CHANNEL_ID=your_discord_channel_id
ADMIN_USER_ID=your_discord_user_id
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_bot_application_id
```

---

## 🧪 Commands

### Deploy Slash Commands

```bash
npx ts-node deploy-commands.ts
```

### Run the Bot

```bash
npx ts-node index.ts
```

Or if you're using a compiled build:

```bash
npm run build
node dist/index.js
```

---

## 📁 Project Structure

```
.
├── commands/            # Slash commands like /leaderboard, /predict
├── utils/               # Emoji maps, tag storage, API utils
├── cron/                # (Optional) Periodic stat fetchers
├── images/              # If used for rank visuals
├── .env                 # Your secrets (not committed)
├── .env.example         # Safe template for setup
├── index.ts             # Bot entrypoint
├── deploy-commands.ts   # One-time slash command registration
```

---

## ❗ Notes

- Make sure your bot is in the server where you use the slash commands.
- All emojis must be accessible to the bot (either global or in the same guild).
- You must re-run `deploy-commands.ts` after adding new slash commands.

---

## 📜 License

MIT – use freely, modify as needed.
