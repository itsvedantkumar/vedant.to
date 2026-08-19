export function formatDate(
  dateStr: string,
  monthFormat: 'short' | 'long' | 'numeric' = 'short'
): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: monthFormat,
    day: 'numeric',
  });
}
