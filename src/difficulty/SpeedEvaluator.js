import { DiffUtils, Vector2 } from './math.js';
import { DifficultyObject as OsuDifficultyHitObject } from './objects.js';

function EvaluateDifficultyOf(current) {
    if (current.BaseObject.isSpinner) return 0;

    const min_speed_bonus = 200; // 200 BPM 1/4th
    const speed_balancing_factor = 40;

    let osuCurrObj = current;

    let strainTime = osuCurrObj.AdjustedDeltaTime;
    let doubleTapFeasibility = 1.0 - osuCurrObj.CalculateDoubleTapFeasibility(osuCurrObj.Next());

    // Cap deltatime to the OD 300 hitwindow.
    // 0.93 is derived from making sure 260bpm OD8 streams aren't nerfed harshly, whilst 0.92 limits the effect of the cap.
    strainTime /= DiffUtils.Clamp(strainTime / osuCurrObj.HitWindowGreat / 0.93, 0.92, 1);

    // speedBonus will be 0.0 for BPM < 200
    let speedBonus = 0.0;

    // Add additional scaling bonus for streams/bursts higher than 200bpm
    if (DiffUtils.MillisecondsToBPM(strainTime) > min_speed_bonus)
        speedBonus =
            0.75 *
            DiffUtils.Pow((DiffUtils.BPMToMilliseconds(min_speed_bonus) - strainTime) / speed_balancing_factor, 2);

    // Base difficulty with all bonuses
    let speedDifficulty = ((1 + speedBonus) * 1000) / strainTime;

    speedDifficulty *= highBpmBonus(osuCurrObj.AdjustedDeltaTime);

    // Apply penalty if there's doubletappable doubles
    return speedDifficulty * doubleTapFeasibility;
}

function highBpmBonus(ms) {
    return 1 / (1 - DiffUtils.Pow(0.3, ms / 1000));
}

export const SpeedEvaluator = { EvaluateDifficultyOf };
