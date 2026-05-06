// 📁 NEW FILE → src/commands/Utility/whois.js

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getModerationCases } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FLAGS_MAP = {
    Staff:                      '👨‍💼 Discord Staff',
    Partner:                    '🤝 Discord Partner',
    Hypesquad:                  '🏠 HypeSquad Events',
    BugHunterLevel1:            '🐛 Bug Hunter (Lv1)',
    BugHunterLevel2:            '🐛 Bug Hunter (Lv2)',
    HypeSquadOnlineHouse1:      '🏠 House Bravery',
    HypeSquadOnlineHouse2:      '🏠 House Brilliance',
    HypeSquadOnlineHouse3:      '🏠 House Balance',
    PremiumEarlySupporter:      '💎 Early Supporter',
    VerifiedBot:                '🤖 Verified Bot',
    VerifiedDeveloper:          '🔧 Verified Dev',
    CertifiedModerator:         '🛡️ Cert. Moderator',
    ActiveDeveloper:            '🔨 Active Developer',
};

export default {
    data: new SlashCommandBuilder()
        .setName('whois')
        .setDescription('Detailed information about a user, including their mod history')
        .addUserOption(o =>
            o.setName('user').setDescription('User to look up (defaults to yourself)')
        ),

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            const target = interaction.options.getUser('user') || interaction.user;
            const member = await interaction.guild.members.fetch(target.id).catch(() => null);

            const flags  = target.flags?.toArray() || [];
            const badges = flags.map(f => FLAGS_MAP[f]).filter(Boolean);

            const createdTs = Math.floor(target.createdTimestamp / 1000);
            const joinedTs  = member ? Math.floor(member.joinedTimestamp / 1000) : null;

            const roles = member
                ? [...member.roles.cache.values()]
                    .filter(r => r.id !== interaction.guild.id)
                    .sort((a, b) => b.position - a.position)
                    .slice(0, 15)
                    .map(r => r.toString())
                    .join(' ')
                : 'Not in server';

            // Mod history summary
            const isMod = interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers);
            let modSummary = '';
            if (isMod) {
                const cases = await getModerationCases(interaction.guild.id, { userId: target.id, limit: 100 });
                const active = cases.filter(c => !c.voided);
                if (active.length > 0) {
                    const counts = {};
                    active.forEach(c => { counts[c.action] = (counts[c.action] || 0) + 1; });
                    modSummary = Object.entries(counts).map(([a, n]) => `${a}: **${n}**`).join(' | ');
                } else {
                    modSummary = 'No moderation history.';
                }
            }

            const embed = createEmbed({
                title: `👤 ${target.tag}`,
                thumbnail: target.displayAvatarURL({ dynamic: true, size: 256 }),
                color: member?.displayHexColor !== '#000000' ? member?.displayHexColor : 'primary',
                fields: [
                    { name: '🆔 User ID',     value: target.id,                   inline: true },
                    { name: '🤖 Bot',          value: target.bot ? 'Yes' : 'No',   inline: true },
                    { name: '📅 Account Created', value: `<t:${createdTs}:D> (<t:${createdTs}:R>)`, inline: false },
                    ...(joinedTs ? [{ name: '📥 Server Joined', value: `<t:${joinedTs}:D> (<t:${joinedTs}:R>)`, inline: false }] : []),
                    ...(member?.nickname ? [{ name: '🏷️ Nickname', value: member.nickname, inline: true }] : []),
                    { name: `🎭 Roles (${member?.roles.cache.size - 1 || 0})`, value: roles || 'None', inline: false },
                    ...(badges.length > 0 ? [{ name: '🏅 Badges', value: badges.join(', '), inline: false }] : []),
                    ...(isMod ? [{ name: '🛡️ Mod History', value: modSummary, inline: false }] : [])
                ]
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('Whois command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Failed to fetch user info.')]
            });
        }
    }
};
