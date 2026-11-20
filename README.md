# Battle Robots

Duelo 2D de robôs autônomos para dois jogadores no mesmo navegador. No hangar, distribua pontos, selecione equipamentos e escolha uma estratégia para cada robô. A partida começa assim que os dois jogadores clicam em **Pronto**.

Na arena, os robôs contornam paredes, desaceleram na lama e usam o equipamento instalado. A partida termina no primeiro nocaute ou quando o cronômetro chega a zero. Vence o robô com mais HP absoluto. Valores iguais resultam em empate.

Quando os dois robôs estão em contato e tentam avançar um contra o outro, o de maior **Potência** empurra o adversário na direção em que avança. Quanto maior a diferença de Potência, mais rápido o empurrão. Potências iguais mantêm a disputa no lugar.

Os espinhos aparecem em placas no campo e em toda a borda interna. Enquanto o chassi toca os espinhos, o robô perde 4 HP por segundo e se move à metade da velocidade. Os robôs tentam contornar essas áreas e sair delas quando são atingidos.

Durante o duelo, os robôs disputam drops que aparecem a cada 5 segundos e permanecem na arena até a coleta. Eles também procuram cobertura, recuam sob ameaça e tentam escapar dos cantos.

| Drop | Efeito ao coletar |
| --- | --- |
| Vida | Recupera 15% do HP máximo, até o limite de vida. |
| Atributo | Aumenta um atributo aleatório em 10% por 5 segundos. Repetir o mesmo bônus renova sua duração. |
| Arma | Instala uma arma adicional aleatória por 10 segundos. |
| Ferramenta | Instala uma ferramenta adicional aleatória por 10 segundos. |
| Teletransporte | Leva o robô imediatamente a uma posição livre da arena. |

Se o robô já tiver todos os itens da categoria sorteada, recebe um bônus de atributo.

## Rodar localmente

O jogo foi projetado para computadores com resolução Full HD (1920 × 1080) ou superior.

Sirva a raiz do repositório com um servidor HTTP. O jogo não exige instalação de dependências.

```sh
python3 -m http.server 8000
```

Abra [localhost:8000](http://localhost:8000).

## Organização do código

- `src/main.js` inicializa a página, aplica o idioma e alterna entre hangar e arena.
- `src/hangar/` reúne a edição dos robôs, a persistência local e a importação e exportação em JSON.
- `src/battle.js` coordena cada passo da partida. Os módulos de `src/simulation/` calculam terreno, rotas, movimento, colisões e ataques.
- `src/arena/` controla a partida no navegador e apresenta o campo, o placar e o histórico de eventos.
- `src/ui/` contém ícones e formatadores compartilhados. As folhas de estilo ficam em `styles/`, divididas entre base, hangar e arena.

## Testes

Use Node.js 22 ou superior. Os testes de ponta a ponta também usam Python 3 para servir o jogo localmente.

```sh
npm ci
npx playwright install chromium
npm test
```

Use `npm run test:unit` para rodar apenas os testes unitários ou `npm run test:e2e` para rodar apenas os testes no Chromium.

## Configuração

Edite [config.js](config.js).

| Regra | Padrão |
| --- | ---: |
| `ATTRIBUTES_POINTS` | 5000 |
| `BATTLE_TIME_IN_SECONDS` | 300 |
| `ATTRIBUTES_BASE` | 10 |
| `GUNS_QUANTITY` | 1 |
| `UTILS_QUANTITY` | 1 |

Use HP base e duração positivos. Atualmente é possível instalar de 0 a 9 armas e de 0 a 5 ferramentas distintas por robô. A recarga de cada ferramenta começa no instante da ativação.

## GitHub Pages

Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions** como origem. O workflow [GitHub Pages](.github/workflows/pages.yml) publica o site ao receber um push em `master` ou `main`. Também pode ser disparado manualmente pela aba **Actions**.
