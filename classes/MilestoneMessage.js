const Tools = require('./Tools.js');
const tools = Tools.global;

class MilestoneMessage {
    constructor(member, newRank, prevRank, users) {
        this.member = member;
        this.newRank = newRank;
        this.prevRank = prevRank;
        this.users = users;
        
        // Define milestone thresholds
        this.milestones = [
            { position: 1, name: 'NUMBER ONE' },
            { position: 3, name: 'TOP 3' },
            { position: 10, name: 'TOP 10' },
            { position: 25, name: 'TOP 25' },
            { position: 50, name: 'TOP 50' },
            { position: 100, name: 'TOP 100' }
        ];
        
        this.milestone = this.checkMilestone();
        this.shouldSend = !!this.milestone;
    }
    
    checkMilestone() {
        // Handle the case when there's no previous rank (first time ranking)
        if (this.prevRank === null) {
            // Find the highest milestone the user qualifies for on first ranking
            for (const milestone of this.milestones) {
                if (this.newRank <= milestone.position) {
                    return milestone;
                }
            }
            return null;
        }
        
        // Only proceed if the new rank is better than previous rank
        if (this.newRank >= this.prevRank) {
            return null;
        }
        
        // Find the highest milestone achieved
        for (const milestone of this.milestones) {
            if (this.newRank <= milestone.position && this.prevRank > milestone.position) {
                return milestone;
            }
        }
        
        return null;
    }
    
    getRandomMessage() {
        const messages = {
            'NUMBER ONE': [
                "<a:Checkin:1313833525094518846> {{user}} has claimed the #1 spot! An incredible achievement!",
                "<a:Checkin:1313833525094518846> All hail {{user}}, our new #1! Your dedication sets you apart.",
                "<a:Checkin:1313833525094518846> {{user}} has reached the top! Enjoy the view from #1!"
            ],
            'TOP 3': [
                "<a:Checkin:1313833525094518846> {{user}} has broken into the top 3! Few ever reach these heights!",
                "<a:Checkin:1313833525094518846> {{user}} has joined the exclusive top 3 club! Outstanding work!",
                "<a:Checkin:1313833525094518846> {{user}} has skyrocketed into the top 3! The competition better watch out!"
            ],
            'TOP 10': [
                "<a:Checkin:1313833525094518846> {{user}} has blasted into the top 10! Everyone's taking notice!",
                "<a:Checkin:1313833525094518846> {{user}} has joined the elite top 10! Impressive milestone!",
                "<a:Checkin:1313833525094518846> {{user}} has entered the top 10! You're making waves!"
            ],
            'TOP 25': [
                "<a:Checkin:1313833525094518846> {{user}} has stormed into the top 25! Your persistence is paying off!",
                "<a:Checkin:1313833525094518846> {{user}} has reached the top 25! Keep climbing higher!",
                "<a:Checkin:1313833525094518846> {{user}} has powered into the top 25! Truly impressive progress!"
            ],
            'TOP 50': [
                "<a:Checkin:1313833525094518846> {{user}} has broken into the top 50! You're among the server's finest!",
                "<a:Checkin:1313833525094518846> {{user}} has reached the top 50! Your growth is phenomenal!",
                "<a:Checkin:1313833525094518846> {{user}} has advanced to the top 50! Keep up the great work!"
            ],
            'TOP 100': [
                "<a:Checkin:1313833525094518846> {{user}} has entered the top 100! The first milestone of many!",
                "<a:Checkin:1313833525094518846> {{user}} has broken into the top 100! A new challenger emerges!",
                "<a:Checkin:1313833525094518846> {{user}} has reached the top 100! Your journey up the ranks begins!"
            ]
        };
        
        const messageList = messages[this.milestone.name] || messages['TOP 100'];
        let message = tools.choose(messageList);
        return message.replace('{{user}}', `<@${this.member.id}>`);
    }
    
    async send(channel) {
        if (!this.shouldSend || !channel) return;
        
        try {
            // Send a simple text message instead of an embed
            const message = this.getRandomMessage();
            await channel.send(message);
            console.log(`Sent milestone message for ${this.member.user.tag} reaching ${this.milestone.name}`);
        } catch (error) {
            console.error('Error sending milestone message:', error);
        }
    }
}

module.exports = MilestoneMessage;
