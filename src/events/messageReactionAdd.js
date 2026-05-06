// 📁 NEW FILE → src/events/messageReactionAdd.js
//
// Handles starboard logic.
// DB key: guild:{guildId}:starboard        → config
// DB key: guild:{guildId}:starboard:posted → Set of message IDs already starred

import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { createEmbed } from '../utils/embeds.js';

export default {
    name: Events.MessageReactionAdd,

    async execute(reaction, user, client) {
        try {
            // Fetch partial reaction/message if needed
            if (reaction.partial) await reaction.fetch().catch(() => null);
            if (reaction.message.partial) await reaction.message.fetch().catch(() => null);

            const message = reaction.message;
            if (!message.guild || user.bot) return;

            const guildId = message.guild.id;
            const cfg     = await getFromDb(`guild:${guildId}:starboard`, {});

            if (!cfg?.enabled || !cfg.channelId) return;
            if (message.channel.id === cfg.channelId) return; // don't star the starboard itself

            // Check emoji matches
            const emoji = cfg.emoji ?? '⭐';
            const reactionEmoji = reaction.emoji.id
                ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
                : reaction.emoji.name;
            if (reactionEmoji !== emoji) return;

            // Ignore ignored channels
            if (cfg.ignoredChannels?.includes(message.channel.id)) return;
            // Ignore bots
            if (cfg.ignoreBots && message.author.bot) return;

            const count = reaction.count ?? 1;
            if (count < (cfg.threshold ?? 3)) return;

            // Already posted?
            const postedKey = `guild:${guildId}:starboard:posted`;
            const posted    = await getFromDb(postedKey, {});
            if (posted[message.id]) {
                // Update the star count on the existing post
                const starChannel = message.guild.channels.cache.get(cfg.channelId);
                if (!starChannel) return;
                try {
                    const starMsg = await starChannel.messages.fetch(posted[message.id]).catch(() => null);
                    if (starMsg) {
                        await starMsg.edit({
                            content: `${emoji} **${count}** | ${message.channel}`
                        });
                    }
                } catch {}
                return;
            }

            // Build and post the starboard embed
            const starChannel = message.guild.channels.cache.get(cfg.channelId);
            if (!starChannel) return;

            const embed = createEmbed({
                description: message.content?.slice(0, 4096) || null,
                color: '#FFD700',
                author: {
                    name: message.author.tag,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                },
                footer: { text: `#${message.channel.name} • ${message.id}` },
                timestamp: message.createdAt
            });

            // Attach first image if present
            const img = message.attachments.find(a => a.contentType?.startsWith('image/'));
            if (img) embed.setImage(img.url);

            // Add embeds from the original if any
            if (!message.content && message.embeds.length > 0) {
                const orig = message.embeds[0];
                if (orig.description) embed.setDescription(orig.description.slice(0, 2048));
                if (orig.image)       embed.setImage(orig.image.url);
            }

            const starMsg = await starChannel.send({
                content: `${emoji} **${count}** | ${message.channel} — [Jump](${message.url})`,
                embeds: [embed]
            });

            // Save so we can update count later
            posted[message.id] = starMsg.id;
            await setInDb(postedKey, posted);

        } catch (error) {
            logger.error('MessageReactionAdd (starboard) error:', error);
        }
    }
};
