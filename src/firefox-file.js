import { saveSkin, sleep } from "./functions.js";

document.querySelector("span").addEventListener("click", () => {
    alert("Because Firefox has a known bug when trying to use a file picker from an extension; as soon as it is opened, the extension closes, making it unusable. The only way to do this is to open a separate window, and use the file picker there.");
});
document.querySelector("#upload-skin-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file)
        return;

    // uploading
    const btn = document.querySelector("#upload-skin-btn");
    btn.classList.add("disabled");
    btn.innerHTML = "Uploading...";
    
    const success = await saveSkin(file);
    if (!success) {
        btn.classList.remove("disabled");
        btn.innerHTML = "Upload skin";
        alert("Failed to upload skin. Please check the console for more information.");
        return;
    }

    // done
    btn.innerHTML = "✅ Done!";
    await sleep(1500);

    window.close();
});
