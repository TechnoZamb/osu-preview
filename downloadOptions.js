const providerList = {
    osu: "https://osu.ppy.sh/beatmapsets/{id}/download?noVideo=1",
    nerinyan: "https://api.nerinyan.moe/d/{id}?nv=1",
    sayobot: "https://dl.sayobot.cn/beatmaps/download/novideo/{id}",
    mino: "https://catboy.best/d/{id}"
};

if (document.body.className === "download-options") {
    window.addEventListener("load", async (e) => {
        const { provider, urlTemplate } = await readDownloadOptions();
        document.getElementById(provider).checked = true;

        if (provider === "custom") {
            document.getElementById("custom-url-input").value = urlTemplate;
        }

        document.getElementById("save-btn").addEventListener("click", saveDownloadOptions);
    });
}

const saveDownloadOptions = () => {
    const provider = document.querySelector("input[name='provider']:checked").value;
    let urlTemplate;

    if (provider === "custom") {
        const customUrl = document.getElementById("custom-url-input").value.trim();

        if (!customUrl.includes("{id}")) {
            showToast("URL must include {id}.");
            return;
        }

        if (!/^https?:\/\//i.test(customUrl)) {
            urlTemplate = "https://" + customUrl;
        }
        else {
            urlTemplate = customUrl;
        }
    }
    else {
        urlTemplate = providerList[provider];
    }
  
    chrome.storage.local.set({ downloadOptions: { provider, urlTemplate } }, () => {
        showToast("Saved!");
    });
};

export const readDownloadOptions = async () => {
    const savedDownloadOptions = (await chrome.storage.local.get("downloadOptions")).downloadOptions;
    if (!savedDownloadOptions) {
        const defaultOptions = {
            provider: "osu",
            urlTemplate: "https://osu.ppy.sh/beatmapsets/{id}/download?noVideo=1"
        };
        chrome.storage.local.set({ downloadOptions: defaultOptions });
        return defaultOptions;
    }
    else {
        return savedDownloadOptions;
    }
}

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

