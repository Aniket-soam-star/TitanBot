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
import { getFromDb, setInDb, getWelcomeConfig, saveWelcomeConfig } from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { botConfig } from '../../config/bot.js';
import { COMMAND_TIERS, TIERS, TIER_LABELS } from '../../utils/roleGuard.js';

// ─── DB helpers ───────────────────────────────────────────────────────────────
// Global bot config (presence, branding, economy, features, giveaway, cooldown)
// These are intentionally bot-wide — one bot instance shares one config.
// They survive restarts because ready.js loads them back from this key.
const GLOBAL_KEY = 'zerobot:global:config';

const PERMS_PER_PAGE = 24;
const CMDS_PER_PAGE  = 24;
const PANEL_TIMEOUT  = 10 * 60 * 1000;

async function loadGlobal()        { return getFromDb(GLOBAL_KEY, {}); }
async function saveGlobal(ov)      { await setInDb(GLOBAL_KEY, ov); }

// Mutate the live botConfig object so changes take effect immediately
// without restarting, AND save to DB so they survive restarts.
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
    const ov = await loadGlobal();
    ov[dotKey] = value;
    await saveGlobal(ov);
}

// All non-PUBLIC commands sorted alphabetically — used by Permissions page
const NON_PUBLIC_CMDS = Object.entries(COMMAND_TIERS)
    .filter(([, tier]) => tier !== TIERS.PUBLIC)
    .map(([name, tier]) => ({ name, tier }))
    .sort((a, b) => a.name.localeCompare(b.name));

// ─── Small helpers ────────────────────────────────────────────────────────────
const STATUS_LABELS = { online: '🟢 Online', idle: '🌙 Idle', dnd: '🔴 Do Not Disturb', invisible: '⚫ Invisible' };
const ACTIVITY_TYPE = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' };
const fmt   = v => `\`${v}\``;
const isHex = s => /^#[0-9A-Fa-f]{6}$/.test(s);

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

// ─── EMBED BUILDERS ───────────────────────────────────────────────────────────

function mainEmbed() {
    return createEmbed({
        title: '⚙️ Zero Bot — Configuration Panel',
        description: [
            'Welcome to the bot configuration panel.',
            'Select a category below to view and edit settings.',
            '',
            '🟢 **Presence**     •  How the bot appears in the member list',
            '🎨 **Branding**     •  Embed colors and footer text',
            '💰 **Economy**      •  Currency, balances, work and rob settings',
            '🧩 **Features**     •  Enable or disable feature modules',
            '🎁 **Giveaway**     •  Default duration and winner limits',
            '🌐 **Welcome**      •  Per-server join and leave message templates',
            '⏱️ **Cooldown**    •  Default command cooldown',
            '📊 **Status**       •  View all current settings at a glance',
            '🚫 **Commands**     •  Enable / disable individual commands per server',
            '🔐 **Permissions**  •  Set which roles can use which commands per server',
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
            { name: '🔘 Status',        value: STATUS_LABELS[p.status] ?? p.status,        inline: true },
            { name: '🎮 Activity Type', value: ACTIVITY_TYPE[act?.type] ?? 'Playing',       inline: true },
            { name: '📝 Activity Text', value: fmt(act?.name ?? 'N/A'),                     inline: false },
        ],
        footer: { text: 'Presence is bot-wide (affects all servers)' },
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
            { name: '🎨 Primary',     value: fmt(c.primary),            inline: true },
            { name: '✅ Success',     value: fmt(c.success),            inline: true },
            { name: '❌ Error',       value: fmt(c.error),              inline: true },
            { name: '⚠️ Warning',    value: fmt(c.warning),            inline: true },
            { name: 'ℹ️ Info',       value: fmt(c.info),               inline: true },
            { name: '🔵 Secondary',  value: fmt(c.secondary),          inline: true },
        ],
        footer: { text: 'Colors must be in #RRGGBB format • Branding is bot-wide' },
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
            { name: '💵 Starting Bal', value: fmt(e.startingBalance),                         inline: true },
            { name: '🎁 Daily Amount', value: fmt(e.dailyAmount),                              inline: true },
            { name: '🏦 Bank Cap',     value: fmt(e.baseBankCapacity),                         inline: true },
            { name: '⚒️ Work Range',  value: `${fmt(e.workMin)} – ${fmt(e.workMax)}`,          inline: true },
            { name: '🙏 Beg Range',   value: `${fmt(e.begMin)} – ${fmt(e.begMax)}`,            inline: true },
            { name: '🦹 Rob Rate',    value: fmt(e.robSuccessRate * 100 + '%'),                 inline: true },
            { name: '⛓️ Jail Time',  value: fmt(e.robFailJailTime / 60000 + ' min'),           inline: true },
        ],
        footer: { text: 'Economy settings are bot-wide' },
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
        footer: { text: 'Feature toggles are bot-wide • Changes apply immediately' },
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
            { name: '🏆 Min Winners',       value: fmt(g.minimumWinners),                         inline: true },
            { name: '🏆 Max Winners',       value: fmt(g.maximumWinners),                         inline: true },
        ],
        footer: { text: 'Giveaway settings are bot-wide' },
        timestamp: true,
    });
}

