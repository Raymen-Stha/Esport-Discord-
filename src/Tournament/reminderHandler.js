const { dataFiles } = require('./config');
const { readData, writeData, log } = require('./utilities');
const { buildReminderEmbed } = require('./templetes/reminderEmbed');
const { buildRosterEmbed } = require('./templetes/rosterEmbed');

async function sendCaptainReminder(client, match, game, tournament) {
    if (!game.channelId && !game.captainRoleId) return;
    
    try {
        const embed = buildReminderEmbed(match, tournament, 'captain', game);
        
        let sent = false;
        if (game.channelId) {
            const channel = await client.channels.fetch(game.channelId);
            if (channel) {
                await channel.send({ 
                    content: game.captainRoleId ? `<@&${game.captainRoleId}>` : 'Attention Captains', 
                    embeds: [embed] 
                });
                sent = true;
            }
        }
        
        if (sent) {
            await markReminderSent(match.id, 'captainNotified');
            await log('REMINDER_SENT', `24h captain reminder sent for match ${match.id}`);
        }
    } catch (e) {
        console.error("Failed to send captain reminder:", e);
    }
}

async function sendRosterAlert(client, match, game, tournament) {
    if (!game.channelId && !game.captainRoleId) return;
    
    try {
        const embed = buildReminderEmbed(match, tournament, 'roster_alert', game);
        
        let sent = false;
        if (game.channelId) {
            const channel = await client.channels.fetch(game.channelId);
            if (channel) {
                await channel.send({ 
                    content: game.captainRoleId ? `<@&${game.captainRoleId}>` : 'Attention Captains', 
                    embeds: [embed] 
                });
                sent = true;
            }
        }
        
        if (sent) {
            await markReminderSent(match.id, 'rosterAlertSent');
            await log('REMINDER_SENT', `6h missing roster alert sent for match ${match.id}`);
        }
    } catch (e) {
        console.error("Failed to send roster alert:", e);
    }
}

async function sendSquadConfirmation(client, match, roster, game) {
    if (!game.channelId) return;
    
    try {
        const tournaments = await readData(dataFiles.tournaments, []);
        const tournament = tournaments.find(t => t.id === match.tournamentId);
        
        const embed = buildRosterEmbed(match, tournament, roster);
        
        const allPlayers = [...roster.players, ...(roster.bench || [])];
        const pings = allPlayers.map(id => `<@${id}>`).join(' ');
        
        const channel = await client.channels.fetch(game.channelId);
        if (channel) {
            await channel.send({ content: `**Roster Confirmation**\n${pings}`, embeds: [embed] });
        }
    } catch (e) {
        console.error("Failed to send squad confirmation:", e);
    }
}

async function sendSixHourReminder(client, match, roster, game, tournament) {
    if (!game.channelId || !roster) return;
    
    try {
        const embed = buildReminderEmbed(match, tournament, 'player_6h', game);
        
        const allPlayers = [...roster.players, ...(roster.bench || [])];
        const pings = allPlayers.map(id => `<@${id}>`).join(' ');
        
        const channel = await client.channels.fetch(game.channelId);
        if (channel) {
            await channel.send({ content: pings, embeds: [embed] });
            await markReminderSent(match.id, 'playersNotified');
            await log('REMINDER_SENT', `6h player reminder sent for match ${match.id}`);
        }
    } catch (e) {
        console.error("Failed to send 6h reminder:", e);
    }
}

async function sendFinalReminder(client, match, roster, game, tournament) {
    if (!game.channelId) return;
    
    try {
        const embed = buildReminderEmbed(match, tournament, 'final_1h', game);
        
        let pings = game.captainRoleId ? `<@&${game.captainRoleId}> ` : '';
        if (roster) {
            const allPlayers = [...roster.players, ...(roster.bench || [])];
            pings += allPlayers.map(id => `<@${id}>`).join(' ');
        }
        
        const channel = await client.channels.fetch(game.channelId);
        if (channel) {
            await channel.send({ content: pings, embeds: [embed] });
            await markReminderSent(match.id, 'finalReminderSent');
            await log('REMINDER_SENT', `1h final reminder sent for match ${match.id}`);
        }
    } catch (e) {
        console.error("Failed to send final reminder:", e);
    }
}

async function markReminderSent(matchId, field) {
    const reminders = await readData(dataFiles.reminders, {});
    if (!reminders[matchId]) {
        reminders[matchId] = {
            captainNotified: false,
            rosterAlertSent: false,
            playersNotified: false,
            finalReminderSent: false
        };
    }
    reminders[matchId][field] = true;
    await writeData(dataFiles.reminders, reminders);
}

module.exports = {
    sendCaptainReminder,
    sendRosterAlert,
    sendSquadConfirmation,
    sendSixHourReminder,
    sendFinalReminder
};
