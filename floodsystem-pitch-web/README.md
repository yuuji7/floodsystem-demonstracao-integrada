# Apresentação FloodSystem

Para ver os dois projetos juntos, abra `Abrir-Demonstracao-Integrada.cmd`. No slide 8, escolha **Sem chuva**, **Leve** (10 mm/h), **Forte** (90 mm/h) ou **Muito intensa** (600 mm/h) e clique em **Iniciar chuva**. O ensaio conectado envia o nível logo no início e a cada 10 segundos. O painel faz uma consulta completa a cada 10 segundos e continua detectando novos registros a cada 2 segundos. **Reiniciar** abre um ensaio separado.

A demonstração integrada usa o submódulo `floodsystem-software` na raiz do repositório, serve os dois projetos no endereço local `http://127.0.0.1:4219` e mantém os registros de simulação em um SQLite temporário. Siga as instruções de preparação no [README principal](../README.md). Para usar uma cópia do software em outro caminho, informe `-Source` ao script de preparação e passe o mesmo caminho como primeiro argumento do iniciador.

No slide 8, alterne entre **Ensaio rápido** e **Laboratório completo** na metade esquerda. O laboratório completo inclui as visões Cliente e Administrador, vazão direta, calibração, histórico do ensaio e cenários de chuva e rios. No ensaio manual a **1×**, a água e a báscula enviam leituras à direita, com a calibração da execução. Ensaios acelerados e cenários regionais usam seus próprios dados. No ensaio rápido, **Opções do 3D** oferece vistas, rótulos, interior e medidas. **Ensaio livre** abre a apresentação com velocidades ajustáveis.

Na metade direita, **Monitoramento** abre o painel original e **Interface completa** mostra toda a interface dentro do slide. **Controles** mostra os filtros e a exportação na visualização compacta. **Ensaios** abre o catálogo meteorológico publicado do FloodSystem. O catálogo e as consultas regionais precisam de internet, e as leituras manuais do 3D ficam no banco local da apresentação.

Em **Moradias**, escolha uma casa no Jardim Pantanal, um apartamento no 5º andar na Vila Leopoldina ou uma moradia junto ao córrego Pedreira. Use **Nível de 95 mm** e troque de imóvel para comparar os alertas sob as mesmas condições. **Acompanhar nível do 3D** usa o nível do reservatório do ensaio rápido como exemplo de nível externo na entrada. Cada caso mostra a ocorrência documentada, o link da fonte e os limites adotados para o teste.

Abra `FloodSystem-Pitch.html` no navegador. O arquivo funciona sozinho e sem internet. Use as setas para navegar ou selecione um slide pelo controle inferior. Pressione **F** para entrar ou sair da tela cheia.

- **Slide 8 — Demonstração:** inicie a chuva, gire o protótipo e acompanhe as leituras. Use **Ver báscula** para aproximar o mecanismo.
- **Slide 9 — Parâmetros de ensaio:** ajuste a intensidade, as duas saídas de água e a velocidade. O nível inicial entra em vigor ao clicar em **Reiniciar**.
- **Slide 10 — Cenário de moradia:** teste os três perfis de São Paulo e compare o nível externo com a altura ilustrativa de cada entrada. As fontes são as mesmas da aba **Moradias**.

As leituras da demonstração são simuladas. Os slides estáticos usam imagens exportadas do PowerPoint original.

Para editar a versão web, altere `pitch.template.html`, `pitch.css` ou `pitch.mjs` e execute `node build.mjs`. Os cenários de moradia estão em `residence.mjs`. A pasta `engine` contém cópias locais do modelo, da simulação e do Three.js, com sua licença. Nenhum arquivo do projeto principal é necessário para executar ou reconstruir a apresentação.
