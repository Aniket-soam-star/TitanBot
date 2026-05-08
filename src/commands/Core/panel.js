// 📁 src/commands/Core/panel.js
//
// Command: /panel
// Opens a full interactive configuration panel for Zero Bot.
// Click buttons to navigate, edit buttons open pre-filled modals.
// No need to type any subcommand names — everything is visual.
//
// Saves to DB key: zerobot:global:config (same as /botconfig)
// Applied to live botConfig immediately on each save.

import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { botConfig } from '../../config/bot.js';

// ─── DB helpers ──────────────────────────────────────────────────────────────
const DB_KEY = 'zerobot:global:config';

async function loadOverrides()     { return getFromDb(DB_KEY, {}); }
async function saveKey(key, value) {
    const ov = await loadOverrides();
    ov[key]  = value;
    await setInDb(DB_KEY, ov);
}

function applyLive(dotKey, value) {
    try {
        const parts = dotKey.split('.');
        let obj = botConfig;
        for (let i = 0; i < parts.length - 1; i++) {
            if (obj[parts[i]] === undefined) return;
            obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = value;
    } catch { /* silent */ }
}

async function persist(dotKey, value) {
    applyLive(dotKey, value);
    await saveKey(dotKey, value);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_LABELS = { online: '🟢 Online', idle: '🌙 Idle', dnd: '🔴 Do Not Disturb', invisible: '⚫ Invisible' };
const ACTIVITY_TYPE = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' };
const isHex         = s => /^#[0-9A-Fa-f]{6}$/.test(s);
const fmt           = v => `\`${v}\``;
const PANEL_TIMEOUT = 10 * 60 * 1000;
const MODAL_TIMEOUT = 5  * 60 * 1000;

function btn(id, label, style = ButtonStyle.Primary) {
    return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

function input(customId, label, value = '') {
    return new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setValue(String(value))
        .setRequired(true);
}

function row(...components) {
    return new ActionRowBuilder().addComponents(...components);
}

function isOwner(interaction) {
    return interaction.guild?.ownerId === interaction.user.id
        || interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
}

// ─── EMBED BUILDERS ──────────────────────────────────────────────────────────

function mainEmbed() {
    return createEmbed({
        title: '⚙️ Zero Bot — Configuration Panel',
        description: [
            'Welcome to the bot configuration panel.',
            'Select a category below to view and edit its settings.',
            '',
            '🟢 **Presence**  •  How the bot appears in the member list',
            '🎨 **Branding**  •  Embed colors and footer text',
            '💰 **Economy**   •  Currency, balances, work and rob settings',
            '🧩 **Features**  •  Enable or disable feature modules',
            '🎁 **Giveaway**  •  Default duration and winner limits',
            '🌐 **Welcome**   •  Join and leave message templates',
            '⏱️ **Cooldown**  •  Default command cooldown',
            '📊 **Status**    •  View all current settings at a glance',
        ].join('\n'),
        color: 'primary',
        footer: { text: 'Changes apply immediately • Panel times out after 10 minutes' },
        timestamp: true,
    });
}

function presenceEmbed() {
    const p   = botConfig.presence;
    const act = p.activities?.[0];
    return createEmbed({
        title: '🟢 Presence Settings',
        description: 'Configure how the bot appears in Discord\'s member list.',
        color: 'primary',
        fields: [
            { name: '🔘 Status',        value: STATUS_LABELS[p.status] ?? p.status, inline: true },
            { name: '🎮 Activity Type', value: ACTIVITY_TYPE[act?.type] ?? 'Playing', inline: true },
            { name: '📝 Activity Text', value: fmt(act?.name ?? 'N/A'), inline: false },
        ],
        footer: { text: 'Use the buttons below to edit each field' },
        timestamp: true,
    });
}

function brandingEmbed() {
    const c = botConfig.embeds.colors;
    const f = botConfig.embeds.footer;
    return createEmbed({
        title: '🎨 Branding Settings',
        description: 'Configure embed colors and footer text across the bot.',
        color: 'primary',
        fields: [
            { name: '📝 Footer Text', value: fmt(f.text ?? 'Zero Bot'), inline: false },
            { name: '🎨 Primary',     value: fmt(c.primary),   inline: true },
            { name: '✅ Success',     value: fmt(c.success),   inline: true },
            { name: '❌ Error',       value: fmt(c.error),     inline: true },
            { name: '⚠️ Warning',    value: fmt(c.warning),   inline: true },
            { name: 'ℹ️ Info',       value: fmt(c.info),      inline: true },
            { name: '🔵 Secondary',  value: fmt(c.secondary), inline: true },
        ],
        footer: { text: 'Colors must be in #RRGGBB format' },
        timestamp: true,
    });
}

function economyEmbed() {
    const e = botConfig.economy;
    return createEmbed({
        title: '💰 Economy Settings',
        description: 'Configure the economy system currency, balances, and payouts.',
        color: 'primary',
        fields: [
            { name: '🪙 Currency',     value: `${fmt(e.currency.symbol)}  Name: ${fmt(e.currency.name)} / ${fmt(e.currency.namePlural)}`, inline: false },
            { name: '💵 Starting Bal', value: fmt(e.startingBalance),  inline: true },
            { name: '🎁 Daily Amount', value: fmt(e.dailyAmount),       inline: true },
            { name: '🏦 Bank Cap',     value: fmt(e.baseBankCapacity),  inline: true },
            { name: '⚒️ Work Range',  value: `${fmt(e.workMin)} – ${fmt(e.workMax)}`, inline: true },
            { name: '🙏 Beg Range',   value: `${fmt(e.begMin)} – ${fmt(e.begMax)}`,  inline: true },
            { name: '🦹 Rob Rate',    value: fmt(e.robSuccessRate * 100 + '%'),       inline: true },
            { name: '⛓️ Jail Time',  value: fmt(e.robFailJailTime / 60000 + ' min'), inline: true },
        ],
        timestamp: true,
    });
}

function featuresEmbed() {
    const f     = botConfig.features;
    const lines = Object.entries(f).map(([k, v]) => `${v ? '✅' : '❌'}  ${k}`);
    return createEmbed({
        title: '🧩 Feature Toggles',
        description: 'Select a feature from the dropdown to toggle it on or off.\n\n' + lines.join('\n'),
        color: 'primary',
        footer: { text: 'Changes apply immediately without restart' },
        timestamp: true,
    });
}

function giveawayEmbed() {
    const g = botConfig.giveaways;
    return createEmbed({
        title: '🎁 Giveaway Settings',
        description: 'Configure default giveaway duration and winner limits.',
        color: 'primary',
        fields: [
            { name: '⏱️ Default Duration', value: fmt(g.defaultDuration / 3_600_000 + ' hours'), inline: true },
            { name: '🏆 Min Winners',       value: fmt(g.minimumWinners), inline: true },
            { name: '🏆 Max Winners',       value: fmt(g.maximumWinners), inline: true },
        ],
        timestamp: true,
    });
}

function welcomeEmbed() {
    const w = botConfig.welcome;
    return createEmbed({
        title: '🌐 Welcome Settings',
        description: 'Configure join and leave message templates.\n\nPlaceholders: `{user}` `{server}` `{memberCount}`',
        color: 'primary',
        fields: [
            { name: '👋 Welcome Message', value: fmt(w.defaultWelcomeMessage), inline: false },
            { name: '👋 Goodbye Message', value: fmt(w.defaultGoodbyeMessage), inline: false },
        ],
        timestamp: true,
    });
}

function cooldownEmbed() {
    return createEmbed({
        title: '⏱️ Cooldown Settings',
        description: 'Configure how long users must wait between commands.',
        color: 'primary',
        fields: [
            { name: '⏱️ Default Cooldown', value: fmt(botConfig.commands.defaultCooldown + ' seconds'), inline: true },
        ],
        timestamp: true,
    });
}

function statusEmbed() {
    const p      = botConfig.presence;
    const e      = botConfig.economy;
    const f      = botConfig.features;
    const act    = p.activities?.[0];
    const featOn  = Object.entries(f).filter(([, v]) => v).map(([k]) => k).join(', ') || 'None';
    const featOff = Object.entries(f).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'None';
    return createEmbed({
        title: '📊 Current Configuration',
        color: 'info',
        fields: [
            { name: '🟢 Presence',    value: `${STATUS_LABELS[p.status]} — ${ACTIVITY_TYPE[act?.type] ?? 'Playing'} ${act?.name}`, inline: false },
            { name: '💰 Currency',    value: `${e.currency.symbol}${e.currency.name} | Start: ${e.startingBalance} | Daily: ${e.dailyAmount}`, inline: false },
            { name: '⏱️ Cooldown',   value: fmt(botConfig.commands.defaultCooldown + 's'), inline: true },
            { name: '📝 Footer',      value: fmt(botConfig.embeds.footer.text), inline: true },
            { name: '✅ Features ON', value: featOn,  inline: false },
            { name: '❌ Features OFF', value: featOff, inline: false },
        ],
        footer: { text: 'All settings as of right now' },
        timestamp: true,
    });
}

// ─── ROW BUILDERS ─────────────────────────────────────────────────────────────

function mainRows() {
    return [
        new ActionRowBuilder().addComponents(
            btn('panel_presence', '🟢 Presence',  ButtonStyle.Primary),
            btn('panel_branding', '🎨 Branding',  ButtonStyle.Primary),
            btn('panel_economy',  '💰 Economy',   ButtonStyle.Primary),
            btn('panel_features', '🧩 Features',  ButtonStyle.Primary),
        ),
        new ActionRowBuilder().addComponents(
            btn('panel_giveaway', '🎁 Giveaway',  ButtonStyle.Secondary),
            btn('panel_welcome',  '🌐 Welcome',   ButtonStyle.Secondary),
            btn('panel_cooldown', '⏱️ Cooldown', ButtonStyle.Secondary),
            btn('panel_status',   '📊 Status',    ButtonStyle.Secondary),
        ),
    ];
}

function backRow() {
    return new ActionRowBuilder().addComponents(
        btn('panel_back', '← Back', ButtonStyle.Danger),
    );
}

function presenceRows() {
    return [
        new ActionRowBuilder().addComponents(
            btn('presence_status',  '🔘 Edit Status',        ButtonStyle.Primary),
            btn('presence_acttype', '🎮 Edit Activity Type', ButtonStyle.Primary),
            btn('presence_acttext', '📝 Edit Activity Text', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

function brandingRows() {
    return [
        new ActionRowBuilder().addComponents(
            btn('branding_footer', '📝 Footer Text',   ButtonStyle.Primary),
            btn('branding_main',   '🎨 Main Colors',   ButtonStyle.Primary),
            btn('branding_status', '✅ Status Colors', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

function economyRows() {
    return [
        new ActionRowBuilder().addComponents(
            btn('econ_currency', '🪙 Currency',     ButtonStyle.Primary),
            btn('econ_balances', '💵 Balances',     ButtonStyle.Primary),
            btn('econ_work',     '⚒️ Work & Beg', ButtonStyle.Primary),
            btn('econ_rob',      '🦹 Rob & Jail',  ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

function giveawayRows() {
    return [
        new ActionRowBuilder().addComponents(
            btn('gv_settings', '✏️ Edit Settings', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

function welcomeRows() {
    return [
        new ActionRowBuilder().addComponents(
            btn('wlc_welcome', '👋 Edit Welcome Msg', ButtonStyle.Primary),
            btn('wlc_goodbye', '👋 Edit Goodbye Msg', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

function cooldownRows() {
    return [
        new ActionRowBuilder().addComponents(
            btn('cd_edit', '✏️ Edit Cooldown', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

function statusRows() { return [backRow()]; }

function featuresRows() {
    const opts = Object.entries(botConfig.features).map(([key, enabled]) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(key)
            .setValue(key)
            .setDescription(enabled ? 'Currently ENABLED — click to disable' : 'Currently DISABLED — click to enable')
            .setEmoji(enabled ? '✅' : '❌')
    );
    return [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('features_toggle')
                .setPlaceholder('Select a feature to toggle on/off...')
                .addOptions(opts)
        ),
        backRow(),
    ];
}

function presenceStatusRows() {
    return [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('presence_status_select')
                .setPlaceholder('Choose a status...')
                .addOptions(
                    Object.entries(STATUS_LABELS).map(([val, label]) =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(label)
                            .setValue(val)
                            .setEmoji(val === 'online' ? '🟢' : val === 'idle' ? '🌙' : val === 'dnd' ? '🔴' : '⚫')
                    )
                )
        ),
        backRow(),
    ];
}

function presenceActTypeRows() {
    return [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('presence_acttype_select')
                .setPlaceholder('Choose activity type...')
                .addOptions(
                    Object.entries(ACTIVITY_TYPE).map(([val, label]) =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(label)
                            .setValue(String(val))
                    )
                )
        ),
        backRow(),
    ];
}

// ─── MODAL BUILDERS ──────────────────────────────────────────────────────────

function actTextModal() {
    const current = botConfig.presence.activities?.[0]?.name ?? '';
    return new ModalBuilder()
        .setCustomId('modal_acttext')
        .setTitle('Edit Activity Text')
        .addComponents(row(
            new TextInputBuilder()
                .setCustomId('acttext')
                .setLabel('Activity Text (shown under bot name)')
                .setStyle(TextInputStyle.Short)
                .setValue(current)
                .setMaxLength(128)
                .setRequired(true)
        ));
}

function footerModal() {
    return new ModalBuilder()
        .setCustomId('modal_footer')
        .setTitle('Edit Footer Text')
        .addComponents(row(
            new TextInputBuilder()
                .setCustomId('footer')
                .setLabel('Footer text shown in all embeds')
                .setStyle(TextInputStyle.Short)
                .setValue(botConfig.embeds.footer.text ?? 'Zero Bot')
                .setMaxLength(100)
                .setRequired(true)
        ));
}

function mainColorsModal() {
    const c = botConfig.embeds.colors;
    return new ModalBuilder()
        .setCustomId('modal_main_colors')
        .setTitle('Edit Main Colors')
        .addComponents(
            row(input('col_primary',   'Primary Color (#RRGGBB)',   c.primary   ?? '#FFD700')),
            row(input('col_secondary', 'Secondary Color (#RRGGBB)', c.secondary ?? '#000000')),
        );
}

function statusColorsModal() {
    const c = botConfig.embeds.colors;
    return new ModalBuilder()
        .setCustomId('modal_status_colors')
        .setTitle('Edit Status Colors')
        .addComponents(
            row(input('col_success', 'Success Color (#RRGGBB)', c.success ?? '#57F287')),
            row(input('col_error',   'Error Color (#RRGGBB)',   c.error   ?? '#ED4245')),
            row(input('col_warning', 'Warning Color (#RRGGBB)', c.warning ?? '#FEE75C')),
            row(input('col_info',    'Info Color (#RRGGBB)',    c.info    ?? '#5865F2')),
        );
}

function currencyModal() {
    const c = botConfig.economy.currency;
    return new ModalBuilder()
        .setCustomId('modal_currency')
        .setTitle('Edit Currency')
        .addComponents(
            row(input('cur_symbol', 'Symbol (e.g. £ $ 🪙)',    c.symbol     ?? '£')),
            row(input('cur_name',   'Name singular (e.g. coin)', c.name       ?? 'coins')),
            row(input('cur_plural', 'Name plural (e.g. coins)',  c.namePlural ?? 'coins')),
        );
}

function balancesModal() {
    const e = botConfig.economy;
    return new ModalBuilder()
        .setCustomId('modal_balances')
        .setTitle('Edit Balances')
        .addComponents(
            row(input('bal_start', 'Starting Balance',    String(e.startingBalance  ?? 50))),
            row(input('bal_daily', 'Daily Reward Amount', String(e.dailyAmount      ?? 100))),
            row(input('bal_bank',  'Bank Capacity',       String(e.baseBankCapacity ?? 100000))),
        );
}

function workModal() {
    const e = botConfig.economy;
    return new ModalBuilder()
        .setCustomId('modal_work')
        .setTitle('Edit Work & Beg Payouts')
        .addComponents(
            row(input('work_min', 'Work Min Payout', String(e.workMin ?? 10))),
            row(input('work_max', 'Work Max Payout', String(e.workMax ?? 100))),
            row(input('beg_min',  'Beg Min Payout',  String(e.begMin  ?? 5))),
            row(input('beg_max',  'Beg Max Payout',  String(e.begMax  ?? 50))),
        );
}

function robModal() {
    const e = botConfig.economy;
    return new ModalBuilder()
        .setCustomId('modal_rob')
        .setTitle('Edit Rob & Jail Settings')
        .addComponents(
            row(input('rob_rate', 'Rob Success Rate (0.0 – 1.0)',  String(e.robSuccessRate ?? 0.4))),
            row(input('rob_jail', 'Jail Time on Failure (minutes)', String((e.robFailJailTime ?? 3600000) / 60000))),
        );
}

function giveawayModal() {
    const g = botConfig.giveaways;
    return new ModalBuilder()
        .setCustomId('modal_giveaway')
        .setTitle('Edit Giveaway Defaults')
        .addComponents(
            row(input('gv_hours',  'Default Duration (hours)', String(g.defaultDuration / 3_600_000 ?? 24))),
            row(input('gv_minwin', 'Minimum Winners',          String(g.minimumWinners ?? 1))),
            row(input('gv_maxwin', 'Maximum Winners',          String(g.maximumWinners ?? 10))),
        );
}

function welcomeModal(type) {
    const w         = botConfig.welcome;
    const isWelcome = type === 'welcome';
    return new ModalBuilder()
        .setCustomId(isWelcome ? 'modal_welcome_msg' : 'modal_goodbye_msg')
        .setTitle(isWelcome ? 'Edit Welcome Message' : 'Edit Goodbye Message')
        .addComponents(row(
            new TextInputBuilder()
                .setCustomId('msg')
                .setLabel(isWelcome ? 'Welcome message ({user} {server} {memberCount})' : 'Goodbye message ({user} {memberCount})')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(isWelcome ? (w.defaultWelcomeMessage ?? '') : (w.defaultGoodbyeMessage ?? ''))
                .setMaxLength(500)
                .setRequired(true)
        ));
}

function cooldownModal() {
    return new ModalBuilder()
  
