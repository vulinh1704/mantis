/** Programmatic API. The CLI (`bin/mantis.js`) is a thin wrapper around these. */
export { look, launchBrowser, UnreachableError, BrowserError } from './look.js';
export { proof, resolveRunDir } from './proof.js';
export { parseLookArgs, parseProofArgs, parseViewport, parseDarkStrategy, VIEWPORT_PRESETS, UsageError } from './options.js';
export { IssueRegistry, buildReport, renderMarkdown, compressCells, expandCells } from './report.js';
export { CELL_DETECTORS, CROSS_DETECTORS, ISSUE_TYPES } from './detectors/index.js';
export { main } from './cli.js';
export { VERSION } from './util.js';
