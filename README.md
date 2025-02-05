# osu! preview

osu! preview is a browser extension that allows you to preview osu!standard beatmaps in your browser. It correctly plays most maps, renders 99% similarly to the osu! client, gives you a seekbar to jump to any part of the map while keeping audio synced, allows you to adjust all volumes and background dim, it has support for mods (EZ, HR, HT, DT, HD, FL), skins, and autoplay.
Built on plain HTML, CSS and Javascript. Uses [zip.js](https://github.com/gildas-lormeau/zip.js).

## Controls

 - `Spacebar` - Play/pause
 - `Mouse wheel` - Volume (hover over each channel to change its volume individually)
 - `Left/Right arrows` - Rewind/skip 3 seconds
 - `Number/Numpad 0-9` - Jump to 0-90% of the beatmap
 - `Tab` - Open/close 'More' panel

Buttons used to activate/deactivate mods in osu! also work in osu! preview.

 - `Q` - EZ, `E` - HT, `A` - HR, `D` - DT, `F` - HD, `G` - FL

## How it works

First, you need to be **logged in** on osu.ppy.sh for any of this to work. The extension downloads the map you are on to local storage and stores it for an hour, so that you don't need to download it again in case you want to open it in your client, as it gives you the local version when pressing the 'Download' button on the extension. Then, it unpacks the .osz (because most osu! file formats are actually just compressed archives) and reads the file it needs. Your skin and settings are saved to local storage as well.

## Report a problem

If you see anything that shouldn't be happening, please let me know however you prefer: open an issue on this repository, DM me on osu!, or write an email at technozamb19@gmail.com. If any of the folllowing apply, please specify:

- the link to the map you were on when the issue occured;
- the minute and second into the map when the issue occured;
- any other useful information to reproduce the issue.