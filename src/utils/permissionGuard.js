// 📁 REPLACE → src/utils/permissionGuard.js
//
// Zero Bot — Central Permission Enforcement (v2)
//
// Priority order (first match wins):
//   1. Server owner → ALWAYS allowed, no exceptions
//   2. Administrator → allowed for everything except truly owner-only
//   3. Guild role override → if set via /botconfig permissions, those roles can run the command
//   4. Default tier → BAN / KICK / MOD / MSG / CHANNEL / GUILD / ROLES / AUDIT
//   5. PUBLIC → everyone
//
// Bot permission check always runs at the end regardless of user tier.
//
// DB key: guild:{guildId}:cmd_perms → { commandName: [roleId, ...], ... }

import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from './embeds.js';
import { getFromDb } from './database.js';
import { logger } from './logger.js';

// ─── Tiers ────────────────────────────────────────────────────────────────
export const TIERS = {
    DANGEROUS: 'dangerous', // Owner OR Admin only
    ADMIN:     'admin',     // Owner OR Admin
    BAN:       'ban',
    KICK:      'kick',
    MOD:       'mod',
    MSG:       'msg',
    CHANNEL:   'channel',
    GUILD:     'guild',
    ROLES:     'roles',
    AUDIT:     'audit',
    PUBLIC:    'public',
};

// ─── Tier → required USER permission ─────────────────────────────────────
const TIER_USER_PERMS = {
    [TIERS.DANGEROUS]: [],
    [TIERS.ADMIN]:     [],
    [TIERS.BAN]:       [PermissionFlagsBits.BanMembers],
    [TIERS.KICK]:      [PermissionFlagsBits.KickMembers],
    [TIERS.MOD]:       [PermissionFlagsBits.ModerateMembers],
    [TIERS.MSG]:       [PermissionFlagsBits.ManageMessages],
    [TIERS.CHANNEL]:   [PermissionFlagsBits.ManageChannels],
    [TIERS.GUILD]:     [PermissionFlagsBits.ManageGuild],
    [TIERS.ROLES]:     [PermissionFlagsBits.ManageRoles],
    [TIERS.AUDIT]:     [PermissionFlagsBits.ViewAuditLog],
    [TIERS.PUBLIC]:    [],
};

// ─── Tier → required BOT permission ──────────────────────────────────────
const TIER_BOT_PERMS = {
    [TIERS.DANGEROUS]: [],
    [TIERS.ADMIN]:     [],
    [TIERS.BAN]:       [PermissionFlagsBits.BanMembers],
    [TIERS.KICK]:      [PermissionFlagsBits.KickMembers],
    [TIERS.MOD]:       [PermissionFlagsBits.ModerateMembers],
    [TIERS.MSG]:       [PermissionFlagsBits.ManageMessages],
    [TIERS.CHANNEL]:   [PermissionFlagsBits.ManageChannels],
    [TIERS.GUILD]:     [],
    [TIERS.ROLES]:     [PermissionFlagsBits.ManageRoles],
    [TIERS.AUDIT]:     [PermissionFlagsBits.ViewAuditLog],
    [TIERS.PUBLIC]:    [],
};

// ─── Extra bot perms for specific commands ────────────────────────────────
const EXTRA_BOT_PERMS = {
    starboard:  [PermissionFlagsBits.AddReactions, PermissionFlagsBits.SendMessages],
    reactroles: [PermissionFlagsBits.AddReactions],
    gcreate:    [PermissionFlagsBits.AddReactions, PermissionFlagsBits.SendMessages],
    activity:   [PermissionFlagsBits.Connect],
};

// ─── Human-readable perm names ────────────────────────────────────────────
const PERM_NAMES = new Map([
    [PermissionFlagsBits.Administrator,   'Administrator'],
    [PermissionFlagsBits.BanMembers,      'Ban Members'],
    [PermissionFlagsBits.KickMembers,     'Kick Members'],
    [PermissionFlagsBits.ModerateMembers, 'Timeout Members'],
    [PermissionFlagsBits.ManageMessages,  'Manage Messages'],
    [PermissionFlagsBits.ManageChannels,  'Manage Channels'],
    [PermissionFlagsBits.ManageGuild,     'Manage Server'],
    [PermissionFlagsBits.ManageRoles,     'Manage Roles'],
    [PermissionFlagsBits.ViewAuditLog,    'View Audit Log'],
    [PermissionFlagsBits.AddReactions,    'Add Reactions'],
    [PermissionFlagsBits.SendMessages,    'Send Messages'],
    [PermissionFlagsBits.Connect,         'Connect to Voice'],
]);
const pName = f => PERM_NAMES.get(f) ?? 'Unknown Permission';

