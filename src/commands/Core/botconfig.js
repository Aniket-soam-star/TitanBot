// 📁 REPLACE → src/commands/Core/botconfig.js
//
// Zero Bot global + per-guild configuration.
// Two scopes:
//   • Global config  (bot owner only) — presence, colors, economy, features, giveaway, cooldown
//   • Guild permissions (server admin) — assign roles to commands per-server
//
// Global overrides DB key : zerobot:global:config
// Guild perms DB key       : guild:{guildId}:cmd_perms

import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} from 'discord.js';
import { createEmbed, successEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import botConfig from '../../config/bot.js';
import { hasCommandAccess, COMMAND_TIERS, TIER_LABELS } from '../../utils/roleGuard.js';
// ── Helper ──────────────────────────────────────────────────────────────────
const DB_KEY = 'zerobot:global:config';

async function getOverrides() {
    return getFromDb(DB_KEY, {});
}

async function saveOverride(key, value) {
    const overrides = await getOverrides();
    overrides[key] = value;
    await setInDb(DB_KEY, overrides);
}

// ── Owner gate: server owner OR Administrator (no Railway env var needed) ─
function isOwner(interaction) {
    const isGuildOwner = interaction.guild?.ownerId === interaction.user.id;
    const isAdmin      = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    return isGuildOwner || isAdmin;
}

// Activity type number → label
const ACTIVITY_LABELS = {
    0: 'Playing', 1: 'Streaming', 2: 'Listening to',
    3: 'Watching', 4: 'Custom', 5: 'Competing in'
};

// Valid hex color check
const isHex = str => /^#[0-9A-Fa-f]{6}$/.test(str);

// ── Command Definition ───────────────────────────────────────────────────────
export default {
    data: new SlashCommandBuilder()
        .setName('botconfig')
        .setDescription('Configure Zero Bot global settings (owner only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

        // ── status ──────────────────────────────────────────────────────────
        .addSubcommand(s => s
            .setName('status')
            .setDescription('View current bot configuration'))

        // ── presence ────────────────────────────────────────────────────────
        .addSubcommandGroup(g => g
            .setName('presence')
            .setDescription('Bot presence / status settings')
            .addSubcommand(s => s
                .setName('set')
                .setDescription('Update the bot status and activity')
                .addStringOption(o => o
                    .setName('status')
                    .setDescription('Bot online status')
                    .setRequired(true)
                    .addChoices(
                        { name: '🟢 Online',    value: 'online' },
                        { name: '🌙 Idle',      value: 'idle' },
                        { name: '🔴 Do Not Disturb', value: 'dnd' },
                        { name: '⚫ Invisible', value: 'invisible' }
                    ))
                .addStringOption(o => o
                    .setName('activity_text')
                    .setDescription('Activity text shown under bot name'))
                .addStringOption(o => o
                    .setName('activity_type')
                    .setDescription('Activity type')
                    .addChoices(
                        { name: 'Playing',       value: '0' },
                        { name: 'Streaming',     value: '1' },
                        { name: 'Listening to',  value: '2' },
                        { name: 'Watching',      value: '3' },
                        { name: 'Competing in',  value: '5' }
                    ))))

        // ── branding ─────────────────────────────────────────────────────────
        .addSubcommandGroup(g => g
            .setName('branding')
            .setDescription('Embed colors and footer settings')
            .addSubcommand(s => s
                .setName('footer')
                .setDescription('Set the default embed footer text')
                .addStringOption(o => o
                    .setName('text')
                    .setDescription('Footer text (max 100 chars)')
                    .setRequired(true)
                    .setMaxLength(100)))
            .addSubcommand(s => s
                .setName('color')
                .setDescription('Set a bot color')
                .addStringOption(o => o
                    .setName('type')
                    .setDescription('Which color to change')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Primary',   value: 'primary' },
                        { name: 'Secondary', value: 'secondary' },
                        { name: 'Success',   value: 'success' },
                        { name: 'Error',     value: 'error' },
                        { name: 'Warning',   value: 'warning' },
                        { name: 'Info',      value: 'info' }
                    ))
                .addStringOption(o => o
                    .setName('hex')
                    .setDescription('Hex color code e.g. #FFD700')
                    .setRequired(true))))

        // ── economy ──────────────────────────────────────────────────────────
        .addSubcommandGroup(g => g
            .setName('economy')
            .setDescription('Economy system settings')
            .addSubcommand(s => s
                .setName('currency')
                .setDescription('Set currency name and symbol')
                .addStringOption(o => o.setName('name').setDescription('Currency name (singular) e.g. coin'))
                .addStringOption(o => o.setName('plural').setDescription('Plural name e.g. coins'))
                .addStringOption(o => o.setName('symbol').setDescription('Symbol e.g. £ $ 🪙')))
            .addSubcommand(s => s
                .setName('balances')
                .setDescription('Set balance defaults')
                .addIntegerOption(o => o.setName('starting').setDescription('Starting balance for new users').setMinValue(0).setMaxValue(1000000))
                .addIntegerOption(o => o.setName('daily').setDescription('Daily reward amount').setMinValue(1).setMaxValue(1000000))
                .addIntegerOption(o => o.setName('bank_cap').setDescription('Base bank capacity').setMinValue(1000).setMaxValue(100000000)))
            .addSubcommand(s => s
                .setName('work')
                .setDescription('Set work/beg payout ranges')
                .addIntegerOption(o => o.setName('work_min').setDescription('Work minimum payout').setMinValue(1).setMaxValue(100000))
                .addIntegerOption(o => o.setName('work_max').setDescription('Work maximum payout').setMinValue(1).setMaxValue(100000))
                .addIntegerOption(o => o.setName('beg_min').setDescription('Beg minimum payout').setMinValue(1).setMaxValue(100000))
                .addIntegerOption(o => o.setName('beg_max').setDescription('Beg maximum payout').setMinValue(1).setMaxValue(100000)))
            .addSubcommand(s => s
                .setName('rob')
                .setDescription('Set rob success rate and jail time')
                .addNumberOption(o => o.setName('success_rate').setDescription('Rob success rate 0.0–1.0 (e.g. 0.4 = 40%)').setMinValue(0).setMaxValue(1))
                .addIntegerOption(o => o.setName('jail_minutes').setDescription('Jail time on failed rob (minutes)').setMinValue(1).setMaxValue(1440))))

        // ── features ─────────────────────────────────────────────────────────
        .addSubcommandGroup(g => g
            .setName('features')
            .setDescription('Enable or disable bot feature modules')
            .addSubcommand(s => s
                .setName('toggle')
                .setDescription('Toggle a feature on or off')
                .addStringOption(o => o
                    .setName('feature')
                    .setDescription('Feature to toggle')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Economy',        value: 'economy' },
                        { name: 'Leveling',       value: 'leveling' },
                        { name: 'Moderation',     value: 'moderation' },
                        { name: 'Logging',        value: 'logging' },
                        { name: 'Welcome',        value: 'welcome' },
                        { name: 'Tickets',        value: 'tickets' },
                        { name: 'Giveaways',      value: 'giveaways' },
                        { name: 'Birthday',       value: 'birthday' },
                        { name: 'Verification',   value: 'verification' },
                        { name: 'Reaction Roles', value: 'reactionRoles' },
                        { name: 'Join To Create', value: 'joinToCreate' },
                        { name: 'Fun',            value: 'fun' },
                        { name: 'Search',         value: 'search' },
                        { name: 'Tools',          value: 'tools' }
                    ))
                .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable').setRequired(true))))

        // ── giveaway ─────────────────────────────────────────────────────────
        .addSubcommandGroup(g => g
            .setName('giveaway')
            .setDescription('Giveaway system defaults')
            .addSubcommand(s => s
                .setName('set')
                .setDescription('Set giveaway defaults')
                .addIntegerOption(o => o.setName('default_hours').setDescription('Default giveaway duration in hours').setMinValue(1).setMaxValue(720))
                .addIntegerOption(o => o.setName('max_winners').setDescription('Maximum number of winners').setMinValue(1).setMaxValue(50))
                .addIntegerOption(o => o.setName('min_winners').setDescription('Minimum number of winners').setMinValue(1).setMaxValue(10))))

        // ── cooldown ─────────────────────────────────────────────────────────
        .addSubcommand(s => s
            .setName('cooldown')
            .setDescription('Set the default command cooldown')
            .addIntegerOption(o => o
                .setName('seconds')
                .setDescription('Cooldown in seconds (default 3)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(60)))

        // ── reset ────────────────────────────────────────────────────────────
        .addSubcommand(s => s
            .setName('reset')
            .setDescription('Reset all bot config overrides to defaults (⚠️ irreversible)'))

        // ── permissions ──────────────────────────────────────────────────────
        // Available to: server owner OR Administrator (no Railway env var needed)
        .addSubcommandGroup(g => g
            .setName('permissions')
            .setDescription('Configure which roles can use specific commands in this server')
            .addSubcommand(s => s
                .setName('setrole')
                .setDescription('Allow a role to use a command (bypasses default permission requirement)')
                .addStringOption(o => o
                    .setName('command')
                    .setDescription('The command name (e.g. ban, warn, purge)')
                    .setRequired(true)
                    .setMaxLength(50))
                .addRoleOption(o => o
                    .setName('role')
                    .setDescription('Role to grant access')
                    .setRequired(true)))
            .addSubcommand(s => s
                .setName('removerole')
                .setDescription('Remove a role from a command\'s allowed list')
                .addStringOption(o => o
                    .setName('command')
                    .setDescription('The command name')
                    .setRequired(true)
                    .setMaxLength(50))
                .addRoleOption(o => o
                    .setName('role')
                    .setDescription('Role to remove')
                    .setRequired(true)))
            .addSubcommand(s => s
                .setName('view')
                .setDescription('View all permission overrides set for this server'))
            .addSubcommand(s => s
                .setName('resetcmd')
                .setDescription('Clear all role overrides for a specific command')
                .addStringOption(o => o
                    .setName('command')
                    .setDescription('The command name to reset')
                    .setRequired(true)
                    .setMaxLength(50)))
            .addSubcommand(s => s
                .setName('resetall')
                .setDescription('⚠️ Clear ALL permission overrides for this entire server'))),

    category: 'core',

    async execute(interaction, config, client) {
        // ── Owner-only gate ──────────────────────────────────────────────────
        if (!isOwner(interaction)) {
            return interaction.reply({
                embeds: [createEmbed({
                    title: '❌ Access Denied',
                    description: [
                        '🔒 This command can only be used by:',
                        '> 👑 **Server Owner**',
                        '> 🛡️ Members with **Administrator** permission',
                    ].join('\n'),
                    color: 'error',
                    timestamp: true,
                })],
                flags: MessageFlags.Ephemeral
            });
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        const group = interaction.options.getSubcommandGroup(false);
        const sub   = interaction.options.getSubcommand();

        try {

            // ════════════════════════════════════════════════════════════════
            //  STATUS — show all current settings
            // ════════════════════════════════════════════════════════════════
            if (sub === 'status' && !group) {
                const overrides = await getOverrides();
                const presence  = botConfig.presence;
                const economy   = botConfig.economy;
                const colors    = botConfig.embeds.colors;
                const features  = botConfig.features;

                const feat = Object.entries(features)
                    .map(([k, v]) => `${v ? '✅' : '❌'} ${k}`)
                    .join('\n');

                const embed = createEmbed({
                    title: '⚙️ Zero Bot — Current Configuration',
                    color: 'info',
                    fields: [
                        {
                            name: '🟢 Presence',
                            value: `Status: \`${presence.status}\`\nActivity: \`${ACTIVITY_LABELS[presence.activities[0]?.type] || 'Playing'} ${presence.activities[0]?.name || 'N/A'}\``,
                            inline: false
                        },
                        {
                            name: '🎨 Branding',
                            value: `Footer: \`${botConfig.embeds.footer.text}\`\nPrimary: \`${colors.primary}\`  Error: \`${colors.error}\`  Success: \`${colors.success}\``,
                            inline: false
                        },
                        {
                            name: '💰 Economy',
                            value: `Currency: **${economy.currency.symbol}${economy.currency.name}** | Starting: **${economy.startingBalance}** | Daily: **${economy.dailyAmount}**\nWork: ${economy.workMin}–${economy.workMax} | Beg: ${economy.begMin}–${economy.begMax} | Rob rate: ${economy.robSuccessRate * 100}%`,
                            inline: false
                        },
                        {
                            name: '🎁 Giveaways',
                            value: `Default: **${botConfig.giveaways.defaultDuration / 3600000}h** | Winners: ${botConfig.giveaways.minimumWinners}–${botConfig.giveaways.maximumWinners}`,
                            inline: false
                        },
                        {
                            name: '⏱️ Command Cooldown',
                            value: `**${botConfig.commands.defaultCooldown}s**`,
                            inline: true
                        },
                        {
                            name: '📦 DB Overrides Stored',
                            value: `**${Object.keys(overrides).length}** key(s)`,
                            inline: true
                        },
                        {
                            name: '🧩 Features',
                            value: feat,
                            inline: false
                        }
                    ]
                });

                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            // ════════════════════════════════════════════════════════════════
            //  RESET
            // ════════════════════════════════════════════════════════════════
            if (sub === 'reset' && !group) {
                await setInDb(DB_KEY, {});
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        'All bot config overrides have been cleared. Restart the bot to fully restore defaults.',
                        '🔄 Config Reset'
                    )]
                });
            }

            // ════════════════════════════════════════════════════════════════
            //  COOLDOWN
            // ════════════════════════════════════════════════════════════════
            if (sub === 'cooldown' && !group) {
                const seconds = interaction.options.getInteger('seconds');
                botConfig.commands.defaultCooldown = seconds;
                await saveOverride('commands.defaultCooldown', seconds);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(`Default command cooldown set to **${seconds}s**.`)]
                });
            }

            // ════════════════════════════════════════════════════════════════
            //  PRESENCE
            // ════════════════════════════════════════════════════════════════
            if (group === 'presence' && sub === 'set') {
                const status       = interaction.options.getString('status');
                const activityText = interaction.options.getString('activity_text');
                const activityType = interaction.options.getString('activity_type');

                botConfig.presence.status = status;

                if (activityText) botConfig.presence.activities[0].name = activityText;
                if (activityType) botConfig.presence.activities[0].type = parseInt(activityType);

                // Apply immediately to running bot
                client.user.setPresence({
                    status,
                    activities: [{
                        name: botConfig.presence.activities[0].name,
                        type: botConfig.presence.activities[0].type
                    }]
                });

                await saveOverride('presence', botConfig.presence);

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        `✅ Presence updated!\nStatus: \`${status}\`\nActivity: \`${ACTIVITY_LABELS[botConfig.presence.activities[0].type]} ${botConfig.presence.activities[0].name}\``,
                        '🟢 Presence Updated'
                    )]
                });
            }

            // ════════════════════════════════════════════════════════════════
            //  BRANDING
            // ════════════════════════════════════════════════════════════════
            if (group === 'branding') {
                if (sub === 'footer') {
                    const text = interaction.options.getString('text');
                    botConfig.embeds.footer.text = text;
                    await saveOverride('embeds.footer.text', text);
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed(`Embed footer text set to: **${text}**`)]
                    });
                }

                if (sub === 'color') {
                    const type = interaction.options.getString('type');
                    const hex  = interaction.options.getString('hex');

                    if (!isHex(hex)) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed(`\`${hex}\` is not a valid hex color. Use format: \`#RRGGBB\``)]
                        });
                    }

                    botConfig.embeds.colors[type] = hex;
                    await saveOverride(`embeds.colors.${type}`, hex);
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed(`**${type}** color set to \`${hex}\`.`)
                            .setColor(parseInt(hex.replace('#', ''), 16))
                        ]
                    });
                }
            }

            // ════════════════════════════════════════════════════════════════
            //  ECONOMY
            // ════════════════════════════════════════════════════════════════
            if (group === 'economy') {
                if (sub === 'currency') {
                    const name   = interaction.options.getString('name');
                    const plural = interaction.options.getString('plural');
                    const symbol = interaction.options.getString('symbol');

                    if (name)   { botConfig.economy.currency.name       = name;   await saveOverride('economy.currency.name',       name);   }
                    if (plural) { botConfig.economy.currency.namePlural  = plural; await saveOverride('economy.currency.namePlural', plural); }
                    if (symbol) { botConfig.economy.currency.symbol      = symbol; await saveOverride('economy.currency.symbol',     symbol); }

                    const c = botConfig.economy.currency;
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed(`Currency: **${c.symbol}${c.name}** / **${c.namePlural}**`)]
                    });
                }

                if (sub === 'balances') {
                    const starting = interaction.options.getInteger('starting');
                    const daily    = interaction.options.getInteger('daily');
                    const bankCap  = interaction.options.getInteger('bank_cap');

                    if (starting !== null) { botConfig.economy.startingBalance  = starting; await saveOverride('economy.startingBalance',  starting); }
                    if (daily    !== null) { botConfig.economy.dailyAmount       = daily;    await saveOverride('economy.dailyAmount',       daily);    }
                    if (bankCap  !== null) { botConfig.economy.baseBankCapacity  = bankCap;  await saveOverride('economy.baseBankCapacity',  bankCap);  }

                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed(
                            `Starting: **${botConfig.economy.startingBalance}** | Daily: **${botConfig.economy.dailyAmount}** | Bank cap: **${botConfig.economy.baseBankCapacity}**`,
                            '💰 Economy Updated'
                        )]
                    });
                }

                if (sub === 'work') {
                    const workMin = interaction.options.getInteger('work_min');
                    const workMax = interaction.options.getInteger('work_max');
                    const begMin  = interaction.options.getInteger('beg_min');
                    const begMax  = interaction.options.getInteger('beg_max');

                    if (workMin !== null) { botConfig.economy.workMin = workMin; await saveOverride('economy.workMin', workMin); }
                    if (workMax !== null) { botConfig.economy.workMax = workMax; await saveOverride('economy.workMax', workMax); }
                    if (begMin  !== null) { botConfig.economy.begMin  = begMin;  await saveOverride('economy.begMin',  begMin);  }
                    if (begMax  !== null) { botConfig.economy.begMax  = begMax;  await saveOverride('economy.begMax',  begMax);  }

                    // Validate min ≤ max
                    if (botConfig.economy.workMin > botConfig.economy.workMax) {
                        botConfig.economy.workMin = botConfig.economy.workMax;
                        await saveOverride('economy.workMin', botConfig.economy.workMax);
                    }
                    if (botConfig.economy.begMin > botConfig.economy.begMax) {
                        botConfig.economy.begMin = botConfig.economy.begMax;
                        await saveOverride('economy.begMin', botConfig.economy.begMax);
                    }

                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed(
                            `Work: **${botConfig.economy.workMin}–${botConfig.economy.workMax}** | Beg: **${botConfig.economy.begMin}–${botConfig.economy.begMax}**`,
                            '⚒️ Payout Ranges Updated'
                        )]
                    });
                }

                if (sub === 'rob') {
                    const rate        = interaction.options.getNumber('success_rate');
                    const jailMinutes = interaction.options.getInteger('jail_minutes');

                    if (rate        !== null) { botConfig.economy.robSuccessRate  = rate;                  await saveOverride('economy.robSuccessRate',  rate);                  }
                    if (jailMinutes !== null) { botConfig.economy.robFailJailTime = jailMinutes * 60_000;  await saveOverride('economy.robFailJailTime', jailMinutes * 60_000);  }

                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed(
                            `Rob success rate: **${botConfig.economy.robSuccessRate * 100}%** | Jail: **${botConfig.economy.robFailJailTime / 60_000}min**`,
                            '🦹 Rob Settings Updated'
                        )]
                    });
                }
            }

            // ════════════════════════════════════════════════════════════════
            //  FEATURES
            // ════════════════════════════════════════════════════════════════
            if (group === 'features' && sub === 'toggle') {
                const feature = interaction.options.getString('feature');
                const enabled = interaction.options.getBoolean('enabled');

                if (!(feature in botConfig.features)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed(`Unknown feature: \`${feature}\``)]
                    });
                }

                botConfig.features[feature] = enabled;
                await saveOverride(`features.${feature}`, enabled);

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        `Feature **${feature}** is now **${enabled ? '✅ enabled' : '❌ disabled'}**.`,
                        '🧩 Feature Updated'
                    )]
                });
            }

            // ════════════════════════════════════════════════════════════════
            //  GIVEAWAY
            // ════════════════════════════════════════════════════════════════
            if (group === 'giveaway' && sub === 'set') {
                const hours      = interaction.options.getInteger('default_hours');
                const maxWinners = interaction.options.getInteger('max_winners');
                const minWinners = interaction.options.getInteger('min_winners');

                if (hours      !== null) { botConfig.giveaways.defaultDuration  = hours * 3_600_000; await saveOverride('giveaways.defaultDuration',  hours * 3_600_000); }
                if (maxWinners !== null) { botConfig.giveaways.maximumWinners   = maxWinners;         await saveOverride('giveaways.maximumWinners',   maxWinners);         }
                if (minWinners !== null) { botConfig.giveaways.minimumWinners   = minWinners;         await saveOverride('giveaways.minimumWinners',   minWinners);         }

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        `Default: **${botConfig.giveaways.defaultDuration / 3_600_000}h** | Winners: ${botConfig.giveaways.minimumWinners}–${botConfig.giveaways.maximumWinners}`,
                        '🎁 Giveaway Defaults Updated'
                    )]
                });
            }

            // ════════════════════════════════════════════════════════════════
            //  PERMISSIONS — per-guild role overrides
            //  DB key: guild:{guildId}:cmd_perms
            // ════════════════════════════════════════════════════════════════
            if (group === 'permissions') {
                const guildId  = interaction.guild.id;
                const permKey  = `guild:${guildId}:cmd_perms`;

                // ── setrole ───────────────────────────────────────────────────
                if (sub === 'setrole') {
                    const cmdName = interaction.options.getString('command').toLowerCase().trim();
                    const role    = interaction.options.getRole('role');

                    // Validate command exists in our tier map
                    const tier = COMMAND_TIERS[cmdName];
                    if (!tier) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed(
                                `\`/${cmdName}\` is not a recognised Zero Bot command.\n\nDouble-check the name — use the exact command name without \`/\`.`,
                                '❌ Unknown Command'
                            )]
                        });
                    }

                    // Block assigning roles to DANGEROUS tier — too risky
                    if (tier === 'dangerous') {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [createEmbed({
                                title: '⛔ Cannot Override This Command',
                                description: [
                                    `\`/${cmdName}\` is in the **Dangerous** tier.`,
                                    'Role overrides are not allowed for high-risk commands.',
                                    'Only the **Server Owner** and **Administrators** can ever use it.',
                                ].join('\n'),
                                color: 'error',
                                timestamp: true,
                            })]
                        });
                    }

                    const overrides = await getFromDb(permKey, {});
                    if (!Array.isArray(overrides[cmdName])) overrides[cmdName] = [];

                    if (overrides[cmdName].includes(role.id)) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [warningEmbed(
                                `${role} already has access to \`/${cmdName}\`.`,
                                '⚠️ Already Set'
                            )]
                        });
                    }

                    overrides[cmdName].push(role.id);
                    await setInDb(permKey, overrides);

                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createEmbed({
                            title: '✅ Permission Override Added',
                            description: [
                                `${role} can now use \`/${cmdName}\`.`,
                                '',
                                `**Default tier:** ${TIER_LABELS[tier]}`,
                                `**Override:** Role ${role} bypasses the default requirement.`,
                            ].join('\n'),
                            color: 'success',
                            timestamp: true,
                        })]
                    });
                }

                // ── removerole ────────────────────────────────────────────────
                if (sub === 'removerole') {
                    const cmdName = interaction.options.getString('command').toLowerCase().trim();
                    const role    = interaction.options.getRole('role');

                    const overrides = await getFromDb(permKey, {});
                    const list      = overrides[cmdName];

                    if (!Array.isArray(list) || !list.includes(role.id)) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [warningEmbed(
                                `${role} does not have a permission override for \`/${cmdName}\`.`,
                                '⚠️ Not Found'
                            )]
                        });
                    }

                    overrides[cmdName] = list.filter(id => id !== role.id);
                    if (overrides[cmdName].length === 0) delete overrides[cmdName];
                    await setInDb(permKey, overrides);

                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed(
                            `Removed ${role} from \`/${cmdName}\` override list. Default permissions now apply.`,
                            '✅ Override Removed'
                        )]
                    });
                }

                // ── view ──────────────────────────────────────────────────────
                if (sub === 'view') {
                    const overrides = await getFromDb(permKey, {});
                    const entries   = Object.entries(overrides);

                    if (entries.length === 0) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [createEmbed({
                                title: '🔐 Permission Overrides',
                                description: [
                                    'No role overrides have been set for this server.',
                                    '',
                                    'Use `/botconfig permissions setrole` to grant a role access to a specific command.',
                                ].join('\n'),
                                color: 'info',
                                timestamp: true,
                            })]
                        });
                    }

                    // Build paginated fields (max 10 per embed)
                    const PAGE_SIZE = 10;
                    const pages     = [];

                    for (let i = 0; i < entries.length; i += PAGE_SIZE) {
                        const slice  = entries.slice(i, i + PAGE_SIZE);
                        const fields = slice.map(([cmd, roleIds]) => ({
                            name:   `\`/${cmd}\``,
                            value:  roleIds.map(id => `<@&${id}>`).join(', ') || '_none_',
                            inline: false,
                        }));

                        pages.push(createEmbed({
                            title: `🔐 Permission Overrides — ${interaction.guild.name}`,
                            description: `**${entries.length}** command(s) have custom role overrides.`,
                            color: 'info',
                            fields,
                            footer: { text: `Page ${pages.length + 1} of ${Math.ceil(entries.length / PAGE_SIZE)}` },
                            timestamp: true,
                        }));
                    }

                    if (pages.length === 1) {
                        return InteractionHelper.safeEditReply(interaction, { embeds: [pages[0]] });
                    }

                    // Multi-page with buttons
                    let page = 0;
                    const buildRow = (p) => new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('bcfg_perm_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
                        new ButtonBuilder().setCustomId('bcfg_perm_info').setLabel(`${p + 1}/${pages.length}`).setStyle(ButtonStyle.Primary).setDisabled(true),
                        new ButtonBuilder().setCustomId('bcfg_perm_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= pages.length - 1)
                    );

                    const msg = await interaction.editReply({ embeds: [pages[0]], components: [buildRow(0)] });
                    const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 90_000, filter: i => i.user.id === interaction.user.id });
                    col.on('collect', async btn => {
                        await btn.deferUpdate();
                        if (btn.customId === 'bcfg_perm_prev' && page > 0) page--;
                        else if (btn.customId === 'bcfg_perm_next' && page < pages.length - 1) page++;
                        await btn.editReply({ embeds: [pages[page]], components: [buildRow(page)] });
                    });
                    col.on('end', () => msg.edit({ components: [] }).catch(() => {}));
                    return;
                }

                // ── resetcmd ──────────────────────────────────────────────────
                if (sub === 'resetcmd') {
                    const cmdName   = interaction.options.getString('command').toLowerCase().trim();
                    const overrides = await getFromDb(permKey, {});

                    if (!overrides[cmdName]) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [warningEmbed(
                                `No overrides found for \`/${cmdName}\`.`,
                                '⚠️ Nothing to Reset'
                            )]
                        });
                    }

                    delete overrides[cmdName];
                    await setInDb(permKey, overrides);

                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed(
                            `All role overrides for \`/${cmdName}\` have been cleared. Default permissions apply again.`,
                            '✅ Command Overrides Cleared'
                        )]
                    });
                }

                // ── resetall ──────────────────────────────────────────────────
                if (sub === 'resetall') {
                    await setInDb(permKey, {});
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createEmbed({
                            title: '✅ All Overrides Cleared',
                            description: 'All permission overrides for this server have been removed.\nDefault permission tiers now apply to all commands.',
                            color: 'success',
                            timestamp: true,
                        })]
                    });
                }
            }

            // Fallback (shouldn't reach here)
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Unknown subcommand.')]
            });

        } catch (error) {
            logger.error('Botconfig command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Failed to update config. Check logs.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
