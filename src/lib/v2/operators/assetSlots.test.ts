import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getManifestEntry } from '@/lib/v2/pipeline/manifest';
import { operatorArmsSlot, operatorLowerBodySlot, operatorModelSlot } from './assetSlots';

describe('operatorLowerBodySlot (Step 8C) — asset manifest resolution', () => {
  it('builds the exact slot name the Step 8B/8B.1 manifest entry and shipped GLB filename both use', () => {
    assert.strictEqual(operatorLowerBodySlot('kael'), 'operator-kael-lowerbody');
  });

  it('is distinct from the full-body and arms slots for the same operator', () => {
    const lower = operatorLowerBodySlot('kael');
    assert.notStrictEqual(lower, operatorModelSlot('kael'));
    assert.notStrictEqual(lower, operatorArmsSlot('kael'));
  });

  it('resolves to a real manifest entry with a budget the shipped 58,457-tri asset satisfies', () => {
    const entry = getManifestEntry(operatorLowerBodySlot('kael'));
    assert.ok(entry, 'expected a registered manifest entry for operator-kael-lowerbody');
    assert.strictEqual(entry!.slot, 'operator-kael-lowerbody');
    assert.strictEqual(entry!.category, 'operator');
    assert.ok(entry!.budget.maxTriangles >= 58_457, `manifest budget (${entry!.budget.maxTriangles}) must cover the shipped asset's real 58,457 triangles`);
  });
});
