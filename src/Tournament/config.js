// ─── Tournament System Configuration ────────────────────────────────
// Central source of truth for all constants, defaults, and enums.
// Every other module imports from here — never hardcode values elsewhere.

module.exports = {

    // ── Embed Colours (Discord hex integers) ────────────────────────
    colors: {
        announcement: 0xFFD700,   // Gold — match announcements
        success:      0x00FF7F,   // Spring green — confirmations
        error:        0xFF4444,   // Red — errors / cancellations
        info:         0x0099FF,   // Blue — informational
        reminder:     0xFF4500,   // Orange-red — time-sensitive reminders
        roster:       0x7B68EE,   // Medium slate blue — roster updates
        summary:      0x1ABC9C,   // Teal — weekly summaries
        completed:    0x2ECC71    // Emerald — completed matches
    },

    // ── Scheduler Timings ───────────────────────────────────────────
    timings: {
        schedulerIntervalMs:   60_000,  // Tick every 60 seconds
        captainReminderHours:  24,      // Ping captain 24h before match
        rosterAlertHours:      6,       // Warn if roster missing at 6h
        playerReminderHours:   6,       // Ping selected players at 6h
        finalAlertHours:       1        // Final reminder at 1h
    },

    // ── Match Status Enum ───────────────────────────────────────────
    statuses: {
        SCHEDULED:    'scheduled',     // Match created, no announcement yet
        ANNOUNCED:    'announced',     // Announcement posted to Discord
        ROSTER_OPEN:  'roster_open',   // 24h window — captain can submit
        ROSTER_LOCKED:'roster_locked', // Roster submitted, locked in
        IN_PROGRESS:  'in_progress',   // Match is live
        COMPLETED:    'completed',     // Result entered
        CANCELLED:    'cancelled'      // Match cancelled
    },

    // ── Validation Limits ───────────────────────────────────────────
    limits: {
        maxSquadSize:        10,     // Hard cap on starters per game
        maxBenchSize:        5,      // Hard cap on bench per game
        maxOpponentLength:   100,    // Characters
        maxTournamentName:   100,
        maxGameName:         50,
        maxNotesLength:      500,
        maxScoreLength:      50,
        maxTeamNameLength:   50
    },

    // ── Discord Custom ID Prefixes ──────────────────────────────────
    // Every button / select menu ID starts with these to prevent
    // collisions with your other modules (tickets, party, etc.)
    prefixes: {
        button: 'tournament_btn_',
        select: 'tournament_sel_',
        modal:  'tournament_mdl_'
    },

    // ── Data File Names ─────────────────────────────────────────────
    dataFiles: {
        games:       'games.json',
        tournaments: 'tournaments.json',
        matches:     'matches.json',
        rosters:     'rosters.json',
        reminders:   'reminders.json',
        summary:     'summary.json',
        logs:        'logs.json',
        settings:    'settings.json'
    },

    // ── Default Settings (written to settings.json on first boot) ──
    defaultSettings: {
        captainReminderEnabled:  true,
        playerReminderEnabled:   true,
        finalReminderEnabled:    true,
        summaryEnabled:          true,
        captainReminderHours:    24,
        playerReminderHours:     6,
        finalReminderHours:      1
    }
};