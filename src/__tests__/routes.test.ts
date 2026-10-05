import { parseConversationParams, parseServerParams } from '@/navigation/routes';
import { parseConversationId, toConversationId } from '@/types/conversationId';

const UUID = '0b7d6f3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('parseConversationId', () => {
  it('accepte dm:<uuid> et room:<uuid>', () => {
    expect(parseConversationId(`dm:${UUID}`)).toEqual({ kind: 'dm', targetId: UUID });
    expect(parseConversationId(`room:${UUID}`)).toEqual({ kind: 'room', targetId: UUID });
  });
  it('est réversible avec toConversationId', () => {
    expect(toConversationId({ kind: 'room', targetId: UUID })).toBe(`room:${UUID}`);
  });
  it.each([undefined, null, 42, '', 'dm:', `x:${UUID}`, 'dm:pas-un-uuid', `dm:${UUID}:extra`, `${UUID}`])(
    'refuse %p',
    (value) => expect(parseConversationId(value)).toBeNull(),
  );
});

describe('parseConversationParams', () => {
  it('accepte un titre absent et refuse null', () => {
    expect(parseConversationParams(null)).toBeNull();
    expect(parseConversationParams({ conversationId: `dm:${UUID}` })).toEqual({
      conversationId: `dm:${UUID}`,
      title: undefined,
    });
    expect(parseServerParams(null)).toBeNull();
    expect(parseServerParams({ serverId: UUID })).toEqual({ serverId: UUID, title: undefined });
  });
  it('valide et conserve le titre', () => {
    expect(parseConversationParams({ conversationId: `dm:${UUID}`, title: 'alice' })).toEqual({
      conversationId: `dm:${UUID}`,
      title: 'alice',
    });
  });
  it('refuse des paramètres absents ou invalides', () => {
    expect(parseConversationParams(undefined)).toBeNull();
    expect(parseConversationParams({})).toBeNull();
    expect(parseConversationParams({ conversationId: 'nope' })).toBeNull();
  });
});

describe('parseServerParams', () => {
  it('valide un identifiant de serveur et conserve le titre', () => {
    expect(parseServerParams({ serverId: UUID, title: 'Chatvardage' })).toEqual({
      serverId: UUID,
      title: 'Chatvardage',
    });
  });
  it('refuse des paramètres absents ou invalides', () => {
    expect(parseServerParams(undefined)).toBeNull();
    expect(parseServerParams({})).toBeNull();
    expect(parseServerParams({ serverId: 'nope' })).toBeNull();
    expect(parseServerParams({ serverId: `dm:${UUID}` })).toBeNull();
  });
});
