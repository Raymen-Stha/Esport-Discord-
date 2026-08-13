const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
    client.on('guildMemberAdd', async (member) => {
        // --- CONFIGURATION ---
        const WELCOME_CHANNEL_ID = '1515577397183774730';
        const AUTO_ROLE_ID = ['1471270683089572096', '1515575096591519754', '1515573843442274535', '1515573751935275179', '1526755702775742645'];
        const VERIFY_ID = '1515577541707043016';

        // 1. Assign the Role
        // 1. Assign the Roles
        try {
            // Discord.js allows you to pass an array of role IDs directly into member.roles.add()
            await member.roles.add(AUTO_ROLE_ID);
            console.log(`Successfully gave ${AUTO_ROLE_ID.length} auto-roles to ${member.user.username}`);
        } catch (error) {
            console.error('Error assigning auto-roles:', error);
        }

        // 2. Send the Welcome Embed
        const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
        // If the channel isn't found, stop the function to prevent crashing
        if (!welcomeChannel) {
            return console.log(`Could not find welcome channel with ID: ${WELCOME_CHANNEL_ID}`);
        }

        const welcomeEmbed = new EmbedBuilder()
            .setTitle(`Welcome ${member.user.username}`)
            .setDescription(
                `We are delighted to have you on board with an amazing community within the Southern Cross University.\n\n` +
                `Before we can get started, please verify your student email:\n` +
                `<#${VERIFY_ID}> - Verify your student email\n`
            )
            .setColor(16771840)
            .setAuthor({
                name: 'Southern Cross University Esport',
                iconURL: client.user.displayAvatarURL()
            })
            .setThumbnail(member.user.displayAvatarURL({ forceStatic: false, size: 256 }));

        welcomeChannel.send({
            content: `${member}`,
            embeds: [welcomeEmbed]
        });
    });
};                      