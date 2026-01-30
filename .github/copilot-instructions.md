# Copilot Instructions for Polaris-Open

## Project Overview
Polaris-Open is a Discord bot built with **Node.js** and **Discord.js v14**. It uses **MongoDB** with **Mongoose** for data storage and includes an **Express** web server (`web_app.js`) for a dashboard. The bot runs with sharding enabled via `polaris.js`.

## Tech Stack
- **Runtime**: Node.js
- **Bot Framework**: Discord.js v14
- **Database**: MongoDB (Mongoose)
- **Web Framework**: Express
- **Sharding**: `discord.js` ShardingManager

## Project Structure
- **Entry Points**:
    - `polaris.js`: The main entry point. Initializes the `ShardingManager` to spawn shards running `index.js`.
    - `index.js`: The logic for individual shards. Initializes the `Discord.Client`.
- **Commands & Events**:
    - `commands/slash/`: Slash commands.
    - `commands/events/`: Event handlers (e.g., `guildMemberRemove`, `messageCreate`).
    - `commands/button/`: Button interactions.
    - `commands/user_context/`: Context menu commands.
- **Data**:
    - `database_schema.js`: Defines the structure for the MongoDB documents. This is a key file for understanding the data model (Settings, Users, Leaderboard).
    - `classes/DatabaseModel.js`: Mongoose model wrapper.
- **Web Dashboard**:
    - `web_app.js`: Express application that serves the dashboard.
    - `app/`: Static assets (HTML, CSS, JS) for the dashboard.

## Coding Conventions
- **Asynchronous Code**: Prefer `async/await` over chains of promises.
- **Discord.js**:
    - Use `Discord.GatewayIntentBits` for intents.
    - Use `Discord.Partials` for partials.
    - Remember that `client.shard` exists; cross-shard communication may be necessary for global stats.
- **Database**:
    - Use the schemas defined in `database_schema.js`.
    - Access database methods via `client.db` or the `Model` class if instantiated.
- **Tools**:
    - Common utility functions are likely in `classes/Tools.js`. Access them via `client.globalTools` or by importing the class.

## Contextual Hints
- If working on **XP/Leveling**, check `commands/slash/addxp.js` or `commands/events/message.js` (implied XP gain logic).
- If working on **Leaderboards**, reference `classes/LevelUpEmbed.js` or `commands/slash/top.js`.
- The web app shares logic with the bot, so ensure changes in `database_schema.js` are reflected in both `web_app.js` and bot logic.
