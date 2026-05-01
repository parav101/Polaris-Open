const COIN_FLIP_EMOJI = "<a:coinflip:1496185990572802078>"
const LOADING_EMOJI = "<a:loading:1478025535975325738>"
const MONEY_BAG_EMOJI = "<a:moneybaganimted:1496185992967749863>"
const { ensureDailyQuests, tickQuest, getTodayKey } = require("../../classes/Quests.js")

module.exports = {
    metadata: {
        name: "coinflip",
        description: "Bet credits on a coin flip (Heads or Tails)",
        args: [
            { type: 'integer', name: 'bet', description: 'Amount of credits to bet (minimum 10)', min: 10, required: true },
            { type: 'string', name: 'choice', description: 'Choose heads or tails', required: true, choices: [ { name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' } ] }
        ]
    },
    async run(client, int, tools) {
        await int.deferReply();
        
        let db = await tools.fetchSettings(int.user.id)

        if (!db.settings.coinflip?.enabled) return tools.warn("*commandDisabled")

        let bet = int.options.getInteger("bet")
        let choice = int.options.getString("choice") // 'heads' or 'tails'

        let userData = db.users[int.user.id] || { credits: 0 }
        let currentCredits = userData.credits || 0

        if (currentCredits < bet) {
            return int.editReply({ content: `You don't have enough credits! You need **${tools.commafy(bet - currentCredits)}** more.` })
        }

        let currentStreak = userData.coinflipStreak || 0;

        let winProb = 0.5;
        if (currentCredits >= 100) {
            winProb = Math.max(0.40, 0.5 - (currentStreak * 0.03));
        }
        
        let isWin = Math.random() < winProb;
        let result = isWin ? choice : (choice === 'heads' ? 'tails' : 'heads');

        let finalMessage = ""
        let newCredits = currentCredits
        let logAmount = 0
        let logNote = ""

        if (isWin) {
            let taxRate = 0.2;
            let tax = Math.round(bet * taxRate);
            let netWinnings = bet - tax;
            
            newCredits += netWinnings;
            logAmount = netWinnings;
            logNote = `Coinflip Win (${bet} bet)`;
            
            currentStreak++;

            finalMessage = `It's **${result}**! You won **${tools.commafy(netWinnings)}** credits (20% tax: ${tools.commafy(tax)}). Balance: **${tools.commafy(newCredits)}** ${MONEY_BAG_EMOJI}\n<a:Checkin:1313833525094518846> **Current Streak:** ${currentStreak}`
        } else {
            newCredits -= bet;
            logAmount = -bet;
            logNote = `Coinflip Loss (${bet} bet)`;
            
            currentStreak = 0;

            finalMessage = `It's **${result}**! You lost your bet of **${tools.commafy(bet)}**. Balance: **${tools.commafy(newCredits)}** ${MONEY_BAG_EMOJI}`
        }

        let updateQuery = { 
            $set: { 
                [`users.${int.user.id}.credits`]: newCredits,
                [`users.${int.user.id}.coinflipStreak`]: currentStreak
            } 
        };
        
        if (!updateQuery.$inc) updateQuery.$inc = {};
        
        if (isWin) {
            updateQuery.$inc["info.taxCollected"] = Math.round(bet * 0.2);
        }

        // Tick coinflip quests
        if (db.settings.quests?.enabled) {
            ensureDailyQuests(userData, db.settings, getTodayKey())
            tickQuest(userData, "coinflipBet", { amount: bet })
            if (isWin) {
                tickQuest(userData, "coinflipWin")
                tickQuest(userData, "coinflipWinStreak", { streak: currentStreak })
            }
            updateQuery.$set[`users.${int.user.id}.quests`] = userData.quests
        }

        Promise.all([
            client.db.update(int.guild.id, updateQuery).exec(),
            tools.addCreditLog(client.db, int.guild.id, int.user.id, {
                type: "coinflip", 
                amount: logAmount, 
                balance: newCredits,
                note: logNote
            }, 5, userData.creditLogs || [])
        ]).catch(console.error);

        await int.editReply({ content: `${COIN_FLIP_EMOJI} Flipping the coin... ${LOADING_EMOJI}` })

        await new Promise(resolve => setTimeout(resolve, 2000))

        await int.editReply({ content: finalMessage })
    }
}