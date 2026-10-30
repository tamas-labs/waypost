/** "07:48" within an hour, "1:23" (hours and minutes, rounded up) above it (DESIGN_HANDOFF 6, G3). */
export function countdownText(seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (seconds < 3600) return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  const minutes = Math.ceil(seconds / 60);
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}
