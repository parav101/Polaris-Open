# Copilot Instructions for Polaris-Open

## Project Overview
Polaris-Open is a Discord bot built with **Node.js** and **Discord.js v14**. It uses **MongoDB** with **Mongoose** for data storage and includes an **Express** web server (`web_app.js`) for a dashboard. The bot runs with sharding enabled via `polaris.js`.

## Tech Stack
- **Runtime**: Node.js
- **Bot Framework**: Discord.js v14
- **Database**: MongoDB (Mongoose)
- **Web Framework**: Express
- **Sharding**: `discord.js` ShardingManager
- **Canvas**: `canvacord` + `@napi-rs/canvas` for rank cards / leaderboard images

## Project Structure
- **Entry Points**:
    - `polaris.js`: Main entry point. Uses `Discord.fetchRecommendedShardCount` then spawns shards running `index.js`.
    - `index.js`: Per-shard logic — loads commands, registers events, runs schedulers (shard 0 only), starts web server (shard 0 only).
- **Commands & Events**:
    - `commands/slash/`: Slash commands.
    - `commands/events/`: Event handlers (e.g., `guildMemberRemove`, `messageCreate`).
    - `commands/button/`: Button interactions.
    - `commands/user_context/`: Context menu commands.
    - `commands/misc/`: Import/transfer utilities (not Discord commands).
- **Data**:
    - `database_schema.js`: Defines MongoDB document structures (Settings, Users, Leaderboard). Always reference this before reading/writing data. Exports `{ settings, settingsArray, settingsIDs, schema }`.
    - `classes/DatabaseModel.js`: Thin Mongoose wrapper (`fetch`, `update`, `create`, `find`, `delete`).
- **Utilities**:
    - `classes/Tools.js`: Core utility class. **Always instantiated per-interaction** as `new Tools(client, int)`. The global, interaction-less instance is `client.globalTools` (also `Tools.global`).
- **Web Dashboard**:
    - `web_app.js`: Express app, exported as `module.exports = (client) => {}`, called on shard 0 only.
    - `app/`: Static assets (HTML, CSS, JS).
- **Config**:
    - `config.json`: `{ test_server_ids, developer_ids, lockBotToDevOnly, enableWebServer, serverPort, siteURL, changelogURL, supportURL }`.
    - `.env`: `DISCORD_TOKEN`, `MONGO_DB_URI` (or `MONGO_DB_IP` + `MONGO_DB_USERNAME` + `MONGO_DB_PASSWORD` + `MONGO_DB_NAME`).

---

## Client Object Properties
Properties attached to `client` in `index.js`:

| Property | Description |
|---|---|
| `client.db` | `new Model("servers", schema)` — main guild DB model |
| `client.globalTools` | `new Tools(client)` — no `int`; use only where no interaction exists |
| `client.commands` | `Discord.Collection` of all loaded commands |
| `client.shard.id` | Current shard index (from `client.shard.ids[0]`) |
| `client.version` | `{ version, updated }` from `json/auto/version.json` |
| `client.statusData` | Loaded from `json/auto/status.json` |
| `client.updateStatus()` | Refreshes bot presence |
| `client.startupTime` | ms from process start to `clientReady` |
| `client.config` | Loaded from `config.json` |

---

## 1. Coding Standards
- Use consistent formatting; follow the existing style in the file being edited.
- Use clear, descriptive names for variables and functions (e.g., `getUserXp` not `getX`).
- Avoid deeply nested logic — flatten with early returns or helper functions.
- Keep functions small and focused on a single responsibility.

## 2. Architecture Guidelines
- Follow the existing modular structure: one command per file, one concern per class.
- Keep business logic out of event handlers; delegate to class methods or helpers.
- Reuse logic via `classes/` — check existing classes before writing new utilities.
- Cross-shard operations must go through `client.shard.broadcastEval`. When doing so, always require files using an absolute path passed via `context` (e.g., `context: { dir: __dirname }`), since `require` paths are relative to each shard process.
- Schedulers and the web server only run on **shard 0** (`client.shard.id === 0`).

