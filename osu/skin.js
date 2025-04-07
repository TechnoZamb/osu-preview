import { rgb, extractFile } from "/functions.js";
const { BlobWriter, TextWriter } = zip;


const DEFAULT_SKIN_NAME = "/assets/defaultskin.zip";

let defaultSkinFiles;

const files = {
    "approachcircle": { tinted: true },
    "hitcircle": { tinted: true },
    "hitcircleoverlay": {},
    "default-": { enumerable: 9 },
    "sliderb": { tinted: true, enumerable: -1 },
    "sliderstartcircle": { tinted: true, notRequired: true },
    "sliderstartcircleoverlay": { notRequired: true },
    "sliderendcircle": { tinted: true, notRequired: true },
    "sliderendcircleoverlay": { notRequired: true },
    "sliderfollowcircle": {},
    "reversearrow": {},
    "sliderscorepoint": {},
    "spinner-approachcircle": {},
    "spinner-clear": {},
    "spinner-background": { notRequired: true, tinted: [100, 100, 100] },
    "followpoint": { enumerable: -1 },
    "cursor": {},
    "cursormiddle": {},
    "cursortrail": {},
    "selection-mod-easy": {},
    "selection-mod-hardrock": {},
    "selection-mod-halftime": {},
    "selection-mod-doubletime": {},
    "selection-mod-hidden": {},
    "selection-mod-flashlight": {}
};
const oldSpinnerFiles = {
    "spinner-circle": {},
    "spinner-metre": {}
};
const newSpinnerFiles = {
    "spinner-glow": { tinted: [17, 160, 248] },
    "spinner-bottom": {},
    "spinner-top": {},
    "spinner-middle2": {},
    "spinner-middle": {}
};
const allFiles = Object.assign({}, files, oldSpinnerFiles, newSpinnerFiles);

const defaultValues = {            // for skin.ini
    General: {
        AllowSliderBallTint: "1",
        SliderBallFlip: "1",
        CursorCenter: "1",
        CursorRotate: "1",
        CursorTrailRotate: "0", // wiki says default 1...
        LayeredHitSounds: "1"
    },
    Colours: {
        SliderBorder: "255,255,255",
        SliderTrackOverride: false,
    },
    Fonts: {
        HitCirclePrefix: "default",
        HitCircleOverlap: -2
    }
};

export async function parseSkin(skinFiles, beatmapFiles, beatmapObj, useBeatmapSkin, useBeatmapHitsounds) {
    const skin = await loadSkin(skinFiles, beatmapFiles, beatmapObj, useBeatmapSkin);
    const hitSounds = await loadHitsounds(skinFiles, beatmapFiles, beatmapObj, useBeatmapHitsounds, skin.LayeredHitSounds);
    return [skin, hitSounds];
}

