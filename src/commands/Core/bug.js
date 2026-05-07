import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("bug")
        .setDescription("Report a bug or issue with the bot"),

    async execute(interaction) {
        const supportButton = new ButtonBuilder()
            .setLabel('🐛 Report Bug — Support Server')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.gg/XgmVfGz2F');

        const row = new ActionRowBuilder().addComponents(supportButton);

        const bugReportEmbed = createEmbed({
            title: '?? Bug Report',
            description: 'Found a bug? Please report it on our support server!\n\n' +
            '**When reporting a bug, please include:**\n' +
            '� ?? Detailed description of the issue\n' +
            '� ?? Steps to reproduce the problem\n' +
            '� ?? Screenshots if applicable\n' +
            '� ?? Your bot version and environment\n\n' +
            'This helps us fix issues faster and more effectively!',
            color: 'error'
        })
            .setTimestamp();

        await InteractionHelper.safeReply(interaction, {
            embeds: [bugReportEmbed],
            components: [row],
        });
    },
};



