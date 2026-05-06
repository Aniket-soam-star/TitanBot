// 📁 NEW FILE → src/commands/Moderation/case.js

import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getFromDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ACTION_ICONS = {
    'Member Banned':      '🔨',
    'Member Kicked':      '👢',
    'Member Timed Out':   '⏳',
    'User Warned':        '⚠️',
    'Member Softbanned':  '🔁',
    'Messages Purged':    '🗑️',
    'Channel Locked':     '🔒',
};

export default {
    data: new SlashCommandBuilder()
        .setName('case')
        .setDescription('Look up a specific moderation case by ID')
        .addIntegerOption(o =>
            o.setName('id').setDescription('Case ID number').setRequired(true).setMinValue(1)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        try {
            const caseId  = interaction.options.getInteger('id');
            const guildId = interaction.guild.id;
            const key     = `moderation_case_${guildId}_${caseId}`;
            const c       = await getFromDb(key, null);

            if (!c) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(`No case found with ID **#${caseId}** in this server.`)],
                    flags: MessageFlags.Ephemeral
                });
            }

            const icon   = ACTION_ICONS[c.action] || '🔹';
            const date   = new Date(c.createdAt).toLocaleString();
            const voided = c.voided
                ? '\n> ⚠️ **This case has been voided** and is no longer active.'
                : '';

            const embed = createEmbed({
                title: `${icon} Case #${caseId} — ${c.action}`,
                description: voided,
                color: c.voided ? 'warning' : 'moderation',
                fields: [
                    { name: '👤 Target',     value: c.target     || c.targetUserId || 'Unknown', inline: true },
                    { name: '🛡️ Moderator', value: c.executor   || c.moderatorId  || 'Unknown', inline: true },
                    { name: '📅 Date',       value: date,                                        inline: true },
                    { name: '📝 Reason',     value: c.reason || 'No reason provided',            inline: false },
                ]
            });

            if (c.editHistory?.length > 0) {
                const last = c.editHistory.at(-1);
                embed.addFields({
                    name: '✏️ Last Edit',
                    value: `By <@${last.editedBy}> — ${new Date(last.editedAt).toLocaleDateString()}\nOld reason: *${last.oldReason}*`,
                    inline: false
                });
            }

            embed.setFooter({ text: `Guild: ${interaction.guild.name}` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('Case command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Failed to fetch case.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
