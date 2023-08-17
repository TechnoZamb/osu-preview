import { rgb, urlJoin } from "./functions.js";

const DEFAULT_SKIN_PATH = "defaultskin/";

const files = {
    "approachcircle": { tinted: true },
    "hitcircle": { tinted: true },
    "hitcircleoverlay": { },
    "default-": { enumerable: 9 },
    "sliderb" : { tinted: true, enumerable: -1 },
    "sliderstartcircle": { tinted: true, notRequired: true },
    "sliderstartcircleoverlay": { notRequired: true },
    "sliderendcircle": { tinted: true, notRequired: true },
    "sliderendcircleoverlay": { notRequired: true },
    "sliderfollowcircle": { },
    "reversearrow": { },
    "sliderscorepoint": { },
    "spinner-approachcircle": { },
    "spinner-background": { notRequired: true, tinted: [100, 100, 100] },
    "cursor": { }
};
const oldSpinnerFiles = {
    "spinner-circle": { },
    "spinner-metre": { }
};
const newSpinneFiles = {
    "spinner-glow": { tinted: [17, 160, 248] },
    "spinner-bottom": { },
    "spinner-top": { },
    "spinner-middle2": { },
    "spinner-middle": { }
};
const allFiles = Object.assign({}, files, oldSpinnerFiles, newSpinneFiles);

const defaultValues = {            // for skin.ini
    General: {
        AllowSliderBallTint: "1",
        SliderBallFlip: "1",
    },
    Colours: {
        SliderBorder: "255,255,255",
        SliderTrackOverride: false,
    }
};

