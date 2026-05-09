// src/utils/roleGuard.js
//
// Replaces all hardcoded .permissions.has() checks across commands.
// The server owner can use /botconfig permissions setrole to grant any role
// access to any command. This utility checks those overrides first, then
// falls back to whether the user has the expected Discord permission.
//
// DB key: guild:{guildId}:cmd_perms
// Shape:  { [commandName]: [roleId, roleId, ...] }
//
// Usage:
//   const allowed = await hasCommandAccess(interaction, 'ban');
//   if (!allowed) return; // already replied with error

import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getFromDb } from './database.js';
import { createEmbed } from './embeds.js';
import { logger } from './logger.js';

// Map command names → the Discord permission that applies by default.
// If a role override exists in the DB, this is bypassed entirely.
const DEFAULT_PERM = {
    // Moderation
    ban:             PermissionFlagsBits.BanMembers,
    unban:           PermissionFlagsBits.BanMembers,
    softban:         PermissionFlagsBits.BanMembers,
    massban:         PermissionFlagsBits.BanMembers,
    kick:            PermissionFlagsBits.KickMembers,
    masskick:        PermissionFlagsBits.KickMembers,
    timeout:         PermissionFlagsBits.ModerateMembers,
    untimeout:       PermissionFlagsBits.ModerateMembers,
    warn:            PermissionFlagsBits.ModerateMembers,
    warnings:        PermissionFlagsBits.ModerateMembers,
    modlogs:         PermissionFlagsBits.ModerateMembers,
    case:            PermissionFlagsBits.ModerateMembers,
    editcase:        PermissionFlagsBits.ModerateMembers,
    cases:           PermissionFlagsBits.ModerateMembers,
    modstats:        PermissionFlagsBits.ModerateMembers,
    dm:              PermissionFlagsBits.ModerateMembers,
    usernotes:       PermissionFlagsBits.ModerateMembers,
    slowmode:        PermissionFlagsBits.ModerateMembers,
    purge:           PermissionFlagsBits.ManageMessages,
    say:             PermissionFlagsBits.ManageMessages,
    autoreply:       PermissionFlagsBits.ManageMessages,
    lock:            PermissionFlagsBits.ManageChannels,
    unlock:          PermissionFlagsBits.ManageChannels,
    // Admin / guild management
    welcome:         PermissionFlagsBits.ManageGuild,
    goodbye:         PermissionFlagsBits.ManageGuild,
    greet:           PermissionFlagsBits.ManageGuild,
    autorole:        PermissionFlagsBits.ManageGuild,
    logging:         PermissionFlagsBits.ManageGuild,
    automod:         PermissionFlagsBits.ManageGuild,
    ticket:          PermissionFlagsBits.ManageGuild,
    verification:    PermissionFlagsBits.ManageGuild,
    autoverify:      PermissionFlagsBits.ManageGuild,
    overview:        PermissionFlagsBits.ManageGuild,
    serverstats:     PermissionFlagsBits.ManageChannels,
    jointocreate:    PermissionFlagsBits.ManageChannels,
    starboard:       PermissionFlagsBits.ManageGuild,
    reactroles:      PermissionFlagsBits.ManageRoles,
    gcreate:         PermissionFlagsBits.ManageGuild,
    gend:            PermissionFlagsBits.ManageGuild,
    gdelete:         PermissionFlagsBits.ManageGuild,
    greroll:         PermissionFlagsBits.ManageGuild,
    levelset:        PermissionFlagsBits.ManageGuild,
    leveladd:        PermissionFlagsBits.ManageGuild,
    levelremove:     PermissionFlagsBits.ManageGuild,
    level:           PermissionFlagsBits.ManageGuild,
    'app-admin':     PermissionFlagsBits.ManageGuild,
    birthday_setchannel: PermissionFlagsBits.ManageGuild,
    report:          PermissionFlagsBits.ManageGuild,
    botconfig:       PermissionFlagsBits.Administrator,
    panel:           PermissionFlagsBits.Administrator,
    wipedata:        PermissionFlagsBits.Administrator,
    transfermodlogs: PermissionFlagsBits.Administrator,
    void:            PermissionFlagsBits.Administrator,
};

/**
 * Check if the interaction user can run `commandName`.
 *
 * Priority order:
 *   1. Server owner → always allowed
 *   2. Administrator → always allowed
 *   3. Role override in DB → allowed if user has any of the override roles
 *   4. Default Discord permission for the command → allowed if user has it
 *   5. Denied — sends ephemeral error and returns false
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} commandName  exact command name (no slash)
 * @returns {Promise<boolean>}  true = proceed, false = already replied with denial
 */
export async function hasCommandAccess(interaction, commandName) {
    if (!interaction.guild) return true; // DMs — allow

    const member  = interaction.member;
    const isOwner = interaction.guild.ownerId === interaction.user.id;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    // Owners and admins always pass
    if (isOwner || isAdmin) return true;

    // Check DB role overrides
    try {
        const permKey   = `guild:${interaction.guild.id}:cmd_perms`;
        const overrides = await getFromDb(permKey, {});
        const roleIds   = overrides[commandName];

        if (Array.isArray(roleIds) && roleIds.length > 0) {
            const hasRole = roleIds.some(id => member.roles.cache.has(id));
            if (hasRole) return true;

            // Has overrides but user doesn't have them — deny with role list
            const roleList = roleIds.map(id => `<@&${id}>`).join(', ');
            await _deny(interaction, [
                `You need one of the following roles to use \`/${commandName}\`:`,
                `> ${roleList}`,
                '',
                '*Ask a server administrator to assign you the required role.*',
            ]);
            return false;
        }
    } catch (err) {
        logger.warn(`[RoleGuard] DB lookup failed for ${commandName}:`, err.message);
        // Fall through to default perm check
    }

    // Default Discord permission check
    const required = DEFAULT_PERM[commandName];
    if (required && !member.permissions.has(required)) {
        await _deny(interaction, [
            `You don't have permission to use \`/${commandName}\`.`,
            '',
            '*Server owners can grant roles access via:*',
            `\`/botconfig permissions setrole command:${commandName} role:@YourRole\``,
        ]);
        return false;
    }

    return true;
}

async function _deny(interaction, lines) {
    const embed = createEmbed({
        title: '❌ Permission Denied',
        description: lines.join('\n'),
        color: 'error',
        timestamp: true,
    });
    const payload = { embeds: [embed], flags: MessageFlags.Ephemeral };
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch (e) {
        logger.warn('[RoleGuard] Could not send denial message:', e.message);
    }
}
