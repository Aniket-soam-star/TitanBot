// 📁 REPLACE → src/commands/Core/panel.js
//
// Changes vs previous version:
//   1. Added 🔐 Permissions page — select a command, pick roles via Discord's
//      native role selector. Reads/writes guild:{guildId}:cmd_perms (same key
//      that roleGuard.js and /botconfig permissions use).
//   2. Fixed commandsRows — now paginated so all commands are reachable,
//      not just the first 25.
//   3. mainRows: moved Commands + added Permissions into a third row.
//   4. RoleSelectMenuBuilder imported for native role picking (no typing IDs).

import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { botConfig } from '../../config/bot.js';
import { COMMAND_TIERS, TIERS, TIER_LABELS } from '../../utils/roleGuard.js';

// ─── DB helpers ──────────────────────────────────────────────────────────────
const DB_KEY      = 'zerobot:global:config';
const PERMS_PER_PAGE = 24;  // Discord StringSelectMenu max = 25; leave 1 for safety
const CMDS_PER_PAGE  = 24;

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

// All non-PUBLIC commands sorted alphabetically — used by Permissions page
const NON_PUBLIC_CMDS = Object.entries(COMMAND_TIERS)
    .filter(([, tier]) => tier !== TIERS.PUBLIC)
    .map(([name, tier]) => ({ name, tier }))
    .sort((a, b) => a.name.localeCompare(b.name));

// ─── Small helpers ─────────────────────────────────────────────────────────────
const PANEL_TIMEOUT  = 10 * 60 * 1000;
const STATUS_LABELS  = { online: '🟢 Online', idle: '🌙 Idle', dnd: '🔴 Do Not Disturb', invisible: '⚫ Invisible' };
const ACTIVITY_TYPE  = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' };
const fmt            = v => `\`${v}\``;
const isHex          = s => /^#[0-9A-Fa-f]{6}$/.test(s);

