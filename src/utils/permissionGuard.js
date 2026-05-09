// 📁 REPLACE → src/utils/permissionGuard.js
// Change from original: added `panel` to COMMAND_TIERS as TIERS.ADMIN

import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from './embeds.js';
import { getFromDb } from './database.js';
import { logger } from './logger.js';

export const TIERS = {
    DANGEROUS: 'dangerous',
    ADMIN:     'admin',
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

const EXTRA_BOT_PERMS = {
    starboard:  [PermissionFlagsBits.AddReactions, PermissionFlagsBits.SendMessages],
    reactroles: [PermissionFlagsBits.AddReactions],
    gcreate:    [PermissionFlagsBits.AddReactions, PermissionFlagsBits.SendMessages],
    activity:   [PermissionFlagsBits.Connect],
};

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

export const COMMAND_TIERS = {
    // Dangerous — owner or admin only
    massban:         TIERS.DANGEROUS,
    wipedata:        TIERS.DANGEROUS,
    void:            TIERS.DANGEROUS,
    transfermodlogs: TIERS.DANGEROUS,
    botconfig:       TIERS.DANGEROUS,

    // Admin
    panel:              TIERS.ADMIN,   // ← ADDED (was missing, defaulted to PUBLIC)
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
    shortcuts: TIERS.PUBLIC,
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

async function getGuildOverrides(guildId) {
    try {
        return await getFromDb(`guild:${guildId}:cmd_perms`, {});
    } catch {
        return {};
    }
}

function deniedEmbed(title, lines) {
    return createEmbed({
        title,
        description: lines.join('\n'),
        color: 'error',
        timestamp: true,
    });
}

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

function checkBotPerms(interaction, commandName, botMember) {
    const tier       = COMMAND_TIERS[commandName] ?? TIERS.PUBLIC;
    const tierPerms  = TIER_BOT_PERMS[tier] ?? [];
    const extraPerms = EXTRA_BOT_PERMS[commandName] ?? [];
    const needed     = [...new Set([...tierPerms, ...extraPerms])];

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

export async function checkPermissions(interaction, commandName) {
    if (!interaction.guild) return { allowed: true };

    const tier      = COMMAND_TIERS[commandName] ?? TIERS.PUBLIC;
    const member    = interaction.member;
    const botMember = interaction.guild.members.me;
    const isOwner   = interaction.guild.ownerId === interaction.user.id;
    const isAdmin   = member.permissions.has(PermissionFlagsBits.Administrator);

    if (tier === TIERS.PUBLIC) {
        return checkBotPerms(interaction, commandName, botMember);
    }

    if (isOwner) {
        return checkBotPerms(interaction, commandName, botMember);
    }

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

    if (isAdmin) {
        return checkBotPerms(interaction, commandName, botMember);
    }

    try {
        const overrides    = await getGuildOverrides(interaction.guild.id);
        const allowedRoles = overrides[commandName];

        if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
            const hasRole = allowedRoles.some(rid => member.roles.cache.has(rid));
            if (hasRole) {
                return checkBotPerms(interaction, commandName, botMember);
            }

            const roleList = allowedRoles.map(rid => `<@&${rid}>`).join(', ');
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
    }

    if (tier === TIERS.ADMIN) {
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

    return checkBotPerms(interaction, commandName, botMember);
}
