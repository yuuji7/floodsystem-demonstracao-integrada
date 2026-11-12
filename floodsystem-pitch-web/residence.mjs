const PRIORITY_MARGIN_MM = 30;
const WATCH_LEVEL_MM = 30;
const WATCH_RAIN = 20;
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

const homes = {
  pantanal: {
    title: 'Casa térrea · Jardim Pantanal, Zona Leste',
    conditions: 'Casa em área baixa na várzea do Tietê, com soleira próxima ao piso externo.',
    exposure: 'A água acumulada no acesso pode entrar direto na casa ao passar da soleira.',
    fact: 'De 31 jan. a 1º fev. de 2025, a Prefeitura registrou 92 mm de chuva na região e atendeu famílias com casas atingidas.',
    source: 'Prefeitura de São Paulo',
    url: 'https://prefeitura.sp.gov.br/w/prefeitura-estabelece-empenho-total-para-reduzir-danos-causados-pelo-temporal-que-atingiu-a-cidade',
    contextSource: { label: 'Várzea do Tietê', url: 'https://prefeitura.sp.gov.br/w/prefeitura-analisa-alternativas-para-solucionar-alagamentos-no-jardim-pantanal' },
    entry: 80,
    entryLabel: 'Soleira',
    point: 'Casa térrea',
    floodTitle: 'Água entrou na casa',
    priorityAction: 'Acompanhe a subida da água de um local seguro e siga as orientações da Defesa Civil.'
  },
  leopoldina: {
    title: 'Apartamento no 5º andar · Vila Leopoldina, Zona Oeste',
    conditions: 'Unidade no 5º andar, com garagem subterrânea e rampa de acesso a partir da rua.',
    exposure: 'A rampa pode levar água ao subsolo e comprometer o acesso, mesmo com a unidade acima da área atingida no teste.',
    fact: 'Em 10 fev. de 2020, imagens publicadas pela Record registraram veículos submersos na garagem de um prédio residencial do bairro.',
    source: 'Registro em vídeo da Record',
    url: 'https://record.r7.com/balanco-geral/videos/carros-ficam-submersos-em-garagem-de-predio-na-vila-leopoldina-em-sao-paulo-12062022/',
    contextSource: { label: 'Plano preventivo municipal', url: 'https://prefeitura.sp.gov.br/web/lapa/w/noticias/16761' },
    entry: 100,
    entryLabel: 'Limite da rampa',
    point: 'Acesso ao subsolo',
    floodTitle: 'Água entrou na garagem',
    priorityAction: 'Avise a portaria e mantenha as pessoas longe da rampa enquanto a água sobe.'
  },
  ubirajara: {
    title: 'Moradia junto ao córrego Pedreira · Jardim Ubirajara, Zona Sul',
    conditions: 'Moradia próxima ao córrego, com entrada voltada para uma área exposta ao transbordamento.',
    exposure: 'A água que sai da calha pode alcançar o acesso da moradia e entrar pelo piso térreo.',
    fact: 'A Prefeitura documentou a entrada de água em uma casa junto ao córrego Pedreira em janeiro de 2019.',
    source: 'Prefeitura de São Paulo',
    url: 'https://prefeitura.sp.gov.br/w/obras-de-recomposi%C3%A7%C3%A3o-e-conten%C3%A7%C3%A3o-das-margens-do-c%C3%B3rrego-pedreira-v%C3%A3o-p%C3%B4r-fim-aos-alagamentos',
    entry: 120,
    entryLabel: 'Soleira',
    point: 'Entrada da moradia',
    floodTitle: 'Água entrou na moradia',
    priorityAction: 'Mantenha distância do córrego e acompanhe as orientações da Defesa Civil.'
  }
};

const examples = {
  leve: { rain: 8, previous: 5, level: 5 },
  forte: { rain: 32, previous: 6, level: 14 },
  subindo: { rain: 48, previous: 40, level: 75 },
  comparacao: { rain: 48, previous: 65, level: 95 },
  entrou: { rain: 55, previous: 82, level: 125 }
};

const urgentAction = 'Mantenha as pessoas em local seguro e evite atravessar áreas alagadas. Em emergência, ligue 199 ou 193.';

