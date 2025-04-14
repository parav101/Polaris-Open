const Discord = require('discord.js');
const { Client } = require('unb-api');
const botClient = new Client(process.env.UNB_KEY);

module.exports = {
    metadata: {
        name: "xpsteal",
        description: "Use this command if you bought xp stealer from the shop.",
        args: [
            { type: "user", name: "member", description: "Which member to steal xp from", required: true },
        ]
    },
    
    async run(client, int, tools) {
        await int.deferReply(); // Defer the reply to avoid interaction expiration

        const member = int.options.get("member")?.member;
        const targetUser = member?.user;
        if (!targetUser) return int.editReply("I couldn't find that member!");
        if(targetUser === int.user) return int.editReply("You can't steal XP from yourself!");
        
        const author = int.user;
        const db = await tools.fetchSettings(author.id);

        if (!db?.settings?.enabled || !db.settings.xpSteal?.enabled) {
            return int.editReply("XP stealing is disabled!");
        }

        const immuneRoles = db.settings.xpSteal.immuneRoles || [];
        if (member.roles.cache.some(role => immuneRoles.some(immuneRole => immuneRole.id === role.id))) {
            return int.editReply("You cannot steal XP from this user because they have immunity at this moment try someone else.");
        }

        const wholeDB = await tools.fetchAll(int.guild.id);
        const userRank = tools.getRank(author.id, wholeDB.users);
        const targetRank = tools.getRank(targetUser.id, wholeDB.users);

        if (Math.abs(targetRank - userRank) > db.settings.xpSteal.range) {
            return int.editReply(`Can't steal from this user. Rank difference is ${Math.abs(targetRank - userRank)}, max allowed is ${db.settings.xpSteal.range}!`);
        }

        // Check if the user has the required item
        let inventoryItem;
        try {
            inventoryItem = await botClient.getInventoryItem(int.guild.id, author.id, db.settings.xpSteal.itemId);
        } catch (error) {
            if (error.response?.status === 404) {
                return int.editReply("The XP stealer item could not be found in your inventory. Please ensure you have purchased it.");
            }
            throw error; // Re-throw unexpected errors
        }

        if (!inventoryItem) return int.editReply("You don't have the XP stealer item!");

        // Calculate random XP to steal
        const randomXp = tools.rng(db.settings.xpSteal.xpMin, db.settings.xpSteal.xpMax);

        // Fetch user data
        const targetUserData = wholeDB.users[targetUser.id] || { xp: 0, cooldown: 0, voiceTime: 0 };
        const userData = wholeDB.users[author.id] || { xp: 0, cooldown: 0, voiceTime: 0 };

        // Adjust XP values
        targetUserData.xp = Math.max(0, targetUserData.xp - randomXp);
        userData.xp += randomXp;

        // Update the database
        await client.db.update(int.guild.id, {
            $set: {
                [`users.${targetUser.id}`]: targetUserData,
                [`users.${author.id}`]: userData
            }
        }).exec();

        // Remove the item from the user's inventory
        await botClient.removeInventoryItem(int.guild.id, author.id, db.settings.xpSteal.itemId, 1);

        // Send success message
        int.editReply(`You have successfully stolen ${randomXp} XP from ${targetUser}!`);
    }
};