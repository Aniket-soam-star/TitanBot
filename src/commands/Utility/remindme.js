// 📁 NEW FILE → src/commands/Utility/remindme.js
//
// Personal reminders stored in DB.
// The reminder scheduler lives in src/events/ready.js (see updated version).
// DB key: reminders:{userId}  → array of reminder objects

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

function parseTime(str) {
    const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
    const match  = str.match(/^(\d+)([smhdw])$/i);
    if (!match) return null;
    return parseInt(match[1]) * (units[match[2].toLowerCase()] || 0);
}

export default {
    data: new SlashCommandBuilder()
        .setName('remindme')
        .setDescription('Set, list, or remove personal reminders')
        .addSubcommand(s => s
            .setName('set')
            .setDescription('Set a reminder')
            .addStringOption(o => o.setName('time').setDescription('Time until reminder (e.g. 10m, 2h, 1d)').setRequired(true))
            .addStringOption(o => o.setName('message').setDescription('What to remind you about').setRequired(true)))
        .addSubcommand(s => s
            .setName('list')
            .setDescription('List your active reminders'))
        .addSubcommand(s => s
            .setName('remove')
            .setDescription('Remove a reminder by its number from /remindme list')
            .addIntegerOption(o => o.setName('number').setDescription('Reminder number').setRequired(true).setMinValue(1))),

    async execute(interaction, config, client) {
        const sub    = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const key    = `reminders:${userId}`;

        try {
            let reminders = await getFromDb(key, []);
            if (!Array.isArray(reminders)) reminders = [];

            // ── set ──────────────────────────────────────────────────────────────────
            if (sub === 'set') {
                const timeStr = interaction.options.getString('time');
                const msg     = interaction.options.getString('message');
                const ms      = parseTime(timeStr);

                if (!ms || ms <= 0) {
                    return interaction.reply({
                        embeds: [errorEmbed('Invalid time format. Use: `10s`, `5m`, `2h`, `1d`, `1w`')],
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (ms > 28 * 86_400_000) {
                    return interaction.reply({
                        embeds: [errorEmbed('Maximum reminder time is 28 days.')],
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (reminders.length >= 25) {
                    return interaction.reply({
                        embeds: [errorEmbed('You have reached the 25 reminder limit. Remove some first.')],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const fireAt = Date.now() + ms;
                const entry  = {
                    id:        `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    userId,
                    channelId: interaction.channel.id,
                    guildId:   interaction.guild?.id || null,
                    message:   msg,
                    fireAt,
                    createdAt: Date.now()
                };

                reminders.push(entry);
                await setInDb(key, reminders);

                // Global index so ready.js can restore reminders on restart
                const userIdx = await getFromDb('reminder_users', []);
                if (!userIdx.includes(userId)) {
                    userIdx.push(userId);
                    await setInDb('reminder_users', userIdx);
                }

                // Register in global scheduler Map
                if (!client.reminders) client.reminders = new Map();
                const timeout = setTimeout(async () => {
                    try {
                        const ch = await client.channels.fetch(entry.channelId).catch(() => null);
                        if (ch) await ch.send({ content: `<@${userId}> ⏰ Reminder: **${msg}**` });
                        // Clean up from DB
                        const current = await getFromDb(key, []);
                        await setInDb(key, current.filter(r => r.id !== entry.id));
                        client.reminders?.delete(entry.id);
                    } catch (e) { logger.error('Reminder fire error:', e); }
                }, ms);
                client.reminders.set(entry.id, timeout);

                return interaction.reply({
                    embeds: [successEmbed(
                        `⏰ I'll remind you about: **${msg}**\n📅 At: <t:${Math.floor(fireAt / 1000)}:F> (<t:${Math.floor(fireAt / 1000)}:R>)`,
                        '✅ Reminder Set'
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }

            // ── list ─────────────────────────────────────────────────────────────────
            if (sub === 'list') {
                const active = reminders.filter(r => r.fireAt > Date.now());
                if (active.length === 0) {
                    return interaction.reply({
                        embeds: [errorEmbed('You have no active reminders.')],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const lines = active
                    .sort((a, b) => a.fireAt - b.fireAt)
                    .map((r, i) => `**${i + 1}.** <t:${Math.floor(r.fireAt / 1000)}:R> — ${r.message.slice(0, 80)}`);

                return interaction.reply({
                    embeds: [createEmbed({
                        title: `⏰ Your Reminders (${active.length})`,
                        description: lines.join('\n'),
                        color: 'info'
                    })],
                    flags: MessageFlags.Ephemeral
                });
            }

            // ── remove ───────────────────────────────────────────────────────────────
            if (sub === 'remove') {
                const num    = interaction.options.getInteger('number');
                const active = reminders.filter(r => r.fireAt > Date.now()).sort((a, b) => a.fireAt - b.fireAt);
                const target = active[num - 1];

                if (!target) {
                    return interaction.reply({
                        embeds: [errorEmbed(`No reminder found at position **${num}**. Use \`/remindme list\` to see yours.`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                // Cancel timer
                if (client.reminders?.has(target.id)) {
                    clearTimeout(client.reminders.get(target.id));
                    client.reminders.delete(target.id);
                }

                await setInDb(key, reminders.filter(r => r.id !== target.id));

                return interaction.reply({
                    embeds: [successEmbed(`Removed reminder: **${target.message.slice(0, 100)}**`)],
                    flags: MessageFlags.Ephemeral
                });
            }

        } catch (error) {
            logger.error('Remindme command error:', error);
            await interaction.reply({
                embeds: [errorEmbed('Something went wrong with your reminder.')],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }
};
