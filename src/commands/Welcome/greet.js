import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError } from '../../utils/errorHandler.js';
import greetDashboard from './modules/greet_dashboard.js';
import { hasCommandAccess } from '../../utils/roleGuard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('greet')
        .setDescription('Manage welcome & goodbye settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Open the welcome & goodbye configuration dashboard'),
        ),

    async execute(interaction, config, client) {
        try {
        const allowed = await hasCommandAccess(interaction, 'greet');
        if (!allowed) return;

            

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'dashboard':
                    return await greetDashboard.execute(interaction, config, client);
                default:
                    logger.warn(`Unknown /greet subcommand: ${subcommand}`);
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Configuration Error', error.userMessage || 'Something went wrong.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
            await handleInteractionError(interaction, error, { command: 'greet' });
        }
    },
};
