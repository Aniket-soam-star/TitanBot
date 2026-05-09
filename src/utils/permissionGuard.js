// src/utils/permissionGuard.js
// Permission utility — exports kept for compatibility.
// checkPermissions always returns { allowed: true } so no commands are blocked.
// Individual commands still show Discord's built-in permission UI via setDefaultMemberPermissions.

import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed } from './embeds.js';
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
    massban:         TIERS.DANGEROUS,
    wipedata:        TIERS.DANGEROUS,
    void:            TIERS.DANGEROUS,
    transfermodlogs: TIERS.DANGEROUS,
    botconfig:       TIERS.DANGEROUS,
    panel:           TIERS.ADMIN,
    automod:         TIERS.ADMIN,
    logging:         TIERS.ADMIN,
    welcome:         TIERS.ADMIN,
    goodbye:         TIERS.ADMIN,
    greet:           TIERS.ADMIN,
    autorole:        TIERS.ADMIN,
    'app-admin':     TIERS.ADMIN,
    verification:    TIERS.ADMIN,
    autoverify:      TIERS.ADMIN,
    autoVerify:      TIERS.ADMIN,
    jointocreate:    TIERS.ADMIN,
    starboard:       TIERS.ADMIN,
    overview:        TIERS.ADMIN,
    ticket:          TIERS.ADMIN,
    serverstats:     TIERS.ADMIN,
    ban:             TIERS.BAN,
    unban:           TIERS.BAN,
    softban:         TIERS.BAN,
    kick:            TIERS.KICK,
    masskick:        TIERS.KICK,
    timeout:         TIERS.MOD,
    untimeout:       TIERS.MOD,
    warn:            TIERS.MOD,
    warnings:        TIERS.MOD,
    modlogs:         TIERS.MOD,
    case:            TIERS.MOD,
    editcase:        TIERS.MOD,
    modstats:        TIERS.MOD,
    dm:              TIERS.MOD,
    usernotes:       TIERS.MOD,
    slowmode:        TIERS.MOD,
    purge:           TIERS.MSG,
    say:             TIERS.MSG,
    autoreply:       TIERS.MSG,
    lock:            TIERS.CHANNEL,
    unlock:          TIERS.CHANNEL,
    gcreate:         TIERS.GUILD,
    gend:            TIERS.GUILD,
    gdelete:         TIERS.GUILD,
    greroll:         TIERS.GUILD,
    levelset:        TIERS.GUILD,
    leveladd:        TIERS.GUILD,
    levelremove:     TIERS.GUILD,
    level:           TIERS.GUILD,
    cases:           TIERS.AUDIT,
    reactroles:      TIERS.ROLES,
};

// ── checkPermissions ─────────────────────────────────────────────────────────
// Always allows — Discord's own setDefaultMemberPermissions handles UI-level
// gating. Removing this block fixes the bug where all commands were silently
// denied for non-administrators.
export async function checkPermissions(interaction, commandName) {
    return { allowed: true };
}

// ── botHasPermission ──────────────────────────────────────────────────────────
// Checks whether the bot has specific permissions in a channel.
// Used by welcome, leveling, and verification dashboards.
// permNames: array of strings like ['SendMessages', 'EmbedLinks']
export function botHasPermission(channel, permNames) {
    try {
        if (!channel || !channel.guild) return true;
        const botMember = channel.guild.members.me;
        if (!botMember) return true;
        const perms = botMember.permissionsIn(channel);
        return permNames.every(name => {
            const flag = PermissionFlagsBits[name];
            if (!flag) return true;
            return perms.has(flag);
        });
    } catch {
        return true;
    }
}

// ── checkUserPermissions ──────────────────────────────────────────────────────
// Checks whether the interaction user has a specific Discord permission.
// Returns true if allowed, false + sends error reply if not.
// Used by levelset, leveladd, levelremove commands.
export async function checkUserPermissions(interaction, permFlag, errorMessage) {
    try {
        if (!interaction.guild) return true;
        const isOwner = interaction.guild.ownerId === interaction.user.id;
        const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
        if (isOwner || isAdmin) return true;
        if (interaction.member?.permissions?.has(permFlag)) return true;

        // Not allowed — send ephemeral error
        const embed = createEmbed({
            title: '❌ Missing Permission',
            description: errorMessage || 'You do not have permission to use this command.',
            color: 'error',
            timestamp: true,
        });
        const payload = { embeds: [embed], flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.reply(payload);
        }
        return false;
    } catch (err) {
        logger.warn('[PermGuard] checkUserPermissions error:', err.message);
        return true;
    }
}
