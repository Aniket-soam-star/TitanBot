// 📁 NEW FILE → src/commands/Utility/roles.js

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('roles')
        .setDescription('List all roles in this server'),

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        try {
            const roles = [...interaction.guild.roles.cache.values()]
                .filter(r => r.id !== interaction.guild.id) // exclude @everyone
                .sort((a, b) => b.position - a.position);

            if (roles.length === 0) {
                return InteractionHelper.safeEditReply(interaction, { content: 'No roles found.' });
            }

            const CHUNK_SIZE = 30;
            const chunks     = [];
            for (let i = 0; i < roles.length; i += CHUNK_SIZE) {
                chunks.push(roles.slice(i, i + CHUNK_SIZE));
            }

            // Build pages
            const pages = chunks.map((chunk, idx) => {
                const lines = chunk.map(r =>
                    `${r.toString()} — \`${r.id}\` — **${r.members.size}** member(s)`
                );
                return createEmbed({
                    title: `🎭 Server Roles (${roles.length} total)`,
                    description: lines.join('\n'),
                    color: 'info',
                    footer: { text: `Page ${idx + 1} of ${chunks.length}` }
                });
            });

            // If short enough, just send one embed
            if (pages.length === 1) {
                return InteractionHelper.safeEditReply(interaction, { embeds: [pages[0]] });
            }

            // Multi-page: just send first page and note to use /roles with search later
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [pages[0]],
                content: `Showing **${Math.min(CHUNK_SIZE, roles.length)}** of **${roles.length}** roles.`
            });
        } catch (error) {
            logger.error('Roles command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ Failed to fetch roles.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
