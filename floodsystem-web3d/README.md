# FloodSystem — teste Web3D

Modelo interativo criado a partir da fotografia do protótipo, das medidas fornecidas e do artigo “Sistema inteligente de monitoramento e prevenção de enchentes com Internet of Things (IoT) e algoritmo de previsão”, DOI https://doi.org/10.33448/rsd-v15i10.51935.

## Como abrir no Windows

1. Execute `Iniciar-FloodSystem.cmd` com um duplo clique.
2. O navegador abrirá em **http://127.0.0.1:4173**.
3. Mantenha a janela do servidor aberta enquanto usar o modelo. Feche-a para encerrar.

Use **Node.js 20 ou superior** para ter o ensaio e a consulta das APIs no servidor local. O iniciador tem uma opção em Python que serve o ensaio estático. O protótipo 3D funciona sem internet com a biblioteca incluída em `dist/vendor`. As consultas regionais precisam de internet.

Também é possível executar `node server.mjs` nesta pasta e abrir o endereço acima. Abrir `dist/index.html` diretamente com duplo clique não é suficiente, porque o navegador precisa servir os módulos JavaScript por HTTP.

## Como usar

- A tela **Cliente** abre em **Ao vivo**. Selecione a estação que representa sua região para ver se está chovendo, a tendência da água, o status e a ação sugerida. A escolha da estação fica salva no navegador.
- Em **Cliente → Simular chuva**, abra o modelo 3D, escolha a intensidade e inicie a demonstração. A visão Cliente tem seu próprio ensaio com controles de pausa e reinício.
- Use **Administrador** para acessar o protótipo 3D, controlar o ensaio e ver as leituras técnicas. O ensaio mantém o estado ao trocar de visão.
- Em **Administrador → Apresentação**, veja o protótipo, as leituras e os controles em tela cheia. Pressione **Esc** ou clique em **Sair da apresentação** para voltar ao painel.
- Arraste o protótipo para girar; use a roda do mouse para aproximar.
- **Lateral** mostra a saída de segurança. **Báscula** aproxima a câmera do mecanismo.
- **Rótulos**, **Ver interior** e **Medidas** ajudam a inspecionar a montagem.
- Controle a chuva em mm/h ou escolha **Vazão direta**, em mL/min por funil.
- Ajuste separadamente a torneira do reservatório e o dreno após a báscula.
- Use **1×, 10×, 30× ou 60×** para mudar somente a velocidade de observação.
- **Pausar** interrompe o ensaio; **↺** reinicia com o nível inicial configurado.
- Em **Medidas e calibração**, alterar o diâmetro do funil recalcula o volume equivalente a 2,17 mm por basculada. O volume e as vazões também podem ser ajustados manualmente.
- **Usar área de referência do artigo** aplica 104,8 cm², representados por uma abertura circular de aproximadamente 115,5 mm.
- **Histórico do ensaio** registra a chuva aplicada e medida, os pulsos, o nível e a faixa ao fim de cada janela de 10 minutos simulados. O ensaio mantém os 144 registros mais recentes na sessão. Reiniciar limpa o histórico.

## Chuva, rio e aviso antecipado

