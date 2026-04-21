const COIN_FLIP_EMOJI = "<a:coinflip:1496185990572802078>"
const LOADING_EMOJI = "<a:loading:1478025535975325738>"
const MONEY_BAG_EMOJI = "<a:moneybaganimted:1496185992967749863>"

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

        let result = Math.random() < 0.5 ? 'heads' : 'tails'
        let isWin = result === choice

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

            finalMessage = `It's **${result}**! You won **${tools.commafy(netWinnings)}** credits (20% tax: ${tools.commafy(tax)}). Balance: **${tools.commafy(newCredits)}** ${MONEY_BAG_EMOJI}`
        } else {
            newCredits -= bet;
            logAmount = -bet;
            logNote = `Coinflip Loss (${bet} bet)`;

            finalMessage = `It's **${result}**! You lost your bet of **${tools.commafy(bet)}**. Balance: **${tools.commafy(newCredits)}** ${MONEY_BAG_EMOJI}`
        }

        Promise.all([
            client.db.update(int.guild.id, { 
                $set: { [`users.${int.user.id}.credits`]: newCredits } 
            }).exec(),
            tools.addCreditLog(client.db, int.guild.id, int.user.id, {
                type: "coinflip", 
                amount: logAmount, 
                balance: newCredits,
                note: logNote
            })
        ]).catch(console.error);

        await int.editReply({ content: `${COIN_FLIP_EMOJI} Flipping the coin... ${LOADING_EMOJI}` })

        await new Promise(resolve => setTimeout(resolve, 2000))

        await int.editReply({ content: finalMessage })
    }
}