"""Confira os sprites do catálogo a partir da raiz do Battle Robots."""
import json
from pathlib import Path
import subprocess
import sys

from PIL import Image


def check_image(path, size):
    try:
        with Image.open(path) as image:
            image.load()
            if image.format != "WEBP":
                return "o arquivo deve ser WebP"
            if image.size != (size, size):
                return f"esperado {size} × {size} px, encontrado {image.width} × {image.height}"
            alpha = image.convert("RGBA").getchannel("A")
            minimum, maximum = alpha.getextrema()
            if maximum == 0:
                return "a imagem está totalmente transparente"
            if minimum != 0:
                return "a imagem precisa de fundo transparente"
    except FileNotFoundError:
        return "arquivo ausente"
    except (OSError, ValueError) as error:
        return f"falha ao decodificar a imagem ({error})"
    return None


def main():
    if not Path("src/catalog.js").is_file():
        sys.exit("Execute na raiz do Battle Robots, onde está src/catalog.js.")
    query = """
        import { guns, utils } from './src/catalog.js';
        console.log(JSON.stringify([Object.keys(guns), Object.keys(utils)]));
    """
    result = subprocess.run(
        ["node", "--input-type=module", "-e", query], check=True,
        capture_output=True, text=True,
    )
    guns, tools = json.loads(result.stdout)
    errors = []
    for key in sorted(set(guns) & set(tools)):
        errors.append(f"{key}: a arma e a ferramenta compartilham os mesmos arquivos de arte")

    for key in guns + tools:
        for view, size in (("hangar", 160), ("arena", 32)):
            path = Path("assets/equipment") / f"{key}-{view}.webp"
            problem = check_image(path, size)
            if problem:
                errors.append(f"{path}: {problem}")
    if errors:
        sys.exit("\n".join(errors))
    print(f"{len(guns)} armas e {len(tools)} ferramentas com as duas artes válidas.")


if __name__ == "__main__":
    main()
