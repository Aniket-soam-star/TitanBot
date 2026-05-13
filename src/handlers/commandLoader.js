// 📁 REPLACE → src/handlers/commandLoader.js
// Fix: Bot has 118 top-level commands. Discord hard-limits at 100.
// Previous code just took the first 100 alphabetically, cutting Welcome,
// Verification, Utility, Voice etc. which are critical.
//
// Fix: LOW_PRIORITY_COMMANDS set defines the 18 least-essential commands.
// Before truncating to 100, the array is sorted so those 18 move to the end.
// Result: all 100 important commands register, 18 niche ones don't.
//
// The 18 that won't register (can restore by removing from LOW_PRIORITY if you
// delete other commands to make room):
//   overview, firstmsg, report            (Core/Utility — redundant/niche)
//   eleaderboard, shop, buy, inventory,   (Economy — nice-to-have)
//   crime, slut, beg                      (Economy — niche)
//   birthday, apply, app-admin            (Birthday/Community)
//   jointocreate, serverstats, activity   (Voice/Server features)
//   logging, reactroles                   (Setup commands)

import { Routes } from 'discord.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Commands that register last (and get cut when over 100) ──────────────────
// These are still LOADED and work if you test in guild-mode or add them back
// by removing other commands to create space.
const LOW_PRIORITY_COMMANDS = new Set([
    // Core — redundant or niche
    'overview',
    // Utility — niche
    'firstmsg',
    'report',
    // Economy — nice-to-have but not essential
    'eleaderboard',
    'shop',
    'buy',
    'inventory',
    'crime',
    'slut',
    'beg',
    // Standalone feature modules
    'birthday',
    'apply',
    'app-admin',
    'jointocreate',
    'serverstats',
    'activity',
    'logging',
    'reactroles',
]);

// ─────────────────────────────────────────────────────────────────────────────

function getSubcommandInfo(commandData) {
    const subcommands = [];

    if (commandData.options) {
        for (const option of commandData.options) {
            if (option.type === 1) {
                subcommands.push(option.name);
            } else if (option.type === 2) {
                if (option.options) {
                    for (const subOption of option.options) {
                        if (subOption.type === 1) {
                            subcommands.push(`${option.name}/${subOption.name}`);
                        }
                    }
                }
            }
        }
    }

    return subcommands;
}

async function getAllFiles(directory, fileList = []) {
    const files = await fs.readdir(directory, { withFileTypes: true });

    for (const file of files) {
        const filePath = path.join(directory, file.name);

        if (file.isDirectory()) {
            if (file.name === 'modules') {
                continue;
            }
            await getAllFiles(filePath, fileList);
        } else if (file.name.endsWith('.js')) {
            fileList.push(filePath);
        }
    }

    return fileList;
}

