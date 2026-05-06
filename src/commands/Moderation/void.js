// 📁 NEW FILE → src/commands/Moderation/void.js

import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { getModerationCases } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('void')
        .setDescription('Nullify (void) a moderation case so it no longer counts against a user')
        .addIntegerOption(o =>
            o.setName('id').setDescription('Case ID to void').setRequired(true).setMinValue(1)
        )
        .addStringOption(o =>
            o.setName('reason').setDescription('Reason for voiding this case')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        try {
            const caseId  = interaction.options.getInteger('id');
            const reason  = interaction.options.getString('reason') || 'No reason provided';
            const guildId = interaction.guild.id;
            const key     = `moderation_case_${guildId}_${caseId}`;

            const c = await getFromDb(key, null);
            if (!c) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(`No case found with ID **#${caseId}**`)],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (c.voided) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(`Case **#${caseId}** is already voided.`)],
                    flags: MessageFlags.Ephemeral
                });
            }

            const updated = {
                ...c,
                voided: true,
                voidedBy: interaction.user.id,
                voidReason: reason,
                voidedAt: new Date().toISOString()
            };
            await setInDb(key, updated);

            // Also mark it in the case list
            const listKey  = `moderation_cases_list_${guildId}`;
            const caseList = await getFromDb(listKey, []);
            const idx      = caseList.findIndex(x => x.caseId === caseId);
            if (idx !== -1) {
                caseList[idx] = { ...caseList[idx], voided: true };
                await setInDb(listKey, caseList);
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(
                    `Case **#${caseId}** has been voided.\n**Reason:** ${reason}`,
                    '🚫 Case Voided'
                )]
            });
        } catch (error) {
            logger.error('Void command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Failed to void case.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
