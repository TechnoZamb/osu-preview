import { DiffUtils, Vector2 } from './math.js';
import { DifficultyObject as OsuDifficultyHitObject } from './objects.js';
import { SnapAimEvaluator } from './SnapAimEvaluator.js';

function EvaluateDifficultyOf(current, withSliderTravelDistance) {
    let osuCurrObj = current;
    let osuLastObj = current.Previous();

    if (current.BaseObject.isSpinner || current.Index <= 1 || osuLastObj.BaseObject.isSpinner) return 0;

    const velocity_change_multiplier = 0.52;

    let osuLastLastObj = current.Previous(1);

    let currDistance = withSliderTravelDistance ? osuCurrObj.LazyJumpDistance : osuCurrObj.JumpDistance;
    let prevDistance = withSliderTravelDistance ? osuLastObj.LazyJumpDistance : osuLastObj.JumpDistance;

    let currVelocity = currDistance / osuCurrObj.AdjustedDeltaTime;

    if (osuLastObj.BaseObject.isSlider && withSliderTravelDistance) {
        // If the last object is a slider, then we extend the travel velocity through the slider into the current object.
        let sliderDistance = osuLastObj.LazyTravelDistance + osuCurrObj.LazyJumpDistance;
        currVelocity = Math.max(currVelocity, sliderDistance / osuCurrObj.AdjustedDeltaTime);
    }

    let prevVelocity = prevDistance / osuLastObj.AdjustedDeltaTime;

    let flowDifficulty = currVelocity;

    // Apply high circle size bonus to the base velocity.
    // We use reduced CS bonus here because the bonus was made for an evaluator with a different d/t scaling
    flowDifficulty *= Math.sqrt(osuCurrObj.SmallCircleBonus);

    // Rhythm changes are harder to flow
    flowDifficulty *=
        1 +
        Math.min(
            0.25,
            DiffUtils.Pow(
                (Math.max(osuCurrObj.AdjustedDeltaTime, osuLastObj.AdjustedDeltaTime) -
                    Math.min(osuCurrObj.AdjustedDeltaTime, osuLastObj.AdjustedDeltaTime)) /
                    50,
                4,
            ),
        );

    if (osuCurrObj.Angle != null && osuLastObj.Angle != null) {
        let angleDifference = Math.abs(osuCurrObj.Angle - osuLastObj.Angle);
        let angleDifferenceAdjusted = Math.sin(angleDifference / 2) * 180.0;
        let angularVelocity = angleDifferenceAdjusted / (osuCurrObj.AdjustedDeltaTime * 0.1);

        // Low angular velocity flow (angles are consistent) is easier to follow than erratic flow
        flowDifficulty *= 0.8 + Math.sqrt(angularVelocity / 270.0);
    }

    // If all three notes are overlapping - don't reward bonuses as you don't have to do additional movement
    let overlappedNotesWeight = 1;

    if (current.Index > 2) {
        let o1 = calculateOverlapFactor(osuCurrObj, osuLastObj);
        let o2 = calculateOverlapFactor(osuCurrObj, osuLastLastObj);
        let o3 = calculateOverlapFactor(osuLastObj, osuLastLastObj);

        overlappedNotesWeight = 1 - o1 * o2 * o3;
    }

    if (osuCurrObj.Angle != null) {
        // Acute angles are also hard to flow
        flowDifficulty += currVelocity * SnapAimEvaluator.CalcAngleAcuteness(osuCurrObj.Angle) * overlappedNotesWeight;
    }

    if (Math.max(prevVelocity, currVelocity) != 0) {
        if (withSliderTravelDistance) {
            currVelocity = currDistance / osuCurrObj.AdjustedDeltaTime;
        }

        // Scale with ratio of difference compared to 0.5 * max dist.
        let distRatio = DiffUtils.Smoothstep(
            Math.abs(prevVelocity - currVelocity) / Math.max(prevVelocity, currVelocity),
            0,
            1,
        );

        // Reward for % distance up to 125 / strainTime for overlaps where velocity is still changing.
        let overlapVelocityBuff = Math.min(
            (OsuDifficultyHitObject.NORMALISED_DIAMETER * 1.25) /
                Math.min(osuCurrObj.AdjustedDeltaTime, osuLastObj.AdjustedDeltaTime),
            Math.abs(prevVelocity - currVelocity),
        );

        flowDifficulty += overlapVelocityBuff * distRatio * overlappedNotesWeight * velocity_change_multiplier;
    }

    if (osuCurrObj.BaseObject.isSlider && withSliderTravelDistance) {
        // Include slider velocity to make velocity more consistent with snap
        flowDifficulty += osuCurrObj.TravelDistance / osuCurrObj.TravelTime;
    }

    // Final velocity is being raised to a power because flow difficulty scales harder with both high distance and time, and we want to account for that
    flowDifficulty = DiffUtils.Pow(flowDifficulty, 1.45);

    // Reduce difficulty for low spacing since spacing below radius is always to be flowed
    return flowDifficulty * DiffUtils.Smootherstep(currDistance, 0, OsuDifficultyHitObject.NORMALISED_RADIUS);
}

function calculateOverlapFactor(first, second) {
    let firstBase = first.BaseObject;
    let secondBase = second.BaseObject;
    let objectRadius = firstBase.Radius;

    let distance = Vector2.Distance(firstBase.StackedPosition, secondBase.StackedPosition);
    return DiffUtils.Clamp(1 - DiffUtils.Pow(Math.max(distance - objectRadius, 0) / objectRadius, 2), 0, 1);
}

export const FlowAimEvaluator = { EvaluateDifficultyOf };
