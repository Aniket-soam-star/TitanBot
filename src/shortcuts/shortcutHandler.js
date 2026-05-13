// src/shortcuts/shortcutHandler.js
// Fix: Added hasCommandAccess check after building ShortcutInteraction so that
// ~ shortcuts respect the same role-based permission system as slash commands.

import { MessageFlags }          from 'discord.js';
import { SHORTCUT_MAP, SHORTCUT_PREFIX } from './shortcutMap.js';
import { ShortcutInteraction }   from './ShortcutInteraction.js';
import { getGuildConfig }        from '../services/guildConfig.js';
import { createEmbed }           from '../utils/embeds.js';
import { logger }                from '../utils/logger.js';
import { hasCommandAccess }      from '../utils/roleGuard.js'; // ← ADDED

// ─── Usage error embed ────────────────────────────────────────────────────────
function usageEmbed(schema) {
    return createEmbed({
        title: '❌ Missing Arguments',
        description: [
            `**Usage:** \`${schema.usage}\``,
            `**Example:** \`${schema.example}\``,
        ].join('\n'),
        color: 'error',
        timestamp: true,
    });
}

// ─── Unknown shortcut embed ───────────────────────────────────────────────────
function unknownEmbed(typed) {
    return createEmbed({
        title: '❓ Unknown Shortcut',
        description: [
            `\`~${typed}\` is not a recognised shortcut.`,
            '',
            'Use \`~help\` or \`/shortcuts\` to see all available shortcuts.',
        ].join('\n'),
        color: 'warning',
        timestamp: true,
    });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function handleShortcut(message, client) {
    // Strip the ~ prefix and split into shortcut name + args
    const raw       = message.content.slice(SHORTCUT_PREFIX.length).trim();
    if (!raw) return;

    const parts     = raw.split(/\s+/);
    const shortcut  = parts[0].toLowerCase();
    const rawArgs   = parts.slice(1);

    // ── Special case: ~help ──────────────────────────────────────────────────
    if (shortcut === 'help') {
        return sendShortcutHelp(message, client);
    }

    const schema = SHORTCUT_MAP[shortcut];

    // Unknown shortcut — silently ignore if it could be a natural message starting
    // with ~ (e.g. ~_tilde in text). Only respond if it looks intentional.
    if (!schema) {
        if (/^[a-z]{1,20}$/i.test(shortcut)) {
            await message.reply({ embeds: [unknownEmbed(shortcut)] });
        }
        return;
    }

    // ── Validate required args ────────────────────────────────────────────────
    const requiredArgs = (schema.args ?? []).filter(a => a.required);
    for (let i = 0; i < requiredArgs.length; i++) {
        if (!rawArgs[i]) {
            return message.reply({ embeds: [usageEmbed(schema)] });
        }
    }

    // ── Find the command ──────────────────────────────────────────────────────
    const command = client.commands.get(schema.command);
    if (!command) {
        logger.warn(`[Shortcuts] Command '${schema.command}' not found for shortcut ~${shortcut}`);
        return message.reply({
            embeds: [createEmbed({
                title: '⚙️ Command Unavailable',
                description: `The command behind \`~${shortcut}\` (\`/${schema.command}\`) is not loaded.`,
                color: 'error',
                timestamp: true,
            })]
        });
    }

    // ── Build fake interaction ────────────────────────────────────────────────
    let interaction;
    try {
        interaction = await ShortcutInteraction.create(message, rawArgs, schema);
    } catch (err) {
        logger.error('[Shortcuts] Failed to build ShortcutInteraction:', err);
        return message.reply({
            embeds: [createEmbed({
                title: '❌ Error',
                description: 'Failed to process the shortcut arguments.',
                color: 'error',
                timestamp: true,
            })]
        });
    }

    // ── Role Guard ────────────────────────────────────────────────────────────
    // ShortcutInteraction exposes .guild / .member / .user from the message,
    // so hasCommandAccess works exactly the same as for slash commands.
    // Denial is handled inside hasCommandAccess (sends ephemeral-style reply).
    try {
        const allowed = await hasCommandAccess(interaction, schema.command);
        if (!allowed) return;
    } catch (err) {
        logger.warn('[Shortcuts] Role guard check failed:', err.message);
        // Fall through — if the guard crashes, still allow (fail-open)
    }
    // ── End Role Guard ────────────────────────────────────────────────────────

    // ── Guild config ──────────────────────────────────────────────────────────
    let guildConfig = null;
    try {
        if (message.guild) {
            guildConfig = await getGuildConfig(client, message.guild.id, {}).catch(() => null);

            // Check if command is disabled for this guild
            if (guildConfig?.disabledCommands?.[schema.command]) {
                return message.reply({
                    embeds: [createEmbed({
                        title: '🚫 Command Disabled',
                        description: `\`/${schema.command}\` has been disabled in this server.`,
                        color: 'error',
                        timestamp: true,
                    })]
                });
            }
        }
    } catch (err) {
        logger.warn('[Shortcuts] Could not load guild config:', err.message);
    }

    // ── Execute ───────────────────────────────────────────────────────────────
    try {
        logger.info(`[Shortcuts] ~${shortcut} used by ${message.author.tag} in ${message.guild?.name ?? 'DM'}`);
        await command.execute(interaction, guildConfig, client);
    } catch (err) {
        logger.error(`[Shortcuts] Error executing ~${shortcut}:`, err);
        const errEmbed = createEmbed({
            title: '❌ Command Error',
            description: 'Something went wrong running that command. Please try again or use the slash command version.',
            color: 'error',
            timestamp: true,
        });
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errEmbed] });
            } else {
                await message.reply({ embeds: [errEmbed] });
            }
        } catch { /* silent */ }
    }
}

// ─── Inline ~help embed ───────────────────────────────────────────────────────
import { CATEGORIES, SHORTCUT_MAP as SM } from './shortcutMap.js';

async function sendShortcutHelp(message) {
    const byCategory = {};

    for (const [key, schema] of Object.entries(SM)) {
        const cat = schema.category ?? 'utility';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push({ key, schema });
    }

    const fields = [];
    for (const [cat, entries] of Object.entries(byCategory)) {
        const meta  = CATEGORIES[cat] ?? { label: cat };
        const lines = entries.map(({ key, schema }) =>
            `\`~${key}\` — ${schema.description}`
        );
        fields.push({
            name:   meta.label,
            value:  lines.join('\n'),
            inline: false,
        });
    }

    await message.reply({
        embeds: [createEmbed({
            title: '⚡ Shortcut Commands — Quick Reference',
            description: [
                'These shortcuts let you run commands faster by typing `~` instead of `/`.',
                'Use `/shortcuts` for a full interactive help panel.',
                '',
                '**Format:** `~shortcut [args]`',
                '**Example:** `~ban @User Spamming`',
            ].join('\n'),
            color: 'primary',
            fields,
            footer: { text: `${Object.keys(SM).length} shortcuts available • ~help to show this again` },
            timestamp: true,
        })]
    });
}
