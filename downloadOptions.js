import { isDebug } from "./popup.js";

const providerList = {
    osu: ["https://osu.ppy.sh/beatmapsets/{id}/download", "https://osu.ppy.sh/beatmapsets/{id}/download?noVideo=1"],
    nerinyan: ["https://api.nerinyan.moe/d/{id}", "https://api.nerinyan.moe/d/{id}?nv=1"],
    sayobot: ["https://dl.sayobot.cn/beatmaps/download/{id}", "https://dl.sayobot.cn/beatmaps/download/novideo/{id}"],
    mino: ["https://catboy.best/d/{id}", "https://catboy.best/d/{id}"]
};

let savedProvider, savedUrlTemplate, savedWithVideo;

window.addEventListener("load", async (e) => {
    if (!isDebug) {
        ({ provider: savedProvider, urlTemplate: savedUrlTemplate, withVideo: savedWithVideo } = await readDownloadOptions());
        document.getElementById(savedProvider).checked = true;

        if (savedProvider === "custom") {
            document.getElementById("custom-url-input").value = savedUrlTemplate;
        }
        document.getElementById("with-video").checked = savedWithVideo;
    }
});

export const saveDownloadOptions = () => {
    const provider = document.querySelector("input[name='provider']:checked").value;
    const withVideo = document.getElementById("with-video").hasAttribute("disabled") ? false : document.getElementById("with-video").checked;
    let urlTemplate;

    if (provider === "custom") {
        const customUrl = document.getElementById("custom-url-input").value.trim();

        if (!customUrl.includes("{id}")) {
            showToast("URL must include {id}.");
            return false;
        }

        if (!/^https?:\/\//i.test(customUrl)) {
            urlTemplate = "https://" + customUrl;
        }
        else {
            urlTemplate = customUrl;
        }
    }
    else {
        urlTemplate = providerList[provider][1 - withVideo];
    }
    
    chrome.storage.local.set({ downloadOptions: { provider, urlTemplate, withVideo } }, () => {
        showToast("Saved!");
    });

    savedProvider = provider;
    savedUrlTemplate = urlTemplate;
    savedWithVideo = withVideo;

    return true;
};

export const readDownloadOptions = async () => {
    const savedDownloadOptions = (await chrome.storage.local.get("downloadOptions")).downloadOptions;
    if (!savedDownloadOptions) {
        const defaultOptions = {
            provider: "osu",
            urlTemplate: "https://osu.ppy.sh/beatmapsets/{id}/download?noVideo=1",
            withVideo: false
        };
        chrome.storage.local.set({ downloadOptions: defaultOptions });
        return defaultOptions;
    }
    else {
        return savedDownloadOptions;
    }
}

export const resetDownloadOptionsState = () => {
    if (savedProvider) {
        document.getElementById(savedProvider).checked = true;
        if (savedProvider === "custom") {
            document.getElementById("custom-url-input").value = savedUrlTemplate;
        }
    }
    document.getElementById("with-video").checked = savedWithVideo;
    if (savedProvider === "mino" || savedProvider === "custom") {
        document.getElementById("with-video").setAttribute("disabled", "");
    }
    else {
        document.getElementById("with-video").removeAttribute("disabled");
    }
};

function showToast(message, duration = 3000) {
    const toastContainer = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;

    toastContainer.appendChild(toast);
    void toast.offsetHeight;
    toast.classList.add("show");

    const hide = () => {
        toast.classList.remove("show");
        toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    };

    setTimeout(hide, duration);
}
