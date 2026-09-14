import { DiffUtils, Vector2 } from './math.js';
import { DifficultyObject as OsuDifficultyHitObject } from './objects.js';

function EvaluateDifficultyOf(current, withSliderTravelDistance) {
    let osuCurrObj = current;
    let osuLastObj = current.Previous();

    if (current.BaseObject.isSpinner || current.Index <= 1 || osuLastObj.BaseObject.isSpinner) return 0;

    const wide_angle_multiplier = 9.67;
    const acute_angle_multiplier = 2.41;
    const slider_multiplier = 1.5;
    const velocity_change_multiplier = 0.9;

    // WARNING: Increasing this multiplier beyond 1.02 reduces difficulty as distance increases. Refer to the desmos link above the wiggle bonus calculation
    const wiggle_multiplier = 1.02;

    let osuLast2Obj = current.Previous(2);

    const radius = OsuDifficultyHitObject.NORMALISED_RADIUS;
    const diameter = OsuDifficultyHitObject.NORMALISED_DIAMETER;

    // Calculate the velocity to the current hitobject, which starts with a base distance / time assuming the last object is a hitcircle.
    let currDistance = withSliderTravelDistance ? osuCurrObj.LazyJumpDistance : osuCurrObj.JumpDistance;
    let currVelocity = currDistance / osuCurrObj.AdjustedDeltaTime;

    // But if the last object is a slider, then we extend the travel velocity through the slider into the current object.
    if (osuLastObj.BaseObject.isSlider && withSliderTravelDistance) {
        let sliderDistance = osuLastObj.LazyTravelDistance + osuCurrObj.LazyJumpDistance;
        currVelocity = Math.max(currVelocity, sliderDistance / osuCurrObj.AdjustedDeltaTime);
    }

    let prevDistance = withSliderTravelDistance ? osuLastObj.LazyJumpDistance : osuLastObj.JumpDistance;
    let prevVelocity = prevDistance / osuLastObj.AdjustedDeltaTime;

    let snapDifficulty = currVelocity; // Start difficulty with regular velocity.

    // Penalize angle repetition.
    snapDifficulty *= vectorAngleRepetition(osuCurrObj, osuLastObj);

    if (osuCurrObj.Angle != null && osuLastObj.Angle != null) {
        let currAngle = osuCurrObj.Angle;
        let lastAngle = osuLastObj.Angle;

        // Rewarding angles, take the smaller velocity as base.
        let velocityInfluence = Math.min(currVelocity, prevVelocity);

        let acuteAngleBonus = 0;

        if (
            Math.max(osuCurrObj.AdjustedDeltaTime, osuLastObj.AdjustedDeltaTime) <
            1.25 * Math.min(osuCurrObj.AdjustedDeltaTime, osuLastObj.AdjustedDeltaTime)
        ) {
            // If rhythms are the same.
            acuteAngleBonus = CalcAngleAcuteness(currAngle);

            // Penalize angle repetition. It is important to do it _before_ multiplying by anything because we compare raw acuteness here
            acuteAngleBonus *=
                0.08 + 0.92 * (1 - Math.min(acuteAngleBonus, DiffUtils.Pow(CalcAngleAcuteness(lastAngle), 3)));

            // Apply acute angle bonus for BPM above 300 1/2 and distance more than one diameter
            acuteAngleBonus *=
                velocityInfluence *
                DiffUtils.Smootherstep(DiffUtils.MillisecondsToBPM(osuCurrObj.AdjustedDeltaTime, 2), 300, 400) *
                DiffUtils.Smootherstep(currDistance, 0, diameter * 2);
        }

        let wideAngleBonus = calcAngleWideness(currAngle);

        // Penalize angle repetition. It is important to do it _before_ multiplying by velocity because we compare raw wideness here
        wideAngleBonus *= 0.25 + 0.75 * (1 - Math.min(wideAngleBonus, DiffUtils.Pow(calcAngleWideness(lastAngle), 3)));

        // Rescaling velocity for the wide angle bonus
        const wide_angle_time_scale = 1.45;
        let wideAngleCurrVelocity = currDistance / DiffUtils.Pow(osuCurrObj.AdjustedDeltaTime, wide_angle_time_scale);
        let wideAnglePrevVelocity = prevDistance / DiffUtils.Pow(osuLastObj.AdjustedDeltaTime, wide_angle_time_scale);

        if (osuLastObj.BaseObject.isSlider && withSliderTravelDistance) {
            let sliderDistance = osuLastObj.LazyTravelDistance + osuCurrObj.LazyJumpDistance;
            wideAngleCurrVelocity = Math.max(
                wideAngleCurrVelocity,
                sliderDistance / DiffUtils.Pow(osuCurrObj.AdjustedDeltaTime, wide_angle_time_scale),
            );
        }

        wideAngleBonus *= Math.min(wideAngleCurrVelocity, wideAnglePrevVelocity);

        if (osuLast2Obj != null) {
            // If objects just go back and forth through a middle point - don't give as much wide bonus
            // Use Previous(2) and Previous(0) because angles calculation is done prevprev-prev-curr, so any object's angle's center point is always the previous object
            let lastBaseObject = osuLastObj.BaseObject;
            let last2BaseObject = osuLast2Obj.BaseObject;

            let distance = Vector2.Distance(last2BaseObject.StackedPosition, lastBaseObject.StackedPosition);

            if (distance < 1) {
                wideAngleBonus *= 1 - 0.55 * (1 - distance);
            }
        }

        // Add in acute angle bonus or wide angle bonus, whichever is larger.
        snapDifficulty += Math.max(acuteAngleBonus * acute_angle_multiplier, wideAngleBonus * wide_angle_multiplier);

        // Apply wiggle bonus for jumps that are [radius, 3*diameter] in distance, with < 110 angle
        // https://www.desmos.com/calculator/dp0v0nvowc
        let wiggleBonus =
            velocityInfluence *
            DiffUtils.Smootherstep(currDistance, radius, diameter) *
            DiffUtils.Pow(DiffUtils.ReverseLerp(currDistance, diameter * 3, diameter), 1.8) *
            DiffUtils.Smootherstep(currAngle, DiffUtils.DegreesToRadians(110), DiffUtils.DegreesToRadians(60)) *
            DiffUtils.Smootherstep(prevDistance, radius, diameter) *
            DiffUtils.Pow(DiffUtils.ReverseLerp(prevDistance, diameter * 3, diameter), 1.8) *
            DiffUtils.Smootherstep(lastAngle, DiffUtils.DegreesToRadians(110), DiffUtils.DegreesToRadians(60));

        snapDifficulty += wiggleBonus * wiggle_multiplier;
    }

    if (Math.max(prevVelocity, currVelocity) != 0) {
        if (withSliderTravelDistance) {
            // We want to use just the object jump without slider velocity when awarding differences
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
            (diameter * 1.25) / Math.min(osuCurrObj.AdjustedDeltaTime, osuLastObj.AdjustedDeltaTime),
            Math.abs(prevVelocity - currVelocity),
        );

        let velocityChangeBonus = overlapVelocityBuff * distRatio;

        // Penalize for rhythm changes.
        velocityChangeBonus *= DiffUtils.Pow(
            Math.min(osuCurrObj.AdjustedDeltaTime, osuLastObj.AdjustedDeltaTime) /
                Math.max(osuCurrObj.AdjustedDeltaTime, osuLastObj.AdjustedDeltaTime),
            2,
        );

        snapDifficulty += velocityChangeBonus * velocity_change_multiplier;
    }

    // Reward sliders based on velocity.
    if (osuCurrObj.BaseObject.isSlider && withSliderTravelDistance) {
        let sliderBonus = osuCurrObj.TravelDistance / osuCurrObj.TravelTime;
        snapDifficulty += (sliderBonus < 1 ? sliderBonus : DiffUtils.Pow(sliderBonus, 0.75)) * slider_multiplier;
    }

    // Apply high circle size bonus
    snapDifficulty *= osuCurrObj.SmallCircleBonus;

    snapDifficulty *= highBpmBonus(osuCurrObj.AdjustedDeltaTime);

    return snapDifficulty;
}