export async function parseSkin(skinPath, beatmapPath, beatmapObj, loadBeatmapSkin) {
    // load in both skin.ini and default skin.ini
    var defaultIni = await fetch(urlJoin(DEFAULT_SKIN_PATH, "skin.ini"));
    var ini = await fetch(urlJoin(skinPath, "skin.ini"));
    if (!ini.ok) {
        if (!defaultIni.ok) {
            throw new Error();
        }
        ini = defaultIni;
    }

    if (ini !== defaultIni) {
        if (!defaultIni.ok) {
            defaultIni = null;
        }
        else {
            defaultIni = parseIni(await defaultIni.text());
        }
    }
    ini = parseIni(await ini.text());

    // parse combo colors
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

    // try parse map colors
    if (loadBeatmapSkin && beatmapObj && beatmapObj.Colours) {
        const tempColors = [];
        for (let i = 1; i < 9; i++) {
            if (beatmapObj.Colours["Combo" + i])
                tempColors.push(rgb(beatmapObj.Colours["Combo" + i]));
        }

        if (tempColors.length > 0) {
            ini.combos = [...tempColors.slice(1), tempColors[0]];
        }
    }

    // other required skin.ini entries
    for (let cat in defaultValues) {
        for (let [key, val] of Object.entries(defaultValues[cat])) {
            if (ini[cat][key] === undefined)
                ini[cat][key] = val;
        }
    }

    const imgs = await loadAllFiles(files);

    let isOldSpinner;
    if (imgs.find(x => x.baseName == "spinner-background").ok) {
        // old spinner
        imgs.push(...await loadAllFiles(oldSpinnerFiles));
        isOldSpinner = true;
    }
    else {
        // new spinner
        imgs.splice(imgs.findIndex(x => x.baseName == "spinner-background"), 1);
        imgs.push(...await loadAllFiles(newSpinneFiles));
        isOldSpinner = false;
    }

    //#region slider balls
    const sliderbs = [];
    var index = 0;
    var sliderb = { baseBaseName: "sliderb", baseName: "sliderb0", stage: (loadBeatmapSkin ? 10 : 8) };
    var stage = 0;

    outer:
    while (true) {
        switch (sliderb.stage) {
            case 10:
                sliderb.url = urlJoin(beatmapPath, sliderb.baseBaseName + index + ".png");
                sliderb.isHD = false;
                break;
            case 9:
                sliderb.url = urlJoin(beatmapPath, "sliderb.png");
                sliderb.isHD = false;
                break;
            case 8:
                sliderb.url = urlJoin(skinPath, sliderb.baseBaseName + index + "@2x.png");
                sliderb.isHD = true;
                break;
            case 7:
                sliderb.url = urlJoin(skinPath, sliderb.baseBaseName + index + ".png");
                sliderb.isHD = false;
                break;
            case 6:
                sliderb.url = urlJoin(skinPath, "sliderb@2x.png");
                sliderb.isHD = true;
                break;
            case 5:
                sliderb.url = urlJoin(skinPath, "sliderb.png");
                sliderb.isHD = false;
                break;
            case 4:
                sliderb.url = urlJoin(DEFAULT_SKIN_PATH, sliderb.baseBaseName + index + "@2x.png");
                sliderb.isHD = true;
                break;
            case 3:
                sliderb.url = urlJoin(DEFAULT_SKIN_PATH, sliderb.baseBaseName + index + ".png");
                sliderb.isHD = false;
                break;
            case 2:
                sliderb.url = urlJoin(DEFAULT_SKIN_PATH, "sliderb@2x.png");
                sliderb.isHD = true;
                break;
            case 1:
                sliderb.url = urlJoin(DEFAULT_SKIN_PATH, "sliderb.png");
                sliderb.isHD = false;
                break;
            default:
                break outer;
        }

        sliderb.img = await asyncLoadImages(sliderb.url);

        if (sliderb.img.complete && sliderb.img.naturalWidth !== 0) {
            sliderbs.push(sliderb);
            if (stage == 0) {
                if (sliderb.stage <= 2)
                    break outer;
                else if (sliderb.stage <= 4)
                    stage = 4;

                else if (sliderb.stage <= 6)
                    break outer;
                else if (sliderb.stage <= 8)
                    stage = 8;
                
                else if (sliderb.stage <= 9)
                    break outer;
                else
                    stage = 10;
            }
            index++;
            sliderb = { baseBaseName: "sliderb", baseName: "sliderb" + index, stage: stage };
        }
        else {
            sliderb.stage--;
            if (sliderb.stage <= 0 || (stage == 4 && sliderb.stage < 3) || (stage == 8 && sliderb.stage < 7) || stage == 10)
                break outer;
        }
    }

    if (sliderbs.length == 0) {
        throw new Error();
    }
    if ([1,2,5,6,9].includes(sliderbs[0].stage)) {
        sliderbs[0].baseName = "sliderb";
    }
    else if (sliderbs[0].stage == 3 || sliderbs[0].stage == 4) {
        let url;
        imgs.push({
            url: (url = urlJoin(DEFAULT_SKIN_PATH, "sliderb-nd.png")), stage: 1, isHD: false, baseName: "sliderb-nd", baseBaseName: "sliderb-nd", img: await asyncLoadImages(url)
        },
        {
            url: (url = urlJoin(DEFAULT_SKIN_PATH, "sliderb-spec.png")), stage: 1, isHD: false, baseName: "sliderb-spec", baseBaseName: "sliderb-spec", img: await asyncLoadImages(url)
        });
    }
    //#endregion

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
    var result = { ini: ini, isOldSpinner: isOldSpinner };

    for (let obj of imgs) {
        if (obj.isHD) {
            obj.img.width /= 2;
            obj.img.height /= 2;
        }

        if (allFiles[obj.baseBaseName]?.tinted) {
            if (allFiles[obj.baseBaseName].tinted === true) {
                result[obj.baseName] = [];
                for (let combo of ini.combos) {
                    result[obj.baseName].push(tintImage(obj.img, combo));
                }
            }
            else {
                result[obj.baseName] = [tintImage(obj.img, allFiles[obj.baseBaseName].tinted)];
            }
        }
        else {
            result[obj.baseName] = obj.img;
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
            sliderbs[i] = [ sliderbs[i].img ];
        }
    }
    result["sliderb"] = sliderbs;
    //#endregion

    return result;

    async function loadAllFiles(fileNames) {
        const imgs = [];

        // stages:
        //      5: beatmap sd
        //      4: skin hd
        //      3: skin sd
        //      2: default hd
        //      1: default sd
        //      0: fail

        for (let [key, val] of Object.entries(fileNames)) {
            if (val.enumerable) {
                if (val.enumerable != -1) {
                    for (let i = 0; i <= val.enumerable; i++) {
                        if (loadBeatmapSkin) {
                            imgs.push({
                                url: urlJoin(beatmapPath, key + i + ".png"), stage: 5, isHD: false, baseName: key + i, baseBaseName: key
                            });
                        }
                        else {
                            imgs.push({
                                url: urlJoin(skinPath, key + i + "@2x.png"), stage: 4, isHD: true, baseName: key + i, baseBaseName: key
                            });
                        }
                    }
                }
            }
            else {
                if (loadBeatmapSkin) {
                    imgs.push({
                        url: urlJoin(beatmapPath, key + ".png"), stage: 5, isHD: false, baseName: key, baseBaseName: key
                    });
                }
                else {
                    imgs.push({
                        url: urlJoin(skinPath, key + "@2x.png"), stage: 4, isHD: true, baseName: key, baseBaseName: key
                    });
                }
            }
        }

        (await asyncLoadImages(imgs.map(o => o.url))).map((o, i) => imgs[i].img = o);

        let completed = 0;
        while (completed < imgs.length) {
            const obj = imgs[completed];

            // if img loaded correctly
            if (obj.img.complete && obj.img.naturalWidth !== 0) {
                obj.ok = true;
                completed++;
            }
            else {
                switch (--obj.stage) {
                    case 5: {
                        obj.url = urlJoin(beatmapPath, obj.baseName + ".png");
                        obj.isHD = false;
                        break;
                    }
                    case 4: {
                        obj.url = urlJoin(skinPath, obj.baseName + "@2x.png");
                        obj.isHD = true;
                        break;
                    }
                    case 3: {
                        obj.url = urlJoin(skinPath, obj.baseName + ".png");
                        obj.isHD = false;
                        break;
                    }
                    case 2: {
                        obj.url = urlJoin(DEFAULT_SKIN_PATH, obj.baseName + "@2x.png");
                        obj.isHD = true;
                        break;
                    }
                    case 1: {
                        obj.url = urlJoin(DEFAULT_SKIN_PATH, obj.baseName + ".png");
                        obj.isHD = false;
                        break;
                    }
                    default: {
                        if (fileNames[obj.baseBaseName].notRequired) {
                            completed++;
                        }
                        else {
                            throw new Error();
                        }
                    }
                }

                obj.img = await asyncLoadImages(obj.url);
            }
        }

        return imgs;
    }
}

export async function asyncLoadImages(files) {
    if (files instanceof Array) {
        const successes = [], errors = [], promises = [], images = [];

        for (let i = 0; i < files.length; i++) {
            promises[i] = new Promise((res, rej) => { successes[i] = res; errors[i] = rej });
            images[i] = Object.assign(new Image(), { src: files[i], onload: successes[i], onerror: errors[i] });
        }

        await Promise.allSettled(promises);
        return images;
    }
    else {
        let success, error;
        const promise = new Promise((res, rej) => { success = res; error = rej });
        const image = Object.assign(new Image(), { src: files, onload: success, onerror: error });
        await Promise.allSettled([promise]);
        return image;
    }
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
