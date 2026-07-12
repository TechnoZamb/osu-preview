import "./libs/webextension-polyfill.js";

browser.declarativeNetRequest.updateDynamicRules({
    addRules: [{
        'id': 1001,
        'priority': 1,
        'action': {
            'type': 'modifyHeaders',
            'requestHeaders': [
                { 'header': 'Referer', 'operation': 'set', 'value': 'https://osu.ppy.sh/beatmapsets' }
            ]
        },
        'condition': {
            'urlFilter': 'osu.ppy.sh'
        }
    }],
    removeRuleIds: [1001]
});

browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "update") {
        if (compareVersions(details.previousVersion, "1.2.0") < 0)
            await browser.storage.local.set({ pendingFirefoxNotice: true });
    }
});

function compareVersions(v1, v2) {
    debugger
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const part1 = v1Parts[i] || 0;
        const part2 = v2Parts[i] || 0;

        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }

    return 0;
}
