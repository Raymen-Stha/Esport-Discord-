const { EmbedBuilder } = require('discord.js');

// --- CONFIGURATION ---
const MOD_LOG_ID = '1515569938583126076';
// Convert to Set for O(1) lookup
const STAFF_ROLE_IDS = new Set(['1298101273027153992', '1298099720572375131']);

// Use regex with word boundaries \b to avoid false positives (e.g. "assessment" matching "ass")
const BAD_WORDS_REGEX = /\b(fuck|shit|bitch|asshole|motherfucker|bastard|cunt|nigga|nigger)\b/i;

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        // 1. Ignore Bots
        if (message.author.bot) return;

        // 2. Ignore Staff (Fix: Check if any of the member's roles intersect with the Set)
        if (message.member?.roles.cache.some(role => STAFF_ROLE_IDS.has(role.id))) return;

        // 3. Check for Bad Words using Regex
        const content = message.content;
        const match = content.match(BAD_WORDS_REGEX);

        if (match) {
            const foundWord = match[1].toLowerCase();

            // 4. Delete the Message
            await message.delete().catch(() => null);

            // 5. Send Log to Mod Channel
            const logChannel = message.guild.channels.cache.get(MOD_LOG_ID);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('🚫 Profanity Detected')
                    .setDescription(`**User:** ${message.author.tag} (${message.author.id})
                    **Channel:** ${message.channel}
                    **Offending Word:** ||${foundWord}||`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                await logChannel.send({ embeds: [embed] });
            }

            // 6. Send Warning to User
            await message.channel.send(`❌ ${message.author}, please keep the language appropriate.`)
                .then(msg => setTimeout(() => msg.delete().catch(() => null), 5000));
        }
    });
};