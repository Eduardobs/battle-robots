---
name: battle-robots-equipment
description: Crie ou atualize armas e ferramentas do jogo Battle Robots, integre sua mecânica e produza ou valide os sprites usados no hangar e na arena 2D.
---

# Equipamentos do Battle Robots

## Identidade e integração

- Escolha uma chave estável e única entre `guns` e `utils` em `src/catalog.js`. Os loadouts salvos usam essa chave. As duas categorias compartilham o diretório de imagens e o cache de sprites da arena.
- Registre os atributos consumidos pela mecânica e um `icon` existente em `src/ui/icons.js`, ou desenhe um pictograma coerente se precisar de outro. Traduza `<categoria>.<chave>.name` e `.description` em `src/locales/{pt-br,en,es}.js`.
- Para armas, siga uma mecânica análoga em `src/simulation/weapons.js` desde o ataque até a resolução do acerto. Para ferramentas, confira `shouldActivateTool` e `useTools` em `src/battle.js`, além do ponto onde o efeito realmente atua. Use o relógio da simulação para duração e recarga.
- Ao ampliar o catálogo, complete as listas de prioridade em `src/hangar/presets.js` e `src/hangar/loadouts.js` para suportar o máximo de encaixes. Acrescentar a chave ao fim preserva as escolhas iniciais quando o pedido não altera a composição dos robôs.

## Artes da mesma peça

| Destino em `assets/equipment/` | Arte a produzir | Uso no jogo |
| --- | --- | --- |
| `<chave>-hangar.webp` | 160 × 160 px, fundo transparente. Ilustração da peça isolada, vista em três quartos por cima, frente para baixo e à direita. Centralize a silhueta com margem para o encaixe. | Arsenal, seletor e montagem sobre o chassi. |
| `<chave>-arena.webp` | 32 × 32 px, fundo transparente. Vista de cima com a frente para a direita no eixo X local. Use contorno simples e uma cor de destaque reconhecível em poucos pixels. | Robô em combate e identificação no placar. |

Escolha uma característica visual que sobreviva à redução, como a cabeça transversal de um martelo, e repita-a nas duas vistas. Use uma peça existente como referência de escala. Para o hangar, gere a ilustração ou adapte a arte fornecida pelo usuário e exporte o WebP com alfa. Para a arena, adicione o desenho ao `render(key)` e a chave à sequência de geração em `scripts/render-equipment.py`. Execute `python3 scripts/render-equipment.py` e confira o diff dos binários.

O jogo resolve ambos os nomes por `spriteUrl` em `src/ui/equipment-art.js`. Com o par correto, o hangar e o Canvas montam a peça dinamicamente. Se a mecânica introduzir um projétil ou efeito próprio, trate sua representação em `src/arena/renderer.js`.

## Verificação

Na raiz do repositório, execute o validador da skill com Node.js e Python com Pillow disponíveis.

```sh
python3 .agents/skills/battle-robots-equipment/scripts/validate_assets.py
```

O validador percorre o catálogo real, decodifica cada par e indica o arquivo a corrigir. Para uma nova mecânica, execute também `npm test` e cubra o comportamento específico que a suíte ainda não exercita. No navegador, equipe a peça, confira o destaque no encaixe e veja a mesma silhueta no robô em combate. Verifique a leitura nos temas claro e escuro e, quando aplicável, a entrada e a saída da peça como drop temporário.
