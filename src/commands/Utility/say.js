// 📁 NEW FILE → src/commands/Utility/say.js
//
// Makes the bot send a plain text message or a rich embed to a target channel.
// Requires Manage Messages permission.

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot send a message or embed to a channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

        // ── plain ──
        .addSubcommand(s => s
            .setName('text')
            .setDescription('Send a plain text message')
            .addStringOption(o => o.setName('message').setDescription('Message content').setRequired(true))
            .addChannelOption(o =>
                o.setName('channel')
                    .setDescription('Channel to send to (defaults to current)')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            ))

        // ── embed ──
        .addSubcommand(s => s
            .setName('embed')
            .setDescription('Send a rich embed')
            .addStringOption(o => o.setName('description').setDescription('Embed description / body').setRequired(true))
            .addStringOption(o => o.setName('title').setDescription('Embed title'))
            .addStringOption(o => o.setName('color').setDescription('Hex color e.g. #FF5733'))
            .addStringOption(o => o.setName('footer').setDescription('Footer text'))
            .addChannelOption(o =>
                o.setName('channel')
                    .setDescription('Channel to send to (defaults to current)')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            )),

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        const sub = interaction.options.getSubcommand();
        const ch  = interaction.options.getChannel('channel') || interaction.channel;

        try {
            // Check bot can send in that channel
            const perms = ch.permissionsFor(interaction.guild.members.me);
            if (!perms?.has(PermissionFlagsBits.SendMessages)) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(`I don't have permission to send messages in ${ch}.`)],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (sub === 'text') {
                const content = interaction.options.getString('message');
                await ch.send({ content });
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`Message sent to ${ch}.`)]
                });
            }

            if (sub === 'embed') {
                const description = interaction.options.getString('description');
                const title       = interaction.options.getString('title') || null;
                const colorRaw    = interaction.options.getString('color') || '#c9a227';
                const footer      = interaction.options.getString('footer') || null;

                // Validate hex color
                const color = /^#[0-9A-Fa-f]{6}$/.test(colorRaw) ? colorRaw : '#c9a227';

                const embed = createEmbed({ title, description, color, footer, timestamp: false });
                await ch.send({ embeds: [embed] });
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`Embed sent to ${ch}.`)]
                });
            }

        } catch (error) {
            logger.error('Say command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Failed to send the message.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
