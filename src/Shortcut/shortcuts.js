// 📁 NEW FILE → src/commands/Core/shortcuts.js
//
// /shortcuts — paginated help panel showing all ~ shortcut commands.
// This is the separate "shortcuts help tab" accessible from Discord.

import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { SHORTCUT_MAP, SHORTCUT_PREFIX, CATEGORIES } from '../../shortcuts/shortcutMap.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Group shortcuts by category
function buildCategoryPages() {
    const byCategory = {};

    for (const [key, schema] of Object.entries(SHORTCUT_MAP)) {
        const cat = schema.category ?? 'utility';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push({ key, schema });
    }

    const pages = [];

    for (const [cat, entries] of Object.entries(byCategory)) {
        const meta   = CATEGORIES[cat] ?? { label: cat, color: 'primary' };
        const fields = entries.map(({ key, schema }) => ({
            name:   `\`~${key}\``,
            value:  [
                schema.description,
                `**Usage:** \`${schema.usage}\``,
                `**Example:** \`${schema.example}\``,
            ].join('\n'),
            inline: true,
        }));

        // Split into sub-pages of 6 fields each (Discord max = 25, but 6 looks clean)
        for (let i = 0; i < fields.length; i += 6) {
            pages.push({
                label: meta.label,
                color: meta.color,
                fields: fields.slice(i, i + 6),
            });
        }
    }

    return pages;
}

export default {
    data: new SlashCommandBuilder()
        .setName('shortcuts')
        .setDescription('View all ~ shortcut commands and how to use them'),
    category: 'core',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        const pages = buildCategoryPages();
        const total = pages.length;
        let current = 0;

        function buildEmbed(index) {
            const page = pages[index];
            return createEmbed({
                title:       `⚡ Shortcut Commands — ${page.label}`,
                description: [
                    `Type \`~shortcut [args]\` to run commands without using \`/\`.`,
                    `Use \`~help\` in chat for a quick reference list.`,
                ].join('\n'),
                color:  page.color,
                fields: page.fields,
                footer: { text: `Page ${index + 1} of ${total} • ${Object.keys(SHORTCUT_MAP).length} total shortcuts` },
                timestamp: true,
            });
        }

        function buildRow(index) {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('sc_prev')
                    .setLabel('◀ Prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(index === 0),
                new ButtonBuilder()
                    .setCustomId('sc_category')
                    .setLabel(pages[index].label)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('sc_next')
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(index >= total - 1),
            );
        }

        const msg = await interaction.editReply({
            embeds: [buildEmbed(0)],
            components: [buildRow(0)],
        });

        if (total <= 1) return;

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i => i.user.id === interaction.user.id,
            time: 120_000,
        });

        collector.on('collect', async btn => {
            await btn.deferUpdate();
            if (btn.customId === 'sc_prev' && current > 0)          current--;
            else if (btn.customId === 'sc_next' && current < total - 1) current++;
            await btn.editReply({
                embeds: [buildEmbed(current)],
                components: [buildRow(current)],
            });
        });

        collector.on('end', () => {
            msg.edit({ components: [] }).catch(() => {});
        });
    },
};