// Welcome embed — shows the CURRENT per-guild config from DB
function welcomeEmbed(cfg) {
    const welcomeMsg = cfg?.welcomeMessage ?? botConfig.welcome.defaultWelcomeMessage;
    const goodbyeMsg = cfg?.leaveMessage   ?? botConfig.welcome.defaultGoodbyeMessage;
    const wChan      = cfg?.channelId      ? `<#${cfg.channelId}>` : '`Not set`';
    const gChan      = cfg?.goodbyeChannelId ? `<#${cfg.goodbyeChannelId}>` : '`Not set`';
    return createEmbed({
        title: '🌐 Welcome Settings',
        description: 'Edit this server\'s join and leave message templates.\n\nPlaceholders: `{user}` `{server}` `{memberCount}`',
        color: 'primary',
        fields: [
            { name: '📢 Welcome Channel', value: wChan,                    inline: true },
            { name: '📢 Goodbye Channel', value: gChan,                    inline: true },
            { name: '👋 Welcome Message', value: fmt(welcomeMsg.length > 80 ? welcomeMsg.slice(0, 80) + '…' : welcomeMsg), inline: false },
            { name: '👋 Goodbye Message', value: fmt(goodbyeMsg.length > 80 ? goodbyeMsg.slice(0, 80) + '…' : goodbyeMsg), inline: false },
        ],
        footer: { text: 'Welcome settings are per-server' },
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
        footer: { text: 'Cooldown setting is bot-wide' },
        timestamp: true,
    });
}

function statusEmbed() {
    const p     = botConfig.presence;
    const e     = botConfig.economy;
    const f     = botConfig.features;
    const act   = p.activities?.[0];
    const featOn  = Object.entries(f).filter(([, v]) =>  v).map(([k]) => k).join(', ') || 'None';
    const featOff = Object.entries(f).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'None';
    return createEmbed({
        title: '📊 Current Configuration',
        color: 'info',
        fields: [
            { name: '🟢 Presence',     value: `${STATUS_LABELS[p.status]} — ${ACTIVITY_TYPE[act?.type] ?? 'Playing'} ${act?.name}`, inline: false },
            { name: '💰 Currency',     value: `${e.currency.symbol}${e.currency.name} | Start: ${e.startingBalance} | Daily: ${e.dailyAmount}`, inline: false },
            { name: '⏱️ Cooldown',    value: fmt(botConfig.commands.defaultCooldown + 's'), inline: true },
            { name: '📝 Footer',       value: fmt(botConfig.embeds.footer.text),            inline: true },
            { name: '✅ Features ON',  value: featOn,  inline: false },
            { name: '❌ Features OFF', value: featOff, inline: false },
        ],
        footer: { text: 'All settings as of right now' },
        timestamp: true,
    });
}

