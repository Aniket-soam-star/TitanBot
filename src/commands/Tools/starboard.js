// 📁 NEW FILE → src/commands/Tools/starboard.js
//
// Configure the starboard.  Reaction logic lives in src/events/messageReactionAdd.js.
// DB key: guild:{guildId}:starboard

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const DEFAULT_CONFIG = {
    enabled:      false,
    channelId:    null,
    emoji:        '⭐',
    threshold:    3,
    ignoreSelf:   true,
    ignoreBots:   true,
    ignoredChannels: []
};

async function getConfig(guildId) {
    const raw = await getFromDb(`guild:${guildId}:starboard`, {});
    return { ...DEFAULT_CONFIG, ...raw };
}

export default {
    data: new SlashCommandBuilder()
        .setName('starboard')
        .setDescription('Configure the server starboard')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

        .addSubcommand(s => s
            .setName('setup')
            .setDescription('Set the starboard channel and enable it')
            .addChannelOption(o =>
                o.setName('channel').setDescription('Starboard channel').setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
            )
            .addIntegerOption(o =>
                o.setName('threshold').setDescription('Reactions needed to star (default 3)').setMinValue(1).setMaxValue(50)
            )
            .addStringOption(o =>
                o.setName('emoji').setDescription('Emoji to watch (default ⭐)')
            ))

        .addSubcommand(s => s
            .setName('toggle')
            .setDescription('Enable or disable the starboard')
            .addBooleanOption(o => o.setName('enabled').setDescription('On/off').setRequired(true)))

        .addSubcommand(s => s
            .setName('status')
            .setDescription('View current starboard configuration')),

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        const sub     = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        try {
            const cfg = await getConfig(guildId);

            if (sub === 'setup') {
                const ch        = interaction.options.getChannel('channel');
                const threshold = interaction.options.getInteger('threshold') ?? cfg.threshold;
                const emoji     = interaction.options.getString('emoji')?.trim() || cfg.emoji;

                cfg.channelId = ch.id;
                cfg.threshold = threshold;
                cfg.emoji     = emoji;
                cfg.enabled   = true;

                await setInDb(`guild:${guildId}:starboard`, cfg);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        `✅ Starboard configured!\n📌 Channel: ${ch}\n${emoji} Threshold: **${threshold}** reactions`,
                        '⭐ Starboard Set Up'
                    )]
                });
            }

            if (sub === 'toggle') {
                cfg.enabled = interaction.options.getBoolean('enabled');
                await setInDb(`guild:${guildId}:starboard`, cfg);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`Starboard is now **${cfg.enabled ? 'enabled' : 'disabled'}**.`)]
                });
            }

            if (sub === 'status') {
                const embed = createEmbed({
                    title: '⭐ Starboard Status',
                    color: 'info',
                    fields: [
                        { name: 'Enabled',    value: cfg.enabled ? '✅ Yes' : '❌ No',                       inline: true },
                        { name: 'Channel',    value: cfg.channelId ? `<#${cfg.channelId}>` : 'Not set',      inline: true },
                        { name: 'Emoji',      value: cfg.emoji,                                              inline: true },
                        { name: 'Threshold',  value: `${cfg.threshold} reaction(s)`,                        inline: true },
                        { name: 'Ignore Self',value: cfg.ignoreSelf ? 'Yes' : 'No',                          inline: true },
                        { name: 'Ignore Bots',value: cfg.ignoreBots ? 'Yes' : 'No',                          inline: true }
                    ]
                });
                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }
        } catch (error) {
            logger.error('Starboard command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Failed to update starboard config.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
