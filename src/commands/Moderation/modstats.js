// 📁 NEW FILE → src/commands/Moderation/modstats.js

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getModerationCases } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('modstats')
        .setDescription('View moderation action statistics for a moderator')
        .addUserOption(o =>
            o.setName('moderator')
                .setDescription('Moderator to check (defaults to yourself)')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            const mod     = interaction.options.getUser('moderator') || interaction.user;
            const guildId = interaction.guild.id;

            // Fetch all cases and filter to this moderator
            const allCases = await getModerationCases(guildId, { limit: 1000 });
            const modCases = allCases.filter(c => {
                // executor field looks like "tag (id)"
                const match = c.executor?.match(/\((\d+)\)$/);
                return match ? match[1] === mod.id : c.moderatorId === mod.id;
            });

            const counts = {};
            const recent = []; // last 7 days
            const now    = Date.now();
            const week   = 7 * 24 * 60 * 60 * 1000;

            modCases.forEach(c => {
                counts[c.action] = (counts[c.action] || 0) + 1;
                if (now - new Date(c.createdAt).getTime() < week) recent.push(c);
            });

            const actionLines = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .map(([action, n]) => `> ${action}: **${n}**`)
                .join('\n');

            const embed = createEmbed({
                title: `📊 Mod Stats — ${mod.tag}`,
                thumbnail: mod.displayAvatarURL({ dynamic: true }),
                color: 'info',
                fields: [
                    {
                        name: '📋 Total Actions',
                        value: modCases.length === 0
                            ? 'No actions recorded.'
                            : `**${modCases.length}** total\n${actionLines}`,
                        inline: false
                    },
                    {
                        name: '📅 Last 7 Days',
                        value: `**${recent.length}** action(s)`,
                        inline: true
                    },
                    {
                        name: '🏆 Most Used',
                        value: Object.keys(counts).length > 0
                            ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
                            : 'N/A',
                        inline: true
                    }
                ]
            });

            embed.setFooter({ text: `Moderator ID: ${mod.id}` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('Modstats command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Failed to fetch mod stats.')]
            });
        }
    }
};
