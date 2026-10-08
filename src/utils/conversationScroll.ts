/** Une page correspond a la hauteur visible de la conversation. */
export function shouldFollowMessages(offset: number, viewportHeight: number): boolean {
  return offset <= Math.max(0, viewportHeight);
}