export async function loadCommands(client) {
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = await getAllFiles(commandsPath);

    logger.info(`Found ${commandFiles.length} command files to load`);

    const uniqueCommandNames = new Set();

    for (const filePath of commandFiles) {
        try {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const commandDir  = path.dirname(filePath);
            const category    = path.basename(commandDir);

            const commandModule = await import(`file://${filePath}`);
            const command       = commandModule.default || commandModule;

            if (!command.data || !command.execute) {
                logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`);
                continue;
            }

            command.category = category;
            command.filePath = normalizedPath;

            const primaryCommandName = command.data.name;

            if (!uniqueCommandNames.has(primaryCommandName)) {
                uniqueCommandNames.add(primaryCommandName);
                client.commands.set(primaryCommandName, command);
            }

            const subcommands = getSubcommandInfo(command.data.toJSON());
            logger.info(`Loaded command: ${primaryCommandName} from ${normalizedPath} (category: ${category})`);
            if (subcommands.length > 0) {
                logger.info(`  - Subcommands: ${subcommands.join(', ')}`);
            }

        } catch (error) {
            logger.error(`Error loading command from ${filePath}:`, error);
        }
    }

    logger.info(`Loaded ${client.commands.size} commands into memory`);
    return client.commands;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function registerCommands(client, guildId) {
    try {
        const commands        = [];
        let totalSubcommands  = 0;
        const registeredNames = new Set();

        for (const command of client.commands.values()) {
            if (command.data && typeof command.data.toJSON === 'function') {
                const commandName = command.data.name;

                if (!registeredNames.has(commandName)) {
                    registeredNames.add(commandName);
                    const commandJson = command.data.toJSON();
                    commands.push(commandJson);
                    totalSubcommands += getSubcommandInfo(commandJson).length;
                }
            } else {
                logger.warn(`Command missing data or toJSON method: ${command}`);
            }
        }

        // ── Priority sort ────────────────────────────────────────────────────
        // Sort so LOW_PRIORITY commands end up at the back of the array.
        // When we truncate to 100, they're the ones that get dropped.
        commands.sort((a, b) => {
            const aLow = LOW_PRIORITY_COMMANDS.has(a.name) ? 1 : 0;
            const bLow = LOW_PRIORITY_COMMANDS.has(b.name) ? 1 : 0;
            return aLow - bLow;
        });

        const MAX_COMMANDS = 100;

        if (commands.length > MAX_COMMANDS) {
            const dropped = commands.slice(MAX_COMMANDS).map(c => c.name);
            logger.warn(
                `Command count (${commands.length}) exceeds Discord limit (${MAX_COMMANDS}). ` +
                `Dropping ${dropped.length} low-priority commands: ${dropped.join(', ')}`
            );
        }

        const commandsToRegister = commands.slice(0, MAX_COMMANDS);
        logger.info(`Registering ${commandsToRegister.length} commands (${totalSubcommands} total including subcommands)`);

        // ── Validation ───────────────────────────────────────────────────────
        const validationErrors = [];

        function validateOptions(cmdName, options, prefix = '') {
            for (const opt of (options || [])) {
                if (opt.name?.length > 32)
                    validationErrors.push(`${cmdName} ${prefix}option "${opt.name}": name too long`);
                if (opt.description?.length > 110)
                    validationErrors.push(`${cmdName} ${prefix}option "${opt.name}": description too long`);
                for (const choice of (opt.choices || [])) {
                    if (choice.name?.length  > 100) validationErrors.push(`${cmdName} choice name too long`);
                    if (String(choice.value).length > 100) validationErrors.push(`${cmdName} choice value too long`);
                }
                if (opt.options) validateOptions(cmdName, opt.options, `${opt.name}/`);
            }
        }

        for (const cmd of commandsToRegister) {
            if (cmd.name?.length > 32)
                validationErrors.push(`Command "${cmd.name}": name too long`);
            if (cmd.description?.length > 110)
                validationErrors.push(`Command "${cmd.name}": description too long`);
            validateOptions(cmd.name, cmd.options);
        }

        if (validationErrors.length > 0) {
            logger.error('Command validation failed:');
            validationErrors.forEach(e => logger.error(`  - ${e}`));
            throw new Error(`Command validation failed with ${validationErrors.length} error(s)`);
        }

        // ── Register ─────────────────────────────────────────────────────────
        if (guildId) {
            logger.info(`DEV MODE: Registering ${commandsToRegister.length} commands for guild ${guildId}`);
            const guild = await client.guilds.fetch(guildId);
            await guild.commands.set(commandsToRegister);
            logger.info(`Successfully registered ${commandsToRegister.length} guild commands for ${guild.name}`);
        } else {
            logger.info(`PRODUCTION: Registering ${commandsToRegister.length} commands GLOBALLY`);
            logger.info('Note: Global commands may take up to 1 hour to appear in new servers.');

            await client.rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commandsToRegister }
            );

            logger.info(`Successfully registered ${commandsToRegister.length} global commands.`);
        }

    } catch (error) {
        logger.error('Error registering commands:', error);
        throw error;
    }
}

export async function reloadCommand(client, commandName) {
    const command = client.commands.get(commandName);

    if (!command) {
        return { success: false, message: `Command "${commandName}" not found` };
    }

    try {
        const commandPath = path.resolve(command.filePath);
        const moduleUrl   = pathToFileURL(commandPath);
        moduleUrl.searchParams.set('t', Date.now().toString());

        const newCommand = (await import(moduleUrl.href)).default;
        client.commands.set(commandName, newCommand);

        logger.info(`Reloaded command: ${commandName}`);
        return { success: true, message: `Successfully reloaded command "${commandName}"` };
    } catch (error) {
        logger.error(`Error reloading command "${commandName}":`, error);
        return { success: false, message: `Error reloading command: ${error.message}` };
    }
}
