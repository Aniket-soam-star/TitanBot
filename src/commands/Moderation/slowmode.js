// 📁 NEW FILE → src/commands/Moderation/slowmode.js

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set the slowmode cooldown for a channel')
        .addIntegerOption(o =>
            o.setName('seconds')
                .setDescription('Slowmode delay in seconds (0 to disable, max 21600)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(21600)
        )
        .addChannelOption(o =>
            o.setName('channel')
                .setDescription('Channel to apply slowmode (defaults to current channel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            const seconds = interaction.options.getInteger('seconds');
            const channel = interaction.options.getChannel('channel') ?? interaction.channel;

            await channel.setRateLimitPerUser(seconds, `Slowmode set by ${interaction.user.tag}`);

            const msg = seconds === 0
                ? `🔓 Slowmode disabled in ${channel}`
                : `🐢 Slowmode set to **${formatDuration(seconds)}** in ${channel}`;

            await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: 'Slowmode Set',
                    target: `#${channel.name} (${channel.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Slowmode → ${seconds}s`,
                    metadata: { channelId: channel.id, seconds }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(msg, '✅ Slowmode Updated')]
            });
        } catch (error) {
            logger.error('Slowmode command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'slowmode_failed' });
        }
    }
};

function formatDuration(seconds) {
    if (seconds < 60)   return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`.replace(' 0s', '');
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`.replace(' 0m', '');
}
