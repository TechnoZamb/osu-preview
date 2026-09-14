import { DiffUtils, Vector2 } from './math.js';
import { DifficultyObject as OsuDifficultyHitObject } from './objects.js';

function EvaluateDifficultyOf(current) {
    if (current.BaseObject.isSpinner) return 0;

    const distance_cap = OsuDifficultyHitObject.NORMALISED_DIAMETER * 1.2; // 1.2 circles distance between centers

    let osuCurrObj = current;
    let osuPrevObj = current.Index > 0 ? current.Previous() : null;

    let travelDistance = osuPrevObj?.LazyTravelDistance ?? 0;
    let distance = travelDistance + osuCurrObj.LazyJumpDistance;

    let distanceScaled = Math.min(distance, distance_cap) / distance_cap;

    let agilityDifficulty = (distanceScaled * 1000) / osuCurrObj.AdjustedDeltaTime;

    agilityDifficulty *= DiffUtils.Pow(osuCurrObj.SmallCircleBonus, 1.5);

    agilityDifficulty *= highBpmBonus(osuCurrObj.AdjustedDeltaTime);

    return agilityDifficulty;
}

function highBpmBonus(ms) {
    return 1 / (1 - DiffUtils.Pow(0.2, ms / 1000));
}

export const AgilityEvaluator = { EvaluateDifficultyOf };
