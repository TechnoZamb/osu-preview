import shutil
import json
from os import getcwd

with open(getcwd() + "\\debug.json", "r", encoding='utf-8') as file:
    data = json.load(file)

map = data["maps"][int(data["mapIndex"])]
skin = data["skins"][int(data["skinIndex"])]

shutil.make_archive("map", "zip", data["osuPath"] + "\\Songs\\" + map[0])
shutil.make_archive("skin", "zip", data["osuPath"] + "\\Skins\\" + skin)

# .\..\> python -m http.server --cgi