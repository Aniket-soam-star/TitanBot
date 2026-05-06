// 📁 NEW FILE → src/commands/Moderation/automod.js
//
// Configure per-guild automod filters.
// All filters run in messageCreate.js (see updated version).
// DB key: guild:{guildId}:automod

import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const DEFAULT_CONFIG = {
    enabled: false,
    antiSpam:     { enabled: false, maxMessages: 5,   windowMs: 5000, action: 'timeout', timeoutMs: 60000 },
    massMention:  { enabled: false, maxMentions: 5,   action: 'delete' },
    badWords:     { enabled: false, words: [],        action: 'delete' },
    antiPhishing: { enabled: false, action: 'delete' },
    antiInvite:   { enabled: false, action: 'delete' },
    ignoredRoles: [],
    ignoredChannels: [],
    logChannelId: null
};

async function getConfig(guildId) {
    const raw = await getFromDb(`guild:${guildId}:automod`, {});
    return { ...DEFAULT_CONFIG, ...raw };
}

async function saveConfig(guildId, config) {
    return setInDb(`guild:${guildId}:automod`, config);
}

export default {
    data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure Zero Bot automod filters')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

        // ── status ──
        .addSubcommand(s => s
            .setName('status')
            .setDescription('Show current automod configuration'))

        // ── toggle ──
        .addSubcommand(s => s
            .setName('toggle')
            .setDescription('Enable or disable automod entirely')
            .addBooleanOption(o => o.setName('enabled').setDescription('On/off').setRequired(true)))

        // ── antispam ──
        .addSubcommand(s => s
            .setName('antispam')
            .setDescription('Configure anti-spam filter')
            .addBooleanOption(o => o.setName('enabled').setDescription('Enable anti-spam').setRequired(true))
            .addIntegerOption(o => o.setName('max_messages').setDescription('Max messages in window (default 5)').setMinValue(2).setMaxValue(20))
            .addIntegerOption(o => o.setName('window_seconds').setDescription('Time window in seconds (default 5)').setMinValue(1).setMaxValue(30))
            .addStringOption(o => o.setName('action').setDescription('Action to take').addChoices(
                { name: 'Delete only', value: 'delete' },
                { name: 'Timeout 1 min', value: 'timeout' },
                { name: 'Kick', value: 'kick' }
            )))

        // ── massmention ──
        .addSubcommand(s => s
            .setName('massmention')
            .setDescription('Configure mass mention filter')
            .addBooleanOption(o => o.setName('enabled').setDescription('Enable mass mention filter').setRequired(true))
            .addIntegerOption(o => o.setName('max_mentions').setDescription('Max mentions per message (default 5)').setMinValue(2).setMaxValue(20)))

        // ── badwords ──
        .addSubcommand(s => s
            .setName('badwords')
            .setDescription('Configure bad word filter')
            .addBooleanOption(o => o.setName('enabled').setDescription('Enable bad word filter').setRequired(true))
            .addStringOption(o => o.setName('add').setDescription('Add words (comma-separated)'))
            .addStringOption(o => o.setName('remove').setDescription('Remove words (comma-separated)')))

        // ── antiphishing ──
        .addSubcommand(s => s
            .setName('antiphishing')
            .setDescription('Block known phishing/scam links')
            .addBooleanOption(o => o.setName('enabled').setDescription('Enable phishing filter').setRequired(true)))

        // ── antiinvite ──
        .addSubcommand(s => s
            .setName('antiinvite')
            .setDescription('Block Discord invite links')
            .addBooleanOption(o => o.setName('enabled').setDescription('Enable invite filter').setRequired(true)))

        // ── ignore ──
        .addSubcommand(s => s
            .setName('ignore')
            .setDescription('Add or remove ignored roles/channels')
            .addStringOption(o => o.setName('type').setDescription('What to ignore').setRequired(true)
                .addChoices({ name: 'Role', value: 'role' }, { name: 'Channel', value: 'channel' }))
            .addStringOption(o => o.setName('action').setDescription('Add or remove').setRequired(true)
                .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
            .addRoleOption(o => o.setName('role').setDescription('Role to ignore'))
            .addChannelOption(o => o.setName('channel').setDescription('Channel to ignore')))

        // ── logchannel ──
        .addSubcommand(s => s
            .setName('logchannel')
            .setDescription('Set the channel where automod actions are logged')
            .addChannelOption(o => o.setName('channel').setDescription('Log channel').setRequired(true))),

    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        const sub     = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        try {
            const cfg = await getConfig(guildId);

            // ── status ──────────────────────────────────────────────────────────────
            if (sub === 'status') {
                const bool = v => v ? '✅ On' : '❌ Off';
                const embed = createEmbed({
                    title: '🛡️ Automod Configuration',
                    color: 'info',
                    fields: [
                        { name: 'Automod',       value: bool(cfg.enabled),              inline: true },
                        { name: 'Anti-Spam',     value: `${bool(cfg.antiSpam.enabled)} (max ${cfg.antiSpam.maxMessages} msgs / ${cfg.antiSpam.windowMs/1000}s → ${cfg.antiSpam.action})`, inline: false },
                        { name: 'Mass Mention',  value: `${bool(cfg.massMention.enabled)} (max ${cfg.massMention.maxMentions} mentions)`, inline: false },
                        { name: 'Bad Words',     value: `${bool(cfg.badWords.enabled)} (${cfg.badWords.words.length} word(s))`, inline: false },
                        { name: 'Anti-Phishing', value: bool(cfg.antiPhishing.enabled), inline: true },
                        { name: 'Anti-Invite',   value: bool(cfg.antiInvite.enabled),   inline: true },
                        { name: 'Log Channel',   value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'Not set', inline: false },
                        { name: 'Ignored Roles', value: cfg.ignoredRoles.length > 0 ? cfg.ignoredRoles.map(r => `<@&${r}>`).join(', ') : 'None', inline: false },
                        { name: 'Ignored Channels', value: cfg.ignoredChannels.length > 0 ? cfg.ignoredChannels.map(c => `<#${c}>`).join(', ') : 'None', inline: false }
                    ]
                });
                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            // ── toggle ──────────────────────────────────────────────────────────────
            if (sub === 'toggle') {
                cfg.enabled = interaction.options.getBoolean('enabled');
                await saveConfig(guildId, cfg);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`Automod is now **${cfg.enabled ? 'enabled' : 'disabled'}**.`)]
                });
            }

            // ── antispam ────────────────────────────────────────────────────────────
            if (sub === 'antispam') {
                cfg.antiSpam.enabled = interaction.options.getBoolean('enabled');
                const maxMsg = interaction.options.getInteger('max_messages');
                const windowSec = interaction.options.getInteger('window_seconds');
                const action = interaction.options.getString('action');
                if (maxMsg)    cfg.antiSpam.maxMessages = maxMsg;
                if (windowSec) cfg.antiSpam.windowMs    = windowSec * 1000;
                if (action)    cfg.antiSpam.action       = action;
                await saveConfig(guildId, cfg);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`Anti-spam **${cfg.antiSpam.enabled ? 'enabled' : 'disabled'}**. Max ${cfg.antiSpam.maxMessages} messages in ${cfg.antiSpam.windowMs/1000}s → ${cfg.antiSpam.action}.`)]
                });
            }

            // ── massmention ─────────────────────────────────────────────────────────
            if (sub === 'massmention') {
                cfg.massMention.enabled = interaction.options.getBoolean('enabled');
                const max = interaction.options.getInteger('max_mentions');
                if (max) cfg.massMention.maxMentions = max;
                await saveConfig(guildId, cfg);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`Mass mention filter **${cfg.massMention.enabled ? 'enabled' : 'disabled'}**. Limit: ${cfg.massMention.maxMentions} mentions.`)]
                });
            }

            // ── badwords ────────────────────────────────────────────────────────────
            if (sub === 'badwords') {
                cfg.badWords.enabled = interaction.options.getBoolean('enabled');
                const toAdd    = interaction.options.getString('add');
                const toRemove = interaction.options.getString('remove');
                if (toAdd)    toAdd.split(',').map(w => w.trim().toLowerCase()).filter(Boolean).forEach(w => {
                    if (!cfg.badWords.words.includes(w)) cfg.badWords.words.push(w);
                });
                if (toRemove) toRemove.split(',').map(w => w.trim().toLowerCase()).forEach(w => {
                    cfg.badWords.words = cfg.badWords.words.filter(x => x !== w);
                });
                await saveConfig(guildId, cfg);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`Bad word filter **${cfg.badWords.enabled ? 'enabled' : 'disabled'}**. Words: ${cfg.badWords.words.length}`)]
                });
            }

            // ── antiphishing ────────────────────────────────────────────────────────
            if (sub === 'antiphishing') {
                cfg.antiPhishing.enabled = interaction.options.getBoolean('enabled');
                await saveConfig(guildId, cfg);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`Anti-phishing filter **${cfg.antiPhishing.enabled ? 'enabled' : 'disabled'}**.`)]
                });
            }

            // ── antiinvite ──────────────────────────────────────────────────────────
            if (sub === 'antiinvite') {
                cfg.antiInvite.enabled = interaction.options.getBoolean('enabled');
                await saveConfig(guildId, cfg);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`Anti-invite filter **${cfg.antiInvite.enabled ? 'enabled' : 'disabled'}**.`)]
                });
            }

            // ── ignore ──────────────────────────────────────────────────────────────
            if (sub === 'ignore') {
                const type   = interaction.options.getString('type');
                const action = interaction.options.getString('action');
                const role   = interaction.options.getRole('role');
                const ch     = interaction.options.getChannel('channel');

                if (type === 'role') {
                    if (!role) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Provide a role.')] });
                    if (action === 'add' && !cfg.ignoredRoles.includes(role.id)) cfg.ignoredRoles.push(role.id);
                    if (action === 'remove') cfg.ignoredRoles = cfg.ignoredRoles.filter(r => r !== role.id);
                } else {
                    if (!ch) return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Provide a channel.')] });
                    if (action === 'add' && !cfg.ignoredChannels.includes(ch.id)) cfg.ignoredChannels.push(ch.id);
                    if (action === 'remove') cfg.ignoredChannels = cfg.ignoredChannels.filter(c => c !== ch.id);
                }
                await saveConfig(guildId, cfg);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`Ignore list updated.`)]
                });
            }

            // ── logchannel ──────────────────────────────────────────────────────────
            if (sub === 'logchannel') {
                const ch = interaction.options.getChannel('channel');
                cfg.logChannelId = ch.id;
                await saveConfig(guildId, cfg);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`Automod logs will be sent to ${ch}.`)]
                });
            }

        } catch (error) {
            logger.error('Automod command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Failed to update automod config.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
