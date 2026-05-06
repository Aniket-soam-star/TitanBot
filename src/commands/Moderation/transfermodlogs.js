// 📁 NEW FILE → src/commands/Moderation/transfermodlogs.js
//
// Moves all moderation cases from one user to another.
// Useful when someone rejoins with an alt or after a username change.

import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('transfermodlogs')
        .setDescription("Transfer all moderation cases from one user's history to another")
        .addUserOption(o =>
            o.setName('from').setDescription('User to transfer cases FROM').setRequired(true)
        )
        .addUserOption(o =>
            o.setName('to').setDescription('User to transfer cases TO').setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        try {
            const fromUser = interaction.options.getUser('from');
            const toUser   = interaction.options.getUser('to');
            const guildId  = interaction.guild.id;

            if (fromUser.id === toUser.id) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Source and destination users must be different.')],
                    flags: MessageFlags.Ephemeral
                });
            }

            const listKey  = `moderation_cases_list_${guildId}`;
            const caseList = await getFromDb(listKey, []);

            if (!Array.isArray(caseList) || caseList.length === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('No moderation cases found in this server.')],
                    flags: MessageFlags.Ephemeral
                });
            }

            let transferred = 0;

            const updatedList = await Promise.all(caseList.map(async c => {
                const targetMatch = c.target?.match(/\((\d+)\)$/) || [];
                const targetId    = targetMatch[1] || c.targetUserId;

                if (targetId !== fromUser.id) return c;

                // Update case list entry
                const updatedEntry = {
                    ...c,
                    target: `${toUser.tag} (${toUser.id})`,
                    targetUserId: toUser.id,
                    transferredFrom: fromUser.id,
                    transferredAt: new Date().toISOString(),
                    transferredBy: interaction.user.id
                };

                // Update individual case record
                const caseKey = `moderation_case_${guildId}_${c.caseId}`;
                const fullCase = await getFromDb(caseKey, null);
                if (fullCase) {
                    await setInDb(caseKey, { ...fullCase, ...updatedEntry });
                }

                transferred++;
                return updatedEntry;
            }));

            if (transferred === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(`No cases found for **${fromUser.tag}** to transfer.`)],
                    flags: MessageFlags.Ephemeral
                });
            }

            await setInDb(listKey, updatedList);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(
                    `Transferred **${transferred}** case(s) from **${fromUser.tag}** → **${toUser.tag}**.`,
                    '🔀 Modlogs Transferred'
                )]
            });
        } catch (error) {
            logger.error('Transfermodlogs command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Failed to transfer modlogs.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