function btn(id, label, style = ButtonStyle.Primary) {
    return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

function input(customId, label, value = '') {
    return new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label.slice(0, 45))
        .setStyle(TextInputStyle.Short)
        .setValue(String(value).slice(0, 100))
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
            '🟢 **Presence**     •  How the bot appears in the member list',
            '🎨 **Branding**     •  Embed colors and footer text',
            '💰 **Economy**      •  Currency, balances, work and rob settings',
            '🧩 **Features**     •  Enable or disable feature modules',
            '🎁 **Giveaway**     •  Default duration and winner limits',
            '🌐 **Welcome**      •  Join and leave message templates',
            '⏱️ **Cooldown**    •  Default command cooldown',
            '📊 **Status**       •  View all current settings at a glance',
            '🚫 **Commands**     •  Enable / disable individual commands',
            '🔐 **Permissions**  •  Set which roles can use which commands',
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

function commandsEmbed(client, page, total) {
    return createEmbed({
        title: '🚫 Command Enable / Disable',
        description: 'Select a command from the dropdown to toggle it on or off for this server.\n\n' +
            '> Server owners and admins can always use all commands regardless of this setting.',
        color: 'primary',
        footer: { text: `Page ${page + 1} of ${total} • Commands disabled here still show in /help` },
        timestamp: true,
    });
}

// ── PERMISSIONS PAGE EMBEDS ───────────────────────────────────────────────────

async function permissionsEmbed(guildId) {
    const overrides = await getFromDb(`guild:${guildId}:cmd_perms`, {});
    const entries   = Object.entries(overrides);
    const total     = NON_PUBLIC_CMDS.length;

    const overrideLines = entries.length > 0
        ? entries.map(([cmd, roleIds]) =>
            `\`/${cmd}\` → ${roleIds.map(id => `<@&${id}>`).join(', ')}`
          ).join('\n')
        : '_No overrides set. All commands use default Discord permissions._';

    return createEmbed({
        title: '🔐 Command Permissions',
        description: [
            'Grant specific roles access to commands, overriding the default Discord permission requirement.',
            '',
            '**How to use:**',
            '1. Pick a command from the dropdown below',
            '2. Use the role selector to pick a role',
            '3. Click **Add Role** or **Remove Role**',
            '',
            '**Current overrides for this server:**',
            overrideLines,
        ].join('\n'),
        color: 'primary',
        footer: { text: `${total} protected commands available • Owners & Admins always bypass permissions` },
        timestamp: true,
    });
}

function permDetailEmbed(cmdName, roleIds, tier) {
    const roleList = roleIds?.length > 0
        ? roleIds.map(id => `<@&${id}>`).join(', ')
        : '_No role overrides — default Discord permission applies._';

    return createEmbed({
        title: `🔐 Permissions — \`/${cmdName}\``,
        description: [
            `**Default requirement:** ${TIER_LABELS[tier] ?? 'Unknown'}`,
            '',
            '**Allowed roles (overrides default):**',
            roleList,
            '',
            'Use the role selector below then click **Add Role** or **Remove Role**.',
            'Click **Clear All** to remove all overrides and restore the default requirement.',
        ].join('\n'),
        color: 'info',
        footer: { text: 'Role overrides replace the default permission requirement entirely' },
        timestamp: true,
    });
}

// ─── ROW BUILDERS ─────────────────────────────────────────────────────────────

function mainRows() {
    return [
        row(
            btn('panel_presence', '🟢 Presence',  ButtonStyle.Primary),
            btn('panel_branding', '🎨 Branding',  ButtonStyle.Primary),
            btn('panel_economy',  '💰 Economy',   ButtonStyle.Primary),
            btn('panel_features', '🧩 Features',  ButtonStyle.Primary),
        ),
        row(
            btn('panel_giveaway', '🎁 Giveaway',  ButtonStyle.Secondary),
            btn('panel_welcome',  '🌐 Welcome',   ButtonStyle.Secondary),
            btn('panel_cooldown', '⏱️ Cooldown', ButtonStyle.Secondary),
            btn('panel_status',   '📊 Status',    ButtonStyle.Secondary),
        ),
        row(
            btn('panel_commands', '🚫 Commands',    ButtonStyle.Danger),
            btn('panel_perms',    '🔐 Permissions', ButtonStyle.Primary),
        ),
    ];
}

function backRow() {
    return row(btn('panel_back', '← Back', ButtonStyle.Danger));
}

// Presence rows
function presenceRows() {
    return [
        row(
            btn('presence_status',  '🔘 Edit Status',        ButtonStyle.Primary),
            btn('presence_acttype', '🎮 Edit Activity Type', ButtonStyle.Primary),
            btn('presence_acttext', '📝 Edit Activity Text', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

// Branding rows
function brandingRows() {
    return [
        row(
            btn('branding_footer', '📝 Footer Text',   ButtonStyle.Primary),
            btn('branding_main',   '🎨 Main Colors',   ButtonStyle.Primary),
            btn('branding_status', '✅ Status Colors', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

// Economy rows
function economyRows() {
    return [
        row(
            btn('econ_currency', '🪙 Currency',   ButtonStyle.Primary),
            btn('econ_balances', '💵 Balances',   ButtonStyle.Primary),
            btn('econ_work',     '⚒️ Work & Beg', ButtonStyle.Primary),
            btn('econ_rob',      '🦹 Rob & Jail', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

// Features rows
function featuresRows() {
    const opts = Object.entries(botConfig.features).map(([key, enabled]) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(key)
            .setValue(key)
            .setDescription(enabled ? 'Currently ENABLED — click to disable' : 'Currently DISABLED — click to enable')
            .setEmoji(enabled ? '✅' : '❌')
    );
    return [
        row(new StringSelectMenuBuilder()
            .setCustomId('features_toggle')
            .setPlaceholder('Select a feature to toggle on/off...')
            .addOptions(opts)),
        backRow(),
    ];
}

// Giveaway rows
function giveawayRows() {
    return [
        row(btn('gv_settings', '✏️ Edit Settings', ButtonStyle.Primary)),
        backRow(),
    ];
}

// Welcome rows
function welcomeRows() {
    return [
        row(
            btn('wlc_welcome', '👋 Edit Welcome Msg', ButtonStyle.Primary),
            btn('wlc_goodbye', '👋 Edit Goodbye Msg', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

// Cooldown rows
function cooldownRows() {
    return [
        row(btn('cd_edit', '✏️ Edit Cooldown', ButtonStyle.Primary)),
        backRow(),
    ];
}

// Status rows
function statusRows() { return [backRow()]; }

// ── Commands rows — PAGINATED ─────────────────────────────────────────────────
function commandsRows(client, disabledCmds, page) {
    const allCommands = [...(client?.commands?.keys() ?? [])].sort();
    const totalPages  = Math.ceil(allCommands.length / CMDS_PER_PAGE);
    const slice       = allCommands.slice(page * CMDS_PER_PAGE, (page + 1) * CMDS_PER_PAGE);

    const options = slice.map(name =>
        new StringSelectMenuOptionBuilder()
            .setLabel(`/${name}`)
            .setValue(name)
            .setDescription(disabledCmds?.[name] ? 'Currently DISABLED — click to enable' : 'Currently ENABLED — click to disable')
            .setEmoji(disabledCmds?.[name] ? '🚫' : '✅')
    );

    const rows = [];
    if (options.length > 0) {
        rows.push(row(new StringSelectMenuBuilder()
            .setCustomId('commands_toggle')
            .setPlaceholder('Select a command to enable/disable...')
            .addOptions(options)));
    }

    // Pagination + back
    rows.push(row(
        btn('cmds_prev', '◀ Prev', ButtonStyle.Secondary).setDisabled(page === 0),
        btn('cmds_page', `${page + 1}/${totalPages}`, ButtonStyle.Primary).setDisabled(true),
        btn('cmds_next', 'Next ▶', ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
        btn('panel_back', '← Back', ButtonStyle.Danger),
    ));

    return rows;
}

// ── Permissions rows ──────────────────────────────────────────────────────────

// State 1: pick a command
function permsCmdSelectRows(page) {
    const totalPages = Math.ceil(NON_PUBLIC_CMDS.length / PERMS_PER_PAGE);
    const slice      = NON_PUBLIC_CMDS.slice(page * PERMS_PER_PAGE, (page + 1) * PERMS_PER_PAGE);

    const opts = slice.map(({ name, tier }) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(`/${name}`)
            .setValue(name)
            .setDescription(TIER_LABELS[tier] ?? tier)
    );

    return [
        row(new StringSelectMenuBuilder()
            .setCustomId('perm_cmd_select')
            .setPlaceholder('Select a command to manage permissions for...')
            .addOptions(opts)),
        row(
            btn('perm_prev', '◀ Prev', ButtonStyle.Secondary).setDisabled(page === 0),
            btn('perm_page', `${page + 1}/${totalPages}`, ButtonStyle.Primary).setDisabled(true),
            btn('perm_next', 'Next ▶', ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
            btn('panel_back', '← Back', ButtonStyle.Danger),
        ),
    ];
}

// State 2: manage roles for selected command
function permsDetailRows() {
    return [
        row(new RoleSelectMenuBuilder()
            .setCustomId('perm_role_select')
            .setPlaceholder('Select a role...')),
        row(
            btn('perm_add_role',  '✅ Add Role',   ButtonStyle.Success),
            btn('perm_rem_role',  '❌ Remove Role', ButtonStyle.Danger),
            btn('perm_clear_all', '🗑 Clear All',   ButtonStyle.Danger),
            btn('perm_back_cmd',  '← Commands',    ButtonStyle.Secondary),
        ),
    ];
}

// ── Modal builders ────────────────────────────────────────────────────────────

function actTextModal() {
    const current = botConfig.presence.activities?.[0]?.name ?? '';
    return new ModalBuilder()
        .setCustomId('modal_acttext')
        .setTitle('Edit Activity Text')
        .addComponents(row(input('acttext', 'Activity text shown under bot name', current).setMaxLength(128)));
}

function footerModal() {
    return new ModalBuilder()
        .setCustomId('modal_footer')
        .setTitle('Edit Footer Text')
        .addComponents(row(input('footer', 'Footer text shown in all embeds', botConfig.embeds.footer.text ?? 'Zero Bot').setMaxLength(100)));
}

function mainColorsModal() {
    const c = botConfig.embeds.colors;
    return new ModalBuilder()
        .setCustomId('modal_main_colors')
        .setTitle('Edit Main Colors')
        .addComponents(
            row(input('col_primary',   'Primary Color (#RRGGBB)',   c.primary   ?? '#FFD700')),
            row(input('col_secondary', 'Secondary Color (#RRGGBB)', c.secondary ?? '#2F3136')),
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
            row(input('cur_symbol', 'Symbol (e.g. £ $ 🪙)',      c.symbol     ?? '£')),
            row(input('cur_name',   'Name singular (e.g. coin)',  c.name       ?? 'coin')),
            row(input('cur_plural', 'Name plural (e.g. coins)',   c.namePlural ?? 'coins')),
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
            row(input('bal_bank',  'Bank Capacity',       String(e.baseBankCapacity ?? 100_000))),
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
            row(input('rob_rate', 'Rob Success Rate (0.0 – 1.0)', String(e.robSuccessRate ?? 0.4))),
            row(input('rob_jail', 'Jail Time on failure (minutes)', String((e.robFailJailTime ?? 3_600_000) / 60_000))),
        );
}

function giveawayModal() {
    const g = botConfig.giveaways;
    return new ModalBuilder()
        .setCustomId('modal_giveaway')
        .setTitle('Edit Giveaway Defaults')
        .addComponents(
            row(input('gv_hours',  'Default Duration (hours)',  String(g.defaultDuration / 3_600_000 ?? 24))),
            row(input('gv_minwin', 'Minimum Winners',           String(g.minimumWinners ?? 1))),
            row(input('gv_maxwin', 'Maximum Winners',           String(g.maximumWinners ?? 10))),
        );
}

function welcomeModal(type) {
    const w = botConfig.welcome;
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
        .setCustomId('modal_cooldown')
        .setTitle('Edit Default Cooldown')
        .addComponents(row(input('cooldown_secs', 'Cooldown in seconds (0 = no cooldown)', String(botConfig.commands.defaultCooldown ?? 3)).setMaxLength(4)));
}

// ── getPage helper ────────────────────────────────────────────────────────────
function getPage(pageId) {
    switch (pageId) {
        case 'main':           return { embed: mainEmbed(),     rows: mainRows() };
        case 'panel_presence': return { embed: presenceEmbed(), rows: presenceRows() };
        case 'panel_branding': return { embed: brandingEmbed(), rows: brandingRows() };
        case 'panel_economy':  return { embed: economyEmbed(),  rows: economyRows() };
        case 'panel_features': return { embed: featuresEmbed(), rows: featuresRows() };
        case 'panel_giveaway': return { embed: giveawayEmbed(), rows: giveawayRows() };
        case 'panel_welcome':  return { embed: welcomeEmbed(),  rows: welcomeRows() };
        case 'panel_cooldown': return { embed: cooldownEmbed(), rows: cooldownRows() };
        case 'panel_status':   return { embed: statusEmbed(),   rows: statusRows() };
        // panel_commands and panel_perms are handled dynamically (need client/guildId)
        default:               return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COMMAND EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export default {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Open the Zero Bot interactive configuration panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    category: 'core',

    async execute(interaction, config, client) {
        if (!isOwner(interaction)) {
            return interaction.reply({
                embeds: [createEmbed({
                    title: '🔒 Access Denied',
                    description: 'Only server administrators can use the configuration panel.',
                    color: 'error',
                    timestamp: true,
                })],
                flags: MessageFlags.Ephemeral,
            });
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: false });
        if (!deferSuccess) return;

        const { embed, rows } = getPage('main');
        const msg = await interaction.editReply({ embeds: [embed], components: rows });

        // ── Pagination / selection state ──────────────────────────────────────
        let cmdPage         = 0; // Commands page
        let permPage        = 0; // Permissions command-list page
        let permSelectedCmd = null; // Currently selected command in Permissions
        let permSelectedRole= null; // Role picked from RoleSelectMenu

        // ── Component collector ───────────────────────────────────────────────
        const collector = msg.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: PANEL_TIMEOUT,
        });

        collector.on('collect', async i => {
            try {
                const id = i.customId;

                // ── Back → main menu ───────────────────────────────────────────
                if (id === 'panel_back') {
                    await i.deferUpdate();
                    permSelectedCmd  = null;
                    permSelectedRole = null;
                    const page = getPage('main');
                    return i.editReply({ embeds: [page.embed], components: page.rows });
                }

                // ── Category navigation ────────────────────────────────────────
                const staticPage = getPage(id);
                if (staticPage) {
                    await i.deferUpdate();
                    return i.editReply({ embeds: [staticPage.embed], components: staticPage.rows });
                }

                // ── Commands page entry ────────────────────────────────────────
                if (id === 'panel_commands') {
                    await i.deferUpdate();
                    cmdPage = 0;
                    const configKey = `guild:${interaction.guildId}:config`;
                    let guildCfg = {};
                    try { guildCfg = await getFromDb(configKey, {}); } catch {}
                    const disabled = guildCfg.disabledCommands ?? {};
                    const totalPages = Math.ceil([...(client?.commands?.keys() ?? [])].length / CMDS_PER_PAGE);
                    return i.editReply({
                        embeds:     [commandsEmbed(client, cmdPage, totalPages)],
                        components: commandsRows(client, disabled, cmdPage),
                    });
                }

                // ── Commands: pagination ───────────────────────────────────────
                if (id === 'cmds_prev' || id === 'cmds_next') {
                    await i.deferUpdate();
                    if (id === 'cmds_prev') cmdPage--;
                    else                    cmdPage++;
                    const configKey = `guild:${interaction.guildId}:config`;
                    let guildCfg = {};
                    try { guildCfg = await getFromDb(configKey, {}); } catch {}
                    const disabled = guildCfg.disabledCommands ?? {};
                    const totalPages = Math.ceil([...(client?.commands?.keys() ?? [])].length / CMDS_PER_PAGE);
                    return i.editReply({
                        embeds:     [commandsEmbed(client, cmdPage, totalPages)],
                        components: commandsRows(client, disabled, cmdPage),
                    });
                }

                // ── Commands: toggle a command ─────────────────────────────────
                if (id === 'commands_toggle') {
                    await i.deferUpdate();
                    const cmdName   = i.values[0];
                    const configKey = `guild:${interaction.guildId}:config`;
                    let guildCfg = {};
                    try { guildCfg = await getFromDb(configKey, {}); } catch {}
                    if (!guildCfg.disabledCommands) guildCfg.disabledCommands = {};
                    const wasDisabled = guildCfg.disabledCommands[cmdName];
                    if (wasDisabled) delete guildCfg.disabledCommands[cmdName];
                    else             guildCfg.disabledCommands[cmdName] = true;
                    await setInDb(configKey, guildCfg);
                    const disabled   = guildCfg.disabledCommands;
                    const totalPages = Math.ceil([...(client?.commands?.keys() ?? [])].length / CMDS_PER_PAGE);
                    const statusEmb  = createEmbed({
                        title:       '🚫 Command Toggles',
                        description: `Command \`/${cmdName}\` is now **${wasDisabled ? '✅ enabled' : '🚫 disabled'}**.\n\nUse the select menu to toggle more commands.`,
                        color:       wasDisabled ? 'success' : 'error',
                        footer:      { text: 'Server owners & admins can always use all commands' },
                        timestamp:   true,
                    });
                    return i.editReply({
                        embeds:     [statusEmb],
                        components: commandsRows(client, disabled, cmdPage),
                    });
                }

                // ════════════════════════════════════════════════════════════════
                //  PERMISSIONS PAGE
                // ════════════════════════════════════════════════════════════════

                // ── Permissions page entry ─────────────────────────────────────
                if (id === 'panel_perms') {
                    await i.deferUpdate();
                    permPage        = 0;
                    permSelectedCmd = null;
                    permSelectedRole= null;
                    return i.editReply({
                        embeds:     [await permissionsEmbed(interaction.guildId)],
                        components: permsCmdSelectRows(permPage),
                    });
                }

                // ── Permissions: paginate command list ─────────────────────────
                if (id === 'perm_prev' || id === 'perm_next') {
                    await i.deferUpdate();
                    if (id === 'perm_prev') permPage--;
                    else                    permPage++;
                    permSelectedCmd  = null;
                    permSelectedRole = null;
                    return i.editReply({
                        embeds:     [await permissionsEmbed(interaction.guildId)],
                        components: permsCmdSelectRows(permPage),
                    });
                }

                // ── Permissions: command selected ──────────────────────────────
                if (id === 'perm_cmd_select') {
                    await i.deferUpdate();
                    permSelectedCmd  = i.values[0];
                    permSelectedRole = null;
                    const permKey    = `guild:${interaction.guildId}:cmd_perms`;
                    const overrides  = await getFromDb(permKey, {});
                    const roleIds    = overrides[permSelectedCmd] ?? [];
                    const tier       = COMMAND_TIERS[permSelectedCmd] ?? TIERS.PUBLIC;
                    return i.editReply({
                        embeds:     [permDetailEmbed(permSelectedCmd, roleIds, tier)],
                        components: permsDetailRows(),
                    });
                }

                // ── Permissions: role selected from RoleSelectMenu ─────────────
                if (id === 'perm_role_select') {
                    await i.deferUpdate();
                    permSelectedRole = i.values[0]; // single role ID
                    // Refresh detail embed (no visual change, just acknowledge)
                    const permKey  = `guild:${interaction.guildId}:cmd_perms`;
                    const overrides = await getFromDb(permKey, {});
                    const roleIds  = overrides[permSelectedCmd] ?? [];
                    const tier     = COMMAND_TIERS[permSelectedCmd] ?? TIERS.PUBLIC;
                    return i.editReply({
                        embeds: [createEmbed({
                            title:       `🔐 Permissions — \`/${permSelectedCmd}\``,
                            description: [
                                `**Default requirement:** ${TIER_LABELS[tier] ?? 'Unknown'}`,
                                '',
                                '**Allowed roles:**',
                                roleIds.length > 0 ? roleIds.map(id => `<@&${id}>`).join(', ') : '_None set_',
                                '',
                                `**Selected role:** <@&${permSelectedRole}>`,
                                'Click **Add Role** or **Remove Role** below.',
                            ].join('\n'),
                            color: 'info',
                            timestamp: true,
                        })],
                        components: permsDetailRows(),
                    });
                }

                // ── Permissions: add role ──────────────────────────────────────
                if (id === 'perm_add_role') {
                    await i.deferUpdate();
                    if (!permSelectedCmd || !permSelectedRole) {
                        return i.followUp({ content: '⚠️ Select a command and a role first.', flags: MessageFlags.Ephemeral });
                    }
                    const permKey   = `guild:${interaction.guildId}:cmd_perms`;
                    const overrides = await getFromDb(permKey, {});
                    if (!Array.isArray(overrides[permSelectedCmd])) overrides[permSelectedCmd] = [];
                    if (!overrides[permSelectedCmd].includes(permSelectedRole)) {
                        overrides[permSelectedCmd].push(permSelectedRole);
                        await setInDb(permKey, overrides);
                    }
                    const tier = COMMAND_TIERS[permSelectedCmd] ?? TIERS.PUBLIC;
                    return i.editReply({
                        embeds:     [permDetailEmbed(permSelectedCmd, overrides[permSelectedCmd], tier)],
                        components: permsDetailRows(),
                    });
                }

                // ── Permissions: remove role ───────────────────────────────────
                if (id === 'perm_rem_role') {
                    await i.deferUpdate();
                    if (!permSelectedCmd || !permSelectedRole) {
                        return i.followUp({ content: '⚠️ Select a command and a role first.', flags: MessageFlags.Ephemeral });
                    }
                    const permKey   = `guild:${interaction.guildId}:cmd_perms`;
                    const overrides = await getFromDb(permKey, {});
                    if (Array.isArray(overrides[permSelectedCmd])) {
                        overrides[permSelectedCmd] = overrides[permSelectedCmd].filter(id => id !== permSelectedRole);
                        if (overrides[permSelectedCmd].length === 0) delete overrides[permSelectedCmd];
                        await setInDb(permKey, overrides);
                    }
                    const roleIds = overrides[permSelectedCmd] ?? [];
                    const tier    = COMMAND_TIERS[permSelectedCmd] ?? TIERS.PUBLIC;
                    return i.editReply({
                        embeds:     [permDetailEmbed(permSelectedCmd, roleIds, tier)],
                        components: permsDetailRows(),
                    });
                }

                // ── Permissions: clear all roles for this command ──────────────
                if (id === 'perm_clear_all') {
                    await i.deferUpdate();
                    if (!permSelectedCmd) {
                        return i.followUp({ content: '⚠️ No command selected.', flags: MessageFlags.Ephemeral });
                    }
                    const permKey   = `guild:${interaction.guildId}:cmd_perms`;
                    const overrides = await getFromDb(permKey, {});
                    delete overrides[permSelectedCmd];
                    await setInDb(permKey, overrides);
                    const tier = COMMAND_TIERS[permSelectedCmd] ?? TIERS.PUBLIC;
                    return i.editReply({
                        embeds:     [permDetailEmbed(permSelectedCmd, [], tier)],
                        components: permsDetailRows(),
                    });
                }

                // ── Permissions: back to command list ──────────────────────────
                if (id === 'perm_back_cmd') {
                    await i.deferUpdate();
                    permSelectedCmd  = null;
                    permSelectedRole = null;
                    return i.editReply({
                        embeds:     [await permissionsEmbed(interaction.guildId)],
                        components: permsCmdSelectRows(permPage),
                    });
                }

                // ── Presence sub-nav ───────────────────────────────────────────
                if (id === 'presence_status') {
                    await i.deferUpdate();
                    return i.editReply({ embeds: [presenceEmbed()], components: presenceStatusRows() });
                }
                if (id === 'presence_acttype') {
                    await i.deferUpdate();
                    return i.editReply({ embeds: [presenceEmbed()], components: presenceActTypeRows() });
                }

                // ── Presence selects ───────────────────────────────────────────
                if (id === 'presence_status_select') {
                    await i.deferUpdate();
                    const newStatus = i.values[0];
                    await persist('presence.status', newStatus);
                    try { client.user.setStatus(newStatus); } catch { /* ignore */ }
                    return i.editReply({ embeds: [presenceEmbed()], components: presenceRows() });
                }
                if (id === 'presence_acttype_select') {
                    await i.deferUpdate();
                    const newType    = Number(i.values[0]);
                    const activities = botConfig.presence.activities ?? [{}];
                    activities[0]    = { ...activities[0], type: newType };
                    await persist('presence.activities', activities);
                    try { client.user.setActivity(activities[0].name, { type: newType }); } catch { /* ignore */ }
                    return i.editReply({ embeds: [presenceEmbed()], components: presenceRows() });
                }

                // ── Features toggle ────────────────────────────────────────────
                if (id === 'features_toggle') {
                    await i.deferUpdate();
                    const key     = i.values[0];
                    const current = botConfig.features[key];
                    await persist(`features.${key}`, !current);
                    return i.editReply({ embeds: [featuresEmbed()], components: featuresRows() });
                }

                // ── Modal-opening buttons ──────────────────────────────────────
                const modalMap = {
                    'presence_acttext': actTextModal(),
                    'branding_footer':  footerModal(),
                    'branding_main':    mainColorsModal(),
                    'branding_status':  statusColorsModal(),
                    'econ_currency':    currencyModal(),
                    'econ_balances':    balancesModal(),
                    'econ_work':        workModal(),
                    'econ_rob':         robModal(),
                    'gv_settings':      giveawayModal(),
                    'wlc_welcome':      welcomeModal('welcome'),
                    'wlc_goodbye':      welcomeModal('goodbye'),
                    'cd_edit':          cooldownModal(),
                };
                if (modalMap[id]) {
                    return i.showModal(modalMap[id]);
                }

            } catch (err) {
                logger.error('[Panel] Collector error:', err);
                try { await i.reply({ content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral }); } catch { /* ignore */ }
            }
        });

        // ── Modal submission handler ───────────────────────────────────────────
        const onModal = async i => {
            if (!i.isModalSubmit() || i.user.id !== interaction.user.id) return;
            if (!i.customId.startsWith('modal_')) return;

            try {
                const id = i.customId;

                if (id === 'modal_acttext') {
                    const text = i.fields.getTextInputValue('acttext').trim();
                    const type = botConfig.presence.activities?.[0]?.type ?? 0;
                    await persist('presence.activities', [{ name: text, type }]);
                    try { client.user.setActivity(text, { type }); } catch { /* ignore */ }
                    await i.reply({ content: '✅ Activity text updated.', flags: MessageFlags.Ephemeral });
                    return msg.edit({ embeds: [presenceEmbed()], components: presenceRows() });
                }

                if (id === 'modal_footer') {
                    const text = i.fields.getTextInputValue('footer').trim();
                    await persist('embeds.footer.text', text);
                    await i.reply({ content: '✅ Footer text updated.', flags: MessageFlags.Ephemeral });
                    return msg.edit({ embeds: [brandingEmbed()], components: brandingRows() });
                }

                if (id === 'modal_main_colors') {
                    const primary   = i.fields.getTextInputValue('col_primary').trim();
                    const secondary = i.fields.getTextInputValue('col_secondary').trim();
                    if (!isHex(primary) || !isHex(secondary)) {
                        return i.reply({ content: '❌ Colors must be in **#RRGGBB** format.', flags: MessageFlags.Ephemeral });
                    }
                    await persist('embeds.colors.primary',   primary);
                    await persist('embeds.colors.secondary', secondary);
                    await i.reply({ content: '✅ Main colors updated.', flags: MessageFlags.Ephemeral });
                    return msg.edit({ embeds: [brandingEmbed()], components: brandingRows() });
                }

                if (id === 'modal_status_colors') {
                    const fields = ['col_success', 'col_error', 'col_warning', 'col_info'];
                    const keys   = ['success', 'error', 'warning', 'info'];
                    for (let idx = 0; idx < fields.length; idx++) {
                        const val = i.fields.getTextInputValue(fields[idx]).trim();
                        if (!isHex(val)) {
                            return i.reply({ content: `❌ \`${keys[idx]}\` color must be in **#RRGGBB** format.`, flags: MessageFlags.Ephemeral });
                        }
                        await persist(`embeds.colors.${keys[idx]}`, val);
                    }
                    await i.reply({ content: '✅ Status colors updated.', flags: MessageFlags.Ephemeral });
                    return msg.edit({ embeds: [brandingEmbed()], components: brandingRows() });
                }

                if (id === 'modal_currency') {
                    await persist('economy.currency.symbol',     i.fields.getTextInputValue('cur_symbol').trim());
                    await persist('economy.currency.name',       i.fields.getTextInputValue('cur_name').trim());
                    await persist('economy.currency.namePlural', i.fields.getTextInputValue('cur_plural').trim());
                    await i.reply({ content: '✅ Currency updated.', flags: MessageFlags.Ephemeral });
                    return msg.edit({ embeds: [economyEmbed()], components: economyRows() });
                }

                if (id === 'modal_balances') {
                    const start = Number(i.fields.getTextInputValue('bal_start'));
                    const daily = Number(i.fields.getTextInputValue('bal_daily'));
                    const bank  = Number(i.fields.getTextInputValue('bal_bank'));
                    if ([start, daily, bank].some(isNaN)) {
                        return i.reply({ content: '❌ All balance values must be numbers.', flags: MessageFlags.Ephemeral });
                    }
                    await persist('economy.startingBalance',  start);
                    await persist('economy.dailyAmount',      daily);
                    await persist('economy.baseBankCapacity', bank);
                    await i.reply({ content: '✅ Balances updated.', flags: MessageFlags.Ephemeral });
                    return msg.edit({ embeds: [economyEmbed()], components: economyRows() });
                }

                if (id === 'modal_work') {
                    const wMin = Number(i.fields.getTextInputValue('work_min'));
                    const wMax = Number(i.fields.getTextInputValue('work_max'));
                    const bMin = Number(i.fields.getTextInputValue('beg_min'));
                    const bMax = Number(i.fields.getTextInputValue('beg_max'));
                    if ([wMin, wMax, bMin, bMax].some(isNaN)) {
                        return i.reply({ content: '❌ All payout values must be numbers.', flags: MessageFlags.Ephemeral });
                    }
                    await persist('economy.workMin', wMin);
                    await persist('economy.workMax', wMax);
                    await persist('economy.begMin',  bMin);
                    await persist('economy.begMax',  bMax);
                    await i.reply({ content: '✅ Work & beg payouts updated.', flags: MessageFlags.Ephemeral });
                    return msg.edit({ embeds: [economyEmbed()], components: economyRows() });
                }

                if (id === 'modal_rob') {
                    const rate = Number(i.fields.getTextInputValue('rob_rate'));
                    const jail = Number(i.fields.getTextInputValue('rob_jail'));
                    if (isNaN(rate) || isNaN(jail) || rate < 0 || rate > 1) {
                        return i.reply({ content: '❌ Rob rate must be 0.0–1.0, jail time must be a number.', flags: MessageFlags.Ephemeral });
                    }
                    await persist('economy.robSuccessRate',  rate);
                    await persist('economy.robFailJailTime', jail * 60_000);
                    await i.reply({ content: '✅ Rob & jail settings updated.', flags: MessageFlags.Ephemeral });
                    return msg.edit({ embeds: [economyEmbed()], components: economyRows() });
                }

                if (id === 'modal_giveaway') {
                    const hours  = Number(i.fields.getTextInputValue('gv_hours'));
                    const minWin = Number(i.fields.getTextInputValue('gv_minwin'));
                    const maxWin = Number(i.fields.getTextInputValue('gv_maxwin'));
                    if ([hours, minWin, maxWin].some(isNaN) || hours <= 0 || minWin < 1 || maxWin < minWin) {
                        return i.reply({ content: '❌ Invalid giveaway settings. Hours > 0, min ≥ 1, max ≥ min.', flags: MessageFlags.Ephemeral });
                    }
                    await persist('giveaways.defaultDuration', hours * 3_600_000);
                    await persist('giveaways.minimumWinners',  minWin);
                    await persist('giveaways.maximumWinners',  maxWin);
                    await i.reply({ content: '✅ Giveaway defaults updated.', flags: MessageFlags.Ephemeral });
                    return msg.edit({ embeds: [giveawayEmbed()], components: giveawayRows() });
                }

                if (id === 'modal_welcome_msg' || id === 'modal_goodbye_msg') {
                    const key = id === 'modal_welcome_msg'
                        ? 'welcome.defaultWelcomeMessage'
                        : 'welcome.defaultGoodbyeMessage';
                    await persist(key, i.fields.getTextInputValue('msg').trim());
                    await i.reply({ content: '✅ Message updated.', flags: MessageFlags.Ephemeral });
                    return msg.edit({ embeds: [welcomeEmbed()], components: welcomeRows() });
                }

                if (id === 'modal_cooldown') {
                    const secs = Number(i.fields.getTextInputValue('cooldown_secs'));
                    if (isNaN(secs) || secs < 0) {
                        return i.reply({ content: '❌ Cooldown must be a non-negative number.', flags: MessageFlags.Ephemeral });
                    }
                    await persist('commands.defaultCooldown', secs);
                    await i.reply({ content: '✅ Cooldown updated.', flags: MessageFlags.Ephemeral });
                    return msg.edit({ embeds: [cooldownEmbed()], components: cooldownRows() });
                }

            } catch (err) {
                logger.error('[Panel] Modal handler error:', err);
                try {
                    if (!i.replied && !i.deferred) {
                        await i.reply({ content: '❌ Failed to save changes.', flags: MessageFlags.Ephemeral });
                    }
                } catch { /* ignore */ }
            }
        };

        client.on('interactionCreate', onModal);

        collector.on('end', () => {
            client.off('interactionCreate', onModal);
            msg.edit({ components: [] }).catch(() => {});
        });
    },
};

// ─── presenceStatusRows / presenceActTypeRows (used in collector) ─────────────
function presenceStatusRows() {
    return [
        row(new StringSelectMenuBuilder()
            .setCustomId('presence_status_select')
            .setPlaceholder('Choose a status...')
            .addOptions(
                Object.entries(STATUS_LABELS).map(([val, label]) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(label)
                        .setValue(val)
                        .setEmoji(val === 'online' ? '🟢' : val === 'idle' ? '🌙' : val === 'dnd' ? '🔴' : '⚫')
                )
            )),
        backRow(),
    ];
}

function presenceActTypeRows() {
    return [
        row(new StringSelectMenuBuilder()
            .setCustomId('presence_acttype_select')
            .setPlaceholder('Choose activity type...')
            .addOptions(
                Object.entries(ACTIVITY_TYPE).map(([val, label]) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(label)
                        .setValue(String(val))
                )
            )),
        backRow(),
    ];
}
