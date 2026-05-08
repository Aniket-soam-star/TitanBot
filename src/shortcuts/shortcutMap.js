// 📁 NEW FILE → src/shortcuts/shortcutMap.js
//
// Central registry of all ~ shortcut commands.
// To add a new shortcut, just add an entry here. No other file changes needed.
//
// Schema fields:
//   command     → the slash command name it maps to (must exist in client.commands)
//   description → shown in ~help / /shortcuts
//   usage       → shown in help (use ~shortcut format)
//   example     → a realistic example shown in help
//   subcommand  → if the command uses subcommands, specify which one to run
//   category    → help grouping (moderation | economy | utility | fun | info)
//   args        → ordered list of option definitions:
//       name     → must match the slash command's option name EXACTLY
//       type     → user | member | string | integer | number | boolean | channel | role
//       required → true = show usage error if missing
//       rest     → true = slurp all remaining args as one string (only last arg)

export const SHORTCUT_PREFIX = '~';

export const SHORTCUT_MAP = {

    // ══════════════════════════════════════════════════════
    //  MODERATION
    // ══════════════════════════════════════════════════════

    ban: {
        command:     'ban',
        description: 'Ban a user from the server',
        usage:       '~ban @user [reason]',
        example:     '~ban @Spammer Breaking server rules',
        category:    'moderation',
        args: [
            { name: 'target', type: 'user',   required: true  },
            { name: 'reason', type: 'string',  required: false, rest: true },
        ],
    },

    kick: {
        command:     'kick',
        description: 'Kick a user from the server',
        usage:       '~kick @user [reason]',
        example:     '~kick @Rulebreaker Being rude',
        category:    'moderation',
        args: [
            { name: 'target', type: 'user',   required: true  },
            { name: 'reason', type: 'string',  required: false, rest: true },
        ],
    },

    mute: {
        command:     'timeout',
        description: 'Timeout/mute a user (duration in minutes)',
        usage:       '~mute @user <minutes> [reason]',
        example:     '~mute @Spammer 10 Spamming in general',
        category:    'moderation',
        args: [
            { name: 'target',   type: 'user',    required: true  },
            { name: 'duration', type: 'integer',  required: true  },
            { name: 'reason',   type: 'string',   required: false, rest: true },
        ],
    },

    unmute: {
        command:     'untimeout',
        description: 'Remove a timeout from a user',
        usage:       '~unmute @user',
        example:     '~unmute @User',
        category:    'moderation',
        args: [
            { name: 'target', type: 'user', required: true },
        ],
    },

    warn: {
        command:     'warn',
        description: 'Issue a warning to a user',
        usage:       '~warn @user [reason]',
        example:     '~warn @User Watch your language',
        category:    'moderation',
        args: [
            { name: 'target', type: 'user',   required: true  },
            { name: 'reason', type: 'string',  required: false, rest: true },
        ],
    },

    clear: {
        command:     'purge',
        description: 'Delete a number of messages from the channel',
        usage:       '~clear <amount>',
        example:     '~clear 20',
        category:    'moderation',
        args: [
            { name: 'amount', type: 'integer', required: true },
        ],
    },

    lock: {
        command:     'lock',
        description: 'Lock the current channel',
        usage:       '~lock',
        example:     '~lock',
        category:    'moderation',
        args: [],
    },

    unlock: {
        command:     'unlock',
        description: 'Unlock the current channel',
        usage:       '~unlock',
        example:     '~unlock',
        category:    'moderation',
        args: [],
    },

    slow: {
        command:     'slowmode',
        description: 'Set channel slowmode (0 to disable)',
        usage:       '~slow <seconds>',
        example:     '~slow 5',
        category:    'moderation',
        args: [
            { name: 'seconds', type: 'integer', required: true },
        ],
    },

    sb: {
        command:     'softban',
        description: 'Ban then immediately unban to purge messages',
        usage:       '~sb @user [reason]',
        example:     '~sb @User Message spam',
        category:    'moderation',
        args: [
            { name: 'target', type: 'user',   required: true  },
            { name: 'reason', type: 'string',  required: false, rest: true },
        ],
    },

    history: {
        command:     'modlogs',
        description: "View a user's moderation history",
        usage:       '~history @user',
        example:     '~history @User',
        category:    'moderation',
        args: [
            { name: 'user', type: 'user', required: true },
        ],
    },

    case: {
        command:     'case',
        description: 'Look up a specific moderation case by ID',
        usage:       '~case <id>',
        example:     '~case 14',
        category:    'moderation',
        args: [
            { name: 'id', type: 'integer', required: true },
        ],
    },

    ecase: {
        command:     'editcase',
        description: 'Edit the reason on a moderation case',
        usage:       '~ecase <id> <new reason>',
        example:     '~ecase 14 Updated reason here',
        category:    'moderation',
        args: [
            { name: 'id',     type: 'integer', required: true  },
            { name: 'reason', type: 'string',   required: true, rest: true },
        ],
    },

    void: {
        command:     'void',
        description: 'Nullify a moderation case',
        usage:       '~void <id> [reason]',
        example:     '~void 14 Was a mistake',
        category:    'moderation',
        args: [
            { name: 'id',     type: 'integer', required: true  },
            { name: 'reason', type: 'string',   required: false, rest: true },
        ],
    },

    ms: {
        command:     'modstats',
        description: 'View moderation statistics for a moderator',
        usage:       '~ms [@moderator]',
        example:     '~ms @Mod',
        category:    'moderation',
        args: [
            { name: 'moderator', type: 'user', required: false },
        ],
    },

    // ══════════════════════════════════════════════════════
    //  ECONOMY
    // ══════════════════════════════════════════════════════

    bal: {
        command:     'balance',
        description: 'Check your or another user\'s balance',
        usage:       '~bal [@user]',
        example:     '~bal @User',
        category:    'economy',
        args: [
            { name: 'user', type: 'user', required: false },
        ],
    },

    dep: {
        command:     'deposit',
        description: 'Deposit coins into your bank',
        usage:       '~dep <amount|all>',
        example:     '~dep 500',
        category:    'economy',
        args: [
            { name: 'amount', type: 'string', required: true },
        ],
    },

    with: {
        command:     'withdraw',
        description: 'Withdraw coins from your bank',
        usage:       '~with <amount>',
        example:     '~with 200',
        category:    'economy',
        args: [
            { name: 'amount', type: 'integer', required: true },
        ],
    },

    daily: {
        command:     'daily',
        description: 'Claim your daily reward',
        usage:       '~daily',
        example:     '~daily',
        category:    'economy',
        args: [],
    },

    work: {
        command:     'work',
        description: 'Work to earn coins',
        usage:       '~work',
        example:     '~work',
        category:    'economy',
        args: [],
    },

    rob: {
        command:     'rob',
        description: 'Attempt to rob another user',
        usage:       '~rob @user',
        example:     '~rob @RichUser',
        category:    'economy',
        args: [
            { name: 'user', type: 'user', required: true },
        ],
    },

    fish: {
        command:     'fish',
        description: 'Go fishing to earn coins',
        usage:       '~fish',
        example:     '~fish',
        category:    'economy',
        args: [],
    },

    mine: {
        command:     'mine',
        description: 'Mine to earn coins',
        usage:       '~mine',
        example:     '~mine',
        category:    'economy',
        args: [],
    },

    crime: {
        command:     'crime',
        description: 'Commit a crime for coins (risky)',
        usage:       '~crime',
        example:     '~crime',
        category:    'economy',
        args: [],
    },

    flip: {
        command:     'gamble',
        description: 'Gamble a coin amount',
        usage:       '~flip <amount>',
        example:     '~flip 100',
        category:    'economy',
        args: [
            { name: 'amount', type: 'integer', required: true },
        ],
    },

    // ══════════════════════════════════════════════════════
    //  FUN
    // ══════════════════════════════════════════════════════

    coinflip: {
        command:     'flip',
        description: 'Flip a coin — heads or tails',
        usage:       '~coinflip',
        example:     '~coinflip',
        category:    'fun',
        args: [],
    },

    roll: {
        command:     'roll',
        description: 'Roll dice (e.g. 2d6)',
        usage:       '~roll [notation]',
        example:     '~roll 2d6',
        category:    'fun',
        args: [
            { name: 'notation', type: 'string', required: false },
        ],
    },

    ship: {
        command:     'ship',
        description: 'Ship two names together',
        usage:       '~ship <name1> <name2>',
        example:     '~ship Alice Bob',
        category:    'fun',
        args: [
            { name: 'name1', type: 'string', required: true  },
            { name: 'name2', type: 'string', required: false },
        ],
    },

    fight: {
        command:     'fight',
        description: 'Fight against another user',
        usage:       '~fight @user',
        example:     '~fight @Enemy',
        category:    'fun',
        args: [
            { name: 'opponent', type: 'user', required: true },
        ],
    },

    mock: {
        command:     'mock',
        description: 'mOcK SoMeOnE\'s TeXt',
        usage:       '~mock <text>',
        example:     '~mock I am very smart',
        category:    'fun',
        args: [
            { name: 'text', type: 'string', required: true, rest: true },
        ],
    },

    // ══════════════════════════════════════════════════════
    //  UTILITY
    // ══════════════════════════════════════════════════════

    av: {
        command:     'avatar',
        description: 'Get a user\'s avatar',
        usage:       '~av [@user]',
        example:     '~av @User',
        category:    'utility',
        args: [
            { name: 'target', type: 'user', required: false },
        ],
    },

    si: {
        command:     'serverinfo',
        description: 'Display server information',
        usage:       '~si',
        example:     '~si',
        category:    'utility',
        args: [],
    },

    ui: {
        command:     'userinfo',
        description: 'Display information about a user',
        usage:       '~ui [@user]',
        example:     '~ui @User',
        category:    'utility',
        args: [
            { name: 'target', type: 'user', required: false },
        ],
    },

    whois: {
        command:     'whois',
        description: 'Detailed user lookup with mod history',
        usage:       '~whois [@user]',
        example:     '~whois @User',
        category:    'utility',
        args: [
            { name: 'user', type: 'user', required: false },
        ],
    },

    say: {
        command:     'say',
        description: 'Make the bot say something',
        usage:       '~say <message>',
        example:     '~say Hello everyone!',
        category:    'utility',
        subcommand:  'text',
        args: [
            { name: 'message', type: 'string', required: true, rest: true },
        ],
    },

    quote: {
        command:     'quote',
        description: 'Quote a message by its ID',
        usage:       '~quote <messageId>',
        example:     '~quote 1234567890123456789',
        category:    'utility',
        args: [
            { name: 'message_id', type: 'string', required: true },
        ],
    },

    remind: {
        command:     'remindme',
        description: 'Set a reminder (time: 10m, 2h, 1d)',
        usage:       '~remind <time> <message>',
        example:     '~remind 30m Check the oven',
        category:    'utility',
        subcommand:  'set',
        args: [
            { name: 'time',    type: 'string', required: true  },
            { name: 'message', type: 'string', required: true, rest: true },
        ],
    },

    roles: {
        command:     'roles',
        description: 'List all roles in this server',
        usage:       '~roles',
        example:     '~roles',
        category:    'utility',
        args: [],
    },

    // ══════════════════════════════════════════════════════
    //  INFO / LEVELING
    // ══════════════════════════════════════════════════════

    ping: {
        command:     'ping',
        description: 'Check the bot\'s latency',
        usage:       '~ping',
        example:     '~ping',
        category:    'info',
        args: [],
    },

    uptime: {
        command:     'uptime',
        description: 'Check how long the bot has been online',
        usage:       '~uptime',
        example:     '~uptime',
        category:    'info',
        args: [],
    },

    rank: {
        command:     'rank',
        description: 'View your or another user\'s level rank',
        usage:       '~rank [@user]',
        example:     '~rank @User',
        category:    'info',
        args: [
            { name: 'user', type: 'user', required: false },
        ],
    },

    lb: {
        command:     'leaderboard',
        description: 'View the server leaderboard',
        usage:       '~lb',
        example:     '~lb',
        category:    'info',
        args: [],
    },

};

// ─── Category metadata for the help embed ─────────────────────────────────
export const CATEGORIES = {
    moderation: { label: '🔨 Moderation', color: 'error'   },
    economy:    { label: '💰 Economy',    color: 'success'  },
    fun:        { label: '🎮 Fun',         color: 'warning'  },
    utility:    { label: '🔧 Utility',    color: 'info'     },
    info:       { label: 'ℹ️ Info',       color: 'primary'  },
};
