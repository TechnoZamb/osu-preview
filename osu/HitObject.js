import { activeMods } from "/osu/osu.js";
import { clamp } from "/functions.js";

export class HitObject {
    constructor(obj, index) {
        if (!obj || !(obj instanceof Array) || obj.length < 6) {
            throw new TypeError("Argument error");
        }

        const validateInt = (val, field) => isNaN(val) ? throwInvalidVal(field) : parseInt(val);
        const validateFloat = (val, field) => isNaN(val) ? throwInvalidVal(field) : parseFloat(val);
        const throwInvalidVal = (field) => { throw new TypeError(`Hitobject #${index}: Invalid value for field ${field}`) };

        const hitSample = (index2) => {
            this.hitSample = obj[index2]?.split?.(":").map((x, i) => (i != 4 ? validateInt(x, "hitSample") : x)) ?? [0, 0, 0, 0, ""];
            this.hitSample[3] = clamp(0, this.hitSample[3], 100);
        };

        this.x = validateInt(obj[0], "x");
        this.y = validateInt(obj[1], "y");
        this.time = validateInt(obj[2], "time");
        this.type = validateInt(obj[3], "type");
        this.hitSounds = validateInt(obj[4], "hitSounds");
        this.StackCount = 0;

        // can only be of 1 type
        if (this.isHitCircle + this.isSlider + this.isSpinner > 1) throwInvalidVal("type");

        if (this.isSlider) {
            this.curvePoints = obj[5]?.split("|");

            if (!this.curvePoints || this.length < 2) throwInvalidVal("curvePoints");
            if (!["L", "P", "B", "C"].includes(this.curvePoints[0])) throwInvalidVal("curvePoints");

            this.curveType = this.curvePoints[0];
            this.curvePoints = this.curvePoints.slice(1);
            for (let i = 0; i < this.curvePoints.length; i++) {
                this.curvePoints[i] = this.curvePoints[i].split?.(":").map?.(x => validateInt(x, "curvePoints"));
                if (!this.curvePoints || this.curvePoints[i].length != 2) throwInvalidVal("curvePoints");
                this.curvePoints[i] = { x: this.curvePoints[i][0], y: this.curvePoints[i][1] };
            }

            this.slides = validateInt(obj[6], "slides");
            this.pixelLength = validateFloat(obj[7], "length");

            this.edgeSounds = obj[8]?.split?.("|") ?? [];
            for (let i = 0; i <= this.slides; i++) {
                if (this.edgeSounds[i] == undefined) {
                    this.edgeSounds[i] = 0;
                }
                else {
                    this.edgeSounds[i] = validateInt(this.edgeSounds[i], "edgeSounds");
                }
            }

            this.edgeSets = obj[9]?.split?.("|") ?? [];
            for (let i = 0; i <= this.slides; i++) {
                this.edgeSets[i] = (this.edgeSets[i] ?? "0:0").split?.(":").map(x => validateInt(x, "edgeSets"));
                if (!this.edgeSets[i] || this.edgeSets[i].length != 2) {
                    this.edgeSets[i] = [0, 0];
                }
            }

            hitSample(10);
        }
        else if (this.isSpinner) {
            this.endTime = validateInt(obj[5], "endTime");
            this.duration = this.endTime - this.time;
            hitSample(6);
        }
        else {
            this.endTime = this.time;
            hitSample(5);
        }
    }

    get isHitCircle() { return !!(this.type & 1) }
    get isSlider() { return !!(this.type & 2) }
    get isSpinner() { return !!(this.type & 8) }
    get isNewCombo() { return !!(this.type & 4) }
}
