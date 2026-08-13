const {
    EmbedBuilder,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const nodemailer = require('nodemailer');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

// File Paths
const verifiedDbPath = path.join(__dirname, 'verified_users.json');
const pendingOtpPath = path.join(__dirname, 'pending_otps.json');
const emailTemplatePath = path.join(__dirname, 'verify_email.html');
const testAlumniCmd = require('./testCleanup.js');

// --- CONFIGURATION (UPDATED ROLE IDS) ---
const STUDENT_ROLE_ID = '1515572262760349846';
const INTRODUCE_ID = '1515577776382677114';
const GAMES_ID = '1515577827859370075';
const SUPPORT_ID = '1515578437748789359';
const CAMPUS_ID = '1526758804090388510';

// --- ENCRYPTION UTILITIES ---
const ALGORITHM = 'aes-256-gcm';
const KEY = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default_fallback_32_chars_long_key!', 'salt', 32);

function encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(text) {
    if (!text || !text.includes(':')) return text;
    try {
        const [ivHex, authTagHex, encryptedText] = text.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("Decryption failed:", error.message);
        return null;
    }
}

// --- IN-MEMORY CACHE FOR DECRYPTED EMAILS ---
// To avoid O(n) decryption on every /verify command
let decryptedEmailCache = null;

async function buildEmailCache() {
    if (decryptedEmailCache) return;
    decryptedEmailCache = new Set();
    const db = await getVerifiedDB();
    for (const [id, record] of Object.entries(db)) {
        const email = decrypt(record.email);
        if (email) decryptedEmailCache.add(email);
    }
}

// --- DATABASE UTILITIES (ASYNC) ---
const getVerifiedDB = async () => {
    try {
        await fsp.access(verifiedDbPath);
        const data = await fsp.readFile(verifiedDbPath, 'utf8');
        return data.trim() === "" ? {} : JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT') {
            await fsp.writeFile(verifiedDbPath, JSON.stringify({}));
        }
        return {}; 
    }
};

const getPendingDB = async () => {
    try {
        await fsp.access(pendingOtpPath);
        const data = await fsp.readFile(pendingOtpPath, 'utf8');
        return data.trim() === "" ? {} : JSON.parse(data);
    } catch (e) { 
        if (e.code === 'ENOENT') {
            await fsp.writeFile(pendingOtpPath, JSON.stringify({}));
        }
        return {}; 
    }
};

const saveVerifiedDB = async (data) => {
    await fsp.writeFile(verifiedDbPath, JSON.stringify(data, null, 2));
};

