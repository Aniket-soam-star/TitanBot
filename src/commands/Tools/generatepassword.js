// 📁 REPLACE → src/commands/Tools/generatepassword.js
// Fix: successEmbed(message, title) args were swapped.
// The password content was passed as the TITLE (where spoiler tags ||..|| don't render),
// so the password was invisible. Now the content is the description and title is correct.

import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('generatepassword')
        .setDescription('Generate a strong, random password')
        .addIntegerOption(option =>
            option.setName('length')
                .setDescription('Password length (default: 16, max: 50)')
                .setMinValue(8)
                .setMaxValue(50)
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('uppercase')
                .setDescription('Include uppercase letters (A-Z)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('numbers')
                .setDescription('Include numbers (0-9)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('symbols')
                .setDescription('Include symbols (!@#$%^&*)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral
        });

        if (!deferSuccess) {
            logger.warn('GeneratePassword interaction defer failed', {
                userId: interaction.user?.id,
                guildId: interaction.guildId,
                commandName: 'generatepassword'
            });
            return;
        }

        try {
            const length           = interaction.options.getInteger('length') || 16;
            const includeUppercase = interaction.options.getBoolean('uppercase') ?? true;
            const includeNumbers   = interaction.options.getBoolean('numbers')   ?? true;
            const includeSymbols   = interaction.options.getBoolean('symbols')   ?? true;

            if (length < 8 || length > 50) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Password must be 8–50 characters. You provided: ' + length, '❌ Invalid Length')],
                });
                return;
            }

            // ── Build character pool ─────────────────────────────────────────
            const lowercase = 'abcdefghijklmnopqrstuvwxyz';
            const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const numbers   = '0123456789';
            const symbols   = '!@#$%^&*()_+-=[]{}|;:,.<>?';

            let chars = lowercase;
            if (includeUppercase) chars += uppercase;
            if (includeNumbers)   chars += numbers;
            if (includeSymbols)   chars += symbols;

            // ── Generate password ────────────────────────────────────────────
            let password = '';
            const randomValues = new Uint32Array(length);
            crypto.getRandomValues(randomValues);

            for (let i = 0; i < length; i++) {
                password += chars[randomValues[i] % chars.length];
            }

            // Guarantee each requested character type appears at least once
            if (includeUppercase && !/[A-Z]/.test(password)) {
                const i = Math.floor(Math.random() * length);
                password = password.substring(0, i) + uppercase[Math.floor(Math.random() * uppercase.length)] + password.substring(i + 1);
            }
            if (includeNumbers && !/[0-9]/.test(password)) {
                const i = Math.floor(Math.random() * length);
                password = password.substring(0, i) + numbers[Math.floor(Math.random() * numbers.length)] + password.substring(i + 1);
            }
            if (includeSymbols && !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
                const i = Math.floor(Math.random() * length);
                password = password.substring(0, i) + symbols[Math.floor(Math.random() * symbols.length)] + password.substring(i + 1);
            }

            // ── Calculate strength ───────────────────────────────────────────
            const hasLower  = /[a-z]/.test(password);
            const hasUpper  = /[A-Z]/.test(password);
            const hasNumber = /[0-9]/.test(password);
            const hasSymbol = /[^a-zA-Z0-9]/.test(password);

            const uniqueRatio = new Set(password).size / password.length;

            let score = password.length * 4;
            score += (password.length - (password.match(/[a-z]/g) || []).length) * 2;
            score += (password.length - (password.match(/[A-Z]/g) || []).length) * 2;
            score += (password.match(/[0-9]/g)     || []).length * 4;
            score += (password.match(/[^a-zA-Z0-9]/g) || []).length * 6;

            if (uniqueRatio < 0.5) score *= 0.7;
            if (hasLower && hasUpper) score *= 1.2;
            if (hasNumber) score *= 1.2;
            if (hasSymbol) score *= 1.3;

            let strength      = 'Weak';
            let strengthEmoji = '🔴';
            let strengthColor = getColor('error');

            if (score > 80)      { strength = 'Very Strong'; strengthEmoji = '🟢'; strengthColor = getColor('success'); }
            else if (score > 60) { strength = 'Strong';      strengthEmoji = '🟢'; strengthColor = getColor('success'); }
            else if (score > 40) { strength = 'Good';        strengthEmoji = '🟡'; strengthColor = getColor('warning'); }
            else if (score > 20) { strength = 'Weak';        strengthEmoji = '🟠'; strengthColor = getColor('warning'); }

            const containsList = [
                hasLower  ? 'Lowercase' : null,
                hasUpper  ? 'Uppercase' : null,
                hasNumber ? 'Numbers'   : null,
                hasSymbol ? 'Symbols'   : null,
            ].filter(Boolean).join(', ');

            // ── Build embed ──────────────────────────────────────────────────
            // FIX: successEmbed(description, title) — description goes FIRST.
            // The password is wrapped in spoiler tags so it only reveals on tap/click.
            const embed = successEmbed(
                `**Password:** ||\`${password}\`||\n\n` +
                `**Length:** ${password.length} characters\n` +
                `**Strength:** ${strengthEmoji} ${strength}\n` +
                `**Contains:** ${containsList}`,
                '🔑 Generated Password'
            ).setColor(strengthColor);

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'generatepassword'
            });
        }
    },
};
