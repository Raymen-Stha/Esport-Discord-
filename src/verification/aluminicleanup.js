const cron = require('node-cron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

// Reference the DB relative to this file
const verifiedDbPath = path.join(__dirname, 'verified_users.json');
const STUDENT_ROLE_ID = '1489833287927988316';
const ALUMNI_ROLE_ID = '1489833325462818836';

// Helper delay function
const delay = ms => new Promise(res => setTimeout(res, ms));

// --- THE CORE LOGIC FUNCTION ---
async function runCleanupLogic(guild) {
    try {
        await fsp.access(verifiedDbPath);
    } catch {
        return 0; // File does not exist
    }

    const rawData = await fsp.readFile(verifiedDbPath, 'utf8');
    const db = JSON.parse(rawData);
    const currentYear = new Date().getFullYear();
    let count = 0;

    for (const [userId, userData] of Object.entries(db)) {
        // Ensure userData is an object and has gradYear
        if (userData && userData.gradYear && userData.gradYear < currentYear) {
            const member = await guild.members.fetch(userId).catch(() => null);

            // Check if they have the student role to swap it
            if (member && member.roles.cache.has(STUDENT_ROLE_ID)) {
                try {
                    // Batch role removal and addition
                    await member.roles.remove(STUDENT_ROLE_ID);
                    await member.roles.add(ALUMNI_ROLE_ID);
                    count++;
                    console.log(`✅ Moved ${member.user.tag} to Alumni (Class of ${userData.gradYear}).`);
                    
                    // Rate limit role updates to avoid Discord API 429s (max 5/sec -> 200ms delay)
                    await delay(250);
                } catch (roleErr) {
                    console.error(`Failed to update roles for ${userId}:`, roleErr);
                }
            }
        }
    }
    return count;
}

// --- THE CRON JOB ---
module.exports = (client) => {
    cron.schedule('1 0 1 1 *', async () => {
        console.log('🎓 Running Annual Alumni Role Update...');
        try {
            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            if (!guild) {
                console.error("Alumni Cron Error: Could not find Guild. Check your GUILD_ID in .env");
                return;
            }
            const updated = await runCleanupLogic(guild);
            console.log(`🏁 Annual Alumni Role Update complete. ${updated} members moved.`);
        } catch (error) {
            console.error('Alumni Cron Error:', error);
        }
    }, {
        scheduled: true,
        timezone: "Australia/Sydney"
    });
};

// --- EXPORT THE FUNCTION FOR THE TEST FILE ---
module.exports.runCleanupLogic = runCleanupLogic;