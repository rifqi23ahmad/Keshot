# Keshot Telegram Finance Bot 💸

A resilient, production-ready personal finance Telegram bot built using Node.js, Fastify, and Prisma.

## Features
- **Clean Architecture:** Routes -> Controllers -> Services -> Repositories
- **Strict Webhook Security:** Validates incoming payloads with `X-Telegram-Bot-Api-Secret-Token`.
- **Idempotency Built-in:** Drops duplicate webhooks from Telegram using a `processed_updates` PostgreSQL table cache.
- **Fail-Fast Parser:** Validates integer limits and rigorously parses user transaction texts.
- **Railway Ready:** Includes DB migration automation on boot and Graceful Shutdown semantics. 
- **Rate-Limited:** Blocks abuse at the edge by enforcing 10req/5sec limit globally.

## Prerequisites
- Node.js (v18+)
- PostgreSQL Database
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

## Installation & Local Testing
1. Clone the repository.
   ```bash
   git clone https://github.com/rifqi23ahmad/Keshot.git
   cd Keshot
   npm install
   ```

2. Generate Prisma Client.
   ```bash
   npx prisma generate
   ```

3. Configure `.env`:
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token
   TELEGRAM_SECRET_TOKEN=my_super_secret_string
   DATABASE_URL=postgresql://user:password@localhost:5432/keshot
   PORT=3000
   WEBHOOK_URL=https://my-app.railway.app
   ```

4. Push the Database Schema:
   ```bash
   npx prisma db push
   # OR
   npx prisma migrate dev --name init
   ```

5. Run Locally:
   ```bash
   npm run dev
   ```

## Deploying to Railway 🚀

### 1. Provision Services
1. Go to your Railway Dashboard.
2. Provision a new **PostgreSQL Plugin**.
3. Create a **New Service > Deploy from GitHub repo** and select `Keshot`.

### 2. Configure Environment Variables
In the Railway Service settings for your bot, add the following variables:
- `TELEGRAM_BOT_TOKEN`: The API key from BotFather
- `TELEGRAM_SECRET_TOKEN`: Any random, hard-to-guess string (you will use it to setup the webhook).
- `DATABASE_URL`: Let Railway inject this via Reference Variables (Select the Postgres URL).
- `WEBHOOK_URL`: Your `https://...up.railway.app` production domain.
- `PORT`: Usually Railway detects it, but you can set to `3000`.

### 3. Deploy
Railway will automatically detect the Node environment. 
When the build finishes, Railway will execute the `start` script defined in `package.json` (`npm run start`):
```bash
npx prisma migrate deploy && node src/server.js
```
This will automatically execute any pending Prisma database migrations before bringing the Fastify server online.

### 4. Setup Tele Webhook
To link Telegram strictly to your newly deployed Railway bot, run from your local terminal:
```bash
npm run setup:webhook
```
*(Make sure your local `.env` has the matching production `WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN` and `TELEGRAM_SECRET_TOKEN` before running.)*

## Commands Usage
- `/start` - Greeting & Instructions
- `+50000 Gaji` - Record Income
- `-20000 Kopi` - Record Expense
- `/summary` - View Total Income, Expense, Balance
- `/history` - View the last 10 transactions
- `/today` - View transactions for today
- `/delete <transaction_id>` - Delete a specific transaction (only your own).
