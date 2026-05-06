// 📁 NEW FILE → src/commands/Moderation/softban.js

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('softban')
        .setDescription('Ban then immediately unban a user to purge their recent messages')
        .addUserOption(o =>
            o.setName('target').setDescription('User to softban').setRequired(true)
        )
        .addStringOption(o =>
            o.setName('reason').setDescription('Reason for the softban')
        )
        .addIntegerOption(o =>
            o.setName('days')
                .setDescription('Days of messages to delete (1–7, default 1)')
                .setMinValue(1)
                .setMaxValue(7)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            const user    = interaction.options.getUser('target');
            const reason  = interaction.options.getString('reason') || 'No reason provided';
            const days    = interaction.options.getInteger('days') ?? 1;

            if (user.id === interaction.user.id) throw new Error('You cannot softban yourself.');
            if (user.id === client.user.id)       throw new Error('You cannot softban the bot.');

            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            if (member) {
                const hier = ModerationService.validateHierarchy(interaction.member, member, 'softban');
                if (!hier.valid) throw new Error(hier.error);
                const botHier = ModerationService.validateBotHierarchy(client, member, 'softban');
                if (!botHier.valid) throw new Error(botHier.error);
            }

            // Ban with message purge
            await interaction.guild.members.ban(user.id, {
                deleteMessageDays: days,
                reason: `[Softban] ${reason} | Mod: ${interaction.user.tag}`
            });

            // Immediately unban
            await interaction.guild.members.unban(user.id, `Softban unban | ${reason}`);

            await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: 'Member Softbanned',
                    target: `${user.tag} (${user.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason,
                    metadata: { userId: user.id, moderatorId: interaction.user.id, deleteDays: days }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(
                    `🔨 **Softbanned** ${user.tag}\n**Reason:** ${reason}\n**Messages purged:** Last ${days} day(s)`,
                    '✅ Softban Complete'
                )]
            });
        } catch (error) {
            logger.error('Softban command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'softban_failed' });
        }
    }
};
