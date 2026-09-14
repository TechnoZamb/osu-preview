import { DiffUtils, Vector2 } from './math.js';
import { DifficultyObject as OsuDifficultyHitObject } from './objects.js';

function EvaluateDifficultyOf(current, mods) {
    if (current.BaseObject.isSpinner) return 0;

    const max_opacity_bonus = 0.4;
    const hidden_bonus = 0.2;

    const min_velocity = 0.5;
    const slider_multiplier = 1.3;

    const min_angle_multiplier = 0.2;

    let osuCurrent = current;
    let osuHitObject = osuCurrent.BaseObject;

    let scalingFactor = 52.0 / osuHitObject.Radius;
    let smallDistNerf = 1.0;
    let cumulativeStrainTime = 0.0;

    let flashlightDifficulty = 0.0;

    let lastObj = osuCurrent;

    let angleRepeatCount = 0.0;

    // This is iterating backwards in time from the current object.
    for (let i = 0; i < Math.min(current.Index, 10); i++) {
        let currentObj = current.Previous(i);
        let currentHitObject = currentObj.BaseObject;

        cumulativeStrainTime += lastObj.AdjustedDeltaTime;

        if (!currentObj.BaseObject.isSpinner) {
            let jumpDistance = Vector2.Distance(osuHitObject.StackedPosition, currentHitObject.StackedEndPosition);

            // We want to nerf objects that can be easily seen within the Flashlight circle radius.
            if (i == 0) smallDistNerf = Math.min(1.0, jumpDistance / 75.0);

            // We also want to nerf stacks so that only the first object of the stack is accounted for.
            let stackNerf = Math.min(1.0, currentObj.LazyJumpDistance / scalingFactor / 25.0);

            // Bonus based on how visible the object is.
            let opacityBonus =
                1.0 + max_opacity_bonus * (1.0 - osuCurrent.OpacityAt(currentHitObject.StartTime, mods.has('hd')));

            flashlightDifficulty += (stackNerf * opacityBonus * scalingFactor * jumpDistance) / cumulativeStrainTime;

            if (currentObj.Angle != null && osuCurrent.Angle != null) {
                // Objects further back in time should count less for the nerf.
                if (Math.abs(currentObj.Angle - osuCurrent.Angle) < 0.02)
                    angleRepeatCount += Math.max(1.0 - 0.1 * i, 0.0);
            }
        }

        lastObj = currentObj;
    }

    flashlightDifficulty = DiffUtils.Pow(smallDistNerf * flashlightDifficulty, 2);

    // Additional bonus for Hidden due to there being no approach circles.
    if (mods.has('hd')) flashlightDifficulty *= 1.0 + hidden_bonus;

    // Nerf patterns with repeated angles.
    flashlightDifficulty *= min_angle_multiplier + (1.0 - min_angle_multiplier) / (angleRepeatCount + 1.0);

    let sliderBonus = 0.0;

    if (osuCurrent.BaseObject.isSlider) {
        const osuSlider = osuCurrent.BaseObject;
        // Invert the scaling factor to determine the true travel distance independent of circle size.
        let pixelTravelDistance = osuCurrent.LazyTravelDistance / scalingFactor;

        // Reward sliders based on velocity.
        sliderBonus = DiffUtils.Pow(Math.max(0.0, pixelTravelDistance / osuCurrent.TravelTime - min_velocity), 0.5);

        // Longer sliders require more memorisation.
        sliderBonus *= pixelTravelDistance;

        // Nerf sliders with repeats, as less memorisation is required.
        if (osuSlider.RepeatCount > 0) sliderBonus /= osuSlider.RepeatCount + 1;
    }

    flashlightDifficulty += sliderBonus * slider_multiplier;

    return flashlightDifficulty;
}

export const FlashlightEvaluator = { EvaluateDifficultyOf };
