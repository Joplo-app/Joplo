import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { skillTopic } from '../src/guide.ts';
import { COMPONENT_DOCS } from '../../../plugins/ui/src/catalog.ts';
import { en } from '../../web/src/i18n/en.ts';
import { boardEn } from '../../web/src/i18n/board/en.ts';

it('quotes the actual English UI labels in Agent guides and server instructions', () => {
  expect(skillTopic('demo')).toContain(en.player.followDirector);
  expect(skillTopic('demo')).toContain(boardEn.board.appearance);
  expect(skillTopic('selection')).toContain(boardEn.board.openInEditor);
  expect(skillTopic('publish')).toContain(en.player.followDirector);
  expect(COMPONENT_DOCS.Thinking).toContain(en.stage.thoughtFor('…').replace(/^· /,''));
  expect(readFileSync(new URL('../../server/src/dev.ts',import.meta.url),'utf8')).toContain(boardEn.board.openInEditor);
});