## 3. Slash Command File Structure
Every command file must export this shape:
```js
module.exports = {
    metadata: {
        name: "commandname",        // used as the command key
        description: "...",
        permission: "ManageGuild",  // optional string — NOT auto-enforced
        args: [...],                // Discord slash command option builders
        dev: true                   // optional — index.js enforces dev-only
    },
    async run(client, int, tools) { ... }
}
```
Event handlers use `.run(client, message/state, tools)` except `guildMemberRemove`, which uses `.execute(member, client, tools)`.

## 4. Tools Class Usage
`Tools` is the central utility class. **Always create a fresh instance per interaction:**
```js
// In a command: tools is already passed in as the third argument
async run(client, int, tools) { ... }

// In an event handler, create manually:
const tools = new Tools(client, int)   // interaction-scoped
// Or use the global instance for non-interaction contexts:
Tools.global  // same as client.globalTools — no int, limited method use
```
Key methods:
- `tools.fetchSettings(userId?, guildId?)` — fetches `settings` + `users[userId]`. **Auto-creates** the document if not found. Most common call: `await tools.fetchSettings(int.user.id)`.
- `tools.fetchAll(guildId?)` — fetches the full document.
- `tools.canManageServer(member, bypass)` — checks `ManageGuild`. `bypass` = `db.settings.manualPerms`.
- `tools.canManageRoles(member, bypass)` — checks `ManageRoles`.
- `tools.isDev(user)` — checks against `config.developer_ids`.
- `tools.warn(msg)` — ephemeral error reply. Prefix with `*` to use a predefined error key (e.g., `"*notMod"`, `"*xpDisabled"`).
- `tools.safeReply(data)` — handles already-replied/deferred interactions; swallows timeout errors.
- `tools.createEmbed(options)` — builds an `EmbedBuilder`. Options: `title, description, color, author, footer, fields, timestamp, thumbnail`.
- `tools.button(options)` / `tools.row(components)` — button/row builders with string helpers.
- `tools.createConfirmationButtons(options)` — full timed confirm/cancel flow with collector.
- `tools.getLevel(xp, settings)` — converts XP to level using the cubic curve.
- `tools.xpForLevel(level, settings)` — converts level to XP.
- `tools.getMultiplier(member, settings, channel)` — resolves the effective XP multiplier for a member.
- `tools.getRolesForLevel(level, rewards)` — returns the reward roles a user should have at a given level.
- `tools.syncLevelRoles(member, list)` — atomically syncs reward roles via `member.roles.set()`.
- `tools.updateStreak(member, db, client, channel, message)` — increments or resets streak, awards streak XP/credits.
- `tools.updateDailyXpSnapshot(member, db, client)` — resets daily activity tracking at UTC midnight.
- `tools.xpObjToArray(users)` — converts the freeform users object to a sorted `[{id, xp, ...}]` array.
- `tools.getRank(id, users)` / `tools.getUserByRank(rank, users)` — leaderboard rank lookups.
- `tools.commafy(n, inline?)` — locale-formatted number; `inline=true` wraps in `inlineCode`.
- `tools.time(ms)` — human-readable duration string.
- `tools.rng(min, max)` / `tools.choose(arr)` — random helpers.

## 5. Async & Error Handling
- Always use `async/await` — avoid raw `.then()/.catch()` chains.
- Wrap Discord API calls and database operations in `try/catch` with meaningful error messages.
- Never silently swallow errors; log them or surface them to the user appropriately.
- Validate command inputs before processing (check types, ranges, missing fields).
- The top-level interaction handler in `index.js` catches unhandled errors and routes to `reply`/`editReply`/`followUp` based on `int.replied` / `int.deferred`.

## 6. Database (MongoDB / Mongoose)
- Always reference `database_schema.js` before reading or writing any document field.
- Use `$set` with dot notation — **never replace the whole document or the `users` object**:
  ```js
  client.db.update(guildId, { $set: { [`users.${userId}.xp`]: newXP } }).exec()
  ```
- Use `.exec()` for fire-and-forget writes; use `await` when you need the result.
- Use projection (second argument of `fetch`/`find`) to fetch only the fields you need.
- Avoid N+1 patterns: batch queries or use `$in` where possible.
- Ensure schema changes in `database_schema.js` are reflected in both bot logic and `web_app.js`.

