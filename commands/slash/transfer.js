const { ensureDailyQuests, tickQuest, getTodayKey } = require("../../classes/Quests.js")

module.exports = {
  metadata: {
    name: 'transfer',
    description: 'Transfer credits between members (20% tax is deducted from the amount)',
    args:[
      { type: 'user', name: 'recipient', description: 'Recipient member', required: true },
      { type: 'integer', name: 'amount', description: 'Amount to transfer', min: 1, required: true }
    ]
  },

  async run(client, int, tools) {
    if (!int.deferred && !int.replied) {
      await int.deferReply();
    }

    const sender = int.member;
    const recipient = int.options.get('recipient')?.member;
    const amount = int.options.get('amount')?.value;

    if (!recipient || !amount) {
      return tools.warn('Invalid arguments provided');
    }

    if (sender.id === recipient.id) {
      return tools.warn('Cannot transfer to yourself');
    }
    
    if (recipient.user.bot) {
      return tools.warn('Cannot transfer to a bot');
    }

    // Fixed Math: 20% tax taken out of the transferred amount
    const taxRate = 0.2; 
    const tax = Math.round(amount * taxRate);
    const netAmount = amount - tax;
    const totalDeduction = amount; 

    // Fetch only the fields this command needs in one read.
    let db = await client.db.fetch(int.guild.id, [
      "settings",
      `users.${sender.id}`,
      `users.${recipient.id}`
    ]);
    if (!db) {
      await client.db.create({ _id: int.guild.id });
      db = { settings: {}, users: {} };
    }
    if (!db.users) db.users = {};

    const senderUserData = db.users[sender.id] || { credits: 0 };
    const senderCredits = senderUserData.credits || 0;

    if (senderCredits < totalDeduction) {
      return tools.warn(`Insufficient credits! You only have ${tools.commafy(senderCredits)} credits.`);
    }

    const recipientUserData = db.users[recipient.id] || { credits: 0 };
    const recipientCredits = recipientUserData.credits || 0;

    // Update both sender and recipient in a single query
    const newSenderCredits = senderCredits - totalDeduction;
    const newRecipientCredits = recipientCredits + netAmount;

    // Tick transferOut quest for sender
    const transferQuestSet = {}
    if (db.settings?.quests?.enabled) {
        ensureDailyQuests(senderUserData, db.settings, getTodayKey())
        tickQuest(senderUserData, "transferOut")
        transferQuestSet[`users.${sender.id}.quests`] = senderUserData.quests
    }

    const now = Date.now();
    const senderLogs = [
      ...(senderUserData.creditLogs || []),
      {
        type: "transfer_out",
        amount: -totalDeduction,
        balance: newSenderCredits,
        note: `Sent ${tools.commafy(totalDeduction)} credits to ${recipient.displayName} (20% tax: ${tools.commafy(tax)})`,
        ts: now
      }
    ].slice(-5);
    const recipientLogs = [
      ...(recipientUserData.creditLogs || []),
      {
        type: "transfer_in",
        amount: netAmount,
        balance: newRecipientCredits,
        note: `Received ${tools.commafy(netAmount)} credits from ${sender.displayName}`,
        ts: now
      }
    ].slice(-5);

    await client.db.update(int.guild.id, {
      $set: { 
        [`users.${sender.id}.credits`]: newSenderCredits,
        [`users.${recipient.id}.credits`]: newRecipientCredits,
        [`users.${sender.id}.creditLogs`]: senderLogs,
        [`users.${recipient.id}.creditLogs`]: recipientLogs,
        ...transferQuestSet
      },
      $inc: { "info.taxCollected": tax }
    }).select("_id").lean().exec();

    await int.editReply({
      content: `💸 ${sender} transferred **${tools.commafy(totalDeduction)}** credits to ${recipient} | tax: **${tools.commafy(tax)}** | received: **${tools.commafy(netAmount)}**`
    });
  }
};