function assess(home, level, rain, rising, linked) {
  const margin = home.entry - level;
  if (margin < 0) return {
    severity: 'flood', title: home.floodTitle,
    reason: `A água passou ${number.format(-margin)} mm do limite da entrada e encontrou passagem livre no teste.`,
    action: urgentAction
  };
  if (margin === 0) return {
    severity: 'priority', title: `Água ${home.entryLabel === 'Soleira' ? 'na soleira' : 'no limite da rampa'}`,
    reason: 'O nível externo chegou à altura da entrada monitorada.',
    action: urgentAction
  };
  if (margin <= PRIORITY_MARGIN_MM) return {
    severity: 'priority', title: 'Aviso prioritário',
    reason: `Faltam ${number.format(margin)} mm para a água alcançar a entrada monitorada.`,
    action: home.priorityAction
  };
  if (rain >= WATCH_RAIN || (level >= WATCH_LEVEL_MM && rising)) {
    const rainSummary = linked ? `A intensidade configurada é de ${rain} mm/h.` : `A chuva simulada foi de ${rain} mm em uma hora.`;
    return {
      severity: 'watch', title: 'Atenção',
      reason: rain >= WATCH_RAIN
        ? `${rainSummary} A água está ${number.format(margin)} mm abaixo da entrada.`
        : 'A água está subindo e atingiu o nível de atenção do ensaio.',
      action: 'Acompanhe o nível no acesso e os avisos oficiais para a região.'
    };
  }
  return {
    severity: 'observe', title: 'Acompanhamento',
    reason: 'O nível e a chuva estão abaixo dos critérios de atenção do ensaio.',
    action: 'Continue acompanhando a chuva e o nível externo.'
  };
}

export function setupResidence(content) {
  const find = id => content.querySelector(`#${id}`);
  const diagram = find('residence-diagram');
  const levelInput = find('residence-level-input');
  const alert = find('residence-alert');
  const follow = find('residence-follow-lab');
  const alertTitle = find('residence-alert-title');
  const buttons = [...content.querySelectorAll('[data-residence-example]')];
  const homeButtons = [...content.querySelectorAll('[data-residence-home]')];
  let homeKey = 'pantanal';
  let selected = 'forte';
  let labReading = null;

  function showHome() {
    const home = homes[homeKey];
    find('residence-home-title').textContent = home.title;
    find('residence-conditions').textContent = home.conditions;
    find('residence-exposure').textContent = home.exposure;
    find('residence-fact').textContent = home.fact;
    const source = find('residence-source');
    source.textContent = home.source;
    source.href = home.url;
    const context = find('residence-context-source');
    context.hidden = !home.contextSource;
    if (home.contextSource) {
      context.textContent = home.contextSource.label;
      context.href = home.contextSource.url;
    }
    find('residence-point').textContent = home.point;
    find('residence-entrance').textContent = `${home.entryLabel} · ${home.entry} mm`;
    find('residence-thresholds').textContent = `${home.entryLabel} a ${home.entry} mm · aviso prioritário a partir de ${home.entry - PRIORITY_MARGIN_MM} mm.`;
    diagram.style.setProperty('--entry-level', home.entry);
    for (const button of homeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.residenceHome === homeKey));
    }
  }

  function render() {
    const sample = examples[selected];
    const home = homes[homeKey];
    const linked = labReading !== null;
    const level = labReading?.level ?? levelInput.valueAsNumber;
    const rain = labReading?.rain ?? sample.rain;
    const delta = level - sample.previous;
    const result = assess(home, level, rain, labReading?.rising ?? (delta > 0), linked);
    const trend = delta > 0 ? `Subiu ${delta} mm` : delta < 0 ? `Baixou ${-delta} mm` : 'Nível estável';

    diagram.style.setProperty('--water-level', level);
    diagram.style.setProperty('--inside-level', Math.max(0, level - home.entry));
    diagram.dataset.flooded = String(level > home.entry);
    find('residence-rain-label').textContent = linked ? 'Chuva configurada no 3D' : 'Chuva simulada em 1 h';
    find('residence-rain-unit').textContent = linked ? 'mm/h' : 'mm';
    find('residence-rain').textContent = rain;
    find('residence-level').textContent = number.format(level);
    find('residence-trend').textContent = linked ? 'Nível do tanque usado no cenário' : `${trend} em 10 min`;
    follow.setAttribute('aria-pressed', String(linked));
    levelInput.closest('label').hidden = linked;
    levelInput.setAttribute('aria-valuetext', `${levelInput.value} milímetros`);
    alert.dataset.severity = result.severity;
    if (alertTitle.textContent !== result.title) alertTitle.textContent = result.title;
    find('residence-alert-reason').textContent = result.reason;
    find('residence-alert-action').textContent = result.action;

    for (const button of buttons) {
      const pressed = !linked && button.dataset.residenceExample === selected && level === sample.level;
      button.setAttribute('aria-pressed', String(pressed));
    }
  }

  for (const button of buttons) button.addEventListener('click', () => {
    selected = button.dataset.residenceExample;
    levelInput.value = examples[selected].level;
    labReading = null;
    render();
  });
  for (const button of homeButtons) button.addEventListener('click', () => {
    homeKey = button.dataset.residenceHome;
    showHome();
    render();
  });
  levelInput.addEventListener('input', render);
  showHome();
  render();

  return {
    get followingLab() { return labReading !== null; },
    showLabReading(level, rain, rising) {
      const roundedLevel = Math.round(level * 10) / 10;
      if (labReading?.level === roundedLevel && labReading.rain === rain && labReading.rising === rising) return;
      labReading = { level: roundedLevel, rain, rising };
      render();
    },
    stopFollowingLab() {
      if (!labReading) return;
      labReading = null;
      render();
    }
  };
}
