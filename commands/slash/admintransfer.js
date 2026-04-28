module.exports = {
  metadata: {
    permission: 'ManageGuild', // Restricts this command to Admins/Moderators
    name: 'admintransfer',
    description: 'Admin command to force transfer credits between two members',
    args:[
      { type: 'user', name: 'sender', description: 'The member to take credits from', required: true },
      { type: 'user', name: 'recipient', description: 'The member to give credits to', required: true },
      { type: 'integer', name: 'amount', description: 'Amount to transfer', min: 1, required: true }
    ]
  },

  async run(client, int, tools) {
    // The sender is chosen from the command options, NOT the person typing the command
    const sender = int.options.get('sender')?.member;
    const recipient = int.options.get('recipient')?.member;
    const amount = int.options.get('amount')?.value;

    if (!sender || !recipient || !amount) {
      return tools.warn('Invalid arguments provided');
    }

    if (sender.id === recipient.id) {
      return tools.warn('Cannot transfer to the same person.');
    }

    if (sender.user.bot) {
      return tools.warn('Cannot take credits from a bot');
    }

    if (recipient.user.bot) {
      return tools.warn('Cannot transfer to a bot');
    }

    if (!int.deferred && !int.replied) {
      await int.deferReply();
    }

    // Using the corrected math from before (20% tax)
    const taxRate = 0.2; 
    const tax = Math.round(amount * taxRate);
    const netAmount = amount - tax;
    const totalDeduction = amount; 

    // Fetch only the fields this command needs in one read.
    let db = await client.db.fetch(int.guild.id, [
      `users.${sender.id}`,
      `users.${recipient.id}`
    ]);
    if (!db) {
      await client.db.create({ _id: int.guild.id });
      db = { users: {} };
    }
    if (!db.users) db.users = {};

    const senderUserData = db.users[sender.id] || { credits: 0 };
    const senderCredits = senderUserData.credits || 0;

    // Make sure the forced sender actually has enough money
    if (senderCredits < totalDeduction) {
      return tools.warn(`Insufficient credits! ${sender.displayName} only has ${tools.commafy(senderCredits)} credits.`);
    }

    const recipientUserData = db.users[recipient.id] || { credits: 0 };
    const recipientCredits = recipientUserData.credits || 0;

    // Update both sender and recipient in a single query
    const newSenderCredits = senderCredits - totalDeduction;
    const newRecipientCredits = recipientCredits + netAmount;

    const now = Date.now();
    const senderLogs = [
      ...(senderUserData.creditLogs || []),
      {
        type: "transfer_out",
        amount: -totalDeduction,
        balance: newSenderCredits,
        note: `Admin forced transfer to ${recipient.displayName} by ${int.member.displayName}`,
        ts: now
      }
    ].slice(-5);
    const recipientLogs = [
      ...(recipientUserData.creditLogs || []),
      {
        type: "transfer_in",
        amount: netAmount,
        balance: newRecipientCredits,
        note: `Admin forced transfer from ${sender.displayName} by ${int.member.displayName}`,
        ts: now
      }
    ].slice(-5);

    await client.db.update(int.guild.id, {
      $set: { 
        [`users.${sender.id}.credits`]: newSenderCredits,
        [`users.${recipient.id}.credits`]: newRecipientCredits,
        [`users.${sender.id}.creditLogs`]: senderLogs,
        [`users.${recipient.id}.creditLogs`]: recipientLogs
      },
      $inc: { "info.taxCollected": tax }
    }).select("_id").lean().exec();

    await int.editReply({
      content: `🛡️ ${int.member} forced a transfer: ${sender} sent **${tools.commafy(totalDeduction)}** credits to ${recipient} | tax: **${tools.commafy(tax)}** | received: **${tools.commafy(netAmount)}**`
    });
  }
};