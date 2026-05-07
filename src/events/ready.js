// 📁 REPLACE → src/events/ready.js
//
// Changes vs original:
//   • NEW: applyConfigOverrides() — loads saved /botconfig changes from DB
//   • NEW: restoreReminders()     — re-registers pending reminders on restart

import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import config from '../config/application.js';
import { reconcileReactionRoleMessages } from '../services/reactionRoleService.js';
import { getFromDb, setInDb } from '../utils/database.js';
import botConfig from '../config/bot.js';

export default {
    name: Events.ClientReady,
    once: true,

    async execute(client) {
        try {
            client.user.setPresence(config.bot.presence);

            startupLog(`Ready! Logged in as ${client.user.tag}`);
            startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
            startupLog(`Loaded ${client.commands.size} commands`);

            // ── Apply saved /botconfig overrides ───────────────────────────
            await applyConfigOverrides(client);

            // ── Reconcile reaction roles ───────────────────────────────────
            const reconciliationSummary = await reconcileReactionRoleMessages(client);
            startupLog(
                `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
            );

            // ── Restore pending reminders ──────────────────────────────────
            await restoreReminders(client);

        } catch (error) {
            logger.error('Error in ready event:', error);
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
//  CONFIG OVERRIDE LOADER
//  Reads the flat overrides saved by /botconfig and merges them into the
//  live botConfig object using dot-notation keys.
//  Example key: 'economy.currency.name' → botConfig.economy.currency.name
// ═══════════════════════════════════════════════════════════════════════════
async function applyConfigOverrides(client) {
    try {
        const overrides = await getFromDb('zerobot:global:config', {});
        const keys = Object.keys(overrides);

        if (keys.length === 0) {
            startupLog('No bot config overrides found.');
            return;
        }

        let applied = 0;

        for (const key of keys) {
            try {
                const value = overrides[key];
                const parts = key.split('.');

                // Handle special cases
                if (key === 'presence') {
                    // Full presence object — apply to bot and config
                    Object.assign(botConfig.presence, value);
                    client.user.setPresence(value);
                    applied++;
                    continue;
                }

                // Walk the botConfig object and set the nested value
                let obj = botConfig;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (obj[parts[i]] === undefined) { obj = null; break; }
                    obj = obj[parts[i]];
                }
                if (obj !== null && obj !== undefined) {
                    obj[parts[parts.length - 1]] = value;
                    applied++;
                }
            } catch (e) {
                logger.warn(`Failed to apply config override for key "${key}":`, e.message);
            }
        }

        startupLog(`Applied ${applied}/${keys.length} saved bot config override(s).`);
    } catch (error) {
        logger.error('Error applying config overrides:', error);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  REMINDER RESTORATION
//  Restores pending reminders from DB so they survive bot restarts.
// ═══════════════════════════════════════════════════════════════════════════
async function restoreReminders(client) {
    try {
        if (!client.reminders) client.reminders = new Map();

        const userIds = await getFromDb('reminder_users', []);
        if (!Array.isArray(userIds) || userIds.length === 0) {
            startupLog('No pending reminders to restore.');
            return;
        }

        let restored = 0;
        let expired  = 0;
        const now    = Date.now();

        for (const userId of userIds) {
            const key     = `reminders:${userId}`;
            let reminders = await getFromDb(key, []);
            if (!Array.isArray(reminders)) continue;

            const active = [];

            for (const r of reminders) {
                if (r.fireAt <= now) {
                    fireReminder(client, r, key);
                    expired++;
                } else {
                    const delay   = r.fireAt - now;
                    const timeout = setTimeout(() => fireReminder(client, r, key), delay);
                    client.reminders.set(r.id, timeout);
                    active.push(r);
                    restored++;
                }
            }

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
            const user = await client.users.fetch(reminder.userId).catch(() => null);
            if (user) await user.send(`⏰ Reminder: **${reminder.message}**`).catch(() => {});
        }

        const current = await getFromDb(dbKey, []);
        await setInDb(dbKey, current.filter(r => r.id !== reminder.id));
        client.reminders?.delete(reminder.id);
    } catch (e) {
        logger.error('Reminder fire error:', e);
    }
}
