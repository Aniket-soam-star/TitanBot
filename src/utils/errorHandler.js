/**
 * Centralized Error Handling System
 */

import { logger } from './logger.js';
import { createEmbed } from './embeds.js';
import { MessageFlags } from 'discord.js';
import { getErrorMetadata, getDefaultErrorCodeByType, resolveErrorCode, ErrorCodes } from './errorRegistry.js';

export const ErrorTypes = {
    VALIDATION:    'validation',
    PERMISSION:    'permission',
    CONFIGURATION: 'configuration',
    DATABASE:      'database',
    NETWORK:       'network',
    DISCORD_API:   'discord_api',
    USER_INPUT:    'user_input',
    RATE_LIMIT:    'rate_limit',
    UNKNOWN:       'unknown'
};

export class ZeroBotError extends Error {
    constructor(message, type = ErrorTypes.UNKNOWN, userMessage = null, context = {}) {
        super(message);
        this.name       = 'ZeroBotError';
        this.type       = type;
        this.userMessage = userMessage;
        this.context    = context;
        this.code       = context?.errorCode || getDefaultErrorCodeByType(type);
        this.timestamp  = new Date().toISOString();
    }
}

/**
 * Categorize an error into an ErrorType.
 *
 * IMPORTANT: Only use very specific, unambiguous signals to classify errors.
 * Broad keyword matching on "invalid", "not found", "config" causes false positives
 * where completely unrelated errors (Discord API, runtime crashes) get shown as
 * "Configuration Error" to users, which is misleading and unhelpful.
 */
export function categorizeError(error) {
    // Already typed — trust it
    if (error instanceof ZeroBotError) return error.type;

    const code    = error.code;
    const message = (error.message || '').toLowerCase();

    // ── Discord API error codes ──────────────────────────────────────────────
    if (typeof code === 'number') {
        if (code === 50013 || code === 50001) return ErrorTypes.PERMISSION;
        if (code === 429)                     return ErrorTypes.RATE_LIMIT;
        if (code >= 10000 && code < 20000)   return ErrorTypes.DISCORD_API;
        if (code === 40060)                   return ErrorTypes.DISCORD_API; // Interaction already acknowledged
    }

    // ── Rate limit ───────────────────────────────────────────────────────────
    if (message.includes('rate limit') || message === 'rate limited') return ErrorTypes.RATE_LIMIT;

    // ── Permission — only very specific signals ───────────────────────────────
    if (
        message === 'missing permissions' ||
        message.startsWith('missing access') ||
        (message.includes('permission') && (message.includes('missing') || message.includes('lack')))
    ) return ErrorTypes.PERMISSION;

    // ── Database — only clear DB signals ─────────────────────────────────────
    if (
        message.includes('database') ||
        message.includes('postgresql') ||
        message.includes('sql') ||
        message.includes('connection refused') ||
        message.includes('econnrefused')
    ) return ErrorTypes.DATABASE;

    // ── Network ───────────────────────────────────────────────────────────────
    if (
        message.includes('enotconn') ||
        message.includes('network error') ||
        message.includes('fetch failed') ||
        message.includes('econnreset')
    ) return ErrorTypes.NETWORK;

    // ── Everything else is UNKNOWN — don't guess ─────────────────────────────
    // We used to map "not found", "invalid", "config" → CONFIGURATION but that
    // caused every unhandled error to show as "Configuration Error" to users.
    return ErrorTypes.UNKNOWN;
}

const UserMessages = {
    [ErrorTypes.VALIDATION]: {
        default: "Please check your input and try again.",
        missing_required: "You're missing some required information.",
        invalid_format: "The format you provided is incorrect. Please try again."
    },
    [ErrorTypes.PERMISSION]: {
        default: "I don't have permission to do that. Please check my server permissions.",
        user_permission: "You don't have permission to use this command.",
        bot_permission: "I need additional permissions to perform this action."
    },
    [ErrorTypes.CONFIGURATION]: {
        default: "This feature hasn't been set up yet. A server administrator needs to configure it first.",
        missing_config: "This feature hasn't been set up yet. Please contact an administrator.",
        invalid_config: "The configuration is invalid. Please contact an administrator."
    },
    [ErrorTypes.DATABASE]: {
        default: "I'm having trouble with my database. Please try again in a moment.",
        connection_failed: "I'm having trouble connecting to my database. Please try again later.",
        timeout: "The operation took too long. Please try again."
    },
    [ErrorTypes.NETWORK]: {
        default: "I'm having network issues. Please try again in a moment.",
        timeout: "The request timed out. Please try again.",
        unreachable: "I can't reach the service right now. Please try again later."
    },
    [ErrorTypes.DISCORD_API]: {
        default: "I'm having trouble with Discord. Please try again in a moment.",
        rate_limit: "You're doing that too much. Please wait a moment and try again.",
        forbidden: "I'm not allowed to do that. Please check my permissions."
    },
    [ErrorTypes.USER_INPUT]: {
        default: "There was an issue with your request. Please try again.",
        invalid_user: "I couldn't find that user. Please check the mention or ID.",
        invalid_channel: "I couldn't find that channel. Please check the mention or ID."
    },
    [ErrorTypes.RATE_LIMIT]: {
        default: "You're doing that too much. Please wait a moment and try again.",
        command_cooldown: "This command is on cooldown. Please wait before using it again.",
        global_rate_limit: "You're being rate limited. Please wait a moment."
    },
    [ErrorTypes.UNKNOWN]: {
        default: "Something went wrong. Please try again.",
        unexpected: "An unexpected error occurred. Please try again later."
    }
};

