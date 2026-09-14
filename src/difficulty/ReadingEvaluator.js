import { DiffUtils, Vector2 } from './math.js';
import { DifficultyObject as OsuDifficultyHitObject } from './objects.js';

const reading_window_size = 3000; // 3 seconds
const distance_influence_threshold = OsuDifficultyHitObject.NORMALISED_DIAMETER * 1.5; // 1.5 circles distance between centers

function EvaluateDifficultyOf(current, hidden) {
    if (current.BaseObject.isSpinner || current.Index == 0) return 0;

    let currObj = current;
    let nextObj = current.Next();

    let velocity = Math.max(1, currObj.LazyJumpDistance / currObj.AdjustedDeltaTime); // Only allow velocity to buff

    let currentVisibleObjectDensity = retrieveCurrentVisibleObjectDensity(currObj);
    let pastObjectDifficultyInfluence = getPastObjectDifficultyInfluence(currObj);

    let constantAngleNerfFactor = getConstantAngleNerfFactor(currObj);

    let noteDensityDifficulty = calculateDensityDifficulty(
        nextObj,
        velocity,
        constantAngleNerfFactor,
        pastObjectDifficultyInfluence,
        currentVisibleObjectDensity,
    );

    let hiddenDifficulty = hidden
        ? calculateHiddenDifficulty(
              currObj,
              pastObjectDifficultyInfluence,
              currentVisibleObjectDensity,
              velocity,
              constantAngleNerfFactor,
          )
        : 0;

    let preemptDifficulty = calculatePreemptDifficulty(velocity, constantAngleNerfFactor, currObj.Preempt);

    let readingDifficulty = DiffUtils.Norm(1.5, preemptDifficulty, hiddenDifficulty, noteDensityDifficulty);

    // Having less time to process information is harder
    readingDifficulty *= highBpmBonus(currObj.AdjustedDeltaTime);

    return readingDifficulty;
}
function calculateDensityDifficulty(
    nextObj,
    velocity,
    constantAngleNerfFactor,
    pastObjectDifficultyInfluence,
    currentVisibleObjectDensity,
) {
    const density_multiplier = 2.4;
    const density_difficulty_base = 2.5;

    // Consider future densities too because it can make the path the cursor takes less clear
    let futureObjectDifficultyInfluence = Math.sqrt(currentVisibleObjectDensity);

    if (nextObj != null) {
        // Reduce difficulty if movement to next object is small
        futureObjectDifficultyInfluence *= DiffUtils.Smootherstep(
            nextObj.LazyJumpDistance,
            15,
            distance_influence_threshold,
        );
    }

    // Value higher note densities exponentially
    let noteDensityDifficulty =
        DiffUtils.Pow(pastObjectDifficultyInfluence + futureObjectDifficultyInfluence, 1.7) *
        0.4 *
        constantAngleNerfFactor *
        velocity;

    // Award only denser than average maps.
    noteDensityDifficulty = Math.max(0, noteDensityDifficulty - density_difficulty_base);

    // Apply a soft cap to general density reading to account for partial memorization
    noteDensityDifficulty = DiffUtils.Pow(noteDensityDifficulty, 0.45) * density_multiplier;

    return noteDensityDifficulty;
}
function calculatePreemptDifficulty(velocity, constantAngleNerfFactor, preempt) {
    const preempt_balancing_factor = 140000;
    const preempt_starting_point = 500; // AR 9.66 in milliseconds

    // Arbitrary curve for the base value preempt difficulty should have as approach rate increases.
    // https://www.desmos.com/calculator/c175335a71
    let preemptDifficulty =
        DiffUtils.Pow((preempt_starting_point - preempt + Math.abs(preempt - preempt_starting_point)) / 2, 2.5) /
        preempt_balancing_factor;

    preemptDifficulty *= constantAngleNerfFactor * velocity;

    return preemptDifficulty;
}
function calculateHiddenDifficulty(
    currObj,
    pastObjectDifficultyInfluence,
    currentVisibleObjectDensity,
    velocity,
    constantAngleNerfFactor,
) {
    const hidden_multiplier = 0.28;

    // Higher preempt means that time spent invisible is higher too, we want to reward that
    let preemptFactor = DiffUtils.Pow(currObj.Preempt, 2.2) * 0.01;

    // Account for both past and current densities
    let densityFactor = DiffUtils.Pow(currentVisibleObjectDensity + pastObjectDifficultyInfluence, 3.3) * 3;

    let hiddenDifficulty = (preemptFactor + densityFactor) * constantAngleNerfFactor * velocity * 0.01;

    // Apply a soft cap to general HD reading to account for partial memorization
    hiddenDifficulty = DiffUtils.Pow(hiddenDifficulty, 0.4) * hidden_multiplier;

    let previousObj = currObj.Previous();

    // Buff perfect stacks only if current note is completely invisible at the time you click the previous note.
    if (
        currObj.LazyJumpDistance == 0 &&
        currObj.OpacityAt(previousObj.BaseObject.StartTime, true) == 0 &&
        previousObj.StartTime > currObj.StartTime - currObj.Preempt
    )
        hiddenDifficulty += (hidden_multiplier * 2500) / DiffUtils.Pow(currObj.AdjustedDeltaTime, 1.5); // Perfect stacks are harder the less time between notes

    return hiddenDifficulty;
}

