// Phase 2 backfill: copy servers.users → user_stats collection.
//
// Usage:
//   node scripts/backfill_user_stats.js
//   node scripts/backfill_user_stats.js --guild 123456789   (single guild)
//   node scripts/backfill_user_stats.js --dry-run           (count only, no writes)
//
// Safe to re-run: uses upsert so existing docs are updated, not duplicated.
// Resume-safe: skips guilds that already have the right doc count.

require("dotenv").config({ path: require("path").join(__dirname, "../.env") })

const mongoose = require("mongoose")
const { UserStatsModel, bulkUpsertUsers, countForGuild } = require("../classes/UserStats.js")

const uri       = process.env.MONGO_DB_URI
const dbName    = process.env.MONGO_DB_NAME || "polaris"
const args      = process.argv.slice(2)
const dryRun    = args.includes("--dry-run")
const guildFlag = args.indexOf("--guild")
const onlyGuild = guildFlag !== -1 ? args[guildFlag + 1] : null

const BATCH_SIZE = 50   // upserts per bulkWrite call — keep low for Atlas free tier
const PAUSE_MS   = 200  // pause between guilds to avoid Atlas rate-limits

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
    console.log("Connecting to MongoDB…")
    await mongoose.connect(uri, { dbName })
    console.log("Connected.\n")

    // Use the raw servers model (not the full Polaris one; we just need _id + users)
    const ServersCollection = mongoose.connection.collection("servers")

    const query = onlyGuild ? { _id: onlyGuild } : {}
    const cursor = ServersCollection.find(query, { projection: { _id: 1, users: 1 } })

    let totalGuilds = 0
    let totalUsers  = 0
    let totalErrors = 0
    let skipped     = 0

    console.log(dryRun ? "[DRY RUN — no writes]\n" : "")

    for await (const doc of cursor) {
        const guildId = doc._id
        const usersMap = doc.users || {}
        const userCount = Object.keys(usersMap).length

        if (userCount === 0) {
            skipped++
            continue
        }

        if (!dryRun) {
            // Quick resume check: if count already matches, skip
            const existing = await countForGuild(guildId)
            if (existing >= userCount) {
                console.log(`[SKIP]  guild=${guildId}  users=${userCount}  (already synced: ${existing} docs)`)
                skipped++
                totalGuilds++
                continue
            }

            const { inserted, errors } = await bulkUpsertUsers(guildId, usersMap, BATCH_SIZE)
            totalUsers  += inserted
            totalErrors += errors
            console.log(`[OK]    guild=${guildId}  inserted=${inserted}  errors=${errors}`)
        } else {
            console.log(`[DRY]   guild=${guildId}  users=${userCount}`)
            totalUsers += userCount
        }

        totalGuilds++
        await sleep(PAUSE_MS)
    }

    console.log(`\n──────────────────────────────────────────`)
    console.log(`Guilds processed : ${totalGuilds}`)
    console.log(`Guilds skipped   : ${skipped}`)
    console.log(`Users upserted   : ${totalUsers}`)
    if (totalErrors > 0) console.log(`Errors           : ${totalErrors}  ← check logs`)
    console.log(`──────────────────────────────────────────\n`)

    await mongoose.disconnect()
    console.log("Done.")
}

main().catch(e => {
    console.error("Backfill failed:", e)
    process.exit(1)
})
