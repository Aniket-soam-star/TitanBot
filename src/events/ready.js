// 📁 REPLACE → src/events/ready.js
//
// Changes vs original:
//   • NEW: restoreReminders() — re-registers all pending reminders from DB on startup

import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import config from '../config/application.js';
import { reconcileReactionRoleMessages } from '../services/reactionRoleService.js';
import { getFromDb, setInDb } from '../utils/database.js';

export default {
    name: Events.ClientReady,
    once: true,

    async execute(client) {
        try {
            client.user.setPresence(config.bot.presence);

            startupLog(`Ready! Logged in as ${client.user.tag}`);
            startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
            startupLog(`Loaded ${client.commands.size} commands`);

            const reconciliationSummary = await reconcileReactionRoleMessages(client);
            startupLog(
                `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
            );

            // ── Restore pending reminders ──────────────────────────────────────────
            await restoreReminders(client);
        } catch (error) {
            logger.error('Error in ready event:', error);
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
//  Reminder restoration
//  Scans DB keys matching reminders:{userId} for all known guilds' members,
//  but because we store by userId directly we iterate guild member caches.
//  A simpler approach: store a global index of active reminder user IDs.
// ═══════════════════════════════════════════════════════════════════════════
async function restoreReminders(client) {
    try {
        if (!client.reminders) client.reminders = new Map();

        // We keep a global index: reminder_users → Set<userId>
        const userIds = await getFromDb('reminder_users', []);
        if (!Array.isArray(userIds) || userIds.length === 0) {
            startupLog('No pending reminders to restore.');
            return;
        }

        let restored  = 0;
        let expired   = 0;
        const now     = Date.now();

        for (const userId of userIds) {
            const key       = `reminders:${userId}`;
            let reminders   = await getFromDb(key, []);
            if (!Array.isArray(reminders)) continue;

            const active = [];

            for (const r of reminders) {
                if (r.fireAt <= now) {
                    // Fire immediately — reminder is overdue
                    fireReminder(client, r, key);
                    expired++;
                } else {
                    // Schedule normally
                    const delay = r.fireAt - now;
                    const timeout = setTimeout(() => fireReminder(client, r, key), delay);
                    client.reminders.set(r.id, timeout);
                    active.push(r);
                    restored++;
                }
            }

            // Write back only future reminders
            await setInDb(key, active);
        }

        startupLog(`Reminders restored: ${restored} scheduled, ${expired} fired (overdue).`);
    } catch (error) {
        logger.error('Error restoring reminders:', error);
    }
}

async function fireReminder(client, reminder, dbKey) {
    try {
        const ch = await client.channels.fetch(reminder.channelId).catch(() => null);
        if (ch) {
            await ch.send({ content: `<@${reminder.userId}> ⏰ Reminder: **${reminder.message}**` });
        } else {
            // Try DM
            const user = await client.users.fetch(reminder.userId).catch(() => null);
            if (user) await user.send(`⏰ Reminder: **${reminder.message}**`).catch(() => {});
        }

        // Remove from DB
        const current = await getFromDb(dbKey, []);
        await setInDb(dbKey, current.filter(r => r.id !== reminder.id));
        client.reminders?.delete(reminder.id);
    } catch (e) {
        logger.error('Reminder fire error:', e);
    }
}
