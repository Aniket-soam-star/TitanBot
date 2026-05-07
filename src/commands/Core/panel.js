// 📁 NEW FILE → src/commands/Core/panel.js
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
    ComponentType,
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { botConfig } from '../../config/bot.js';

// ─── DB helpers ──────────────────────────────────────────────────────────────
const DB_KEY = 'zerobot:global:config';

async function loadOverrides()            { return getFromDb(DB_KEY, {}); }
async function saveKey(key, value)        {
    const ov = await loadOverrides();
    ov[key]  = value;
    await setInDb(DB_KEY, ov);
}

// Apply dot-notation key to live botConfig (e.g. "economy.currency.name")
function applyLive(dotKey, value) {
    try {
        const parts = dotKey.split('.');
        let obj = botConfig;
        for (let i = 0; i < parts.length - 1; i++) {
            if (obj[parts[i]] === undefined) return;
            obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = value;
    } catch (e) { /* silent */ }
}

async function persist(dotKey, value) {
    applyLive(dotKey, value);
    await saveKey(dotKey, value);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_LABELS  = { online: '🟢 Online', idle: '🌙 Idle', dnd: '🔴 Do Not Disturb', invisible: '⚫ Invisible' };
const ACTIVITY_TYPE  = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' };
const isHex          = s => /^#[0-9A-Fa-f]{6}$/.test(s);
const fmt            = v => `\`${v}\``;
const PANEL_TIMEOUT  = 10 * 60 * 1000; // 10 minutes

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
    const p    = botConfig.presence;
    const act  = p.activities?.[0];
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
            { name: '🪙 Currency',      value: `${fmt(e.currency.symbol)}  Name: ${fmt(e.currency.name)} / ${fmt(e.currency.namePlural)}`, inline: false },
            { name: '💵 Starting Bal',  value: fmt(e.startingBalance),   inline: true },
            { name: '🎁 Daily Amount',  value: fmt(e.dailyAmount),        inline: true },
            { name: '🏦 Bank Cap',      value: fmt(e.baseBankCapacity),   inline: true },
            { name: '⚒️ Work Range',   value: `${fmt(e.workMin)} – ${fmt(e.workMax)}`, inline: true },
            { name: '🙏 Beg Range',    value: `${fmt(e.begMin)} – ${fmt(e.begMax)}`,  inline: true },
            { name: '🦹 Rob Rate',     value: `${fmt(e.robSuccessRate * 100 + '%')}`, inline: true },
            { name: '⛓️ Jail Time',   value: fmt(e.robFailJailTime / 60000 + ' min'), inline: true },
        ],
        timestamp: true,
    });
}

