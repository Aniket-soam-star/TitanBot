// 📁 NEW FILE → src/commands/Moderation/modlogs.js

import {
    SlashCommandBuilder, PermissionFlagsBits,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags
} from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getModerationCases } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CASES_PER_PAGE = 5;

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
        .setName('modlogs')
        .setDescription("View a user's moderation history")
        .addUserOption(o =>
            o.setName('user').setDescription('User to look up').setRequired(true)
        )
        .addStringOption(o =>
            o.setName('filter')
                .setDescription('Filter by action type')
                .addChoices(
                    { name: 'All',      value: 'all' },
                    { name: 'Bans',     value: 'Member Banned' },
                    { name: 'Kicks',    value: 'Member Kicked' },
                    { name: 'Timeouts', value: 'Member Timed Out' },
                    { name: 'Warns',    value: 'User Warned' }
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            const target     = interaction.options.getUser('user');
            const filterType = interaction.options.getString('filter') || 'all';

            const cases = await getModerationCases(interaction.guild.id, {
                userId: target.id,
                action: filterType === 'all' ? undefined : filterType,
                limit: 100
            });

            // Filter out voided cases visually (mark them)
            const totalPages = Math.ceil(Math.max(cases.length, 1) / CASES_PER_PAGE);
            let currentPage  = 1;

            const buildEmbed = (page) => {
                const start    = (page - 1) * CASES_PER_PAGE;
                const pageCases = cases.slice(start, start + CASES_PER_PAGE);

                const embed = createEmbed({
                    title: `📋 Moderation History — ${target.tag}`,
                    description: cases.length === 0
                        ? '✅ No moderation history found for this user.'
                        : `**${cases.length}** total record(s) | Showing page **${page}/${totalPages}**`,
                    thumbnail: target.displayAvatarURL({ dynamic: true }),
                    color: cases.length === 0 ? 'success' : 'moderation'
                });

                pageCases.forEach(c => {
                    const icon    = ACTION_ICONS[c.action] || '🔹';
                    const date    = new Date(c.createdAt).toLocaleDateString();
                    const voided  = c.voided ? ' ~~(voided)~~' : '';
                    const reason  = c.reason || 'No reason provided';
                    embed.addFields({
                        name: `${icon} Case #${c.caseId} — ${c.action}${voided}`,
                        value: `**Moderator:** ${c.executor}\n**Date:** ${date}\n**Reason:** ${reason}`,
                        inline: false
                    });
                });

                embed.setFooter({ text: `User ID: ${target.id}` });
                return embed;
            };

            const buildRow = (page) => new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ml_prev').setLabel('⬅️ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                new ButtonBuilder().setCustomId('ml_info').setLabel(`${page}/${totalPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('ml_next').setLabel('Next ➡️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
            );

            const msg = await interaction.editReply({
                embeds: [buildEmbed(currentPage)],
                components: totalPages > 1 ? [buildRow(currentPage)] : []
            });

            if (totalPages <= 1) return;

            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300_000,
                filter: i => i.user.id === interaction.user.id
            });

            collector.on('collect', async btn => {
                await btn.deferUpdate();
                if (btn.customId === 'ml_prev' && currentPage > 1)          currentPage--;
                else if (btn.customId === 'ml_next' && currentPage < totalPages) currentPage++;
                await btn.editReply({ embeds: [buildEmbed(currentPage)], components: [buildRow(currentPage)] });
            });

            collector.on('end', () => {
                msg.edit({ components: [] }).catch(() => {});
            });

        } catch (error) {
            logger.error('Modlogs command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Failed to fetch moderation history.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
