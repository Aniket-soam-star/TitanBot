import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { hasCommandAccess } from '../../utils/roleGuard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(option =>
            option.setName('target').setDescription('The user to ban').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason').setDescription('Reason for the ban')
        )
        .addIntegerOption(option =>
            option.setName('delete_days')
                .setDescription('Delete message history (days, 0–7)')
                .setMinValue(0).setMaxValue(7)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: 'moderation',

    async execute(interaction, config, client) {
        try {
            const user      = interaction.options.getUser('target');
            const reason    = interaction.options.getString('reason') || 'No reason provided';
            const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

            if (user.id === interaction.user.id) {
                throw new TitanBotError('Cannot ban yourself', ErrorTypes.VALIDATION, 'You cannot ban yourself.');
            }
            if (user.id === client.user.id) {
                throw new TitanBotError('Cannot ban the bot', ErrorTypes.VALIDATION, 'You cannot ban the bot.');
            }

            // Fetch the target as a guild member if they are in the server
            const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);

            if (targetMember) {
                // Role hierarchy: moderator must outrank target
                if (interaction.member.roles.highest.position <= targetMember.roles.highest.position) {
                    throw new TitanBotError(
                        'Hierarchy violation',
                        ErrorTypes.PERMISSION,
                        'You cannot ban a user with an equal or higher role than you.'
                    );
                }

                // Check bot can actually ban this member
                if (!targetMember.bannable) {
                    throw new TitanBotError(
                        'Bot cannot ban',
                        ErrorTypes.PERMISSION,
                        'I cannot ban this user. Make sure my role is above theirs and I have the **Ban Members** permission.'
                    );
                }
            } else {
            }

            // Execute the ban
            await interaction.guild.members.ban(user.id, {
                reason,
                deleteMessageSeconds: deleteDays * 86400,
            });

            // Log moderation action
            const caseId = await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: 'Member Banned',
                    target: `${user.tag} (${user.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason,
                    metadata: {
                        userId: user.id,
                        moderatorId: interaction.user.id,
                        permanent: true,
                        deleteDays,
                    },
                },
            });

            logger.info(`User banned: ${user.tag} by ${interaction.user.tag} in ${interaction.guild.name}`);

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        `🚫 **Banned** ${user.tag}`,
                        `**Reason:** ${reason}\n**Case ID:** #${caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Ban command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'ban_failed' });
        }
    },
};
