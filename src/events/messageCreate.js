// 📁 REPLACE → src/events/messageCreate.js
//
// Changes vs original:
//   • Auto-reply block (already present — kept as-is)
//   • NEW: handleAutomod() called after auto-reply
//   • Leveling block unchanged

import { Events, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling.js';
import { addXp } from '../services/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { getFromDb, setInDb } from '../utils/database.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS  = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

// ── Known phishing / scam domains (extend as needed) ───────────────────────
const PHISHING_DOMAINS = [
    'discord-gift', 'discordgifts', 'discordnitro', 'free-nitro',
    'steamcommunity.ru', 'steamcommunity.com.', 'bit.ly/discord',
    'dlscord', 'disc0rd', 'discrod', 'nitro-discord',
    'discordapp.gift', 'freesdiscord'
];

// ── Discord invite regex ────────────────────────────────────────────────────
const INVITE_REGEX = /discord(?:\.gg|\.com\/invite|app\.com\/invite)\/[a-zA-Z0-9]+/i;

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        try {
            if (message.author.bot || !message.guild) return;

            // ── Auto-reply ─────────────────────────────────────────────────────────
            if (client.autoReplies) {
                const content = message.content.toLowerCase();
                for (const [key, response] of client.autoReplies.entries()) {
                    const [guildId, trigger] = key.split(':');
                    if (guildId === message.guild.id && content.includes(trigger)) {
                        await message.reply(response);
                        break;
                    }
                }
            }

            // ── Automod ────────────────────────────────────────────────────────────
            const blocked = await handleAutomod(message, client);
            if (blocked) return; // message was deleted; skip XP

            // ── Leveling ───────────────────────────────────────────────────────────
            await handleLeveling(message, client);
        } catch (error) {
            logger.error('Error in messageCreate event:', error);
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
//  AUTOMOD
// ═══════════════════════════════════════════════════════════════════════════
const spamTracker = new Map(); // guildId:userId → { count, resetAt }

async function handleAutomod(message, client) {
    try {
        const guildId = message.guild.id;
        const cfg     = await getFromDb(`guild:${guildId}:automod`, {});

        if (!cfg?.enabled) return false;

        // ── Ignored channels / roles ────────────────────────────────────────────
        if (cfg.ignoredChannels?.includes(message.channel.id)) return false;
        if (cfg.ignoredRoles?.length > 0) {
            const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
            if (member?.roles.cache.some(r => cfg.ignoredRoles.includes(r.id))) return false;
        }

        let blocked = false;

        // ── Anti-spam ───────────────────────────────────────────────────────────
        if (cfg.antiSpam?.enabled && !blocked) {
            blocked = await checkAntiSpam(message, cfg.antiSpam, guildId, cfg.logChannelId);
        }

        // ── Mass mention ────────────────────────────────────────────────────────
        if (cfg.massMention?.enabled && !blocked) {
            const totalMentions = message.mentions.users.size + message.mentions.roles.size;
            if (totalMentions >= (cfg.massMention.maxMentions ?? 5)) {
                await message.delete().catch(() => {});
                await notifyUser(message, '🔇 Mass mentions are not allowed in this server.');
                await logAutomod(message, client, cfg, 'Mass Mention', `${totalMentions} mentions`);
                blocked = true;
            }
        }

        // ── Bad words ───────────────────────────────────────────────────────────
        if (cfg.badWords?.enabled && !blocked && cfg.badWords.words?.length > 0) {
            const lc = message.content.toLowerCase();
            const hit = cfg.badWords.words.find(w => lc.includes(w));
            if (hit) {
                await message.delete().catch(() => {});
                await notifyUser(message, '🔇 Your message contained a banned word.');
                await logAutomod(message, client, cfg, 'Bad Word', `Matched: \`${hit}\``);
                blocked = true;
            }
        }

        // ── Anti-phishing ───────────────────────────────────────────────────────
        if (cfg.antiPhishing?.enabled && !blocked) {
            const lc  = message.content.toLowerCase();
            const hit = PHISHING_DOMAINS.find(d => lc.includes(d));
            if (hit) {
                await message.delete().catch(() => {});
                await notifyUser(message, '🔇 A potential phishing/scam link was detected and removed.');
                await logAutomod(message, client, cfg, 'Phishing Link', `Domain pattern: \`${hit}\``);
                blocked = true;
            }
        }

        // ── Anti-invite ─────────────────────────────────────────────────────────
        if (cfg.antiInvite?.enabled && !blocked) {
            if (INVITE_REGEX.test(message.content)) {
                await message.delete().catch(() => {});
                await notifyUser(message, '🔇 Discord invite links are not allowed here.');
                await logAutomod(message, client, cfg, 'Discord Invite', 'Invite link detected');
                blocked = true;
            }
        }

        return blocked;
    } catch (error) {
        logger.error('Automod handler error:', error);
        return false;
    }
}

async function checkAntiSpam(message, spamCfg, guildId, logChannelId) {
    const key     = `${guildId}:${message.author.id}`;
    const now     = Date.now();
    const window  = spamCfg.windowMs ?? 5000;
    const maxMsgs = spamCfg.maxMessages ?? 5;

    let entry = spamTracker.get(key);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + window, msgIds: [] };
    }

    entry.count++;
    entry.msgIds.push(message.id);
    spamTracker.set(key, entry);

    // Clean map periodically
    if (spamTracker.size > 5000) {
        for (const [k, v] of spamTracker) {
            if (Date.now() > v.resetAt) spamTracker.delete(k);
        }
    }

    if (entry.count < maxMsgs) return false;

    // Delete all tracked spam messages
    const toDelete = entry.msgIds.slice();
    spamTracker.delete(key);

    await Promise.all(toDelete.map(id =>
        message.channel.messages.fetch(id)
            .then(m => m.delete())
            .catch(() => {})
    ));

    await notifyUser(message, '🔇 You are sending messages too fast. Slow down!');

    // Apply configured action
    const action = spamCfg.action ?? 'timeout';
    if (action === 'timeout') {
        const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member?.moderatable) {
            await member.timeout(spamCfg.timeoutMs ?? 60_000, 'Automod: spam detected').catch(() => {});
        }
    } else if (action === 'kick') {
        const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member?.kickable) await member.kick('Automod: spam detected').catch(() => {});
    }

    return true;
}

