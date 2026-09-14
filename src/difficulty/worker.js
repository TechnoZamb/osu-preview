import { decode } from './beatmap.js';
import { calculateStrains, calculatePP } from './engine.js';
import { canonicalMods } from './objects.js';

let map, durationMs;
const cache = new Map();
self.onmessage = ({ data }) => {
    const { id, type } = data;
    try {
        if (type === 'load') {
            map = decode(data.text);
            durationMs = data.durationMs;
            cache.clear();
        }
        const key = canonicalMods(data.mods).join(',');
        let result = cache.get(key);
        if (!result) {
            result = { trace: calculateStrains(map, data.mods, durationMs), pp: null };
            cache.set(key, result);
            if (cache.size > 8) cache.delete(cache.keys().next().value);
        } else {
            cache.delete(key);
            cache.set(key, result);
        }
        if (data.includePP && !result.pp) result.pp = calculatePP(result.trace);
        self.postMessage({
            id,
            key,
            gaps: result.trace.gaps,
            graph: result.trace.graph,
            bucketMs: result.trace.bucketMs,
            pp: data.includePP ? result.pp : null,
        });
    } catch (error) {
        self.postMessage({ id, error: error.message || 'Difficulty calculation failed' });
    }
};
