import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('autoreply')
    .setDescription('Manage auto replies')
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add an auto reply')
      .addStringOption(opt => opt.setName('trigger').setDescription('Word/phrase to trigger reply').setRequired(true))
      .addStringOption(opt => opt.setName('response').setDescription('Bot response').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove an auto reply')
      .addStringOption(opt => opt.setName('trigger').setDescription('Trigger to remove').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all auto replies'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const dbKey = `guild:${guildId}:autoreplies`;

    try {
      // Load existing replies from DB
      let replies = await getFromDb(dbKey, {});

      if (sub === 'add') {
        const trigger = interaction.options.getString('trigger').toLowerCase();
        const response = interaction.options.getString('response');

        replies[trigger] = response;
        await setInDb(dbKey, replies);

        // Sync to in-memory cache
        if (!client.autoReplies) client.autoReplies = new Map();
        client.autoReplies.set(`${guildId}:${trigger}`, response);

        await interaction.reply(`✅ Auto reply added!\n**Trigger:** ${trigger}\n**Response:** ${response}`);

      } else if (sub === 'remove') {
        const trigger = interaction.options.getString('trigger').toLowerCase();

        if (replies[trigger]) {
          delete replies[trigger];
          await setInDb(dbKey, replies);

          if (client.autoReplies) client.autoReplies.delete(`${guildId}:${trigger}`);

          await interaction.reply(`🗑️ Removed auto reply for: **${trigger}**`);
        } else {
          await interaction.reply({ content: `❌ No auto reply found for: **${trigger}**`, ephemeral: true });
        }

      } else if (sub === 'list') {
        const entries = Object.entries(replies);
        if (entries.length === 0) {
          await interaction.reply('❌ No auto replies set.');
        } else {
          const list = entries.map(([t, r]) => `• **${t}** → ${r}`).join('\n');
          await interaction.reply(`📋 **Auto Replies:**\n${list}`);
        }
      }

    } catch (error) {
      logger.error('Error in autoreply command:', error);
      await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
    }
  }
};
