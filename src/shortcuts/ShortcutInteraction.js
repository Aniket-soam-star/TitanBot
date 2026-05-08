// 📁 NEW FILE → src/shortcuts/ShortcutInteraction.js
//
// Wraps a Discord Message object to look like a slash command Interaction.
// This lets shortcut commands (~ban, ~kick, etc.) run the exact same
// execute() function as their slash command counterparts without any
// changes to the original command files.
//
// Supported option types: user, member, string, integer, number, boolean, channel, role
// Ephemeral flags are silently ignored (prefix messages can't be ephemeral).
// deferReply() sends a "Processing..." embed then editReply() edits it.

import { createEmbed } from '../utils/embeds.js';

export class ShortcutInteraction {
    constructor(message, parsedArgs, schema) {
        // ── Core Discord properties ──────────────────────────────────────────
        this.message       = message;
        this.guild         = message.guild;
        this.guildId       = message.guildId;
        this.channel       = message.channel;
        this.channelId     = message.channelId;
        this.user          = message.author;
        this.member        = message.member;
        this.commandName   = schema.command;
        this.client        = message.client;

        // ── State flags ──────────────────────────────────────────────────────
        this.deferred      = false;
        this.replied       = false;
        this._reply        = null;   // the sent/deferred Message
        this._schema       = schema;
        this._args         = parsedArgs; // Map<name, { value, user, member, channel, role, int, num, bool }>

        // ── Stub properties used by some bot internals ───────────────────────
        this.id            = `shortcut-${Date.now()}`;
        this.traceId       = `sc-${Date.now()}`;
        this.traceContext  = { traceId: this.traceId };

        // ── Options API ──────────────────────────────────────────────────────
        this.options = this._buildOptions();
    }

    // ─── Options builder ─────────────────────────────────────────────────────
    _buildOptions() {
        const args      = this._args;
        const schema    = this._schema;

        return {
            getUser:            (name)        => args.get(name)?.user    ?? null,
            getMember:          (name)        => args.get(name)?.member  ?? null,
            getString:          (name)        => args.get(name)?.value   ?? null,
            getInteger:         (name)        => args.get(name)?.int     ?? null,
            getNumber:          (name)        => args.get(name)?.num     ?? null,
            getBoolean:         (name)        => args.get(name)?.bool    ?? null,
            getChannel:         (name)        => args.get(name)?.channel ?? null,
            getRole:            (name)        => args.get(name)?.role    ?? null,
            getAttachment:      ()            => null,
            getSubcommand:      (required)    => schema.subcommand ?? null,
            getSubcommandGroup: (required)    => null,
            getFocused:         ()            => ({ name: '', value: '' }),
        };
    }

    // ─── Reply methods ────────────────────────────────────────────────────────

    // Strip ephemeral / flags — they don't apply to prefix messages
    _clean(payload) {
        if (!payload || typeof payload !== 'object') return { content: String(payload) };
        const { flags, ephemeral, fetchReply, ...rest } = payload;
        return rest;
    }

    async deferReply({ ephemeral } = {}) {
        if (this.deferred || this.replied) return;
        this.deferred = true;
        this._reply = await this.message.reply({
            embeds: [createEmbed({
                description: '⏳ Processing...',
                color: 'primary',
                timestamp: false,
            })]
        }).catch(() => null);
    }

    async reply(payload) {
        if (this.replied) return this.followUp(payload);
        this.replied = true;
        const cleaned = this._clean(payload);
        this._reply = await this.message.reply(cleaned).catch(() => null);
        return this._reply;
    }

    async editReply(payload) {
        const cleaned = this._clean(payload);
        if (this._reply) {
            return this._reply.edit(cleaned).catch(async () => {
                // If edit fails (e.g. message deleted), fall back to new reply
                return this.message.channel.send(cleaned).catch(() => null);
            });
        }
        // No existing reply — create one
        this.replied = true;
        this._reply = await this.message.reply(cleaned).catch(() => null);
        return this._reply;
    }

    async followUp(payload) {
        const cleaned = this._clean(payload);
        return this.message.channel.send(cleaned).catch(() => null);
    }

    // ─── Interaction type stubs ───────────────────────────────────────────────
    isChatInputCommand()  { return true;  }
    isButton()            { return false; }
    isSelectMenu()        { return false; }
    isStringSelectMenu()  { return false; }
    isModalSubmit()       { return false; }
    isAutocomplete()      { return false; }
    isRepliable()         { return true;  }
    async showModal()     { /* modals not supported in prefix commands */ }

    // ─── Static factory — parses raw message args against the schema ──────────
    static async create(message, rawArgs, schema) {
        const parsedArgs = await ShortcutInteraction._parse(message, rawArgs, schema.args ?? []);
        return new ShortcutInteraction(message, parsedArgs, schema);
    }

    static async _parse(message, rawArgs, argDefs) {
        const result   = new Map();
        let   argIndex = 0;

        for (const def of argDefs) {
            if (argIndex >= rawArgs.length) break;

            // 'rest' args consume everything left as one joined string
            const raw = def.rest
                ? rawArgs.slice(argIndex).join(' ')
                : rawArgs[argIndex];

            if (!raw) break;

            const entry = { value: raw };

            switch (def.type) {
                case 'user':
                case 'member': {
                    // Accepts <@id>, <@!id>, or bare numeric ID
                    const userId = raw.replace(/[<@!>]/g, '');
                    if (/^\d{17,20}$/.test(userId)) {
                        entry.user   = await message.client.users.fetch(userId).catch(() => null);
                        entry.member = message.guild
                            ? await message.guild.members.fetch(userId).catch(() => null)
                            : null;
                        entry.value  = userId;
                    }
                    break;
                }
                case 'channel': {
                    const chId = raw.replace(/[<#>]/g, '');
                    entry.channel = message.guild?.channels.cache.get(chId) ?? null;
                    break;
                }
                case 'role': {
                    const roleId = raw.replace(/[<@&>]/g, '');
                    entry.role = message.guild?.roles.cache.get(roleId) ?? null;
                    break;
                }
                case 'integer': {
                    const parsed = parseInt(raw, 10);
                    entry.int   = isNaN(parsed) ? null : parsed;
                    entry.value = raw;
                    break;
                }
                case 'number': {
                    const parsed = parseFloat(raw);
                    entry.num   = isNaN(parsed) ? null : parsed;
                    entry.value = raw;
                    break;
                }
                case 'boolean': {
                    entry.bool  = ['true','yes','on','1','enable'].includes(raw.toLowerCase());
                    entry.value = raw;
                    break;
                }
                default: {
                    // string — value already set above
                    break;
                }
            }

            result.set(def.name, entry);
            if (!def.rest) argIndex++;
        }

        return result;
    }
}
