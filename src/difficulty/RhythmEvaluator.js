import { DiffUtils, Vector2 } from './math.js';
import { DifficultyObject as OsuDifficultyHitObject } from './objects.js';

function EvaluateDifficultyOf(current) {
    if (current.BaseObject.isSpinner) return 0;

    const history_time_max = 5 * 1000; // 5 seconds
    const history_objects_max = 32;
    const rhythm_overall_multiplier = 0.95;

    let rhythmComplexitySum = 0;

    let deltaDifferenceEpsilon = current.HitWindowGreat * 0.3;

    let island = new Island(2147483647);
    let previousIsland = new Island(2147483647);

    const islands = [];

    let startDifficulty = 0; // store the difficulty of the current start of an island to buff for tighter rhythms

    let firstDeltaSwitch = false;

    let historicalNoteCount = Math.min(current.Index, history_objects_max);

    let rhythmStart = 0;

    while (
        rhythmStart < historicalNoteCount - 2 &&
        current.StartTime - current.Previous(rhythmStart).StartTime < history_time_max
    )
        rhythmStart++;

    let prevObj = current.Previous(rhythmStart);
    let prevPrevObj = current.Previous(rhythmStart + 1);

    // we go from the furthest object back to the current one
    for (let i = rhythmStart; i > 0; i--) {
        let currObj = current.Previous(i - 1);

        if (currObj.BaseObject.isSpinner) continue;

        // scales note 0 to 1 from history to now
        let timeDecay = (history_time_max - (current.StartTime - currObj.StartTime)) / history_time_max;
        let noteDecay = (historicalNoteCount - i) / historicalNoteCount;

        let currHistoricalDecay = Math.min(noteDecay, timeDecay); // either we're limited by time or limited by object count.

        // Use custom cap value to ensure that at this point delta time is actually zero
        const delta_min_value = 1e-7;

        let currDelta = Math.max(currObj.DeltaTime, delta_min_value);
        let prevDelta = Math.max(prevObj.DeltaTime, delta_min_value);

        let deltaDifference = Math.abs(prevDelta - currDelta);

        // Make sure to always have the current island initialised - if we don't do it here it will only initialise on the next rhythm change
        if (island.Delta == 2147483647) island = new Island(Math.trunc(currDelta));

        // calculate how much current delta difference deserves a rhythm bonus
        // this function is meant to reduce rhythm bonus for deltas that are multiples of each other (i.e 100 and 200)
        let deltaDifferenceRatio = Math.max(prevDelta, currDelta) / Math.min(prevDelta, currDelta);

        // reduce ratio bonus if delta difference is too big
        let differenceMultiplier = DiffUtils.Clamp(2.0 - deltaDifferenceRatio / 8.0, 0.0, 1.0);

        let windowPenalty = DiffUtils.Clamp((deltaDifference - deltaDifferenceEpsilon) / deltaDifferenceEpsilon, 0, 1);

        let effectiveDifficulty = getEffectiveDifficulty(deltaDifferenceRatio) * windowPenalty * differenceMultiplier;

        // if previous object is a slider it might be easier to tap since you don't have to do a whole tapping motion
        // while a full deltatime might end up some weird ratio the "unpress->tap" motion might be simple
        // for example a slider-circle-circle pattern should be evaluated as a regular triple and not as a single->double
        if (prevObj.BaseObject.isSlider) {
            let sliderLazyEndDelta = currObj.MinimumJumpTime;
            let sliderLazyDeltaDifferenceRatio =
                Math.max(sliderLazyEndDelta, currDelta) / Math.min(sliderLazyEndDelta, currDelta);

            let sliderRealEndDelta = currObj.LastObjectEndDeltaTime;
            let sliderRealDeltaDifferenceRatio =
                Math.max(sliderRealEndDelta, currDelta) / Math.min(sliderRealEndDelta, currDelta);

            let sliderEffectiveDifficulty = Math.min(
                getEffectiveDifficulty(sliderLazyDeltaDifferenceRatio),
                getEffectiveDifficulty(sliderRealDeltaDifferenceRatio),
            );
            effectiveDifficulty = Math.min(sliderEffectiveDifficulty, effectiveDifficulty);
        }

        if (deltaDifference < deltaDifferenceEpsilon) {
            // island is still progressing
            island.AddDelta(Math.trunc(currDelta));
        }

        if (firstDeltaSwitch) {
            if (deltaDifference > deltaDifferenceEpsilon) {
                // bpm change is into slider, this is easy acc window
                if (currObj.BaseObject.isSlider) effectiveDifficulty *= 0.5;

                // repeated island polarity (2 -> 4, 3 -> 5)
                if (island.IsSimilarPolarity(previousIsland, deltaDifferenceEpsilon)) effectiveDifficulty *= 0.5;

                // previous increase happened a note ago, 1/1->1/2-1/4, dont want to buff this.
                if (
                    Math.max(prevPrevObj.DeltaTime, delta_min_value) > prevDelta + deltaDifferenceEpsilon &&
                    prevDelta > currDelta + deltaDifferenceEpsilon
                )
                    effectiveDifficulty *= 0.125;

                // repeated island size (ex: triplet -> triplet)
                // TODO: remove this nerf since its staying here only for balancing purposes because of the flawed ratio calculation
                if (previousIsland.DeltaCount == island.DeltaCount) effectiveDifficulty *= 0.5;

                let isSpeedingUp = prevDelta > currDelta + deltaDifferenceEpsilon;

                if (isSpeedingUp) effectiveDifficulty *= 0.65;

                let found = false;

                for (const existingIsland of islands) {
                    if (existingIsland.AlmostEquals(island, deltaDifferenceEpsilon)) {
                        // only increase island occurrences if they're going one after another
                        if (previousIsland.AlmostEquals(island, deltaDifferenceEpsilon)) existingIsland.Occurrences++;

                        // repeated island (ex: triplet -> triplet)
                        let power = DiffUtils.Logistic(island.Delta, 58.33, 0.24, 2.75);
                        effectiveDifficulty *= Math.min(
                            3.0 / existingIsland.Occurrences,
                            DiffUtils.Pow(1.0 / existingIsland.Occurrences, power),
                        );

                        found = true;
                        break;
                    }
                }

                if (!found && island.DeltaCount > 0) islands.push(island);

                // scale down the difficulty if the object is double-tappable
                effectiveDifficulty *= 1 - prevObj.CalculateDoubleTapFeasibility(currObj) * 0.75;

                if (island.DeltaCount > 1) {
                    rhythmComplexitySum += Math.sqrt(effectiveDifficulty * startDifficulty) * currHistoricalDecay;
                } else {
                    // constant difficulty for single-note islands
                    rhythmComplexitySum += 0.7 * currHistoricalDecay;
                }

                startDifficulty = effectiveDifficulty;

                if (prevDelta + deltaDifferenceEpsilon < currDelta)
                    // we're slowing down, stop counting
                    firstDeltaSwitch = false; // if we're speeding up, this stays true and we keep counting island size.

                previousIsland = island;
                island = new Island(Math.trunc(currDelta));
            }
        } else if (prevDelta > currDelta + deltaDifferenceEpsilon) {
            // we're speeding up
            // Begin counting island until we change speed again.
            firstDeltaSwitch = true;

            // bpm change is into slider, this is easy acc window
            if (currObj.BaseObject.isSlider) effectiveDifficulty *= 0.6;

            // bpm change was from a slider, this is easier typically than circle -> circle
            // unintentional side effect is that bursts with kicksliders at the ends might have lower difficulty than bursts without sliders
            if (prevObj.BaseObject.isSlider) effectiveDifficulty *= 0.6;

            startDifficulty = effectiveDifficulty;

            island = new Island(Math.trunc(currDelta));
        }

        prevPrevObj = prevObj;
        prevObj = currObj;
    }

    // If the current island is long we don't want the sum to have as big of an effect
    rhythmComplexitySum *= DiffUtils.ReverseLerp(island.DeltaCount, 22, 3);

    return Math.sqrt(4 + rhythmComplexitySum * rhythm_overall_multiplier) / 2.0; // produces multiplier that can be applied to strain. range [1, infinity) (not really though)
}
function getEffectiveDifficulty(deltaDifferenceRatio) {
    const rhythm_ratio_difficulty_multiplier = 26.0;

    // Take only the fractional part of the value since we're only interested in punishing multiples
    let deltaDifferenceFraction = deltaDifferenceRatio - Math.trunc(deltaDifferenceRatio);

    return (
        1.0 + rhythm_ratio_difficulty_multiplier * Math.min(0.5, DiffUtils.SmoothstepBellCurve(deltaDifferenceFraction))
    );
}

class Island {
    constructor(delta) {
        this.Delta = Math.max(delta, 25);
        this.DeltaCount = 1;
        this.Occurrences = 1;
    }
    AddDelta(delta) {
        if (this.Delta === 2147483647) this.Delta = Math.max(delta, 25);
        this.DeltaCount++;
    }
    IsSimilarPolarity(other, epsilon) {
        return (
            this.DeltaCount > 1 &&
            other.DeltaCount > 1 &&
            Math.abs(this.Delta - other.Delta) < epsilon &&
            this.DeltaCount % 2 === other.DeltaCount % 2
        );
    }
    AlmostEquals(other, epsilon) {
        return Math.abs(this.Delta - other.Delta) < epsilon && this.DeltaCount === other.DeltaCount;
    }
}

export const RhythmEvaluator = { EvaluateDifficultyOf };