// ─── Tier label for display ───────────────────────────────────────────────
export const TIER_LABELS = {
    [TIERS.DANGEROUS]: '👑 Owner / Administrator Only',
    [TIERS.ADMIN]:     '🛡️ Administrator',
    [TIERS.BAN]:       '🔨 Ban Members',
    [TIERS.KICK]:      '👢 Kick Members',
    [TIERS.MOD]:       '⏳ Timeout Members',
    [TIERS.MSG]:       '🗑️ Manage Messages',
    [TIERS.CHANNEL]:   '📢 Manage Channels',
    [TIERS.GUILD]:     '⚙️ Manage Server',
    [TIERS.ROLES]:     '🎭 Manage Roles',
    [TIERS.AUDIT]:     '📋 View Audit Log',
    [TIERS.PUBLIC]:    '🌍 Everyone',
};

// ═══════════════════════════════════════════════════════════════════════════
//  COMMAND → TIER MAP
// ═══════════════════════════════════════════════════════════════════════════
export const COMMAND_TIERS = {
    // Dangerous
    massban:         TIERS.DANGEROUS,
    wipedata:        TIERS.DANGEROUS,
    void:            TIERS.DANGEROUS,
    transfermodlogs: TIERS.DANGEROUS,
    botconfig:       TIERS.DANGEROUS,

    // Admin
    automod:            TIERS.ADMIN,
    logging:            TIERS.ADMIN,
    welcome:            TIERS.ADMIN,
    goodbye:            TIERS.ADMIN,
    greet:              TIERS.ADMIN,
    autorole:           TIERS.ADMIN,
    'app-admin':        TIERS.ADMIN,
    verification:       TIERS.ADMIN,
    autoverify:         TIERS.ADMIN,
    autoVerify:         TIERS.ADMIN,
    jointocreate:       TIERS.ADMIN,
    starboard:          TIERS.ADMIN,
    overview:           TIERS.ADMIN,
    ticket:             TIERS.ADMIN,
    serverstats:        TIERS.ADMIN,
    serverstats_create: TIERS.ADMIN,
    serverstats_delete: TIERS.ADMIN,
    serverstats_update: TIERS.ADMIN,
    serverstats_list:   TIERS.ADMIN,
    birthday_setchannel:TIERS.ADMIN,

    // Ban
    ban:     TIERS.BAN,
    unban:   TIERS.BAN,
    softban: TIERS.BAN,

    // Kick
    kick:     TIERS.KICK,
    masskick: TIERS.KICK,

    // Mod
    timeout:   TIERS.MOD,
    untimeout: TIERS.MOD,
    warn:      TIERS.MOD,
    warnings:  TIERS.MOD,
    modlogs:   TIERS.MOD,
    case:      TIERS.MOD,
    editcase:  TIERS.MOD,
    modstats:  TIERS.MOD,
    dm:        TIERS.MOD,
    usernotes: TIERS.MOD,
    slowmode:  TIERS.MOD,

    // Msg
    purge:     TIERS.MSG,
    say:       TIERS.MSG,
    autoreply: TIERS.MSG,

    // Channel
    lock:   TIERS.CHANNEL,
    unlock: TIERS.CHANNEL,

    // Guild
    gcreate:     TIERS.GUILD,
    gend:        TIERS.GUILD,
    gdelete:     TIERS.GUILD,
    greroll:     TIERS.GUILD,
    levelset:    TIERS.GUILD,
    leveladd:    TIERS.GUILD,
    levelremove: TIERS.GUILD,
    level:       TIERS.GUILD,

    // Audit
    cases: TIERS.AUDIT,

    // Roles
    reactroles: TIERS.ROLES,

    // Public
    help: TIERS.PUBLIC, ping: TIERS.PUBLIC, stats: TIERS.PUBLIC,
    support: TIERS.PUBLIC, bug: TIERS.PUBLIC, uptime: TIERS.PUBLIC,
    balance: TIERS.PUBLIC, beg: TIERS.PUBLIC, buy: TIERS.PUBLIC,
    crime: TIERS.PUBLIC, daily: TIERS.PUBLIC, deposit: TIERS.PUBLIC,
    eleaderboard: TIERS.PUBLIC, fish: TIERS.PUBLIC, gamble: TIERS.PUBLIC,
    inventory: TIERS.PUBLIC, mine: TIERS.PUBLIC, pay: TIERS.PUBLIC,
    rob: TIERS.PUBLIC, shop: TIERS.PUBLIC, slut: TIERS.PUBLIC,
    withdraw: TIERS.PUBLIC, work: TIERS.PUBLIC,
    fact: TIERS.PUBLIC, fight: TIERS.PUBLIC, flip: TIERS.PUBLIC,
    mock: TIERS.PUBLIC, reverse: TIERS.PUBLIC, roll: TIERS.PUBLIC,
    ship: TIERS.PUBLIC, wanted: TIERS.PUBLIC,
    leaderboard: TIERS.PUBLIC, rank: TIERS.PUBLIC,
    avatar: TIERS.PUBLIC, serverinfo: TIERS.PUBLIC, userinfo: TIERS.PUBLIC,
    weather: TIERS.PUBLIC, remindme: TIERS.PUBLIC, roles: TIERS.PUBLIC,
    whois: TIERS.PUBLIC, quote: TIERS.PUBLIC, report: TIERS.PUBLIC,
    firstmsg: TIERS.PUBLIC, todo: TIERS.PUBLIC,
    define: TIERS.PUBLIC, google: TIERS.PUBLIC, movie: TIERS.PUBLIC,
    urban: TIERS.PUBLIC,
    baseconvert: TIERS.PUBLIC, calculate: TIERS.PUBLIC, countdown: TIERS.PUBLIC,
    embedbuilder: TIERS.PUBLIC, generatepassword: TIERS.PUBLIC,
    hexcolor: TIERS.PUBLIC, poll: TIERS.PUBLIC, randomuser: TIERS.PUBLIC,
    shorten: TIERS.PUBLIC, time: TIERS.PUBLIC, unixtime: TIERS.PUBLIC,
    birthday: TIERS.PUBLIC, birthday_info: TIERS.PUBLIC,
    birthday_list: TIERS.PUBLIC, birthday_remove: TIERS.PUBLIC,
    birthday_set: TIERS.PUBLIC, next_birthdays: TIERS.PUBLIC,
    verify: TIERS.PUBLIC, apply: TIERS.PUBLIC,
    claim: TIERS.PUBLIC, close: TIERS.PUBLIC, priority: TIERS.PUBLIC,
    activity: TIERS.PUBLIC,
};

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Load guild role overrides from DB. Cached per interaction call (not across calls). */
async function getGuildOverrides(guildId) {
    try {
        return await getFromDb(`guild:${guildId}:cmd_perms`, {});
    } catch {
        return {};
    }
}

