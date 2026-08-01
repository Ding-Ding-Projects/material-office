import assert from 'node:assert/strict';
import test from 'node:test';

import { positionNearViewport } from '../src/renderer/ui/popovers.mjs';

test('appearance editor stays fully anchored inside the supported minimum-height viewport', () => {
  const position = positionNearViewport(
    { left: 120, right: 180, top: 220, bottom: 260, width: 60, height: 40 },
    520,
    650,
    720,
    560
  );
  assert.deepEqual(position, { left: 120, top: 10 });
  assert.ok(position.top >= 10);
});

test('popover collision logic prefers a fitting side and clamps horizontal overflow', () => {
  assert.deepEqual(
    positionNearViewport(
      { left: 690, right: 710, top: 80, bottom: 100, width: 20, height: 20 },
      430,
      240,
      720,
      560
    ),
    { left: 280, top: 108 }
  );
  assert.deepEqual(
    positionNearViewport(
      { left: 40, right: 90, top: 500, bottom: 530, width: 50, height: 30 },
      430,
      240,
      720,
      560
    ),
    { left: 40, top: 252 }
  );
});
