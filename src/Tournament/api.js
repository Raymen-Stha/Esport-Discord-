const express = require('express');
const { dataFiles, limits } = require('./config');
const { readData, writeData, generateId, log, sanitizeString } = require('./utilities');
const tournamentHandler = require('./tournamentHandler');
const matchHandler = require('./matchHandler');
// Moved to top-level — avoids require() resolution on every request
const { getRoster, submitRoster } = require('./rosterHandler');

// Pre-built Set for terminal status checks
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

module.exports = (client) => {
    const router = express.Router();

    // --- Authentication Middleware ---
    const authenticate = (req, res, next) => {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format.' });
        }
        
        const token = authHeader.split(' ')[1];
        if (token !== process.env.TOURNAMENT_API_KEY) {
            return res.status(403).json({ error: 'Forbidden: Invalid API Key.' });
        }
        next();
    };

    // --- Rate Limiting (Simple In-Memory) ---
    const rateLimits = new Map();
    const rateLimit = (req, res, next) => {
        const ip = req.ip;
        const now = Date.now();
        const windowMs = 60000; // 1 minute
        const maxRequests = 30;

        if (!rateLimits.has(ip)) {
            rateLimits.set(ip, []);
        }

        const requests = rateLimits.get(ip);
        const windowStart = now - windowMs;
        
        // Remove old requests
        while (requests.length > 0 && requests[0] < windowStart) {
            requests.shift();
        }

        if (requests.length >= maxRequests) {
            return res.status(429).json({ error: 'Too Many Requests.' });
        }

        requests.push(now);
        next();
    };

    // Apply middleware to all routes in this router
    router.use(authenticate);
    router.use(rateLimit);

    // ==========================================
    // GAMES API
    // ==========================================
    router.get('/games', async (req, res) => {
        res.json(await readData(dataFiles.games, []));
    });

    router.post('/games', async (req, res) => {
        try {
            const data = req.body;
            if (!data.name) return res.status(400).json({ error: 'Game name is required' });
            
            const game = {
                id: generateId(),
                name: sanitizeString(data.name, limits.maxGameName),
                roleId: data.roleId || null,
                captainRoleId: data.captainRoleId || null,
                announcementChannelId: data.announcementChannelId || null,
                channelId: data.channelId || null,
                summaryChannelId: data.summaryChannelId || null,
                squadSize: parseInt(data.squadSize) || 5,
                benchSize: parseInt(data.benchSize) || 1
            };

            const games = await readData(dataFiles.games, []);
            games.push(game);
            await writeData(dataFiles.games, games);
            await log('GAME_CREATED', `Configured game: ${game.name}`, 'WEB');
            
            res.status(201).json(game);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.put('/games/:id', async (req, res) => {
        try {
            const games = await readData(dataFiles.games, []);
            const index = games.findIndex(g => g.id === req.params.id);
            if (index === -1) return res.status(404).json({ error: 'Game not found' });

            const allowedFields = ['name', 'roleId', 'captainRoleId', 'announcementChannelId', 'channelId', 'summaryChannelId', 'squadSize', 'benchSize'];
            for (const key of allowedFields) {
                if (req.body[key] !== undefined) {
                    if (key === 'name') games[index][key] = sanitizeString(req.body[key], limits.maxGameName);
                    else if (key === 'squadSize' || key === 'benchSize') games[index][key] = parseInt(req.body[key]) || 0;
                    else games[index][key] = req.body[key];
                }
            }

            await writeData(dataFiles.games, games);
            await log('GAME_UPDATED', `Updated game config: ${games[index].name}`, 'WEB');
            res.json(games[index]);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.delete('/games/:id', async (req, res) => {
        try {
            const games = await readData(dataFiles.games, []);
            const index = games.findIndex(g => g.id === req.params.id);
            if (index === -1) return res.status(404).json({ error: 'Game not found' });

            // Check dependencies
            const tournaments = await readData(dataFiles.tournaments, []);
            const activeTournaments = tournaments.filter(t => t.gameId === req.params.id);
            if (activeTournaments.length > 0) {
                return res.status(400).json({ error: 'Cannot delete game: tournaments depend on it.' });
            }

            const deleted = games.splice(index, 1)[0];
            await writeData(dataFiles.games, games);
            await log('GAME_DELETED', `Deleted game config: ${deleted.name}`, 'WEB');
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ==========================================
    // TOURNAMENTS API
    // ==========================================
    router.get('/tournaments', async (req, res) => {
        res.json(await tournamentHandler.getAllTournaments());
    });

    router.post('/tournaments', async (req, res) => {
        try {
            const tournament = await tournamentHandler.createTournament(req.body);
            res.status(201).json(tournament);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    router.put('/tournaments/:id', async (req, res) => {
        try {
            const tournament = await tournamentHandler.editTournament(req.params.id, req.body);
            res.json(tournament);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    router.delete('/tournaments/:id', async (req, res) => {
        try {
            await tournamentHandler.deleteTournament(req.params.id);
            res.json({ success: true });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    // ==========================================
    // MATCHES API
    // ==========================================
    router.get('/matches', async (req, res) => {
        const filters = {
            tournamentId: req.query.tournamentId,
            gameId: req.query.gameId,
            status: req.query.status
        };
        res.json(await matchHandler.getAllMatches(filters));
    });

    router.post('/matches', async (req, res) => {
        try {
            const match = await matchHandler.createMatch(req.body);
            // The scheduler will pick this up and post the announcement automatically
            res.status(201).json(match);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    router.put('/matches/:id', async (req, res) => {
        try {
            const match = await matchHandler.editMatch(req.params.id, req.body);
            res.json(match);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    router.post('/matches/:id/cancel', async (req, res) => {
        try {
            const match = await matchHandler.cancelMatch(req.params.id);
            res.json(match);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    router.post('/matches/:id/complete', async (req, res) => {
        try {
            const match = await matchHandler.completeMatch(req.params.id, req.body);
            res.json(match);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    router.get('/matches/:id/roster', async (req, res) => {
        try {
            const roster = getRoster(req.params.id);
            res.json(roster || { players: [], bench: [] });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.put('/matches/:id/roster', async (req, res) => {
        try {
            // Assuming web portal edits are done by an 'Admin' (we can use 'Web Admin' as captainId)
            const captainId = 'Web Admin';
            const roster = await submitRoster(client, req.params.id, captainId, req.body.players || [], req.body.bench || []);
            res.json(roster);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    // ==========================================
    // DASHBOARD & LOGS API
    // ==========================================
    router.get('/dashboard', async (req, res) => {
        const [matches, tournaments, rosters, logs] = await Promise.all([
            readData(dataFiles.matches, []),
            readData(dataFiles.tournaments, []),
            readData(dataFiles.rosters, []),
            readData(dataFiles.logs, [])
        ]);

        const today = new Date().toISOString().split('T')[0];
        
        const todaysMatches = matches.filter(m => m.matchDate === today);
        const activeTournaments = tournaments.filter(t => t.status === 'active');
        
        // Use Set for O(n) missing-rosters calculation instead of O(n²)
        const activeMatchIds = matches
            .filter(m => !TERMINAL_STATUSES.has(m.status))
            .map(m => m.id);
        const rosterMatchIdSet = new Set(rosters.map(r => r.matchId));
        const missingRosters = activeMatchIds.filter(id => !rosterMatchIdSet.has(id)).length;

        res.json({
            stats: {
                todaysMatches: todaysMatches.length,
                missingRosters,
                activeTournaments: activeTournaments.length,
                totalMatches: matches.length
            },
            recentLogs: logs.slice(0, 10)
        });
    });

    router.get('/logs', async (req, res) => {
        res.json(await readData(dataFiles.logs, []));
    });

    // ==========================================
    // SETTINGS API
    // ==========================================
    router.get('/settings', async (req, res) => {
        res.json(await readData(dataFiles.settings, {}));
    });

    router.put('/settings', async (req, res) => {
        try {
            const settings = await readData(dataFiles.settings, {});
            const allowed = ['captainReminderEnabled', 'playerReminderEnabled', 'finalReminderEnabled', 'summaryEnabled', 'captainReminderHours', 'playerReminderHours', 'finalReminderHours'];
            
            for (const key of allowed) {
                if (req.body[key] !== undefined) {
                    settings[key] = req.body[key];
                }
            }
            
            await writeData(dataFiles.settings, settings);
            res.json(settings);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    return router;
};