function featuresEmbed() {
    const f = botConfig.features;
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
            { name: '⏱️ Default Duration', value: fmt(g.defaultDuration / 3_600_000 + ' hours'),  inline: true },
            { name: '🏆 Min Winners',      value: fmt(g.minimumWinners),  inline: true },
            { name: '🏆 Max Winners',      value: fmt(g.maximumWinners),  inline: true },
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
    const p = botConfig.presence;
    const e = botConfig.economy;
    const f = botConfig.features;
    const act = p.activities?.[0];
    const featOn  = Object.entries(f).filter(([,v]) => v).map(([k]) => k).join(', ');
    const featOff = Object.entries(f).filter(([,v]) => !v).map(([k]) => k).join(', ') || 'None';
    return createEmbed({
        title: '📊 Current Configuration',
        color: 'info',
        fields: [
            { name: '🟢 Presence',    value: `${STATUS_LABELS[p.status]} — ${ACTIVITY_TYPE[act?.type] ?? 'Playing'} ${act?.name}`, inline: false },
            { name: '💰 Currency',    value: `${e.currency.symbol}${e.currency.name} | Start: ${e.startingBalance} | Daily: ${e.dailyAmount}`, inline: false },
            { name: '⏱️ Cooldown',   value: fmt(botConfig.commands.defaultCooldown + 's'), inline: true },
            { name: '📝 Footer',      value: fmt(botConfig.embeds.footer.text), inline: true },
            { name: '✅ Features ON', value: featOn || 'None', inline: false },
            { name: '❌ Features OFF',value: featOff, inline: false },
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

// Presence rows
function presenceRows() {
    return [
        new ActionRowBuilder().addComponents(
            btn('presence_status',   '🔘 Edit Status',        ButtonStyle.Primary),
            btn('presence_acttype',  '🎮 Edit Activity Type', ButtonStyle.Primary),
            btn('presence_acttext',  '📝 Edit Activity Text', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

// Branding rows
function brandingRows() {
    return [
        new ActionRowBuilder().addComponents(
            btn('branding_footer',  '📝 Footer Text',     ButtonStyle.Primary),
            btn('branding_main',    '🎨 Main Colors',     ButtonStyle.Primary),
            btn('branding_status',  '✅ Status Colors',   ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

// Economy rows
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

// Giveaway rows
function giveawayRows() {
    return [
        new ActionRowBuilder().addComponents(
            btn('gv_settings', '✏️ Edit Settings', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

// Welcome rows
function welcomeRows() {
    return [
        new ActionRowBuilder().addComponents(
            btn('wlc_welcome', '👋 Edit Welcome Msg', ButtonStyle.Primary),
            btn('wlc_goodbye', '👋 Edit Goodbye Msg', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

// Cooldown rows
function cooldownRows() {
    return [
        new ActionRowBuilder().addComponents(
            btn('cd_edit', '✏️ Edit Cooldown', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

// Status rows
function statusRows() { return [backRow()]; }

// Features select menu + back
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

// Presence status select
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

// Presence activity type select
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
                            .setValue(val)
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
        .addComponents(new ActionRowBuilder().addComponents(
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
        .addComponents(new ActionRowBuilder().addComponents(
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
            row(input('col_success', 'Success Color (#RRGGBB)', c.success ?? '#FFD700')),
            row(input('col_error',   'Error Color (#RRGGBB)',   c.error   ?? '#000000')),
            row(input('col_warning', 'Warning Color (#RRGGBB)', c.warning ?? '#FF0000')),
            row(input('col_info',    'Info Color (#RRGGBB)',    c.info    ?? '#FFD700')),
        );
}

function currencyModal() {
    const c = botConfig.economy.currency;
    return new ModalBuilder()
        .setCustomId('modal_currency')
        .setTitle('Edit Currency')
        .addComponents(
            row(input('cur_symbol', 'Symbol (e.g. £ $ 🪙)',       c.symbol     ?? '£')),
            row(input('cur_name',   'Name singular (e.g. coin)',   c.name       ?? 'coins')),
            row(input('cur_plural', 'Name plural (e.g. coins)',    c.namePlural ?? 'coins')),
        );
}

function balancesModal() {
    const e = botConfig.economy;
    return new ModalBuilder()
        .setCustomId('modal_balances')
        .setTitle('Edit Balances')
        .addComponents(
            row(input('bal_start',  'Starting Balance',    String(e.startingBalance  ?? 50))),
            row(input('bal_daily',  'Daily Reward Amount', String(e.dailyAmount      ?? 100))),
            row(input('bal_bank',   'Bank Capacity',       String(e.baseBankCapacity ?? 100000))),
        );
}

function workModal() {
    const e = botConfig.economy;
    return new ModalBuilder()
        .setCustomId('modal_work')
        .setTitle('Edit Work & Beg Payouts')
        .addComponents(
            row(input('work_min', 'Work Min Payout',  String(e.workMin ?? 10))),
            row(input('work_max', 'Work Max Payout',  String(e.workMax ?? 100))),
            row(input('beg_min',  'Beg Min Payout',   String(e.begMin  ?? 5))),
            row(input('beg_max',  'Beg Max Payout',   String(e.begMax  ?? 50))),
        );
}

function robModal() {
    const e = botConfig.economy;
    return new ModalBuilder()
        .setCustomId('modal_rob')
        .setTitle('Edit Rob & Jail Settings')
        .addComponents(
            row(input('rob_rate', 'Rob Success Rate (0.0 – 1.0)', String(e.robSuccessRate ?? 0.4))),
            row(input('rob_jail', 'Jail Time on Failure (minutes)', String((e.robFailJailTime ?? 3600000) / 60000))),
        );
}

function giveawayModal() {
    const g = botConfig.giveaways;
    return new ModalBuilder()
        .setCustomId('modal_giveaway')
        .setTitle('Edit Giveaway Defaults')
        .addComponents(
            row(input('gv_hours',   'Default Duration (hours)',   String(g.defaultDuration / 3_600_000 ?? 24))),
            row(input('gv_minwin',  'Minimum Winners',            String(g.minimumWinners ?? 1))),
            row(input('gv_maxwin',  'Maximum Winners',            String(g.maximumWinners ?? 10))),
        );
}

function welcomeModal(type) {
    const w = botConfig.welcome;
    const isWelcome = type === 'welcome';
    return new ModalBuilder()
        .setCustomId(isWelcome ? 'modal_welcome_msg' : 'modal_goodbye_msg')
        .setTitle(isWelcome ? 'Edit Welcome Message' : 'Edit Goodbye Message')
        .addComponents(new ActionRowBuilder().addComponents(
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
        .setCustomId('modal_cooldown')
        .setTitle('Edit Default Cooldown')
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('cd')
                .setLabel('Cooldown in seconds (0 = no cooldown)')
                .setStyle(TextInputStyle.Short)
                .setValue(String(botConfig.commands.defaultCooldown ?? 3))
                .setMaxLength(4)
                .setRequired(true)
        ));
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function btn(id, label, style, disabled = false) {
    return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
}
function input(id, label, value = '') {
    return new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label.slice(0, 45))
        .setStyle(TextInputStyle.Short)
        .setValue(String(value).slice(0, 100))
        .setRequired(true);
}
function row(component) {
    return new ActionRowBuilder().addComponents(component);
}

function saved(field) {
    return createEmbed({ title: '✅ Saved', description: `**${field}** updated successfully.`, color: 'success', timestamp: true });
}
function invalid(msg) {
    return createEmbed({ title: '❌ Invalid Input', description: msg, color: 'error', timestamp: true });
}

// ─── MODAL AWAIT helper ───────────────────────────────────────────────────────
async function awaitModal(action, modal, msg) {
    await action.showModal(modal);
    const submit = await action.awaitModalSubmit({
        time:   120_000,
        filter: i => i.user.id === action.user.id && i.customId === modal.data.custom_id,
    }).catch(() => null);
    return submit;
}

// ─── PANEL STATE MACHINE ──────────────────────────────────────────────────────
async function runPanel(interaction, client) {
    const filter = i => i.user.id === interaction.user.id;

    // Initial render
    const msg = await InteractionHelper.safeEditReply(interaction, {
        embeds: [mainEmbed()],
        components: mainRows(),
    });

    const collector = msg.createMessageComponentCollector({ filter, time: PANEL_TIMEOUT });

    collector.on('collect', async action => {
        try {
            const id = action.customId;

            // ── MAIN NAVIGATION ──────────────────────────────────────────────
            if (id === 'panel_back') {
                await action.update({ embeds: [mainEmbed()], components: mainRows() });
                return;
            }
            if (id === 'panel_presence') { await action.update({ embeds: [presenceEmbed()],    components: presenceRows()   }); return; }
            if (id === 'panel_branding')  { await action.update({ embeds: [brandingEmbed()],    components: brandingRows()   }); return; }
            if (id === 'panel_economy')   { await action.update({ embeds: [economyEmbed()],     components: economyRows()    }); return; }
            if (id === 'panel_features')  { await action.update({ embeds: [featuresEmbed()],    components: featuresRows()   }); return; }
            if (id === 'panel_giveaway')  { await action.update({ embeds: [giveawayEmbed()],    components: giveawayRows()   }); return; }
            if (id === 'panel_welcome')   { await action.update({ embeds: [welcomeEmbed()],     components: welcomeRows()    }); return; }
            if (id === 'panel_cooldown')  { await action.update({ embeds: [cooldownEmbed()],    components: cooldownRows()   }); return; }
            if (id === 'panel_status')    { await action.update({ embeds: [statusEmbed()],      components: statusRows()     }); return; }

            // ── PRESENCE ─────────────────────────────────────────────────────
            if (id === 'presence_status') {
                await action.update({ embeds: [presenceEmbed()], components: presenceStatusRows() });
                return;
            }
            if (id === 'presence_acttype') {
                await action.update({ embeds: [presenceEmbed()], components: presenceActTypeRows() });
                return;
            }
            if (id === 'presence_status_select') {
                const val = action.values[0];
                botConfig.presence.status = val;
                client.user.setPresence({ status: val, activities: botConfig.presence.activities });
                await persist('presence', botConfig.presence);
                await action.update({ embeds: [presenceEmbed()], components: presenceRows() });
                return;
            }
            if (id === 'presence_acttype_select') {
                const val = parseInt(action.values[0]);
                botConfig.presence.activities[0].type = val;
                client.user.setPresence({ status: botConfig.presence.status, activities: botConfig.presence.activities });
                await persist('presence', botConfig.presence);
                await action.update({ embeds: [presenceEmbed()], components: presenceRows() });
                return;
            }
            if (id === 'presence_acttext') {
                const submit = await awaitModal(action, actTextModal(), msg);
                if (!submit) return;
                const val = submit.fields.getTextInputValue('acttext').trim();
                botConfig.presence.activities[0].name = val;
                client.user.setPresence({ status: botConfig.presence.status, activities: botConfig.presence.activities });
                await persist('presence', botConfig.presence);
                await submit.update({ embeds: [presenceEmbed(), saved('Activity Text')], components: presenceRows() });
                return;
            }

            // ── BRANDING ─────────────────────────────────────────────────────
            if (id === 'branding_footer') {
                const submit = await awaitModal(action, footerModal(), msg);
                if (!submit) return;
                const val = submit.fields.getTextInputValue('footer').trim();
                botConfig.embeds.footer.text = val;
                await persist('embeds.footer.text', val);
                await submit.update({ embeds: [brandingEmbed(), saved('Footer Text')], components: brandingRows() });
                return;
            }
            if (id === 'branding_main') {
                const submit = await awaitModal(action, mainColorsModal(), msg);
                if (!submit) return;
                const primary   = submit.fields.getTextInputValue('col_primary').trim();
                const secondary = submit.fields.getTextInputValue('col_secondary').trim();
                const errors    = [];
                if (!isHex(primary))   errors.push(`Primary \`${primary}\` — not a valid hex code`);
                if (!isHex(secondary)) errors.push(`Secondary \`${secondary}\` — not a valid hex code`);
                if (errors.length > 0) { await submit.update({ embeds: [brandingEmbed(), invalid(errors.join('\n'))], components: brandingRows() }); return; }
                botConfig.embeds.colors.primary   = primary;
                botConfig.embeds.colors.secondary = secondary;
                await persist('embeds.colors.primary',   primary);
                await persist('embeds.colors.secondary', secondary);
                await submit.update({ embeds: [brandingEmbed(), saved('Main Colors')], components: brandingRows() });
                return;
            }
            if (id === 'branding_status') {
                const submit = await awaitModal(action, statusColorsModal(), msg);
                if (!submit) return;
                const success = submit.fields.getTextInputValue('col_success').trim();
                const error   = submit.fields.getTextInputValue('col_error').trim();
                const warning = submit.fields.getTextInputValue('col_warning').trim();
                const info    = submit.fields.getTextInputValue('col_info').trim();
                const errs    = [success, error, warning, info].filter(c => !isHex(c)).map(c => `\`${c}\` is not a valid hex code`);
                if (errs.length > 0) { await submit.update({ embeds: [brandingEmbed(), invalid(errs.join('\n'))], components: brandingRows() }); return; }
                ['success', 'error', 'warning', 'info'].forEach((k, i) => {
                    const val = [success, error, warning, info][i];
                    botConfig.embeds.colors[k] = val;
                    persist(`embeds.colors.${k}`, val);
                });
                await submit.update({ embeds: [brandingEmbed(), saved('Status Colors')], components: brandingRows() });
                return;
            }

            // ── ECONOMY ───────────────────────────────────────────────────────
            if (id === 'econ_currency') {
                const submit = await awaitModal(action, currencyModal(), msg);
                if (!submit) return;
                const symbol = submit.fields.getTextInputValue('cur_symbol').trim();
                const name   = submit.fields.getTextInputValue('cur_name').trim();
                const plural = submit.fields.getTextInputValue('cur_plural').trim();
                botConfig.economy.currency = { ...botConfig.economy.currency, symbol, name, namePlural: plural };
                await persist('economy.currency.symbol',     symbol);
                await persist('economy.currency.name',       name);
                await persist('economy.currency.namePlural', plural);
                await submit.update({ embeds: [economyEmbed(), saved('Currency')], components: economyRows() });
                return;
            }
            if (id === 'econ_balances') {
                const submit = await awaitModal(action, balancesModal(), msg);
                if (!submit) return;
                const start = parseInt(submit.fields.getTextInputValue('bal_start'));
                const daily = parseInt(submit.fields.getTextInputValue('bal_daily'));
                const bank  = parseInt(submit.fields.getTextInputValue('bal_bank'));
                if ([start, daily, bank].some(isNaN)) { await submit.update({ embeds: [economyEmbed(), invalid('All values must be whole numbers.')], components: economyRows() }); return; }
                botConfig.economy.startingBalance  = start;
                botConfig.economy.dailyAmount       = daily;
                botConfig.economy.baseBankCapacity  = bank;
                await persist('economy.startingBalance',  start);
                await persist('economy.dailyAmount',       daily);
                await persist('economy.baseBankCapacity',  bank);
                await submit.update({ embeds: [economyEmbed(), saved('Balances')], components: economyRows() });
                return;
            }
            if (id === 'econ_work') {
                const submit = await awaitModal(action, workModal(), msg);
                if (!submit) return;
                const wmin = parseInt(submit.fields.getTextInputValue('work_min'));
                const wmax = parseInt(submit.fields.getTextInputValue('work_max'));
                const bmin = parseInt(submit.fields.getTextInputValue('beg_min'));
                const bmax = parseInt(submit.fields.getTextInputValue('beg_max'));
                if ([wmin, wmax, bmin, bmax].some(isNaN)) { await submit.update({ embeds: [economyEmbed(), invalid('All values must be whole numbers.')], components: economyRows() }); return; }
                if (wmin > wmax || bmin > bmax) { await submit.update({ embeds: [economyEmbed(), invalid('Min values cannot be greater than max values.')], components: economyRows() }); return; }
                botConfig.economy.workMin = wmin; botConfig.economy.workMax = wmax;
                botConfig.economy.begMin  = bmin; botConfig.economy.begMax  = bmax;
                await ['workMin','workMax','begMin','begMax'].reduce(async (p, k) => {
                    await p; await persist(`economy.${k}`, botConfig.economy[k]);
                }, Promise.resolve());
                await submit.update({ embeds: [economyEmbed(), saved('Work & Beg Payouts')], components: economyRows() });
                return;
            }
            if (id === 'econ_rob') {
                const submit = await awaitModal(action, robModal(), msg);
                if (!submit) return;
                const rate = parseFloat(submit.fields.getTextInputValue('rob_rate'));
                const jail = parseInt(submit.fields.getTextInputValue('rob_jail'));
                if (isNaN(rate) || rate < 0 || rate > 1) { await submit.update({ embeds: [economyEmbed(), invalid('Rob rate must be between `0.0` and `1.0`')], components: economyRows() }); return; }
                if (isNaN(jail) || jail < 0)              { await submit.update({ embeds: [economyEmbed(), invalid('Jail time must be a positive number (minutes).')], components: economyRows() }); return; }
                botConfig.economy.robSuccessRate  = rate;
                botConfig.economy.robFailJailTime = jail * 60_000;
                await persist('economy.robSuccessRate',  rate);
                await persist('economy.robFailJailTime', jail * 60_000);
                await submit.update({ embeds: [economyEmbed(), saved('Rob & Jail Settings')], components: economyRows() });
                return;
            }

            // ── FEATURES ─────────────────────────────────────────────────────
            if (id === 'features_toggle') {
                const feature = action.values[0];
                if (feature in botConfig.features) {
                    botConfig.features[feature] = !botConfig.features[feature];
                    await persist(`features.${feature}`, botConfig.features[feature]);
                }
                await action.update({ embeds: [featuresEmbed()], components: featuresRows() });
                return;
            }

            // ── GIVEAWAY ─────────────────────────────────────────────────────
            if (id === 'gv_settings') {
                const submit = await awaitModal(action, giveawayModal(), msg);
                if (!submit) return;
                const hours  = parseFloat(submit.fields.getTextInputValue('gv_hours'));
                const minwin = parseInt(submit.fields.getTextInputValue('gv_minwin'));
                const maxwin = parseInt(submit.fields.getTextInputValue('gv_maxwin'));
                if (isNaN(hours) || hours <= 0)    { await submit.update({ embeds: [giveawayEmbed(), invalid('Duration must be a positive number.')], components: giveawayRows() }); return; }
                if (isNaN(minwin) || isNaN(maxwin)) { await submit.update({ embeds: [giveawayEmbed(), invalid('Winners must be whole numbers.')], components: giveawayRows() }); return; }
                if (minwin > maxwin)                { await submit.update({ embeds: [giveawayEmbed(), invalid('Min winners cannot be greater than max.')], components: giveawayRows() }); return; }
                botConfig.giveaways.defaultDuration  = hours * 3_600_000;
                botConfig.giveaways.minimumWinners   = minwin;
                botConfig.giveaways.maximumWinners   = maxwin;
                await persist('giveaways.defaultDuration',  hours * 3_600_000);
                await persist('giveaways.minimumWinners',   minwin);
                await persist('giveaways.maximumWinners',   maxwin);
                await submit.update({ embeds: [giveawayEmbed(), saved('Giveaway Settings')], components: giveawayRows() });
                return;
            }

            // ── WELCOME ───────────────────────────────────────────────────────
            if (id === 'wlc_welcome') {
                const submit = await awaitModal(action, welcomeModal('welcome'), msg);
                if (!submit) return;
                const val = submit.fields.getTextInputValue('msg').trim();
                botConfig.welcome.defaultWelcomeMessage = val;
                await persist('welcome.defaultWelcomeMessage', val);
                await submit.update({ embeds: [welcomeEmbed(), saved('Welcome Message')], components: welcomeRows() });
                return;
            }
            if (id === 'wlc_goodbye') {
                const submit = await awaitModal(action, welcomeModal('goodbye'), msg);
                if (!submit) return;
                const val = submit.fields.getTextInputValue('msg').trim();
                botConfig.welcome.defaultGoodbyeMessage = val;
                await persist('welcome.defaultGoodbyeMessage', val);
                await submit.update({ embeds: [welcomeEmbed(), saved('Goodbye Message')], components: welcomeRows() });
                return;
            }

            // ── COOLDOWN ──────────────────────────────────────────────────────
            if (id === 'cd_edit') {
                const submit = await awaitModal(action, cooldownModal(), msg);
                if (!submit) return;
                const val = parseInt(submit.fields.getTextInputValue('cd'));
                if (isNaN(val) || val < 0 || val > 300) { await submit.update({ embeds: [cooldownEmbed(), invalid('Cooldown must be between `0` and `300` seconds.')], components: cooldownRows() }); return; }
                botConfig.commands.defaultCooldown = val;
                await persist('commands.defaultCooldown', val);
                await submit.update({ embeds: [cooldownEmbed(), saved('Command Cooldown')], components: cooldownRows() });
                return;
            }

        } catch (err) {
            logger.error('[Panel] Error handling interaction:', err);
            try { await action.reply({ embeds: [createEmbed({ title: '❌ Error', description: 'Something went wrong. Please try again.', color: 'error' })], flags: MessageFlags.Ephemeral }); } catch {}
        }
    });

    collector.on('end', () => {
        // Disable all components when panel times out
        msg.edit({
            embeds: [createEmbed({
                title: '⏱️ Panel Timed Out',
                description: 'This configuration panel has expired. Run `/panel` again to reopen it.',
                color: 'warning',
                timestamp: true,
            })],
            components: [],
        }).catch(() => {});
    });
}

// ─── COMMAND EXPORT ───────────────────────────────────────────────────────────
export default {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Open the interactive bot configuration panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    category: 'core',

    async execute(interaction, config, client) {
        if (!isOwner(interaction)) {
            return interaction.reply({
                embeds: [createEmbed({
                    title: '❌ Access Denied',
                    description: [
                        '🔒 This panel is only accessible to:',
                        '> 👑 **Server Owner**',
                        '> 🛡️ Members with **Administrator** permission',
                    ].join('\n'),
                    color: 'error',
                    timestamp: true,
                })],
                flags: MessageFlags.Ephemeral,
            });
        }

        const deferred = await InteractionHelper.safeDefer(interaction, { ephemeral: false });
        if (!deferred) return;

        await runPanel(interaction, client);
    },
};
