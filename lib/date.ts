export function formatDate(
  dateStr: string,
  monthFormat: 'short' | 'long' | 'numeric' = 'short'
): string {
  // 'YYYY-MM-DD' parses as UTC midnight, so formatting in the host timezone
  // renders the previous day anywhere west of UTC. Pin the output to UTC so a
  // date reads identically on the server, in a client component, and in tests.
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: monthFormat,
    day: 'numeric',
  });
}
