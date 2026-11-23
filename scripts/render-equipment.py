"""Bake the small top-down arena sprites. The hangar uses separate illustrated assets."""
from math import cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw

OUTPUT = Path(__file__).resolve().parents[1] / "assets" / "equipment"
INK = "#172124"
STEEL = "#dce2df"
GRAY = "#737f80"
GOLD = "#ffb747"
ICE = "#60def1"
VIOLET = "#d0a0ff"


def render(key):
    # The front of all mounts points right, along the robot's local X axis.
    image = Image.new("RGBA", (32, 32))
    draw = ImageDraw.Draw(image)

    def box(bounds, color):
        draw.rectangle(bounds, fill=color, outline=INK, width=2)

    def disc(bounds, color):
        draw.ellipse(bounds, fill=color, outline=INK, width=2)

    def shape(points, color):
        draw.polygon(points, fill=color)
        draw.line([*points, points[0]], fill=INK, width=2, joint="curve")

    if key == "flame":
        box((8, 11, 24, 21), GRAY)
        disc((2, 5, 17, 25), "#ed5430")
        shape([(19, 12), (29, 8), (29, 24), (19, 20)], GOLD)
    elif key == "nitrogen":
        box((9, 12, 29, 19), STEEL)
        for y in (3, 16):
            box((3, y, 19, y + 11), ICE)
            draw.line((8, y + 2, 8, y + 8), fill=STEEL, width=2)
    elif key == "pistol":
        box((3, 10, 16, 22), GRAY)
        box((10, 12, 31, 19), STEEL)
    elif key == "saw":
        box((1, 13, 18, 19), GRAY)
        teeth = []
        for i in range(20):
            radius = 12 if i % 2 == 0 else 8
            angle = i * pi / 10
            teeth.append((round(19 + radius * cos(angle)), round(16 + radius * sin(angle))))
        shape(teeth, "#ff9938")
        disc((13, 10, 25, 22), STEEL)
    elif key == "hammer":
        box((2, 13, 25, 19), STEEL)
        box((20, 3, 29, 28), GOLD)
        draw.line((22, 17, 27, 12), fill=INK, width=3)
    elif key == "hook":
        disc((1, 10, 13, 22), GOLD)
        draw.line((11, 16, 28, 16), fill=STEEL, width=4)
        shape([(29, 16), (16, 4), (17, 11), (23, 16), (17, 21), (16, 28)], "#5ce4cf")
    elif key == "pulse":
        box((2, 12, 29, 20), GRAY)
        for x in (6, 14, 22):
            box((x, 6, x + 5, 26), ICE)
    elif key == "disc":
        disc((6, 6, 27, 26), "#a8e751")
        disc((12, 12, 20, 20), GRAY)
        for y in (3, 23):
            box((2, y, 24, y + 5), STEEL)
    elif key == "echo":
        box((2, 12, 18, 20), GRAY)
        shape([(10, 12), (26, 3), (26, 29), (10, 20)], VIOLET)
        draw.line((25, 16, 30, 16), fill=STEEL, width=3)
    elif key == "shield":
        shape([(3, 9), (16, 3), (29, 9), (25, 22), (16, 29), (7, 22)], "#5498ff")
        shape([(10, 11), (22, 11), (16, 21)], ICE)
    elif key == "nitro":
        for y in (4, 17):
            box((4, y, 27, y + 10), "#58a6f7")
            draw.rectangle((5, y + 2, 10, y + 8), fill=GOLD)
    elif key == "beacon":
        disc((3, 3, 28, 28), GRAY)
        disc((8, 8, 24, 24), GOLD)
    elif key == "hologram":
        shape([(16, 2), (29, 16), (16, 30), (3, 16)], VIOLET)
        draw.line((8, 16, 23, 16), fill=STEEL, width=2)
    elif key == "treads":
        box((2, 7, 29, 25), GRAY)
        for x in (6, 13, 20):
            draw.rectangle((x, 10, x + 3, 22), fill=GOLD)
    else:
        raise ValueError(key)
    return image


if __name__ == "__main__":
    keys = "flame nitrogen pistol saw hammer hook pulse disc echo shield nitro beacon hologram treads"
    for key in keys.split():
        render(key).save(OUTPUT / f"{key}-arena.webp", lossless=True)
