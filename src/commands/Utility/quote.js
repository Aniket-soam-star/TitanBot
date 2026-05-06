// 📁 NEW FILE → src/commands/Utility/quote.js
//
// Fetches a message by ID (from the current channel or a specified channel)
// and reposts it as a nice embed.

import { SlashCommandBuilder, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('quote')
        .setDescription('Quote a message by its ID')
        .addStringOption(o =>
            o.setName('message_id').setDescription('The ID of the message to quote').setRequired(true)
        )
        .addChannelOption(o =>
            o.setName('channel')
                .setDescription('Channel the message is in (defaults to current channel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
        ),

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            const msgId  = interaction.options.getString('message_id').trim();
            const ch     = interaction.options.getChannel('channel') || interaction.channel;

            // Validate snowflake
            if (!/^\d{17,20}$/.test(msgId)) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('That doesn\'t look like a valid message ID.')],
                    flags: MessageFlags.Ephemeral
                });
            }

            const message = await ch.messages.fetch(msgId).catch(() => null);
            if (!message) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(`Message not found in ${ch}. Make sure the ID and channel are correct.`)],
                    flags: MessageFlags.Ephemeral
                });
            }

            const content   = message.content || '*[No text content]*';
            const timestamp = Math.floor(message.createdTimestamp / 1000);

            const embed = createEmbed({
                description: content.slice(0, 4096),
                color: 'primary',
                author: {
                    name: message.author.tag,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                },
                footer: {
                    text: `#${ch.name} • ${message.id}`
                },
                timestamp: message.createdAt
            });

            // Carry over first image attachment if any
            const img = message.attachments.find(a => a.contentType?.startsWith('image/'));
            if (img) embed.setImage(img.url);

            // Jump link button isn't supported via slash reply embeds, so we'll include it as text
            const jumpUrl = message.url;

            await InteractionHelper.safeEditReply(interaction, {
                content: `> 🔗 [Jump to original message](${jumpUrl}) — quoted by ${interaction.user}`,
                embeds: [embed]
            });
        } catch (error) {
            logger.error('Quote command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Failed to fetch that message.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