export async function loadSkin(skinFiles, beatmapFiles, beatmapObj, useBeatmapSkin) {
    // load default skin
    if (!defaultSkinFiles) {
        defaultSkinFiles = await fetch(DEFAULT_SKIN_NAME).then(res => res.blob());
        defaultSkinFiles = (await extractFile(defaultSkinFiles)).reduce((prev, curr) => ({ ...prev, [curr.filename]: curr }), {});
    }

    //#region skin.ini and default skin.ini
    let defaultIni = defaultSkinFiles[Object.keys(defaultSkinFiles).find(x => x.toLowerCase() == "skin.ini")];
    let ini = skinFiles[Object.keys(skinFiles).find(x => x.toLowerCase() == "skin.ini")];
    if (!ini) {
        if (!defaultIni) {
            throw new Error();
        }
        ini = defaultIni;
    }
    if (ini !== defaultIni) {
        if (!defaultIni) {
            defaultIni = null;
        }
        else {
            defaultIni = parseIni(await defaultIni.getData(new TextWriter()));
        }
    }
    ini = parseIni(await ini.getData(new TextWriter()));
    //#endregion

    //#region combo colors
    ini.combos = [];
    if (ini.Colours.Combo1) {
        for (let i = 2; i <= 8; i++) {
            if (ini.Colours["Combo" + i]) {
                ini.combos.push(rgb(ini.Colours["Combo" + i]));
            }
        }
        ini.combos.push(rgb(ini.Colours.Combo1));
    }
    else {
        let i = 2;
        for (i; i <= 4; i++) {
            if (ini.Colours["Combo" + i]) {
                ini.combos.push(rgb(ini.Colours["Combo" + i]));
            }
            else {
                try {
                    var val = rgb(defaultIni.Colours["Combo" + i]);
                    if (!val) throw new Error();
                    ini.combos.push(val);
                }
                catch (e) { throw e; }
            }
        }
        for (i; i <= 8; i++) {
            if (ini.Colours["Combo" + i]) {
                ini.combos.push(rgb(ini.Colours["Combo" + i]));
            }
        }

        try {
            var val = rgb(defaultIni.Colours.Combo1);
            if (!val) throw new Error();
            ini.combos.push(val);
        }
        catch (e) { throw e; }
    }
    //#endregion

    // try parse map colors
    if (useBeatmapSkin && beatmapObj && beatmapObj.Colours) {
        const tempColors = [];
        for (let i = 1; i < 9; i++) {
            if (beatmapObj.Colours["Combo" + i])
                tempColors.push(rgb(beatmapObj.Colours["Combo" + i]));
        }

        if (tempColors.length > 0) {
            ini.combos = [...tempColors.slice(1), tempColors[0]];
        }
    }

    // load default ini values
    for (let cat in defaultValues) {
        if (!ini[cat]) {
            ini[cat] = {};
        }
        for (let [key, val] of Object.entries(defaultValues[cat])) {
            if (ini[cat][key] === undefined)
                ini[cat][key] = val;
        }
    }

    const imgs = await loadAllFiles(files, ini);

    let isOldSpinner;
    if (imgs.find(x => x.baseName == "spinner-background").ok) {
        // old spinner
        imgs.push(...await loadAllFiles(oldSpinnerFiles));
        isOldSpinner = true;
    }
    else {
        // new spinner
        imgs.splice(imgs.findIndex(x => x.baseName == "spinner-background"), 1);
        imgs.push(...await loadAllFiles(newSpinnerFiles));
        isOldSpinner = false;
    }

    let isLongerCursorTrail = false;
    if (imgs.find(x => x.baseName == "cursormiddle").stage > 2 || imgs.find(x => x.baseName == "cursor").stage < 3) {
        isLongerCursorTrail = true;
    }

    // slider balls and follow points
    const followPoints = await loadEnumerables("followpoint-");
    const sliderbs = await loadEnumerables("sliderb");
    if (sliderbs[0].stage == 3 || sliderbs[0].stage == 4) {
        imgs.push(
            { files: defaultSkinFiles, name: "sliderb-nd", baseName: "sliderb-nd", ext: ".png", stage: 1, isHD: false, img: await asyncLoadImage(defaultSkinFiles, "sliderb-nd.png") },
            { files: defaultSkinFiles, name: "sliderb-spec", baseName: "sliderb-spec", ext: ".png", stage: 1, isHD: false, img: await asyncLoadImage(defaultSkinFiles, "sliderb-spec.png") }
        );
    }

    //#region slider start end circles
    for (let x of ["sliderstartcircle", "sliderendcircle"]) {
        let [circle, overlay] = [imgs.find(y => y.baseName == x), imgs.find(y => y.baseName == x + "overlay")];

        if (circle.ok) {
            if (!overlay.ok) {
                overlay.img = new Image();
                overlay.isHD = false;
            }
        }
        else {
            circle.img = imgs.find(x => x.baseName == "hitcircle").img;
            overlay.img = imgs.find(x => x.baseName == "hitcircleoverlay").img;
            circle.isHD = false;
            overlay.isHD = false;
        }
    }
    //#endregion
    
    // loading complete
    //#region construct result
    var result = { ini: ini, isOldSpinner: isOldSpinner, isLongerCursorTrail: isLongerCursorTrail, LayeredHitSounds: parseInt(ini.General.LayeredHitSounds) };

    for (let obj of imgs) {
        if (obj.isHD) {
            obj.img.width /= 2;
            obj.img.height /= 2;
        }

        if (allFiles[obj.baseName]?.tinted) {
            if (allFiles[obj.baseName].tinted === true) {
                result[obj.name] = [];
                for (let combo of ini.combos) {
                    result[obj.name].push(tintImage(obj.img, combo));
                }
            }
            else {
                result[obj.name] = [tintImage(obj.img, allFiles[obj.baseName].tinted)];
            }
        }
        else {
            if (obj.baseName == "default-") {
                result[obj.baseName + obj.count] = obj.img;
            }
            else {
                result[obj.name] = obj.img;
            }
        }
    }

    if (sliderbs[0].stage == 3 || sliderbs[0].stage == 4) {
        result.isDefaultSliderBall = true;
        result["sliderb-nd"] = tintImage(result["sliderb-nd"], [0, 0, 0]);
    }

    for (let i = 0; i < sliderbs.length; i++) {
        if (sliderbs[i].isHD) {
            sliderbs[i].img.width /= 2;
            sliderbs[i].img.height /= 2;
        }

        if (parseInt(ini.General.AllowSliderBallTint) == 1) {
            const temp = sliderbs[i].img;
            sliderbs[i] = [];
            for (let combo of ini.combos) {
                sliderbs[i].push(tintImage(temp, combo));
            }
        }
        else {
            sliderbs[i] = [sliderbs[i].img];
        }
    }
    result["sliderb"] = sliderbs;


    for (let i = 0; i < followPoints.length; i++) {
        if (followPoints[i].isHD) {
            followPoints[i].img.width /= 2;
            followPoints[i].img.height /= 2;
        }

        followPoints[i] = followPoints[i].img;
    }
    result["followpoint"] = followPoints;
    //#endregion
    
    return result;


    async function loadAllFiles(fileNames, ini) {
        const result = [];

        // stages:
        //      5: beatmap sd
        //      4: skin hd
        //      3: skin sd
        //      2: default hd
        //      1: default sd
        //      0: fail

        for (let [key, val] of Object.entries(fileNames)) {
            let imgs = [];

            if (key == "default-") {
                for (let i = 0; i <= val.enumerable; i++) {
                    if (useBeatmapSkin) {
                        imgs.push({ files: beatmapFiles, count: i, ext: ".png", baseName: key, stage: 5, isHD: false });
                    }
                    else {
                        imgs.push({ files: skinFiles, count: i, ext: ".png", baseName: key, stage: 4, isHD: true });
                    }
                }
            }
            else if (!val.enumerable) {
                if (useBeatmapSkin) {
                    imgs.push({ files: beatmapFiles, ext: ".png", baseName: key, stage: 5, isHD: false });
                }
                else {
                    imgs.push({ files: skinFiles, ext: ".png", baseName: key, stage: 4, isHD: true });
                }
            }

            for (let obj of imgs) {
                let ok = false;

                do {
                    if (obj.baseName == "default-" && (obj.stage == 3 || obj.stage == 4)) {
                        obj.name = ini.Fonts.HitCirclePrefix + "-" + (obj.count ?? "");
                    }
                    else {
                        obj.name = obj.baseName + (obj.count ?? "");
                    }

                    obj.img = await asyncLoadImage(obj.files, obj.name + (obj.isHD ? "@2x" : "") + obj.ext);

                    if (obj.img) {
                        obj.ok = true;
                        ok = true;
                    }
                    else {
                        switch (--obj.stage) {
                            case 5: {
                                Object.assign(obj, { files: beatmapFiles, isHD: false });
                                break;
                            }
                            case 4: {
                                Object.assign(obj, { files: skinFiles, isHD: true });
                                break;
                            }
                            case 3: {
                                Object.assign(obj, { files: skinFiles, isHD: false });
                                break;
                            }
                            case 2: {
                                Object.assign(obj, { files: defaultSkinFiles, isHD: true });
                                break;
                            }
                            case 1: {
                                Object.assign(obj, { files: defaultSkinFiles, isHD: false });
                                break;
                            }
                            default: {
                                if (fileNames[obj.baseName].notRequired) {
                                    ok = true;
                                }
                                else {
                                    throw new Error();
                                }
                            }
                        }
                    }

                } while (ok == false)

                result.push(obj);
            }
        }

        return result;
    }

    async function loadEnumerables(enumName) {
        const enumBaseName = enumName.replace("-", "");
        const enums = [];
        var obj = { baseName: enumName, ext: ".png", stage: (useBeatmapSkin ? 10 : 8) };
        var index = 0;
        var stage = 0;

        outer:
        while (true) {
            switch (obj.stage) {
                case 10:
                    Object.assign(obj, { files: beatmapFiles, name: enumName + index, isHD: false });
                    break;
                case 9:
                    Object.assign(obj, { files: beatmapFiles, name: enumBaseName, isHD: false });
                    break;
                case 8:
                    Object.assign(obj, { files: skinFiles, name: enumName + index + "@2x", isHD: true });
                    break;
                case 7:
                    Object.assign(obj, { files: skinFiles, name: enumName + index, isHD: false });
                    break;
                case 6:
                    Object.assign(obj, { files: skinFiles, name: enumBaseName + "@2x", isHD: true });
                    break;
                case 5:
                    Object.assign(obj, { files: skinFiles, name: enumBaseName, isHD: false });
                    break;
                case 4:
                    Object.assign(obj, { files: defaultSkinFiles, name: enumName + index + "@2x", isHD: true });
                    break;
                case 3:
                    Object.assign(obj, { files: defaultSkinFiles, name: enumName + index, isHD: false });
                    break;
                case 2:
                    Object.assign(obj, { files: defaultSkinFiles, name: enumBaseName + "@2x", isHD: true });
                    break;
                case 1:
                    Object.assign(obj, { files: defaultSkinFiles, name: enumBaseName, isHD: false });
                    break;
                default:
                    break outer;
            }

            obj.img = await asyncLoadImage(obj.files, obj.name + obj.ext);

            if (obj.img) {
                enums.push(obj);
                if (stage == 0) {
                    if (obj.stage <= 2)
                        break outer;
                    else if (obj.stage <= 4)
                        stage = 4;

                    else if (obj.stage <= 6)
                        break outer;
                    else if (obj.stage <= 8)
                        stage = 8;

                    else if (obj.stage <= 9)
                        break outer;
                    else
                        stage = 10;
                }
                index++;
                obj = { baseName: enumName, ext: ".png", stage: stage };
            }
            else {
                obj.stage--;
                if (obj.stage <= 0 || (stage == 4 && obj.stage < 3) || (stage == 8 && obj.stage < 7) || stage == 10)
                    break outer;
            }
        }

        if (enums.length == 0) {
            throw new Error("No sprites found");
        }
        if ([1, 2, 5, 6, 9].includes(enums[0].stage)) {
            enums[0].baseName = enumName;
        }

        return enums;
    }
}

