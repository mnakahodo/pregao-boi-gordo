# Pregão do Boi Gordo — jogo de mercado futuro para sala de aula

Os alunos escaneiam um QR Code com o celular e entram numa simulação de pregão de
**contratos futuros de boi gordo** (330 arrobas por contrato, como o BGI da B3).
Cada celular é um aluno ou um grupo, com um destes papéis:

| Papel | Situação | Proteção (hedge) |
|---|---|---|
| **Pecuarista** | vai VENDER 660 @ no vencimento; teme a queda | vende 0, 1 ou 2 contratos |
| **Frigorífico** | vai COMPRAR 660 @ no vencimento; teme a alta | compra 0, 1 ou 2 contratos |
| **Especulador** | não tem boi; capital de R$ 45.000 | escolhe comprado/vendido (até 3) a cada rodada |

A cada rodada o professor revela uma **notícia de mercado**. Os alunos dão o palpite
(sobe/cai), os especuladores ajustam a posição, e o professor revela o **preço de ajuste**:
o jogo calcula o **ajuste diário**, atualiza a **conta margem** e dispara **chamadas de margem**
(depositar ou zerar a posição). No vencimento, o futuro converge para o preço à vista e a tela
mostra o **preço efetivo** de cada pecuarista e frigorífico, o resultado dos especuladores,
o ranking de palpites e as lições da partida.

O baralho tem **18 notícias** inspiradas em fatos reais: o embargo chinês de 2021, a greve dos
caminhoneiros de 2018, o reconhecimento de área livre de aftosa sem vacinação (OMSA, 2025),
as tarifas dos EUA em 2025, o ciclo pecuário, a entressafra, o câmbio, a Selic e o milho.
**As magnitudes de preço são ilustrativas.** Você pode jogar 6, 8, 10 ou 12 rodadas.

---

## Como colocar no ar

O jogo precisa de um pequeno servidor (Node.js). Há duas formas de rodá-lo:

### Opção A — Online e gratuito no Render (recomendado)
Funciona em qualquer rede, inclusive no 4G dos alunos.

1. Crie uma conta gratuita no **GitHub** (github.com) e um repositório novo
   (por exemplo, `pregao-boi-gordo`).
2. No repositório, clique em **Add file → Upload files** e arraste **todo o conteúdo desta pasta**,
   exceto a pasta `node_modules`, se ela existir. Clique em **Commit changes**.
3. Crie uma conta gratuita no **Render** (render.com) usando o login do GitHub.
4. Clique em **New → Blueprint** e escolha o repositório. O arquivo `render.yaml` já está
   configurado; basta confirmar. Se preferir **New → Web Service**, preencha:
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plano: `Free`
5. Em 2 a 3 minutos o Render mostra um endereço como `https://pregao-boi-gordo.onrender.com`.

**Na aula:** abra `https://SEU-ENDERECO.onrender.com/professor` no computador ligado ao projetor.

> No plano gratuito o servidor "dorme" depois de 15 minutos sem uso, e o primeiro acesso pode
> levar até 1 minuto. **Abra a tela do professor uns 5 minutos antes da dinâmica.**

### Opção B — No seu notebook, na mesma rede Wi-Fi
1. Instale o **Node.js LTS** (nodejs.org).
2. Abra o terminal nesta pasta e rode:
   ```
   npm install
   npm start
   ```
3. Abra `http://localhost:3000/professor`. O QR Code já usa o IP do notebook na rede.

> Redes Wi-Fi de faculdade muitas vezes bloqueiam a comunicação entre aparelhos. Se os celulares
> não conseguirem entrar, ligue o notebook no **roteador do seu celular** e peça aos alunos que se
> conectem a ele, ou use a Opção A.

---

## Roteiro sugerido (20 minutos, 8 rodadas)

| Tempo | O que fazer |
|---|---|
| 0–3 min | Projete a tela do professor. Os alunos escaneiam o QR Code e digitam o nome ou o grupo. Ajuste os papéis com ↻, se quiser. Clique em **Começar**. |
| 3–5 min | **Hedge**: pecuaristas e frigoríficos decidem quantos contratos travar. Explique a margem. Clique em **Abrir o pregão**. |
| 5–15 min | **8 rodadas** de cerca de 75 segundos: leia a notícia em voz alta → os alunos dão o palpite → **Revelar** → comente o “Por quê?” e as chamadas de margem → **Próxima rodada**. |
| 15–20 min | **Resultados**: compare o preço efetivo de quem fez hedge de 100%, 50% e 0%, discuta as chamadas de margem e as perguntas de debate da tela final. |

**Pontos para destacar:**
- Quem fez hedge de 100% termina **exatamente no preço inicial**, seja qual for o caminho do mercado.
- Quem **zerou a posição** após uma chamada de margem perdeu a proteção. Se o mercado virar
  depois disso, o resultado fica pior do que sem hedge.
- O ajuste diário cobra **caixa** durante o caminho, mesmo de quem está protegido.

## Detalhes técnicos
- A partida fica na memória do servidor. Se o servidor reiniciar, a partida se perde, mas
  basta criar outra. Partidas paradas há mais de 8 horas são apagadas.
- Quem recarregar a página volta automaticamente para a mesma partida, no mesmo aparelho.
- Alunos que entram depois do início viram especuladores.
- Os parâmetros (preço inicial, margens, tamanho do contrato, capital) estão no início de
  `server.js`, no objeto `CFG`. As notícias estão em `cards.js` e podem ser editadas ou ampliadas.
- Tela do professor: `/professor`. Para criar uma sala nova do zero: `/professor?novo=1`.
  Entrada dos alunos: `/j/CÓDIGO`, ou a página inicial `/` com o código digitado.