### Document Structure
Top-level fields: `_id` (guild ID), `users`, `settings`, `info`, `giveaways[]`, `voiceSessions[]`.

**`users` is a free-form `Object` — Mongoose does not validate it.** Always guard against undefined:
```js
const userData = db.users[userId] || { xp: 0, cooldown: 0 }
```
Key user fields: `xp`, `cooldown` (Unix ms timestamp — check `userData.cooldown > Date.now()`), `hidden`, `lastXpGain`, `activityXpAccumulated`, `xpAtDayStart`, `credits`, `streak { count, highest, lastClaim, milestoneRoles }`, `tempRoles[]`.

**`settings` uses dot-path IDs** (e.g., `"gain.min"`, `"levelUp.embed"`, `"confession.channelId"`). These same paths are used in `settingsIDs`, `settings_edit.js`, `$set` keys, and web app validation — keep them consistent.

### Key Settings Fields
`enabled`, `enabledVoiceXp`, `resetXpOnLeave`, `nicknameRank`, `gain.{min,max,time}`, `voice.{multiplier,hoursLimit,interval,mutedMultiplier,deafMultiplier}`, `curve.{1,2,3}` (cubic XP formula), `rounding`, `maxLevel`, `levelUp.{enabled,embed,message,channel,multiple,multipleUntil,emoji,rewardRolesOnly}`, `multipliers.{roles,channels,rolePriority,channelStacking}`, `rewards[]`, `rewardSyncing.*`, `leaderboard.*`, `rankCard.*`, `manualPerms`, `chestDrops.*`, `streak.*`, `shop.*`, `confession.*`, `activityLeaderboard.*`.

## 7. Security
- Never hardcode secrets, tokens, or credentials — use `.env` / `config.json`.
- Validate and sanitize all user-provided input before using it in queries or embeds.
- Do not expose internal error details in Discord replies — log internally, show a generic message.
- Follow least-privilege principles; don't request Discord permissions beyond what's needed.
- In `web_app.js`, all guild-modifying endpoints require Discord OAuth + `ManageGuild` check via `broadcastEval`. `tools.isDev()` is the only bypass.

## 8. Discord.js Conventions
- Use `Discord.GatewayIntentBits` for intents and `Discord.Partials` for partials.
- Messages are **not cached** (`MessageManager: 0`) — never rely on `guild.messages.cache`.
- Always defer replies for commands that may take >3 seconds (`interaction.deferReply()`).
- Use `ephemeral: true` for sensitive or user-specific responses.
- Check permissions after fetching DB settings, so `manualPerms` is respected:
  ```js
  let db = await tools.fetchSettings(int.user.id)
  if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod")
  ```

### Button ID Convention
`customId = "commandName~userId~...optionalData"` — the `userId` at index [1] ensures only the original user can interact. Always guard:
```js
if (buttonData[1] !== int.user.id) return int.deferUpdate()
```
For modals: `customId = "configmodal~settingID~userId"` (userId at index [2]).

Button commands are routed as `"button:" + customId.split("~")[0]`.

## 9. XP & Leveling System
- **XP formula**: cubic — `c3*x³ + c2*x² + c1*x`, rounded to `settings.rounding`. Coefficients: `curve.3`, `curve.2`, `curve.1`.
- **Multipliers**: channels blocked via `boost: 0` — there's no separate "ignored channel" list. Roles with `boost ≤ 0` also block XP. Use `tools.getMultiplier()` — never recalculate manually.
- **Cooldown check**: `userData.cooldown > Date.now()` (cooldown is a Unix ms timestamp, not a duration).
- **Activity XP** is stored raw (divided by multiplier): `activityXpAccumulated += xpGained / multiplier` so the daily snapshot is multiplier-neutral.
- **`addxp.js` only writes `.xp`** — it deliberately avoids resetting cooldown or `lastXpGain`.
- **Level-up messages** are sent via `ch.send()` from the event handler, not via interaction reply.
- **`levelUp.message`** supports template variables: `[[LEVEL]]`, `[[XP]]`, `[[@]]`, `[[USERNAME]]`, `[[ROLE]]`, `[[CHOOSE a|b|c]]`, `[[IFLEVEL >= N | text]]`, `[[IFROLE | text]]`, etc. (see `classes/LevelUpMessage.js`).
- **`levelUp.embed`**: when true, `settings.levelUp.message` stores a JSON string `{ content?, embeds: [...] }` — use `LevelUpEmbed` to parse and validate it.