/** Build a denied embed using the bot's error theme. */
function deniedEmbed(title, lines) {
    return createEmbed({
        title,
        description: lines.join('\n'),
        color: 'error',
        timestamp: true,
    });
}

/** Build a bot-missing-perms embed using the warning theme. */
function botMissingEmbed(missing) {
    return createEmbed({
        title: '⚙️ Bot Missing Permission',
        description: [
            "I'm missing a required permission to run this command:",
            `\`\`\`${missing}\`\`\``,
            '_Please ask a server administrator to grant me this permission._',
        ].join('\n'),
        color: 'warning',
        timestamp: true,
    });
}

// ─── Bot perm check (reused across all paths) ─────────────────────────────
function checkBotPerms(interaction, commandName, botMember) {
    const tier        = COMMAND_TIERS[commandName] ?? TIERS.PUBLIC;
    const tierPerms   = TIER_BOT_PERMS[tier] ?? [];
    const extraPerms  = EXTRA_BOT_PERMS[commandName] ?? [];
    const needed      = [...new Set([...tierPerms, ...extraPerms])];

    if (needed.length === 0) return { allowed: true };

    const ch = interaction.channel;
    const missing = needed.filter(p => {
        const chPerms = ch ? botMember.permissionsIn(ch) : null;
        return chPerms ? !chPerms.has(p) : !botMember.permissions.has(p);
    });

    if (missing.length === 0) return { allowed: true };

    return {
        allowed: false,
        reason: 'bot',
        embed: botMissingEmbed(missing.map(pName).join(', ')),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════
export async function checkPermissions(interaction, commandName) {
    if (!interaction.guild) return { allowed: true };

    const tier      = COMMAND_TIERS[commandName] ?? TIERS.PUBLIC;
    const member    = interaction.member;
    const botMember = interaction.guild.members.me;
    const isOwner   = interaction.guild.ownerId === interaction.user.id;
    const isAdmin   = member.permissions.has(PermissionFlagsBits.Administrator);

    // ── 1. PUBLIC — fast exit ─────────────────────────────────────────────
    if (tier === TIERS.PUBLIC) {
        return checkBotPerms(interaction, commandName, botMember);
    }

    // ── 2. Server owner — always allowed ──────────────────────────────────
    if (isOwner) {
        return checkBotPerms(interaction, commandName, botMember);
    }

    // ── 3. DANGEROUS — owner already handled above, only admin left ───────
    if (tier === TIERS.DANGEROUS) {
        if (!isAdmin) {
            return {
                allowed: false,
                reason: 'user',
                embed: deniedEmbed('❌ Access Denied', [
                    '🔒 This command can only be used by:',
                    '> 👑 **Server Owner**',
                    '> 🛡️ Members with **Administrator** permission',
                    '',
                    '*This is a high-risk command that can cause irreversible changes.*',
                ]),
            };
        }
        return checkBotPerms(interaction, commandName, botMember);
    }

    // ── 4. Administrator — bypasses role overrides & tier checks ──────────
    if (isAdmin) {
        return checkBotPerms(interaction, commandName, botMember);
    }

    // ── 5. Guild role overrides (configured via /botconfig permissions) ───
    //   If the server admin has assigned specific roles to this command,
    //   those roles can use it regardless of the default tier.
    try {
        const overrides = await getGuildOverrides(interaction.guild.id);
        const allowedRoles = overrides[commandName]; // string[] of role IDs

        if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
            const hasRole = allowedRoles.some(rid => member.roles.cache.has(rid));
            if (hasRole) {
                // Role override matched — still check bot perms
                return checkBotPerms(interaction, commandName, botMember);
            }

            // Override exists but user doesn't have any allowed role
            const roleList = allowedRoles
                .map(rid => `<@&${rid}>`)
                .join(', ');

            return {
                allowed: false,
                reason: 'role_override',
                embed: deniedEmbed('❌ Missing Required Role', [
                    '🔒 You need one of the following roles to use this command:',
                    `> ${roleList}`,
                    '',
                    '*This was configured by a server administrator.*',
                ]),
            };
        }
    } catch (err) {
        logger.warn(`[PermGuard] Failed to load role overrides for guild ${interaction.guild.id}:`, err.message);
        // Fall through to default tier check if DB fails
    }

    // ── 6. Default tier check ─────────────────────────────────────────────
    if (tier === TIERS.ADMIN) {
        // Only reaches here if not owner and not admin (both handled above)
        return {
            allowed: false,
            reason: 'user',
            embed: deniedEmbed('❌ Administrator Required', [
                '🔒 This command requires:',
                '> 👑 **Server Owner**',
                '> 🛡️ **Administrator** permission',
                '> Or a specifically assigned role (see `/botconfig permissions view`)',
            ]),
        };
    }

    const requiredPerms = TIER_USER_PERMS[tier] ?? [];
    const missingPerms  = requiredPerms.filter(p => !member.permissions.has(p));

    if (missingPerms.length > 0) {
        const missingStr = missingPerms.map(pName).join(', ');
        return {
            allowed: false,
            reason: 'user',
            embed: deniedEmbed('❌ Missing Permission', [
                '🔒 You need the following permission to use this command:',
                `\`\`\`${missingStr}\`\`\``,
                '',
                '*Server owners and Administrators bypass this.*',
                '*A server admin can also grant access via `/botconfig permissions setrole`.*',
            ]),
        };
    }

    // User passed — check bot perms
    return checkBotPerms(interaction, commandName, botMember);
}
