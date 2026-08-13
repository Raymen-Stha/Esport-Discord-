const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const sharp = require('sharp'); // Use sharp to resize large images

// Persistent memory map to track users under a strict 5-minute scanning lock
const activeScans = new Map();

// --- CONFIGURATION HOISTING ---
const MOD_LOG_ID = '1523328663561699407';
const TIMEOUT_DURATION = 24 * 60 * 60 * 1000; // 24 Hours
const COOLDOWN_DURATION = 5 * 60 * 1000;      // 5 Minutes Hard Cooldown
const STAFF_ROLE_IDS = new Set(['1298101273027153992', '1298099720572375131', '1399599012906012756']);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `Analyze this image sent in a Discord server. Determine if it contains a scam, phishing attempt, malicious link, crypto fraud, fake Nitro promo, or hijacked account giveaway.\n\nIf the image is completely clean, harmless, or doesn't contain a scam, reply with exactly the word 'SAFE'.\nIf it is a scam or dangerous, reply with a brief one-sentence description explaining the threat.`;
// ------------------------------

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        // 1. Basic checks
        if (message.author.bot) return;

        // 2. Hierarchy Check: Staff bypass
        if (message.member?.roles.cache.some(role => STAFF_ROLE_IDS.has(role.id))) return;

        // 3. Image Filter Check
        const image = message.attachments.find(att => att.contentType?.startsWith('image/'));
        if (!image) return;

        // 🛑 5-MINUTE ANTI-CONCURRENCY LOCK
        const currentTime = Date.now();
        const lastScanTime = activeScans.get(message.author.id);

        if (lastScanTime && (currentTime - lastScanTime < COOLDOWN_DURATION)) {
            console.log(`⏳ Anti-Raid: Ignored image flood from ${message.author.tag}. User locked for 5 minutes.`);
            return;
        }

        // Lock user and set auto-cleanup to prevent memory leaks
        activeScans.set(message.author.id, currentTime);
        setTimeout(() => activeScans.delete(message.author.id), COOLDOWN_DURATION);

        try {
            console.log(`Processing primary attachment (${image.name}) from ${message.author.tag}...`);

            // 4. Download image buffer
            const imgResponse = await fetch(image.url);
            if (!imgResponse.ok) return;

            const arrayBuffer = await imgResponse.arrayBuffer();
            let imageBuffer = Buffer.from(arrayBuffer);

            // Resize image if it's too large (over 1000px) to save API bandwidth & memory
            imageBuffer = await sharp(imageBuffer)
                .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toBuffer();

            // 5. Query Google Gemini AI API directly with a Timeout
            const abortController = new AbortController();
            const timeoutId = setTimeout(() => abortController.abort(), 10000); // 10s timeout

            const apiResponse = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: SYSTEM_PROMPT },
                            {
                                inlineData: {
                                    mimeType: 'image/jpeg',
                                    data: imageBuffer.toString('base64')
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.0,
                        maxOutputTokens: 100
                    }
                })
            });

            clearTimeout(timeoutId);

            const data = await apiResponse.json();
            if (!apiResponse.ok) throw new Error(`Gemini API Error: ${data.error?.message || apiResponse.statusText}`);

            const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            const modLogChannel = message.guild.channels.cache.get(MOD_LOG_ID);

            // 6. Handle SAFE Results
            if (!contentText || contentText.toUpperCase().startsWith("SAFE")) {
                console.log(`✅ Image [${image.name}] verification passed by Gemini Vision.`);

                if (modLogChannel) {
                    const safeEmbed = new EmbedBuilder()
                        .setTitle('✅ Image Scan: SAFE')
                        .setDescription(
                            `**User:** ${message.author} (\`${message.author.id}\`)\n` +
                            `**Channel:** ${message.channel} (\`${message.channel.id}\`)\n\n` +
                            `**Gemini AI Response:**\n\`\`\`\n${contentText}\n\`\`\``
                        )
                        .setColor(65280) // Green
                        .setImage('attachment://scam_evidence.jpg')
                        .setTimestamp();

                    await modLogChannel.send({
                        embeds: [safeEmbed],
                        files: [new AttachmentBuilder(imageBuffer, { name: 'scam_evidence.jpg' })]
                    });
                }
                return;
            }

            // 🚨 Handle MALICIOUS Results (Scam Found)
            console.log(`🚨 Image Vision FLAGGED: ${contentText}`);

            // ⚡ Instant Mitigation: Delete threat message immediately
            await message.delete().catch(() => { });

            // Prepare Action Execution
            const userId = message.author.id;
            const guild = message.guild;
            let timeoutSuccessful = false;

            // DM User Execution
            const sendUserDM = async () => {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle(`⚠️ Action Taken in ${guild.name}`)
                        .setDescription(`Your account has been placed on a **24-hour timeout** for sending a suspected scam or phishing graphic.`)
                        .setColor(16711680) // Red
                        .addFields({ name: 'Reason Identified by Gemini AI', value: `\`\`\`${contentText}\`\`\``, inline: false })
                        .setImage('attachment://scam_evidence.jpg')
                        .setFooter({ text: 'If your account was compromised, please secure your credentials immediately.' })
                        .setTimestamp();

                    await message.author.send({
                        embeds: [dmEmbed],
                        files: [new AttachmentBuilder(imageBuffer, { name: 'scam_evidence.jpg' })]
                    });
                } catch {
                    console.log(`⚠️ Could not DM ${message.author.tag} (DMs locked).`);
                }
            };

            // Timeout Execution
            const executeTimeout = async () => {
                if (message.member && message.member.moderatable) {
                    try {
                        await message.member.timeout(TIMEOUT_DURATION, `Automated Gemini AI Moderation: ${contentText.substring(0, 45)}`);
                        timeoutSuccessful = true;
                    } catch (timeoutErr) {
                        console.error(`Failed to timeout user ${message.author.tag}:`, timeoutErr);
                    }
                }
            };

            // Parallel Historical Purge Execution across channels
            const purgeUserHistory = async () => {
                console.log(`🧹 Commencing IMMEDIATE historical data sweep for user ID: ${userId}...`);
                const oneHourAgo = Date.now() - (60 * 60 * 1000);
                const textChannels = guild.channels.cache.filter(c => c.isTextBased());

                const purgeTasks = Array.from(textChannels.values()).map(async (channel) => {
                    try {
                        const fetchedMessages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
                        if (!fetchedMessages) return;

                        const targetMessages = fetchedMessages.filter(m => m.author.id === userId && m.createdTimestamp > oneHourAgo);

                        if (targetMessages.size > 0) {
                            await channel.bulkDelete(targetMessages).catch(async () => {
                                for (const [_, msg] of targetMessages) {
                                    if (msg.deletable) await msg.delete().catch(() => { });
                                }
                            });
                        }
                    } catch {
                        // Prevent misconfigured channels from interrupting the sweep
                    }
                });

                await Promise.allSettled(purgeTasks);
                console.log(`✨ Immediate cleanup finalized for target signature ID: ${userId}`);
            };

            // Execute DM, Timeout, and Purge concurrently
            await Promise.allSettled([sendUserDM(), executeTimeout(), purgeUserHistory()]);

            // Dispatch Moderation Log with final status
            if (modLogChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🚨 AI Moderation Action Executed (Gemini Vision Mode)')
                    .setDescription(
                        `**User:** ${message.author} (\`${message.author.id}\`)\n` +
                        `**Channel:** ${message.channel} (\`${message.channel.id}\`)\n` +
                        `**Timeout Status:** ${timeoutSuccessful ? '✅ Active (24 Hours)' : '❌ Failed (Check Bot Permissions)'}\n\n` +
                        `**Gemini Flagged Reason:**\n\`\`\`\n${contentText}\n\`\`\``
                    )
                    .setColor(16711680) // Red
                    .setImage('attachment://scam_evidence.jpg')
                    .setTimestamp();

                await modLogChannel.send({
                    content: `⚠️ **Moderation Action:** Unauthorized scam graphic removed from ${message.author}`,
                    embeds: [logEmbed],
                    files: [new AttachmentBuilder(imageBuffer, { name: 'scam_evidence.jpg' })]
                });
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('❌ Gemini API request timed out.');
            } else if (error.code === 50013) {
                console.error('❌ Bot lacks proper roles or permissions to clear targeted message logs!');
            } else {
                console.error('Error in image moderation:', error);
            }
        }
    });
};