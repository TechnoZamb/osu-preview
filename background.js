chrome.declarativeNetRequest.updateDynamicRules({
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
