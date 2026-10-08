import { shouldFollowMessages } from '@/utils/conversationScroll';
it.each([0, 30, 500, 700, -5])('suit les messages dans une page (%s)', offset => expect(shouldFollowMessages(offset, 700)).toBe(true));
it.each([701, 800, 2000])('preserve la lecture au-dela dune page (%s)', offset => expect(shouldFollowMessages(offset, 700)).toBe(false));
it('utilise la hauteur avec clavier', () => expect(shouldFollowMessages(500, 350)).toBe(false));
