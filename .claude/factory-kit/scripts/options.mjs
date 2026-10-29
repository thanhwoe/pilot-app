// Reads the plugin's boolean options, which Claude Code exports to hooks as
// CLAUDE_PLUGIN_OPTION_<KEY>. An option that is unset or empty keeps its default (on).

const OFF = new Set(['false', '0', 'no', 'off']);

/** True unless the option is explicitly turned off. */
export const optionEnabled = (value) => !OFF.has(String(value ?? '').trim().toLowerCase());
