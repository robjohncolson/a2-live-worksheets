import { buildMap, loadRubrics } from './misconception-map-sources.mjs';
import { syncMisconceptionServerAssets } from './misconception-server-assets.mjs';

const rubrics = loadRubrics();
const items = {};
for (const [itemId, rubric] of Object.entries(rubrics)) {
  items[itemId] = Object.fromEntries(rubric.elements.map(element => [element.id, []]));
}
buildMap('data/misconception-rubric-map.json', items, { rubrics });
syncMisconceptionServerAssets();