async function notifyUser(message, text) {
    try {
        const dm = await message.author.createDM().catch(() => null);
        if (dm) {
            await dm.send(`**${message.guild.name}:** ${text}`).catch(() => {});
        }
    } catch {}
}

async function logAutomod(message, client, cfg, action, detail) {
    try {
        if (!cfg.logChannelId) return;
        const logCh = message.guild.channels.cache.get(cfg.logChannelId);
        if (!logCh) return;

        const { createEmbed } = await import('../utils/embeds.js');
        const embed = createEmbed({
            title: `🛡️ Automod — ${action}`,
            color: 'warning',
            fields: [
                { name: 'User',    value: `${message.author.tag} (${message.author.id})`, inline: true },
                { name: 'Channel', value: `${message.channel}`,                           inline: true },
                { name: 'Detail',  value: detail,                                         inline: false },
                { name: 'Content', value: message.content?.slice(0, 512) || '*[deleted]*', inline: false }
            ]
        });
        await logCh.send({ embeds: [embed] });
    } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
//  LEVELING (unchanged from original)
// ═══════════════════════════════════════════════════════════════════════════
async function handleLeveling(message, client) {
    try {
        const rateLimitKey = `xp-event:${message.guild.id}:${message.author.id}`;
        const canProcess   = await checkRateLimit(rateLimitKey, MESSAGE_XP_RATE_LIMIT_ATTEMPTS, MESSAGE_XP_RATE_LIMIT_WINDOW_MS);
        if (!canProcess) return;

        const levelingConfig = await getLevelingConfig(client, message.guild.id);
        if (!levelingConfig?.enabled) return;
        if (levelingConfig.ignoredChannels?.includes(message.channel.id)) return;

        if (levelingConfig.ignoredRoles?.length > 0) {
            const member = await message.guild.members.fetch(message.author.id).catch(() => null);
            if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) return;
        }

        if (levelingConfig.blacklistedUsers?.includes(message.author.id)) return;
        if (!message.content || message.content.trim().length === 0) return;

        const userData       = await getUserLevelData(client, message.guild.id, message.author.id);
        const cooldownTime   = levelingConfig.xpCooldown || 60;
        const now            = Date.now();
        const timeSinceLast  = now - (userData.lastMessage || 0);
        if (timeSinceLast < cooldownTime * 1000) return;

        const minXP    = levelingConfig.xpRange?.min || levelingConfig.xpPerMessage?.min || 15;
        const maxXP    = levelingConfig.xpRange?.max || levelingConfig.xpPerMessage?.max || 25;
        const safeMin  = Math.max(1, minXP);
        const safeMax  = Math.max(safeMin, maxXP);
        let finalXP    = Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;

        if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) {
            finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);
        }

        const result = await addXp(client, message.guild, message.member, finalXP);
        if (result.success && result.leveledUp) {
            logger.info(`${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`);
        }
    } catch (error) {
        logger.error('Error handling leveling for message:', error);
    }
      }
