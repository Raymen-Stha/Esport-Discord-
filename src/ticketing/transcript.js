const discordTranscripts = require('discord-html-transcripts');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTicket, deleteTicketData } = require('./db.js');

async function generateTranscript(interaction) {
    const TRANSCRIPT_LOG_CHANNEL = '1515570035903434774';

    try {
        // 1. Acknowledge the staff member
        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.channel;

        // 2. Fetch ticket info from our JSON DB
        const ticketData = await getTicket(channel.id);

        // 3. Generate the HTML Transcript
        const attachment = await discordTranscripts.createTranscript(channel, {
            limit: -1,
            fileName: `transcript-${channel.name}.html`,
            saveImages: true
        });

        // 4. Send transcript to the Log Channel
        const logChannel = await interaction.client.channels.fetch(TRANSCRIPT_LOG_CHANNEL).catch(() => null);
        if (!logChannel) {
            return interaction.editReply({ content: "❌ Error: Could not find the transcript log channel." });
        }

        const logMsg = await logChannel.send({
            content: `📑 **Ticket Transcript**\n**Channel:** \`#${channel.name}\`\n**Closed By:** ${interaction.user.tag}`,
            files: [attachment]
        });

        // 5. DM the user who opened the ticket (if they are in the DB)
        if (ticketData && ticketData.userId) {
            const downloadUrl = logMsg.attachments.first()?.url;

            if (downloadUrl) {
                const downloadRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Download My Transcript')
                        .setURL(downloadUrl)
                        .setStyle(ButtonStyle.Link)
                        .setEmoji('📥')
                );

                const dmEmbed = new EmbedBuilder()
                    .setTitle('📑 Ticket Transcript Ready')
                    .setDescription(`Your ticket **#${channel.name}** has been closed. You can download a copy of the conversation below.`)
                    .setColor(0x00AE86)
                    .setTimestamp();

                const member = await interaction.guild.members.fetch(ticketData.userId).catch(() => null);
                if (member) {
                    await member.send({
                        embeds: [dmEmbed],
                        components: [downloadRow]
                    }).catch(() => console.log(`Could not DM user ${ticketData.userId}. DMs are likely locked.`));
                }
            }
        }

        // 6. Final staff notification and DB cleanup
        await interaction.editReply({
            content: '✅ Transcript logged and DM attempted. The database entry will be cleared and channel deleted in 5 seconds.'
        });

        setTimeout(async () => {
            // Delete the entry from tickets.json
            await deleteTicketData(channel.id);
            // Delete the channel from Discord
            await channel.delete().catch(() => null);
        }, 5000);

    } catch (error) {
        console.error("Critical Transcript Error:", error);
        if (interaction.deferred) {
            await interaction.editReply({ content: "❌ Something went wrong during transcript generation." });
        }
    }
}

module.exports = { generateTranscript };