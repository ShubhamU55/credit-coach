import { color } from './color';
import { kitShadow, overlay } from './kitB';

describe('part B tokens', () => {
  test('overlays are the translucent blacks design.md 6.4 and 6.20 name', () => {
    expect(overlay.onFinishChip).toBe('rgba(0,0,0,0.35)');
    expect(overlay.heroSegmentEmpty).toBe('rgba(0,0,0,0.4)');
  });

  test('shadows are hard offsets (zero blur) built from colour tokens', () => {
    expect(kitShadow.stepPrimary).toBe(`4px 4px 0px ${color.accentEdge}`);
    expect(kitShadow.timelinePay).toBe(`2px 2px 0px ${color.accentEdge}`);
    expect(kitShadow.scoreNow).toBe(`3px 3px 0px ${color.bg}`);
  });
});
