# FloodSystem · Demonstração integrada

A apresentação reúne o protótipo Web3D à esquerda e o painel do FloodSystem à direita. O ensaio envia as leituras simuladas do nível da água e as viradas da báscula à API do painel. A aba **Moradias** compara os alertas em três situações documentadas em São Paulo.

## Abrir a demonstração no Windows

Instale Git, Python 3.13, Node.js 22 e pnpm 11. Execute estes comandos no PowerShell.

```powershell
git clone --recurse-submodules https://github.com/yuuji7/floodsystem-demonstracao-integrada.git
Set-Location floodsystem-demonstracao-integrada
.\floodsystem-pitch-web\Preparar-Demonstracao.ps1
.\floodsystem-pitch-web\Abrir-Demonstracao-Integrada.cmd
```

Se já clonou o repositório, execute `git submodule update --init --recursive` para baixar a versão vinculada do painel antes da preparação. O iniciador abre o [slide de demonstração](http://127.0.0.1:4219/apresentacao/#demonstracao). A API local guarda as leituras em um SQLite temporário. O catálogo de ensaios publicados e as consultas regionais usam internet.

No slide 8, selecione a intensidade e clique em **Iniciar chuva** para acompanhar o protótipo e o painel. Em **Moradias**, escolha um imóvel e clique em **Nível de 95 mm** para comparar os alertas. **Acompanhar nível do 3D** usa a leitura do reservatório como nível de referência no cenário.

Para abrir os slides, o ensaio livre e os cenários de moradia sem servidor, abra `floodsystem-pitch-web/FloodSystem-Pitch.html` diretamente no navegador.

## Estrutura

- [`floodsystem-pitch-web/`](floodsystem-pitch-web/) contém os slides e a integração local.
- [`floodsystem-web3d/`](floodsystem-web3d/) contém o laboratório Web3D completo.
- `floodsystem-software/` é o submódulo com a versão do [painel e da API originais](https://github.com/luizfelipee7/FloodSystem) usada na integração.