## 10. Voice XP System
- `commands/events/voice.js` **only manages session lifecycle** — it starts/ends `voiceSessions` entries in the DB.
- **Actual XP** is awarded by the shard-0 scheduler in `index.js` every 5 minutes (respecting `settings.voice.interval`). Uses `voice.mutedMultiplier` and `voice.deafMultiplier`.
- Do not grant voice XP directly in the voice event handler.

## 11. Cross-Shard Operations
Guild data (members, roles, channels) may be on any shard. Use `broadcastEval` and find the first non-null result:
```js
const result = await client.shard.broadcastEval(async (cl, ctx) => {
    const guild = cl.guilds.cache.get(ctx.guildId)
    if (!guild) return null
    // ... fetch data ...
    return data
}, { context: { guildId, dir: __dirname } })
.then(results => results.find(r => r))
```
Always pass `dir: __dirname` in context and use it for requires inside the callback.

## 12. Web Dashboard (`web_app.js`)
- Exported as `module.exports = (client) => { ... }` and called once on shard 0.
- Auth: Discord OAuth2 → random hex token stored in MongoDB `auth` collection → `polaris` cookie. Token is cached in memory for 15 seconds to reduce DB hits.
- Settings save (`POST /api/settings`) validates every field via `settingsIDs` from `database_schema.js` and live Discord data (roles/channels fetched via `broadcastEval`).
- **`config.siteURL` must start with `"http"`** — otherwise it falls back to `"https://gdcolon.com/polaris"` and dashboard buttons will break in local dev.

## 13. Comments & Documentation
- Add comments only where the logic is non-obvious — avoid restating what the code already says.
- Explain *why* something is done when it's not immediately clear, not *what* it does.
- Keep inline comments short; use block comments for complex algorithms.

## 14. Performance
- Avoid redundant database calls within the same command execution — cache fetched data locally.
- Optimize loops: avoid awaiting inside loops where parallel execution (`Promise.all`) is possible.
- Be mindful of rate limits on Discord API calls, especially in bulk operations.
- Avoid loading large collections into memory — paginate or limit queries.

## 15. Testing & Reliability
- Write small, pure helper functions where possible to make logic testable in isolation.
- Test edge cases: empty arrays, missing DB documents, invalid user input, off-limits values.
- Validate that XP/level calculations stay consistent across `message.js`, `addxp.js`, and leaderboard commands.

## 16. Git & Collaboration
- Write concise, meaningful commit messages (e.g., `fix: prevent XP gain in ignored channels`).
- Keep commits small and focused — one logical change per commit.
- Don't commit `config.json` or `.env` with real credentials.

---

## Contextual Hints
- **XP/Leveling**: See `commands/slash/addxp.js` and `commands/events/message.js`.
- **Leaderboards**: See `classes/LevelUpEmbed.js` and `commands/slash/top.js`.
- **Voice XP**: See `commands/events/voice.js` (session tracking) + shard-0 scheduler in `index.js` (XP grant).
- **Web Dashboard**: `web_app.js` shares data model with the bot — keep them in sync.
- **Streaks**: See `commands/slash/streak.js`, `commands/slash/resetstreak.js`, and `tools.updateStreak()`.
- **Confessions**: See `commands/slash/confess.js` and related button handlers.
- **Settings navigation UI**: `commands/button/settings_list.js` → `settings_view.js` → `settings_edit.js` (modal flow).
- **Paginated embeds**: Use `classes/PageEmbed.js`; one active paginator per user (previous collector is stopped on re-open).
- **Rank cards / leaderboard images**: Use `tools.createRankCard()` / `tools.leaderboardBuilder()`.
- **`MilestoneMessage`**: contains a hardcoded custom emoji ID (`1313833525094518846`) scoped to the original server — update if deploying elsewhere.