export async function loadHitsounds(skinFiles, beatmapFiles, beatmapObj, useBeatmapHitsounds, layeredHitSounds) {

    const soundSet = new Set();

    for (let obj of beatmapObj.HitObjects) {
        if (obj.isSlider) {
            soundSet.add(`${[, "normal", "soft", "drum"][obj.hitSample[1]]}-slider${["slide", "whistle"][obj.hitSounds & 2 ? 1 : 0]}|${obj.hitSample[2]}`);
            soundSet.add(`${[, "normal", "soft", "drum"][obj.hitSample[0]]}-slidertick|${obj.hitSample[2]}`);

            for (let i = 0; i <= obj.slides; i++) {
                for (let j = 1; j < 4; j++) {
                    if (obj.edgeSounds[i] & (2 ** j)) {
                        soundSet.add(`${[, "normal", "soft", "drum"][obj.edgeSets[i][1]]}-hit${["normal", "whistle", "finish", "clap"][j]}|${obj.hitSample[2]}`);
                    }
                }
                if (obj.edgeSounds[i] & 14 == 0 || layeredHitSounds) {
                    soundSet.add(`${[, "normal", "soft", "drum"][obj.edgeSets[i][0]]}-hitnormal|${obj.hitSample[2]}`);
                }
            }
        }
        if (obj.isSpinner) {
            soundSet.add("spinnerspin|");
            soundSet.add("spinnerbonus|");
        }

        for (let i = 1; i < 4; i++) {
            if (obj.hitSounds & (2 ** i)) {
                soundSet.add(`${[, "normal", "soft", "drum"][obj.hitSample[1]]}-hit${["normal", "whistle", "finish", "clap"][i]}|${obj.hitSample[2]}`);
            }
        }
        if (obj.hitSounds & 14 == 0 || layeredHitSounds) {
            soundSet.add(`${[, "normal", "soft", "drum"][obj.hitSample[0]]}-hitnormal|${obj.hitSample[2]}`);
        }
    }


    const tempAudioContext = new AudioContext();

    // load base hitsounds
    const hitsounds = {};
    for (let s of soundSet) {

        const [sound, index] = s.split("|");
        let stage = (useBeatmapHitsounds && index != 0) ? 0 : 3;

        do {
            const file = [
                () => beatmapFiles[sound + (index != 1 ? index : "") + ".wav"],
                () => beatmapFiles[sound + (index != 1 ? index : "") + ".mp3"],
                () => beatmapFiles[sound + (index != 1 ? index : "") + ".wav"],
                () => skinFiles[sound + ".wav"],
                () => skinFiles[sound + ".mp3"],
                () => skinFiles[sound + ".ogg"],
                () => defaultSkinFiles[sound + ".wav"],
                () => defaultSkinFiles[sound + ".mp3"],
                () => defaultSkinFiles[sound + ".ogg"],
                () => { { throw new TypeError(`Sound file ${sound} not found`) } }
            ][stage]();

            if (file) {
                const arrayBuffer = await file.getData(new BlobWriter()).then(x => x.arrayBuffer());
                let audioBuffer;
                try {
                    audioBuffer = await tempAudioContext.decodeAudioData(arrayBuffer);
                }
                catch {
                    audioBuffer = tempAudioContext.createBuffer(1, 1, tempAudioContext.sampleRate);
                }

                // file loaded correctly
                hitsounds[sound + index] = audioBuffer;
                break;
            }
        } while (++stage)
    }

    return hitsounds;
}