function getPastObjectDifficultyInfluence(currObj) {
    let pastObjectDifficultyInfluence = 0;

    for (const loopObj of retrievePastVisibleObjects(currObj)) {
        let loopDifficulty = currObj.OpacityAt(loopObj.BaseObject.StartTime, false);

        // When aiming an object small distances mean previous objects may be cheesed, so it doesn't matter whether they were arranged confusingly.
        loopDifficulty *= DiffUtils.Smootherstep(loopObj.LazyJumpDistance, 15, distance_influence_threshold);

        // Account less for objects close to the max reading window
        let timeBetweenCurrAndLoopObj = currObj.StartTime - loopObj.StartTime;
        let timeNerfFactor = getTimeNerfFactor(timeBetweenCurrAndLoopObj);

        loopDifficulty *= timeNerfFactor;
        pastObjectDifficultyInfluence += loopDifficulty;
    }

    return pastObjectDifficultyInfluence;
}

// Returns a list of objects that are visible on screen at the point in time the current object becomes visible.
function* retrievePastVisibleObjects(current) {
    for (let i = 0; i < current.Index; i++) {
        let hitObject = current.Previous(i);

        if (
            hitObject == null ||
            current.StartTime - hitObject.StartTime > reading_window_size ||
            hitObject.StartTime < current.StartTime - current.Preempt
        )
            // Current object not visible at the time object needs to be clicked
            break;

        yield hitObject;
    }
}

// Returns the density of objects visible at the point in time the current object needs to be clicked capped by the reading window.
function retrieveCurrentVisibleObjectDensity(current) {
    let visibleObjectCount = 0;

    let hitObject = current.Next();

    while (hitObject != null) {
        if (
            hitObject.StartTime - current.StartTime > reading_window_size ||
            current.StartTime < hitObject.StartTime - hitObject.Preempt
        )
            // Object not visible at the time current object needs to be clicked.
            break;

        let timeBetweenCurrAndLoopObj = hitObject.StartTime - current.StartTime;
        let timeNerfFactor = getTimeNerfFactor(timeBetweenCurrAndLoopObj);

        visibleObjectCount += hitObject.OpacityAt(current.BaseObject.StartTime, false) * timeNerfFactor;

        hitObject = hitObject.Next();
    }

    return visibleObjectCount;
}

// Returns a factor of how often the current object's angle has been repeated in a certain time frame.
// It does this by checking the difference in angle between current and past objects and sums them based on a range of similarity.
// https://www.desmos.com/calculator/eb057a4822
function getConstantAngleNerfFactor(current) {
    const minimum_angle_relevancy_time = 2000; // 2 seconds
    const maximum_angle_relevancy_time = 200;

    let constantAngleCount = 0;
    let index = 0;
    let currentTimeGap = 0;

    let loopObjPrev0 = current;
    let loopObjPrev1 = null;
    let loopObjPrev2 = null;

    while (currentTimeGap < minimum_angle_relevancy_time) {
        let loopObj = current.Previous(index);

        if (loopObj == null) break;

        // Account less for objects that are close to the time limit.
        let longIntervalFactor =
            1 -
            DiffUtils.ReverseLerp(
                loopObj.AdjustedDeltaTime,
                maximum_angle_relevancy_time,
                minimum_angle_relevancy_time,
            );

        if (loopObj.Angle != null && current.Angle != null) {
            let angleDifference = Math.abs(current.Angle - loopObj.Angle);
            let angleDifferenceAlternating = Math.PI;

            if (loopObjPrev0.Angle != null && loopObjPrev1?.Angle != null && loopObjPrev2?.Angle != null) {
                angleDifferenceAlternating = Math.abs(loopObjPrev1.Angle - loopObj.Angle);
                angleDifferenceAlternating += Math.abs(loopObjPrev2.Angle - loopObjPrev0.Angle);

                let weight = 1.0;

                // Be sure that one of the angles is very sharp, when other is wide
                weight *= DiffUtils.ReverseLerp((Math.min(loopObj.Angle, loopObjPrev0.Angle) * 180) / Math.PI, 20, 5);
                weight *= DiffUtils.ReverseLerp((Math.max(loopObj.Angle, loopObjPrev0.Angle) * 180) / Math.PI, 60, 120);

                // Lerp between max angle difference and rescaled alternating difference, with more harsh scaling compared to normal difference
                angleDifferenceAlternating = DiffUtils.Lerp(Math.PI, 0.1 * angleDifferenceAlternating, weight);
            }

            let stackFactor = DiffUtils.Smootherstep(
                loopObj.LazyJumpDistance,
                0,
                OsuDifficultyHitObject.NORMALISED_RADIUS,
            );

            constantAngleCount +=
                Math.cos(
                    3 *
                        Math.min(
                            DiffUtils.DegreesToRadians(30),
                            Math.min(angleDifference, angleDifferenceAlternating) * stackFactor,
                        ),
                ) * longIntervalFactor;
        }

        currentTimeGap = current.StartTime - loopObj.StartTime;
        index++;

        loopObjPrev2 = loopObjPrev1;
        loopObjPrev1 = loopObjPrev0;
        loopObjPrev0 = loopObj;
    }

    return DiffUtils.Clamp(2 / constantAngleCount, 0.2, 1);
}

// Returns a nerfing factor for when objects are very distant in time, affecting reading less.
function getTimeNerfFactor(deltaTime) {
    return DiffUtils.Clamp(2 - deltaTime / (reading_window_size / 2), 0, 1);
}

function highBpmBonus(ms) {
    return 1 / (1 - DiffUtils.Pow(0.8, ms / 1000));
}

export const ReadingEvaluator = { EvaluateDifficultyOf };
