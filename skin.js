import urlJoin from "./url-join.js";

const DEFAULT_SKIN_PATH = "defaultskin/";

const requiredFiles = [
    "approachcircle", "hitcircle", "hitcircleoverlay", "default-"
];
const tinted = [
    "approachcircle", "hitcircle", "sliderb"
];

export async function parseSkin(path) {
    // load in both skin.ini and default skin.ini
    var defaultIni = await fetch(urlJoin(DEFAULT_SKIN_PATH, "skin.ini"));
    var ini = await fetch(urlJoin(path, "skin.ini"));
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

    // first, try and load in HD elements; if those fail, load in SD elements;
    // if those fail, load in hd default skin HD elements; if those fail, load in default skin SD elements;
    // if those fail, end the program
    var imgBaseNames = [], imgsURLs = [];
    for (let file of requiredFiles) {
        if (file.endsWith("-")) {
            for (let i = 0; i < 10; i++) {
                imgBaseNames.push(file + i);
                imgsURLs.push(urlJoin(path, file + i + "@2x.png"));
            }
        }
        else {
            imgBaseNames.push(file);
            imgsURLs.push(urlJoin(path, file + "@2x.png"));
        }
    }
    var stages = Array(imgBaseNames.length).fill(3);

    const imgs = (await asyncLoadImages(imgsURLs)).map(o => ({ img: o, isHD: true }));

    var completed = 0;
    while (completed < imgs.length) {
        // if img loaded correctly
        if (imgs[completed].img.complete && imgs[completed].img.naturalWidth !== 0) {
            completed++;
        }
        else {
            switch (--stages[completed]) {
                // SD skin elements
                case 2:
                    imgs[completed] = { img: await asyncLoadImages(urlJoin(path, imgBaseNames[completed] + ".png")), isHD: false };
                    break;
                // TODO
                default:
                    throw new Error();
            }
        }
    }

    var result = {};
    for (let i = 0; i < imgs.length; i++) {
        if (tinted.includes(imgBaseNames[i])) {
            result[imgBaseNames[i]] = { combos: [], isHD: imgs[i].isHD };
            for (let combo of ini.combos) {
                result[imgBaseNames[i]].combos.push(tintImage(imgs[i].img, combo));
            }
        }
        else {
            result[imgBaseNames[i]] = imgs[i];
        }
    }
    result.ini = ini;
    return result;
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

function tintImage(img, color) {
    const buffer = document.createElement("canvas");
    buffer.width = img.width; buffer.height = img.height;
    const context = buffer.getContext("2d");
    context.drawImage(img, 0, 0, img.width, img.height);
    const data = context.getImageData(0, 0, img.width, img.height);

    for (let i = 0; i < data.data.length; i += 4) {
        data.data[i] *= color[0] / 255;
        data.data[i + 1] *= color[1] / 255;
        data.data[i + 2] *= color[2] / 255;
    }

    context.putImageData(data, 0, 0);
    return buffer;
}

const rgb = (val) => val.split(",").map(x => clamp(0, parseInt(x.trim()), 255));

const clamp = (min, n, max) => Math.min(max, Math.max(min, n));