export async function asyncLoadImage(files, name) {
    let url;

    if (name) {
        if (!files[name]) {
            return null;
        }

        try {
            url = URL.createObjectURL(await files[name].getData(new BlobWriter()));
        }
        catch {
            return null;
        }
    }
    else {
        url = files;
    }

    let success, error;
    const promise = new Promise((res, rej) => { success = res; error = rej });
    const image = Object.assign(new Image(), { src: url, onload: success, onerror: error });
    await Promise.allSettled([promise]);
    return (image.complete && image.naturalWidth !== 0) ? image : null;
}

function parseIni(text) {
    var result = {};
    var currCategory, matches;

    for (let line of text.split("\n")) {
        if (!line.trim() || line.startsWith("//")) {
            continue;
        }

        if ((matches = line.match(/\[(General|Colours|Fonts)\]/))) {
            currCategory = matches[1];
            result[currCategory] = {};
        }
        else {
            var keyval = line.trim().split(":");
            if (keyval.length > 1) {
                if (!currCategory) currCategory = "General";
                if (keyval[1].indexOf("//") !== -1) {
                    keyval[1] = keyval[1].substring(0, keyval[1].indexOf("//"));
                }
                result[currCategory][keyval[0].trim()] = keyval[1].trim();
            }
        }
    }

    return result;
}

const buffer = document.createElement("canvas");
const context = buffer.getContext("2d", { willReadFrequently: true });

function tintImage(img, color) {
    if (img.width == 0 || img.height == 0)
        return img;
    buffer.width = img.width; buffer.height = img.height;
    context.drawImage(img, 0, 0, img.width, img.height);
    const data = context.getImageData(0, 0, img.width, img.height);

    for (let i = 0; i < data.data.length; i += 4) {
        data.data[i] *= color[0] / 255;
        data.data[i + 1] *= color[1] / 255;
        data.data[i + 2] *= color[2] / 255;
    }

    context.putImageData(data, 0, 0);
    return Object.assign(new Image(), { src: buffer.toDataURL() });
}
