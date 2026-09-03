/**
 * Escapes special characters in a string for safe use inside RegExp source.
 * @param {string} value - The string to escape
 * @returns {string} The escaped string
 */
export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
