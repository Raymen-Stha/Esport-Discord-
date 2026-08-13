const cron = require('node-cron');
const { dataFiles, statuses } = require('./config');
const { readData, log } = require('./utilities');
const { postAnnouncement } = require('./announcementHandler');
const { 
    sendCaptainReminder, 
    sendRosterAlert, 
    sendSixHourReminder, 
    sendFinalReminder 
} = require('./reminderHandler');
const { updateWeeklySummary } = require('./summaryHandler');

// Pre-built Set for statuses that skip processing
const TERMINAL_STATUSES = new Set([statuses.CANCELLED, statuses.COMPLETED]);

module.exports = (client) => {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            // Batch-read all data files once per tick (async, cached)
            const [matches, games, tournaments, rosters, reminders, settings] = await Promise.all([
                readData(dataFiles.matches, []),
                readData(dataFiles.games, []),
                readData(dataFiles.tournaments, []),
                readData(dataFiles.rosters, []),
                readData(dataFiles.reminders, {}),
                readData(dataFiles.settings, {})
            ]);

            const now = new Date();

            // Build O(1) lookup Maps once per tick instead of .find() per match
            const gamesMap = new Map(games.map(g => [g.id, g]));
            const tournamentsMap = new Map(tournaments.map(t => [t.id, t]));
            const rostersMap = new Map(rosters.map(r => [r.matchId, r]));
            
            for (const match of matches) {
                // Skip cancelled/completed via Set lookup O(1)
                if (TERMINAL_STATUSES.has(match.status)) continue;
                
                const game = gamesMap.get(match.gameId);
                const tournament = tournamentsMap.get(match.tournamentId);
                const roster = rostersMap.get(match.id);
                const matchReminders = reminders[match.id] || {};
                
                if (!game || !tournament) continue;

                // 1. Post Initial Announcement if needed
                if (match.status === statuses.SCHEDULED && !match.announcementMessageId) {
                    await postAnnouncement(client, match, game);
                    continue; // Will handle reminders on next tick
                }

                // Calculate time difference
                let matchDateTimeStr = match.matchDate;
                if (match.matchTime) {
                    matchDateTimeStr = `${match.matchDate} ${match.matchTime}`; 
                }
                
                const matchTime = new Date(matchDateTimeStr);
                if (isNaN(matchTime)) continue; // Can't parse date
                
                const diffHours = (matchTime - now) / (1000 * 60 * 60);

                // Skip if match is far in the past (e.g. >24h old and not completed)
                if (diffHours < -24) continue;

                // 2. 24-Hour Captain Reminder
                if (settings.captainReminderEnabled !== false && !matchReminders.captainNotified) {
                    const capHours = settings.captainReminderHours || 24;
                    if (diffHours <= capHours && diffHours > capHours - 1) {
                        await sendCaptainReminder(client, match, game, tournament);
                    }
                }

                // 3. 6-Hour Missing Roster Alert OR Player Reminder
                if (settings.playerReminderEnabled !== false && !matchReminders.playersNotified && !matchReminders.rosterAlertSent) {
                    const alertHours = settings.playerReminderHours || 6;
                    if (diffHours <= alertHours && diffHours > alertHours - 1) {
                        if (!roster) {
                            await sendRosterAlert(client, match, game, tournament);
                        } else {
                            await sendSixHourReminder(client, match, roster, game, tournament);
                        }
                    }
                }

                // 4. 1-Hour Final Reminder
                if (settings.finalReminderEnabled !== false && !matchReminders.finalReminderSent) {
                    const finalHours = settings.finalReminderHours || 1;
                    if (diffHours <= finalHours && diffHours > finalHours - 1) {
                        await sendFinalReminder(client, match, roster, game, tournament);
                    }
                }
            }

            // 5. Update Weekly Summary every 15 mins
            if (now.getMinutes() % 15 === 0) {
                await updateWeeklySummary(client);
            }

        } catch (error) {
            console.error('❌ Scheduler Error:', error);
            await log('SCHEDULER_ERROR', error.message);
        }
    }, {
        scheduled: true,
        timezone: "Australia/Sydney"
    });
    
    console.log("✅ Tournament scheduler started.");
};
