// 📁 NEW FILE → src/commands/Moderation/editcase.js

import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('editcase')
        .setDescription('Edit the reason on a moderation case')
        .addIntegerOption(o =>
            o.setName('id').setDescription('Case ID to edit').setRequired(true).setMinValue(1)
        )
        .addStringOption(o =>
            o.setName('reason').setDescription('New reason for the case').setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        try {
            const caseId    = interaction.options.getInteger('id');
            const newReason = interaction.options.getString('reason');
            const guildId   = interaction.guild.id;
            const key       = `moderation_case_${guildId}_${caseId}`;

            const c = await getFromDb(key, null);
            if (!c) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(`No case found with ID **#${caseId}**`)],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Only the original moderator or an admin can edit
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            const isOwner = c.moderatorId === interaction.user.id;
            if (!isAdmin && !isOwner) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('You can only edit cases you created, or you need Administrator.')],
                    flags: MessageFlags.Ephemeral
                });
            }

            const oldReason = c.reason || 'No reason provided';
            const editEntry = {
                oldReason,
                newReason,
                editedBy: interaction.user.id,
                editedAt: new Date().toISOString()
            };

            const updated = {
                ...c,
                reason: newReason,
                editHistory: [...(c.editHistory || []), editEntry],
                updatedAt: new Date().toISOString()
            };
            await setInDb(key, updated);

            // Keep the case list in sync
            const listKey  = `moderation_cases_list_${guildId}`;
            const caseList = await getFromDb(listKey, []);
            const idx      = caseList.findIndex(x => x.caseId === caseId);
            if (idx !== -1) {
                caseList[idx] = { ...caseList[idx], reason: newReason };
                await setInDb(listKey, caseList);
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(
                    `Case **#${caseId}** reason updated.\n\n**Old:** ${oldReason}\n**New:** ${newReason}`,
                    '✏️ Case Edited'
                )]
            });
        } catch (error) {
            logger.error('Editcase command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Failed to edit case.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
