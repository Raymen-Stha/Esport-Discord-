const { PermissionFlagsBits } = require('discord.js');

let isRunning = false;
// Use Set for O(1) lookup
const NEW_ROLE_IDS = new Set([
    '1515573751935275179',
    '1515573843442274535',
    '1515575096591519754',
    '1526755702775742645'
]);

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (
            message.author.bot ||
            !message.guild ||
            message.content.toLowerCase() !== '!resetroles'
        ) return;

        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ You must be an Administrator to use this command.');
        }

        if (isRunning) {
            return message.reply('⚠️ A role update is already running.');
        }

        isRunning = true;

        const statusMessage = await message.reply('⏳ Loading members...');

        try {

            // Only fetch if cache isn't complete
            if (message.guild.members.cache.size < message.guild.memberCount) {
                await message.guild.members.fetch();
            }

            const members = [...message.guild.members.cache.values()];

            let updated = 0;
            let skipped = 0;
            let failed = 0;

            await statusMessage.edit(
                `🚀 Starting...\nTotal Members: ${members.length}`
            );

            for (let i = 0; i < members.length; i++) {

                const member = members[i];

                if (member.user.bot) continue;

                try {
                    // Use Set.has instead of Array.includes
                    const missingRoles = Array.from(NEW_ROLE_IDS).filter(
                        roleId =>
                            !member.roles.cache.has(roleId) &&
                            message.guild.roles.cache.has(roleId)
                    );

                    if (missingRoles.length === 0) {
                        skipped++;
                    } else {
                        // Batch add
                        await member.roles.add(missingRoles);
                        updated++;
                    }

                } catch (err) {
                    console.log(`Failed: ${member.user.tag}`);
                    console.error(err);
                    failed++;
                }

                if ((i + 1) % 10 === 0 || i === members.length - 1) {
                    await statusMessage.edit(
                        `⚙️ Processing ${i + 1}/${members.length}\n\n` +
                        `✅ Updated: ${updated}\n` +
                        `⏭️ Already Had Roles: ${skipped}\n` +
                        `❌ Failed: ${failed}`
                    ).catch(() => { });
                }

                // Prevent REST rate limits
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            await statusMessage.edit(
                `🎉 **Finished!**\n\n` +
                `✅ Updated: ${updated}\n` +
                `⏭️ Already Had Roles: ${skipped}\n` +
                `❌ Failed: ${failed}`
            );

        } catch (err) {
            console.error(err);
            await statusMessage.edit('❌ An error occurred. Check the console.');
        } finally {
            isRunning = false;
        }
    });
};