const savePendingDB = async (data) => {
    await fsp.writeFile(pendingOtpPath, JSON.stringify(data, null, 2));
};

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {

        // --- 1. HANDLE SLASH COMMAND ---
        if (interaction.isChatInputCommand() && interaction.commandName === 'verify') {
            const email = interaction.options.getString('email').trim().toLowerCase();
            const gradYear = interaction.options.getInteger('gradyear');
            const userId = interaction.user.id;

            if (interaction.member.roles.cache.has(STUDENT_ROLE_ID)) {
                return interaction.reply({ content: "✅ You are already verified!", ephemeral: true });
            }

            if (!email.endsWith("@student.scu.edu.au")) {
                return interaction.reply({ content: "❌ Please use your official **@student.scu.edu.au** email.", ephemeral: true });
            }

            // Await building the cache if it hasn't been built yet
            await buildEmailCache();

            // Check if email already used (O(1) lookup)
            const verifiedDb = await getVerifiedDB();
            
            // Allow re-verifying if it's the exact same user (in case they lost roles)
            let usedByOther = false;
            if (decryptedEmailCache.has(email)) {
                // If it's in the cache, make sure it's not THIS user
                if (verifiedDb[userId] && decrypt(verifiedDb[userId].email) === email) {
                    usedByOther = false;
                } else {
                    usedByOther = true;
                }
            }

            if (usedByOther) {
                return interaction.reply({ content: "❌ This email is already linked to another account.", ephemeral: true });
            }

            const otp = Math.floor(100000 + Math.random() * 900000);
            const duration = 5 * 60 * 1000; // 5 minutes
            const expires = Date.now() + duration;

            const pendingDb = await getPendingDB();
            pendingDb[userId] = { otp, expires, email: encrypt(email), gradYear };
            await savePendingDB(pendingDb);

            // --- FIXED: ACTIVE CLEANUP TIMER ---
            // This self-executes in the background exactly after 5 minutes to clear out abandoned records
            setTimeout(async () => {
                const currentPending = await getPendingDB();
                if (currentPending[userId] && Date.now() >= currentPending[userId].expires) {
                    delete currentPending[userId];
                    await savePendingDB(currentPending);
                    console.log(`🧹 Cleaned up expired/abandoned pending OTP entry for user: ${userId}`);
                }
            }, duration);

            const modal = new ModalBuilder()
                .setCustomId('otpModal')
                .setTitle('Student Verification');

            const otpInput = new TextInputBuilder()
                .setCustomId('otpInput')
                .setLabel("Verification Code")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('123456')
                .setMinLength(6)
                .setMaxLength(6)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(otpInput));
            await interaction.showModal(modal);

            try {
                let htmlContent = await fsp.readFile(emailTemplatePath, 'utf8');
                htmlContent = htmlContent.replace('{{otp}}', otp.toString());
                await transporter.sendMail({ to: email, subject: "🔒 SCU Esports Verification Code", html: htmlContent });
            } catch (err) {
                console.error("Email Error:", err);
            }
        }

        // --- 2. HANDLE MODAL SUBMISSION ---
        if (interaction.isModalSubmit() && interaction.customId === 'otpModal') {
            await interaction.deferReply({ ephemeral: true });

            const submittedOtp = interaction.fields.getTextInputValue('otpInput').trim();
            const userId = interaction.user.id;
            const member = interaction.member;

            const currentPending = await getPendingDB();
            const data = currentPending[userId];

            if (!data || Date.now() > data.expires) {
                if (data) { delete currentPending[userId]; await savePendingDB(currentPending); }
                return interaction.editReply({ content: "⏰ OTP session expired. Please run `/verify` again." });
            }

            if (submittedOtp === data.otp.toString()) {
                delete currentPending[userId];
                await savePendingDB(currentPending);

                const clearTextEmail = decrypt(data.email);

                const finalVerifiedDb = await getVerifiedDB();
                finalVerifiedDb[userId] = {
                    email: encrypt(clearTextEmail),
                    gradYear: data.gradYear
                };
                await saveVerifiedDB(finalVerifiedDb);

                // Update cache
                if (decryptedEmailCache) decryptedEmailCache.add(clearTextEmail);

                try {
                    const currentYear = new Date().getFullYear();
                    const isAlumni = data.gradYear < currentYear;
                    const ALUMNI_ROLE_ID = '1515572053019852800';

                    const targetRoleId = isAlumni ? ALUMNI_ROLE_ID : STUDENT_ROLE_ID;
                    const role = interaction.guild.roles.cache.get(targetRoleId);

                    if (role) {
                        await member.roles.add(role);
                    } else {
                        console.error(`Could not locate Role ID ${targetRoleId} in the guild cache.`);
                    }

                    await interaction.editReply({
                        content: `✅ Verification successful! Welcome to the community as ${isAlumni ? 'an Alumni member' : 'a Student member'}.`
                    });

                    const welcomeEmbed = new EmbedBuilder()
                        .setTitle(`Verified ${isAlumni ? 'Alumni' : 'Student'} | ${interaction.user.username}`)
                        .setDescription(
                            `We are delighted to have you on board with the Southern Cross University Esports community!\n\n` +
                            `**Status:** ${isAlumni ? '🎓 Alumni' : '📖 Current Student'}\n` +
                            `**Class of:** ${data.gradYear}\n\n` +
                            `**Quick Start Guide:**\n` +
                            `👋 <#${INTRODUCE_ID}> - Introduce yourself\n` +
                            `🎮 <#${GAMES_ID}> - Pick your games\n` +
                            `🎫 <#${SUPPORT_ID}> - Need help? Open a ticket\n` +
                            `🏫<#${CAMPUS_ID}>- select your campus`
                        )
                        .setColor(isAlumni ? 0x95a5a6 : 0xFFCC00)
                        .setAuthor({
                            name: 'Southern Cross University Esports',
                            iconURL: 'https://imgs.search.brave.com/IU-RtpyjOh0cw1x1TFdBK936MHmhdhOL8rdx3-HSf4E/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly91cGxv/YWQud2lraW1lZGlh/Lm9yZy93aWtpcGVk/aWEvY29tbW9ucy90/aHVtYi9jL2MwL1Nv/dXRoZXJuX0Nyb3Nz/X3ZlcnRpY2FsLnBu/Zy81MTJweC1Tb3V0/aGVybl9Dcm9zc192/ZXJ0aWNhbC5wbmc'
                        })
                        .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false, size: 256 }))
                        .setFooter({ text: `Verified ${isAlumni ? 'Alumni' : 'Student'} Member` })
                        .setTimestamp();

                    return interaction.channel.send({ embeds: [welcomeEmbed] }).catch(err => console.error("Failed to send welcome embed:", err));

                } catch (e) {
                    console.error("Role Assignment Error:", e);
                    return interaction.editReply({
                        content: "✅ You are verified, but I ran into a permission hitch applying your roles. Please contact an admin to verify the role hierarchy."
                    });
                }
            } else {
                delete currentPending[userId];
                await savePendingDB(currentPending);
                return interaction.editReply({
                    content: "❌ **Incorrect OTP.** Please restart with `/verify`."
                });
            }
        }
    });
};