- **Ao vivo** destaca estações da [Defesa Civil RS](https://sistemas.defesacivil.rs.gov.br/api-redehidrometeorologica) com chuva medida nos últimos 5 minutos e cidades com chuva estimada pelo [Open-Meteo](https://open-meteo.com/en/docs). Ao selecionar um local, o 3D aplica a leitura de chuva em tempo acelerado uma vez por intervalo. Leituras duplicadas não repetem a chuva. O painel ao lado mostra a faixa oficial da estação quando disponível e distingue os avisos gerados pelo protótipo.
- **Testar chuva passada** abre a lista com média em mm/h, chuva acumulada e alerta oficial, quando há boletim correspondente. Os casos de Muçum e Encantado incluem 48 horas da rede da Defesa Civil RS até 05/11/2026 às 17h40. O [boletim do SGB](https://www.sgb.gov.br/w/bacia-do-rio-taquari-niveis-dos-rios-apresentam-elevacao-apos-chuvas-recentes-conforme-boletim-divulgado-pelo-sgb) registrou Alerta e Atenção, respectivamente, para o rio Taquari às 06h.
- **Reproduzir** percorre o período inteiro e aplica cada acumulado de 10 minutos no protótipo. **Ver chuva** vai ao primeiro intervalo chuvoso e **Ver aviso** ao primeiro sinal combinado disponível. O detector usa o nível regional dos blocos já concluídos. A média considera apenas os blocos com chuva medida, incluindo os que registraram zero. Lacunas ficam identificadas e a simulação hidráulica reinicia no próximo bloco conhecido. É possível buscar outros períodos de 48 horas da rede.
- O indicador experimental considera chuva intensa (30 mm/h), acumulado (30 mm em uma hora) e subida rápida (5 mm/min). Ele dá o mesmo peso aos sinais de chuva e de subida. Os limites servem à demonstração. O percentual e a margem descrevem a escala do painel. A chance de inundação de um imóvel depende da medição no local, da exposição e da validação do método.
- Na visão Administrador, a consulta por coordenadas usa a [camada de suscetibilidade à inundação do SGB](https://geoportal.sgb.gov.br/server/rest/services/gestaoterritorial/inundacao/MapServer). Ela descreve o terreno nas áreas mapeadas.

## Dimensões adotadas

Todas as medidas abaixo estão em milímetros. Largura × profundidade × altura:

| Peça | Dimensões | Origem |
| --- | --- | --- |
| Estrutura principal | 300 de largura × 265,5 de altura, sem funis | Usuário |
| Reservatório esquerdo | 130 × 96 × 265,5 | Usuário |
| Caixa superior direita | 160 × 145 × 168 | Usuário |
| Chapas de acrílico | 5 de espessura | Usuário |
| Saída de segurança na lateral esquerda | 80 de largura × 5 de altura | Altura fornecida. Largura ajustada à parede de 96 mm |
| Compartimento eletrônico direito | 160 × 145 × 97,5 | Hipótese: diferença até 265,5 |
| Báscula móvel | aproximadamente 128 × 82 × 40 | Reconstrução visual das duas cubas e do divisor na foto |
| Boca dos funis | 95 de diâmetro | Aproximação de uma garrafa de 1,5 L |
| Altura dos funis cortados | aproximadamente 100, incluindo tampa | Aproximação visual |
| Mangueiras azuis | 4 de diâmetro interno em todas. Diâmetro externo de cerca de 5,2 na entrada e 6 na saída | Diâmetro interno informado. Diâmetros externos aproximados pela foto |

Os dois módulos somam 290 mm de largura; foram reservados 10 mm para o intervalo entre eles. A base de transporte, as mangueiras salientes e os funis podem ultrapassar o contorno da estrutura principal, como na fotografia. A caixa eletrônica está separada do compartimento molhado. O dreno direito proposto sai pela parede lateral acima dessa divisória.

## Funcionamento e hipóteses

- O ultrassônico é ilustrado acima do reservatório. A leitura representa a distância vertical até a água e sua conversão para nível.
- A báscula alterna ao acumular um volume de referência. Um ímã solidário à peça passa junto ao sensor magnético fixo. A indicação de pulso acompanha as viradas.
- A calibração padrão gera uma virada a cada **2,17 mm de chuva acumulada no funil**. O volume equivalente é a área de captação em cm² multiplicada por 2,17 e dividida por 10. O cálculo usa o volume sem arredondamento.
- A chuva entra em cada funil conforme sua área de captação: `Q[mL/min] = intensidade[mm/h] × área[cm²] / 600`.
- Com o funil de 95 mm, 2,17 mm de chuva correspondem a cerca de **15,38 mL por virada**. Com a área de 104,8 cm² do artigo, correspondem a **22,74 mL**.
- No modo de vazão direta, a água é aplicada igualmente aos dois funis. As mangueiras de 4 mm internos estão representadas no 3D. As vazões de referência são estimativas e podem ser ajustadas após medições.
- A saída esquerda tem referência de **40 mL/min com 100 mm de água sobre a saída**, totalmente aberta. A direita tem **160 mL/min com 20 mm de água**, totalmente aberta. São hipóteses de simulação.
- As vazões variam como `Q = Qref × abertura × sqrt(altura / alturaRef)`. A relação linear com a abertura é uma simplificação, não uma curva calibrada de válvula.
- O nível inicial é **40 mm** para tornar o reservatório visível; pode ser alterado para zero no painel.
- O volume inicial é contabilizado no balanço. São conservados separadamente entrada, armazenamento, saída e transbordamento em cada módulo. A água do lado direito chega ao dreno depois de passar pela báscula.
- A borda inferior da saída de segurança fica a **195,5 mm** do fundo interno do reservatório. Na simulação, toda a água acima dessa borda escoa pela abertura. O painel registra essa vazão separadamente da torneira.
- O aviso antecipado usa a intensidade aplicada e a velocidade de subida calculada pelo ensaio. A faixa de nível até a abertura aparece separadamente no histórico de bancada. A bandeja direita registra transbordamento acima de 45 mm. O artigo avalia a conversão de chuva em pulsos e deixa o desempenho de alertas para estudos futuros.
- O teste usa integração em pequenos passos e uma animação geométrica. Não resolve a dinâmica de fluidos 3D, o torque da báscula, as perdas completas das mangueiras, o armazenamento nos funis nem a capacidade máxima de passagem dos gargalos. Não substitui ensaios físicos ou calibração instrumental.

Referência aproximada para a garrafa de 1,5 L (outra versão comercial): https://merakettim.coca-colaturkiye.com/soru-detay/merhaba-1-5-lt-lik-sisenin-capi-ne-kadar--44165.

Referências para a relação de descarga por orifício e a necessidade de calibração:
- https://help.autodesk.com/cloudhelp/ENG/INFDS-UserGuide/files/GUID-8C4FAD55-7D4D-4236-A36E-0C52F5497428.htm
- https://www.usbr.gov/tsc/techreferences/mands/wmm/chap02_15.html

## Arquivos e verificação

- `dist/`: aplicação pronta para servir ou hospedar.
- `dist/model.js`: geometria, câmera e animações Three.js.
- `dist/physics.mjs`: cálculo dos volumes e leituras, sem dependência do navegador.
- `dist/app.js`: controles e atualização da interface.
- `dist/region.js`: consulta regional, gráfico e leitura de suscetibilidade do SGB.
- `dist/risk.mjs`: regras compartilhadas entre leituras atuais, reprodução histórica e ensaio.
- `api/hidro.js`: função de leitura das APIs de chuva e da rede hidrometeorológica, usada também pelo servidor local.
- `tests/physics.test.mjs`: verificações de conservação, calibração, transbordamento, drenagem, intervalos e independência da velocidade.
- `server.mjs`: servidor HTTP restrito ao computador local.
- `Iniciar-FloodSystem.cmd`: iniciador para Windows.

Para verificar o cálculo: `npm test` ou `node --test tests/physics.test.mjs`.

Three.js 0.180.0 está incluído sob licença MIT; consulte `dist/vendor/THREE-LICENSE.txt`.