function highBpmBonus(ms) {
    return 1 / (1 - DiffUtils.Pow(0.03, DiffUtils.Pow(ms / 1000, 0.65)));
}

function vectorAngleRepetition(current, previous) {
    if (current.Angle == null || previous.Angle == null) return 1;

    const note_limit = 6;
    const maximum_repetition_nerf = 0.15;
    const maximum_vector_influence = 0.5;

    let constantAngleCount = 0;

    for (let index = 0; index < note_limit; index++) {
        let prevObj = current.Previous(index);

        if (prevObj == null) break;

        // Only consider vectors in the same jump section, stopping to change rhythm ruins momentum
        if (
            Math.max(current.AdjustedDeltaTime, prevObj.AdjustedDeltaTime) >
            1.1 * Math.min(current.AdjustedDeltaTime, prevObj.AdjustedDeltaTime)
        )
            break;

        if (prevObj.NormalisedVectorAngle != null && current.NormalisedVectorAngle != null) {
            let angleDifference = Math.abs(current.NormalisedVectorAngle - prevObj.NormalisedVectorAngle);
            // Refer to this desmos for tuning, constants need to be precise so that values stay within the range of 0 and 1.
            // https://www.desmos.com/calculator/a8jesv5sv2
            constantAngleCount += Math.cos(8 * Math.min(DiffUtils.DegreesToRadians(11.25), angleDifference));
        }
    }

    let vectorRepetition = DiffUtils.Pow(Math.min(0.5 / constantAngleCount, 1), 2);

    let stackFactor = DiffUtils.Smootherstep(current.LazyJumpDistance, 0, OsuDifficultyHitObject.NORMALISED_DIAMETER);

    let currAngle = current.Angle;
    let lastAngle = previous.Angle;

    let angleDifferenceAdjusted = Math.cos(
        2 * Math.min(DiffUtils.DegreesToRadians(45), Math.abs(currAngle - lastAngle) * stackFactor),
    );

    let baseNerf = 1 - maximum_repetition_nerf * CalcAngleAcuteness(lastAngle) * angleDifferenceAdjusted;

    return DiffUtils.Pow(baseNerf + (1 - baseNerf) * vectorRepetition * maximum_vector_influence * stackFactor, 2);
}

function calcAngleWideness(angle) {
    return DiffUtils.Smoothstep(angle, DiffUtils.DegreesToRadians(40), DiffUtils.DegreesToRadians(140));
}

function CalcAngleAcuteness(angle) {
    return DiffUtils.Smoothstep(angle, DiffUtils.DegreesToRadians(140), DiffUtils.DegreesToRadians(40));
}

export const SnapAimEvaluator = { EvaluateDifficultyOf, CalcAngleAcuteness };
