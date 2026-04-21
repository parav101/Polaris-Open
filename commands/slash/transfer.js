const Discord = require('discord.js');

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

    // Fetch both users' data concurrently
    const [senderDb, recipientDb] = await Promise.all([
      tools.fetchSettings(sender.id, int.guild.id),
      tools.fetchSettings(recipient.id, int.guild.id)
    ]);

    if (!senderDb) {
      return tools.warn('*noData');
    }

    const senderUserData = senderDb.users[sender.id] || { credits: 0 };
    const senderCredits = senderUserData.credits || 0;

    if (senderCredits < totalDeduction) {
      return tools.warn(`Insufficient credits! You only have ${tools.commafy(senderCredits)} credits.`);
    }

    const recipientUserData = recipientDb.users[recipient.id] || { credits: 0 };
    const recipientCredits = recipientUserData.credits || 0;

    // Update both sender and recipient in a single query
    const newSenderCredits = senderCredits - totalDeduction;
    const newRecipientCredits = recipientCredits + netAmount;

    await client.db.update(int.guild.id, {
      $set: { 
        [`users.${sender.id}.credits`]: newSenderCredits,
        [`users.${recipient.id}.credits`]: newRecipientCredits 
      }
    }).exec();

    // Log credit transactions concurrently in the background
    Promise.all([
      tools.addCreditLog(client.db, int.guild.id, sender.id, {
        type: "transfer_out",
        amount: -totalDeduction,
        balance: newSenderCredits,
        note: `Sent ${tools.commafy(totalDeduction)} credits to ${recipient.displayName} (20% tax: ${tools.commafy(tax)})`
      }),
      tools.addCreditLog(client.db, int.guild.id, recipient.id, {
        type: "transfer_in",
        amount: netAmount,
        balance: newRecipientCredits,
        note: `Received ${tools.commafy(netAmount)} credits from ${sender.displayName}`
      })
    ]).catch(err => console.error("Transfer DB log err:", err));

    // Send confirmation embed
    const embed = new Discord.EmbedBuilder()
      .setTitle('💸 Credit Transfer')
      .setDescription(`Transfer successful!`)
      .setColor(0x00ff80)
      .addFields(
        { name: '📤 Sender', value: `${sender.displayName}`, inline: true },
        { name: '📥 Recipient', value: `${recipient.displayName}`, inline: true },
        { name: '💰 Amount Sent', value: `${tools.commafy(totalDeduction)} credits`, inline: false },
        { name: '💈 Tax Deducted (20%)', value: `${tools.commafy(tax)} credits`, inline: true },
        { name: '💵 Net Received', value: `${tools.commafy(netAmount)} credits`, inline: true },
        { name: '📊 New Balances', value: `${sender.displayName}: ${tools.commafy(newSenderCredits)}\n${recipient.displayName}: ${tools.commafy(newRecipientCredits)}`, inline: false }
      )
      .setTimestamp();

    await int.editReply({ embeds:[embed] });
  }
};