export function getUserMessage(error, context = {}) {
    // If the error has an explicit user message, always use it
    if (error?.userMessage) return error.userMessage;

    const type     = categorizeError(error);
    const messages = UserMessages[type] || UserMessages[ErrorTypes.UNKNOWN];

    if (context.subtype && messages[context.subtype]) return messages[context.subtype];
    return messages.default;
}

export async function handleInteractionError(interaction, error, context = {}) {
    const errorType        = categorizeError(error);
    const userMessage      = getUserMessage(error, context);
    const resolvedErrorCode = resolveErrorCode({ error, errorType, context });
    const errorMetadata    = getErrorMetadata(resolvedErrorCode);
    const traceId          = context.traceId || interaction?.traceContext?.traceId || interaction?.traceId || error?.context?.traceId;

    const isUserError = [
        ErrorTypes.VALIDATION,
        ErrorTypes.RATE_LIMIT,
        ErrorTypes.USER_INPUT,
        ErrorTypes.PERMISSION
    ].includes(errorType);
    const isExpectedError = Boolean(error?.context?.expected === true || error?.context?.suppressErrorLog === true);

    const logData = {
        event: 'interaction.error',
        errorCode: resolvedErrorCode,
        remediationHint: errorMetadata.remediation,
        severity: errorMetadata.severity,
        retryable: errorMetadata.retryable,
        error: error.message,
        type: errorType,
        traceId,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        command: interaction.commandName || context.command,
        context
    };

    if (isUserError || isExpectedError) {
        if (errorType !== ErrorTypes.RATE_LIMIT) {
            logger.debug(`User Error [${errorType.toUpperCase()}]: ${error.message}`, logData);
        }
    } else {
        logger.error(`System Error [${errorType.toUpperCase()}]: ${error.message}`, {
            ...logData,
            stack: error.stack
        });
    }

    const embed = createEmbed({
        title:       getErrorTitle(errorType),
        description: userMessage,
        color:       'error',
        timestamp:   true
    });

    if (errorType === ErrorTypes.RATE_LIMIT) {
        embed.addFields({ name: '💡 Tip', value: 'Wait a moment before trying again.' });
    } else if (errorType === ErrorTypes.PERMISSION) {
        embed.addFields({ name: '🔧 Need Help?', value: 'Contact a server administrator if you believe this is an error.' });
    } else if (errorType === ErrorTypes.CONFIGURATION) {
        embed.addFields({ name: '📋 Setup Required', value: 'A server administrator needs to configure this feature first.' });
    }

    try {
        if (!interaction?.id) return;

        if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > 14 * 60 * 1000) {
            logger.warn('Interaction expired before error handler could respond', { traceId });
            return;
        }

        const payload = { embeds: [embed] };
        if (!interaction.deferred && !interaction.replied) payload.flags = MessageFlags.Ephemeral;

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch (replyError) {
        if (replyError.code === 40060 || replyError.code === 10062) {
            logger.warn('Interaction already acknowledged or expired', { traceId, code: replyError.code });
            return;
        }
        logger.error('Failed to send error response:', { traceId, error: replyError });
    }
}

function getErrorTitle(errorType) {
    const titles = {
        [ErrorTypes.VALIDATION]:    '❌ Invalid Input',
        [ErrorTypes.PERMISSION]:    '🚫 Permission Denied',
        [ErrorTypes.CONFIGURATION]: '⚙️ Setup Required',
        [ErrorTypes.DATABASE]:      '🗄️ Database Error',
        [ErrorTypes.NETWORK]:       '🌐 Network Error',
        [ErrorTypes.DISCORD_API]:   '🔌 API Error',
        [ErrorTypes.USER_INPUT]:    '💬 Input Error',
        [ErrorTypes.RATE_LIMIT]:    '⏱️ Slow Down!',
        [ErrorTypes.UNKNOWN]:       '❓ Something Went Wrong'
    };
    return titles[errorType] || titles[ErrorTypes.UNKNOWN];
}

export function withErrorHandling(fn, context = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            const interaction = args.find(arg =>
                arg && typeof arg === 'object' &&
                (arg.isCommand || arg.isButton || arg.isModalSubmit ||
                 arg.isStringSelectMenu || arg.isChatInputCommand)
            );
            if (interaction) {
                await handleInteractionError(interaction, error, context);
            } else {
                logger.error('Error in non-interaction context:', error);
            }
            return null;
        }
    };
}

// Backward-compatible alias
export const TitanBotError = ZeroBotError;
export function createError(message, type = ErrorTypes.UNKNOWN, userMessage = null, context = {}) {
    return new ZeroBotError(message, type, userMessage, {
        ...context,
        errorCode: context?.errorCode || getDefaultErrorCodeByType(type)
    });
}

export default {
    ErrorTypes, ZeroBotError, TitanBotError,
    categorizeError, getUserMessage,
    handleInteractionError, withErrorHandling, createError
};
