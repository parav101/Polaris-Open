const Discord = require('discord.js');

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

    // Using the corrected math from before (20% tax)
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
      return tools.warn(`*noData for sender ${sender.displayName}`);
    }

    const senderUserData = senderDb.users[sender.id] || { credits: 0 };
    const senderCredits = senderUserData.credits || 0;

    // Make sure the forced sender actually has enough money
    if (senderCredits < totalDeduction) {
      return tools.warn(`Insufficient credits! ${sender.displayName} only has ${tools.commafy(senderCredits)} credits.`);
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
      },
      $inc: { "info.taxCollected": tax }
    }).exec();

    // Log credit transactions concurrently in the background
    Promise.all([
      tools.addCreditLog(client.db, int.guild.id, sender.id, {
        type: "transfer_out",
        amount: -totalDeduction,
        balance: newSenderCredits,
        note: `Admin forced transfer to ${recipient.displayName} by ${int.member.displayName}`
      }),
      tools.addCreditLog(client.db, int.guild.id, recipient.id, {
        type: "transfer_in",
        amount: netAmount,
        balance: newRecipientCredits,
        note: `Admin forced transfer from ${sender.displayName} by ${int.member.displayName}`
      })
    ]).catch(err => console.error("AdminTransfer DB log err:", err));

    // Send confirmation embed
    const embed = new Discord.EmbedBuilder()
      .setTitle('🛡️ Admin Forced Transfer')
      .setDescription(`Transfer successful! Executed by Admin: ${int.member.displayName}`)
      .setColor(0xff3333) // Red color to indicate an admin action
      .addFields(
        { name: '📤 Sender', value: `${sender.displayName}`, inline: true },
        { name: '📥 Recipient', value: `${recipient.displayName}`, inline: true },
        { name: '💰 Amount Taken', value: `${tools.commafy(totalDeduction)} credits`, inline: false },
        { name: '💈 Tax Deducted (20%)', value: `${tools.commafy(tax)} credits`, inline: true },
        { name: '💵 Net Received', value: `${tools.commafy(netAmount)} credits`, inline: true },
        { name: '📊 New Balances', value: `${sender.displayName}: ${tools.commafy(newSenderCredits)}\n${recipient.displayName}: ${tools.commafy(newRecipientCredits)}`, inline: false }
      )
      .setTimestamp();

    await int.reply({ embeds: [embed] });
  }
};