function commandsEmbed(page, total) {
    return createEmbed({
        title: '🚫 Command Enable / Disable',
        description: 'Select a command from the dropdown to toggle it on or off **for this server**.\n\n' +
            '> Server owners and admins can always use all commands regardless of this setting.',
        color: 'primary',
        footer: { text: `Page ${page + 1} of ${total} • Changes are per-server` },
        timestamp: true,
    });
}

async function permissionsEmbed(guildId) {
    const overrides = await getFromDb(`guild:${guildId}:cmd_perms`, {});
    const entries   = Object.entries(overrides);

    const overrideLines = entries.length > 0
        ? entries.map(([cmd, roleIds]) =>
            `\`/${cmd}\` → ${roleIds.map(id => `<@&${id}>`).join(', ')}`
          ).join('\n')
        : '_No overrides set. All commands use default Discord permissions._';

    return createEmbed({
        title: '🔐 Command Permissions',
        description: [
            'Grant specific roles access to commands for **this server**, overriding the default Discord permission requirement.',
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
        footer: { text: `${NON_PUBLIC_CMDS.length} protected commands available • Owners & Admins always bypass` },
        timestamp: true,
    });
}

function permDetailEmbed(cmdName, roleIds, tier) {
    const tierLabel = TIER_LABELS[tier] ?? TIER_LABELS[TIERS.PUBLIC] ?? 'Default Discord Permission';
    const roleList  = roleIds?.length > 0
        ? roleIds.map(id => `<@&${id}>`).join(', ')
        : '_No role overrides — default Discord permission applies._';

    return createEmbed({
        title: `🔐 Permissions — \`/${cmdName}\``,
        description: [
            `**Default requirement:** ${tierLabel}`,
            '',
            '**Allowed roles (overrides default):**',
            roleList,
            '',
            'Use the role selector below then click **Add Role** or **Remove Role**.',
            'Click **Clear All** to remove all overrides and restore the default requirement.',
        ].join('\n'),
        color: 'info',
        footer: { text: 'Role overrides are per-server' },
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

function giveawayRows() {
    return [
        row(btn('gv_settings', '✏️ Edit Settings', ButtonStyle.Primary)),
        backRow(),
    ];
}

function welcomeRows() {
    return [
        row(
            btn('wlc_welcome', '👋 Edit Welcome Msg', ButtonStyle.Primary),
            btn('wlc_goodbye', '👋 Edit Goodbye Msg', ButtonStyle.Primary),
        ),
        backRow(),
    ];
}

function cooldownRows() {
    return [
        row(btn('cd_edit', '✏️ Edit Cooldown', ButtonStyle.Primary)),
        backRow(),
    ];
}

function statusRows() { return [backRow()]; }

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

    rows.push(row(
        btn('cmds_prev', '◀ Prev', ButtonStyle.Secondary).setDisabled(page === 0),
        btn('cmds_page', `${page + 1}/${totalPages}`, ButtonStyle.Primary).setDisabled(true),
        btn('cmds_next', 'Next ▶', ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
        btn('panel_back', '← Back', ButtonStyle.Danger),
    ));

    return rows;
}

function permsCmdSelectRows(page) {
    const totalPages = Math.ceil(NON_PUBLIC_CMDS.length / PERMS_PER_PAGE);
    const slice      = NON_PUBLIC_CMDS.slice(page * PERMS_PER_PAGE, (page + 1) * PERMS_PER_PAGE);

    const opts = slice.map(({ name, tier }) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(`/${name}`)
            .setValue(name)
            .setDescription(TIER_LABELS[tier] ?? 'Protected command')
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

function permsDetailRows() {
    return [
        row(new RoleSelectMenuBuilder()
            .setCustomId('perm_role_select')
            .setPlaceholder('Select a role...')),
        row(
            btn('perm_add_role',  '✅ Add Role',    ButtonStyle.Success),
            btn('perm_rem_role',  '❌ Remove Role', ButtonStyle.Danger),
            btn('perm_clear_all', '🗑 Clear All',   ButtonStyle.Danger),
            btn('perm_back_cmd',  '← Commands',    ButtonStyle.Secondary),
        ),
    ];
}

// ─── Modal builders ───────────────────────────────────────────────────────────

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
            row(input('cur_symbol', 'Symbol (e.g. £ $ 🪙)',     c.symbol     ?? '£')),
            row(input('cur_name',   'Name singular (e.g. coin)', c.name       ?? 'coin')),
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

// Welcome modal reads the current value from the already-loaded per-guild cfg
function welcomeModal(type, cfg) {
    const isWelcome = type === 'welcome';
    const current   = isWelcome
        ? (cfg?.welcomeMessage ?? botConfig.welcome.defaultWelcomeMessage ?? '')
        : (cfg?.leaveMessage   ?? botConfig.welcome.defaultGoodbyeMessage ?? '');
    return new ModalBuilder()
        .setCustomId(isWelcome ? 'modal_welcome_msg' : 'modal_goodbye_msg')
        .setTitle(isWelcome ? 'Edit Welcome Message' : 'Edit Goodbye Message')
        .addComponents(row(
            new TextInputBuilder()
                .setCustomId('msg')
                .setLabel(isWelcome
                    ? 'Welcome message ({user} {server} {memberCount})'
                    : 'Goodbye message ({user} {server} {memberCount})')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(current)
                .setMaxLength(500)
                .setRequired(true)
        ));
}

function cooldownModal() {
    return new ModalBuilder()
        .setCustomId('modal_cooldown')
        .setTitle('Edit Default Cooldown')
        .addComponents(row(
            input('cooldown_secs', 'Cooldown in seconds (0 = no cooldown)', String(botConfig.commands.defaultCooldown ?? 3))
                .setMaxLength(4)
        ));
}

// ─── getPage helper ────────────────────────────────────────────────────────────
function getPage(pageId) {
    switch (pageId) {
        case 'main':           return { embed: mainEmbed(),     rows: mainRows() };
        case 'panel_presence': return { embed: presenceEmbed(), rows: presenceRows() };
        case 'panel_branding': return { embed: brandingEmbed(), rows: brandingRows() };
        case 'panel_economy':  return { embed: economyEmbed(),  rows: economyRows() };
        case 'panel_giveaway': return { embed: giveawayEmbed(), rows: giveawayRows() };
        case 'panel_cooldown': return { embed: cooldownEmbed(), rows: cooldownRows() };
        case 'panel_status':   return { embed: statusEmbed(),   rows: statusRows() };
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

        // ── Per-session state ─────────────────────────────────────────────────
        let cmdPage         = 0;
        let permPage        = 0;
        let permSelectedCmd = null;
        let permSelectedRole= null;
        let welcomeCfg      = null; // lazily loaded when Welcome page is opened

        // ── Component collector ───────────────────────────────────────────────
        const collector = msg.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: PANEL_TIMEOUT,
        });

        collector.on('collect', async i => {
            try {
                const id = i.customId;

                // ── Back → main menu ──────────────────────────────────────────
                if (id === 'panel_back') {
                    await i.deferUpdate();
                    permSelectedCmd  = null;
                    permSelectedRole = null;
                    const page = getPage('main');
                    return i.editReply({ embeds: [page.embed], components: page.rows });
                }

                // ── Static category pages ─────────────────────────────────────
                const staticPage = getPage(id);
                if (staticPage) {
                    await i.deferUpdate();
                    return i.editReply({ embeds: [staticPage.embed], components: staticPage.rows });
                }

                // ── Features page ─────────────────────────────────────────────
                if (id === 'panel_features') {
                    await i.deferUpdate();
                    return i.editReply({ embeds: [featuresEmbed()], components: featuresRows() });
                }

                // ── Welcome page — load per-guild config ──────────────────────
                if (id === 'panel_welcome') {
                    await i.deferUpdate();
                    welcomeCfg = await getWelcomeConfig(client, interaction.guildId);
                    return i.editReply({ embeds: [welcomeEmbed(welcomeCfg)], components: welcomeRows() });
                }

                // ── Commands page entry ───────────────────────────────────────
                if (id === 'panel_commands') {
                    await i.deferUpdate();
                    cmdPage = 0;
                    const configKey = `guild:${interaction.guildId}:config`;
                    let guildCfg = {};
                    try { guildCfg = await getFromDb(configKey, {}); } catch {}
                    const disabled   = guildCfg.disabledCommands ?? {};
                    const totalPages = Math.ceil([...(client?.commands?.keys() ?? [])].length / CMDS_PER_PAGE);
                    return i.editReply({
                        embeds:     [commandsEmbed(cmdPage, totalPages)],
                        components: commandsRows(client, disabled, cmdPage),
                    });
                }

                // ── Commands: pagination ──────────────────────────────────────
                if (id === 'cmds_prev' || id === 'cmds_next') {
                    await i.deferUpdate();
                    cmdPage += id === 'cmds_next' ? 1 : -1;
                    const configKey = `guild:${interaction.guildId}:config`;
                    let guildCfg = {};
                    try { guildCfg = await getFromDb(configKey, {}); } catch {}
                    const disabled   = guildCfg.disabledCommands ?? {};
                    const totalPages = Math.ceil([...(client?.commands?.keys() ?? [])].length / CMDS_PER_PAGE);
                    return i.editReply({
                        embeds:     [commandsEmbed(cmdPage, totalPages)],
                        components: commandsRows(client, disabled, cmdPage),
                    });
                }

                // ── Commands: toggle ──────────────────────────────────────────
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
                    const totalPages = Math.ceil([...(client?.commands?.keys() ?? [])].length / CMDS_PER_PAGE);
                    const statusEmb  = createEmbed({
                        title:       '🚫 Command Toggles',
                        description: `Command \`/${cmdName}\` is now **${wasDisabled ? '✅ enabled' : '🚫 disabled'}** in this server.\n\nUse the select menu to toggle more commands.`,
                        color:       wasDisabled ? 'success' : 'error',
                        footer:      { text: 'Server owners & admins can always use all commands' },
                        timestamp:   true,
                    });
                    return i.editReply({
                        embeds:     [statusEmb],
                        components: commandsRows(client, guildCfg.disabledCommands, cmdPage),
                    });
                }

                // ── Permissions page entry ────────────────────────────────────
                if (id === 'panel_perms') {
                    await i.deferUpdate();
                    permPage = 0; permSelectedCmd = null; permSelectedRole = null;
                    return i.editReply({
                        embeds:     [await permissionsEmbed(interaction.guildId)],
                        components: permsCmdSelectRows(permPage),
                    });
                }

                // ── Permissions: paginate ─────────────────────────────────────
                if (id === 'perm_prev' || id === 'perm_next') {
                    await i.deferUpdate();
                    permPage += id === 'perm_next' ? 1 : -1;
                    permSelectedCmd = null; permSelectedRole = null;
                    return i.editReply({
                        embeds:     [await permissionsEmbed(interaction.guildId)],
                        components: permsCmdSelectRows(permPage),
                    });
                }

                // ── Permissions: command selected ─────────────────────────────
                if (id === 'perm_cmd_select') {
                    await i.deferUpdate();
                    permSelectedCmd  = i.values[0];
                    permSelectedRole = null;
                    const overrides = await getFromDb(`guild:${interaction.guildId}:cmd_perms`, {});
                    const roleIds   = overrides[permSelectedCmd] ?? [];
                    const tier      = COMMAND_TIERS[permSelectedCmd] ?? TIERS.PUBLIC;
                    return i.editReply({
                        embeds:     [permDetailEmbed(permSelectedCmd, roleIds, tier)],
                        components: permsDetailRows(),
                    });
                }

                // ── Permissions: role selected ────────────────────────────────
                if (id === 'perm_role_select') {
                    await i.deferUpdate();
                    permSelectedRole = i.values[0];
                    const overrides = await getFromDb(`guild:${interaction.guildId}:cmd_perms`, {});
                    const roleIds   = overrides[permSelectedCmd] ?? [];
                    const tier      = COMMAND_TIERS[permSelectedCmd] ?? TIERS.PUBLIC;
                    const tierLabel = TIER_LABELS[tier] ?? 'Default Discord Permission';
                    return i.editReply({
                        embeds: [createEmbed({
                            title: `🔐 Permissions — \`/${permSelectedCmd}\``,
                            description: [
                                `**Default requirement:** ${tierLabel}`,
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

                // ── Permissions: add role ─────────────────────────────────────
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

                // ── Permissions: remove role ──────────────────────────────────
                if (id === 'perm_rem_role') {
                    await i.deferUpdate();
                    if (!permSelectedCmd || !permSelectedRole) {
                        return i.followUp({ content: '⚠️ Select a command and a role first.', flags: MessageFlags.Ephemeral });
                    }
                    const permKey   = `guild:${interaction.guildId}:cmd_perms`;
                    const overrides = await getFromDb(permKey, {});
                    if (Array.isArray(overrides[permSelectedCmd])) {
                        overrides[permSelectedCmd] = overrides[permSelectedCmd].filter(r => r !== permSelectedRole);
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

                // ── Permissions: clear all ────────────────────────────────────
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

                // ── Permissions: back to command list ─────────────────────────
                if (id === 'perm_back_cmd') {
                    await i.deferUpdate();
                    permSelectedCmd = null; permSelectedRole = null;
                    return i.editReply({
                        embeds:     [await permissionsEmbed(interaction.guildId)],
                        components: permsCmdSelectRows(permPage),
                    });
                }

                // ── Presence sub-nav ──────────────────────────────────────────
                if (id === 'presence_status') {
                    await i.deferUpdate();
                    return i.editReply({ embeds: [presenceEmbed()], components: presenceStatusRows() });
                }
                if (id === 'presence_acttype') {
                    await i.deferUpdate();
                    return i.editReply({ embeds: [presenceEmbed()], components: presenceActTypeRows() });
                }

                // ── Presence selects ──────────────────────────────────────────
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

                // ── Features toggle ───────────────────────────────────────────
                if (id === 'features_toggle') {
                    await i.deferUpdate();
                    const key     = i.values[0];
                    const current = botConfig.features[key];
                    await persist(`features.${key}`, !current);
                    return i.editReply({ embeds: [featuresEmbed()], components: featuresRows() });
                }

                // ── Modal-opening buttons ─────────────────────────────────────
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
                    'wlc_welcome':      welcomeModal('welcome', welcomeCfg),
                    'wlc_goodbye':      welcomeModal('goodbye', welcomeCfg),
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

                // ── Welcome / Goodbye — save to per-guild DB ──────────────────
                if (id === 'modal_welcome_msg' || id === 'modal_goodbye_msg') {
                    const isWelcome = id === 'modal_welcome_msg';
                    const newMsg    = i.fields.getTextInputValue('msg').trim();

                    // Load fresh copy in case it changed
                    welcomeCfg = await getWelcomeConfig(client, interaction.guildId);

                    if (isWelcome) {
                        welcomeCfg.welcomeMessage = newMsg;
                    } else {
                        welcomeCfg.leaveMessage = newMsg;
                    }

                    await saveWelcomeConfig(client, interaction.guildId, welcomeCfg);

                    await i.reply({
                        content: `✅ ${isWelcome ? 'Welcome' : 'Goodbye'} message updated for this server.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return msg.edit({ embeds: [welcomeEmbed(welcomeCfg)], components: welcomeRows() });
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

// ─── presenceStatusRows / presenceActTypeRows ─────────────────────────────────
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
