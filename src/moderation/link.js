const { EmbedBuilder } = require('discord.js');

// --- CONFIGURATION ---
const MOD_LOG_ID = '1515569938583126076';
const ADMIN_ROLE_IDS = new Set(['1298101273027153992', '1298099720572375131', '1399599012906012756']);

// IDs of channels where ALL links are allowed
const IGNORED_CHANNELS = new Set([
    '1515579001543065660',
    '1515579091468685435',
    '1536863750718623838'
]);

// Whitelisted links that ANYONE can send anywhere
const ALLOWED_LINKS = new Set([
    'scu.edu.au',
    'tenor.com',
    'giphy.com',
    'discord.com',
    'klipy.com'
]);

// Pre-compiled regex
const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

module.exports = (client) => {
    client.on('messageCreate', async (message) => {

        // 1. Basic checks: Ignore bots and ignore whitelisted channels
        if (message.author.bot || IGNORED_CHANNELS.has(message.channel.id)) return;

        // 2. Check for link
        const linksFound = message.content.match(URL_REGEX);

        // If there are links in the message, evaluate them
        if (linksFound && linksFound.length > 0) {

            // 3. Hierarchy Check: Let admins post any links freely
            const isAnAdmin = message.member?.roles.cache.some(role => ADMIN_ROLE_IDS.has(role.id));
            if (isAnAdmin) return;

            // 4. Whitelist Domain Check
            // Check if EVERY link found in the message matches at least one whitelisted domain
            const allLinksAllowed = linksFound.every(link => {
                try {
                    // Normalize the URL string to extract the host domain name safely
                    const urlInstance = new URL(link.toLowerCase());
                    const host = urlInstance.hostname; // e.g., "www.youtube.com" or "scu.edu.au"

                    // Verify if the extracted domain contains or matches your allowed items
                    for (const allowedDomain of ALLOWED_LINKS) {
                        if (host === allowedDomain || host.endsWith('.' + allowedDomain)) {
                            return true;
                        }
                    }
                    return false;
                } catch (e) {
                    // Fallback basic text match if URL parsing hits an edge case
                    for (const allowedDomain of ALLOWED_LINKS) {
                        if (link.toLowerCase().includes(allowedDomain)) return true;
                    }
                    return false;
                }
            });

            // If all links in the message belong to the whitelist, let it pass!
            if (allLinksAllowed) return;

            // 5. Create the Log Embed (Triggered if any link was unauthorized)
            const linkEmbed = new EmbedBuilder()
                .setTitle('🔗 Link Deleted')
                .setDescription(
                    `**User:** ${message.author} (${message.author.id})\n` +
                    `**Channel:** ${message.channel} (${message.channel.id})\n\n` +
                    `**Content:**\n${message.content}`
                )
                .setColor(16711680) // Red
                .setTimestamp();

            // 6. Send to Mod Log
            const modLogChannel = message.guild.channels.cache.get(MOD_LOG_ID);
            if (modLogChannel) {
                modLogChannel.send({
                    content: `⚠️ **Moderation Action:** Unauthorized link removed from ${message.author}`,
                    embeds: [linkEmbed]
                });
            }

            // 7. Delete the message and send a disappearing warning
            try {
                await message.delete();

                const warning = await message.channel.send({
                    content: `⚠️ ${message.author}, links are not allowed in this channel! Only approved academic/resource links are permitted.`
                });

                // Delete the warning after 5 seconds
                setTimeout(() => {
                    warning.delete().catch(err => console.log("Warning already deleted or missing."));
                }, 5000);

            } catch (error) {
                if (error.code === 50013) {
                    console.error('❌ Bot lacks "Manage Messages" permission to delete the link!');
                } else {
                    console.error('Error in link moderation:', error);
                }
            }
        }
    });
};