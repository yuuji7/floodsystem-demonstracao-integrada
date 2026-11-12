const RS = 'https://redehidrometeorologica.defesacivil.rs.gov.br/graphql';
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
// The RS service accepts only the exact field list in its published queries.
const TAGS = "query Tags_data { tags_data(clients: [\"casa-militar-defesa-civil-rs\"]) { qualle_meteorologia { codigo name { prefix general local } show timestamp position { bacia latitude longitude regiao altitude filtros { outros { crepdec { nome { value } codigo { value } } } } } " +
  " data { rio { rio_alarmes { inundacao { ativo { value } status { value } } } rio_nome { value } rio_nivel { value } rio_nivel_tendencia { value } rio_area_drenagem { value } homologacao { relacao { valido { value } } } }" +
  " chuva { acumulado { min005 { value } h001 { value } h003 { value } h006 { value } h012 { value } h024 { value } h048 { value } h168 { value } } homologacao { relacao { valido { value } } } }" +
  " pressaoatmos { atual { value } historico { diaanterior { media { value } } diaatual { media { value } } } tendencia { value } homologacao { relacao { valido { value } } } }" +
  " senstermica { atual { value } historico { diaatual { media { value } } diaanterior { media { value } } } tendencia { value } homologacao { relacao { valido { value } } } }" +
  " radiacaosolar { atual { value } homologacao { relacao { valido { value } } } }" +
  " temperatura { atual { value } historico { diaanterior { media { value } } diaatual { media { value } maxima { value } minima { value } } } tendencia { value } homologacao { relacao { valido { value } } } }" +
  " umidade { atual { value } historico { diaanterior { media { value } } diaatual { media { value } } } tendencia { value } homologacao { relacao { valido { value } } } }" +
  " vento { direcao { value } velocidade_maxima { value } velocidade_media { value } homologacao { relacao { valido { value } } } } } type filter { relacao { tem_chuva_acumulada tem_nivel_do_rio tem_pressao_atmosferica tem_sensacao_termica tem_umidade tem_vazao_do_rio tem_vento } } resource { estacao { estado { manutencao { value } } } } } proximaAtualizacaoEm } }";
const HISTORIC = "query Historic($stationCode: String!, $startDate: String!, $endDate: String!, $interval: QueryInterval) { historic( system: Qualle_Hidrometeorologia client: \"casa-militar-defesa-civil-rs\" stationCode: $stationCode startDate: $startDate endDate: $endDate interval: $interval opts: { ordenacao: ASC } ) }";

const tenMinutes = 600_000;
const windowHours = 48;
const cities = [
  ['Rio Branco', 'AC', -9.97, -67.81], ['Manaus', 'AM', -3.12, -60.02],
  ['Tefé', 'AM', -3.35, -64.71], ['Parintins', 'AM', -2.63, -56.74],
  ['Belém', 'PA', -1.46, -48.50], ['Santarém', 'PA', -2.44, -54.71],
  ['Marabá', 'PA', -5.37, -49.12], ['Boa Vista', 'RR', 2.82, -60.67],
  ['Macapá', 'AP', .04, -51.06], ['Porto Velho', 'RO', -8.76, -63.90],
  ['Palmas', 'TO', -10.18, -48.33], ['São Luís', 'MA', -2.53, -44.30],
  ['Teresina', 'PI', -5.09, -42.80], ['Fortaleza', 'CE', -3.73, -38.52],
  ['Natal', 'RN', -5.79, -35.21], ['João Pessoa', 'PB', -7.12, -34.86],
  ['Recife', 'PE', -8.05, -34.90], ['Maceió', 'AL', -9.66, -35.74],
  ['Aracaju', 'SE', -10.91, -37.07], ['Salvador', 'BA', -12.97, -38.50],
  ['Barreiras', 'BA', -12.15, -44.99], ['Cuiabá', 'MT', -15.60, -56.10],
  ['Sinop', 'MT', -11.86, -55.50], ['Campo Grande', 'MS', -20.47, -54.62],
  ['Goiânia', 'GO', -16.68, -49.25], ['Brasília', 'DF', -15.79, -47.88],
  ['Belo Horizonte', 'MG', -19.92, -43.94], ['Uberlândia', 'MG', -18.92, -48.28],
  ['Vitória', 'ES', -20.32, -40.34], ['Rio de Janeiro', 'RJ', -22.91, -43.17],
  ['São Paulo', 'SP', -23.5505, -46.6333], ['Campinas', 'SP', -22.91, -47.06],
  ['Curitiba', 'PR', -25.43, -49.27], ['Florianópolis', 'SC', -27.59, -48.55],
  ['Porto Alegre', 'RS', -30.03, -51.23], ['Lajeado', 'RS', -29.47, -51.96]
];

function number(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rain(value) {
  const parsed = number(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function brazilTime(value) {
  if (typeof value !== 'string') return NaN;
  const iso = value.replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(iso) ? iso : iso + '-03:00');
}

function providerDate(time) {
  return new Date(time - 3 * 3_600_000).toISOString().slice(0, 19).replace('T', ' ');
}

async function graph(operationName, query, variables = {}) {
  const response = await fetch(RS, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({operationName, query, variables}),
    signal: AbortSignal.timeout(9_000)
  });
  if (!response.ok) throw new Error('Defesa Civil RS: HTTP ' + response.status);
  const body = await response.json();
  if (body.errors?.length || !body.data) throw new Error('Resposta inválida da Defesa Civil RS');
  return body.data;
}

function parseStation(station) {
  const {codigo, position, timestamp, data, name} = station;
  const lat = number(position?.latitude), lon = number(position?.longitude);
  const at = brazilTime(timestamp);
  const maintenance = station.resource?.estacao?.estado?.manutencao?.value === true;
  if (maintenance || !/^DCRS-\d{5}$/.test(codigo) || lat === null || lon === null || !Number.isFinite(at)) return null;
  const river = data?.rio;
  const rainSensor = data?.chuva;
  const waterValid = river?.homologacao?.relacao?.valido?.value === true;
  const rainValid = rainSensor?.homologacao?.relacao?.valido?.value === true;
  const alarm = river?.rio_alarmes?.inundacao;
  const level = waterValid ? number(river.rio_nivel?.value) : null;
  const status = number(alarm?.status?.value);
  const risk = level !== null && alarm?.ativo?.value === true && [0, 1, 2, 3].includes(status) ? status : null;
  const accumulation = rainValid ? rainSensor?.acumulado : null;
  return {
    id: codigo, name: name?.general || codigo, local: name?.local || '',
    lat, lon, at, basin: position.bacia || '', river: river?.rio_nome?.value || '',
    level, trend: waterValid ? number(river.rio_nivel_tendencia?.value) : null, risk,
    rain5: rain(accumulation?.min005?.value), rainHour: rain(accumulation?.h001?.value),
    rain24: rain(accumulation?.h024?.value),
    rain48: rain(accumulation?.h048?.value)
  };
}

async function stations() {
  const data = await graph('Tags_data', TAGS);
  if (!Array.isArray(data.tags_data?.qualle_meteorologia)) throw new Error('Lista de estações indisponível');
  return {
    stations: data.tags_data.qualle_meteorologia
      .filter(s => s.show === true || s.show === 'true')
      .map(parseStation).filter(Boolean),
    nextUpdate: data.tags_data.proximaAtualizacaoEm ?? null
  };
}

async function history(stationCode, end) {
  const start = end - windowHours * 3_600_000;
  const data = await graph('Historic', HISTORIC, {
    stationCode, startDate: providerDate(start), endDate: providerDate(end), interval: 'MIN_10'
  });
  if (!Array.isArray(data.historic?.items)) throw new Error('Série hidrológica indisponível');
  const points = data.historic.items
    .map(row => ({
      at: brazilTime(row.ts), level: number(row.rio_nivel), rain: rain(row.chuva_mm),
      rainRate: rain(row.chuva_taxa_med), rainPeak: rain(row.chuva_taxa_max)
    }))
    .filter(row => Number.isFinite(row.at) && row.at >= start && row.at + tenMinutes <= end)
    .sort((a,b) => a.at - b.at);
  return {station: stationCode, start, end, points};
}

async function weather() {
  const url = new URL(OPEN_METEO);
  url.search = new URLSearchParams({
    latitude: cities.map(c => c[2]).join(','), longitude: cities.map(c => c[3]).join(','),
    current: 'precipitation', timeformat: 'unixtime'
  });
  const response = await fetch(url, {signal: AbortSignal.timeout(9_000)});
  if (!response.ok) throw new Error('Open-Meteo: HTTP ' + response.status);
  const results = await response.json();
  if (!Array.isArray(results) || results.length !== cities.length) throw new Error('Leituras meteorológicas indisponíveis');
  const places = results.map((result, i) => {
    const [name, state, lat, lon] = cities[i];
    const at = number(result.current?.time);
    return {
      id:'meteo-' + i, name, state, lat, lon, at: at === null ? null : at * 1000,
      interval: number(result.current?.interval), rain: rain(result.current?.precipitation)
    };
  }).filter(place => place.at !== null && place.rain !== null && place.interval > 0);
  return {places: places.length, observations:places, wet: places.filter(place => place.rain > 0).sort((a,b) => b.rain - a.rain)};
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const station = params.get('station');
  const kind = params.get('source') ?? 'rs';
  const requestedEnd = params.get('end');
  const now = Date.now();
  const latest = Math.floor((now - tenMinutes) / tenMinutes) * tenMinutes;
  const end = requestedEnd === null ? latest : Number(requestedEnd);
  if (station !== null && (!/^DCRS-\d{5}$/.test(station) || kind !== 'rs')) {
    return Response.json({error: 'Código de estação inválido.'}, {status: 400});
  }
  if (kind !== 'rs' && kind !== 'weather') {
    return Response.json({error: 'Fonte desconhecida.'}, {status: 400});
  }
  if (requestedEnd !== null && (!station || !/^\d{13}$/.test(requestedEnd) || end % tenMinutes ||
      end > latest || end < now - 87 * 24 * 3_600_000)) {
    return Response.json({error:'Escolha um período completo dos últimos 87 dias.'}, {status:400});
  }
  try {
    const data = kind === 'weather' ? await weather() : station ? await history(station,end) : await stations();
    const cacheSeconds = station || kind === 'weather' ? 300 : 120;
    return Response.json(data, {headers:{'Cache-Control':'public, max-age=30, s-maxage=' + cacheSeconds}});
  } catch (error) {
    console.warn('FloodSystem hidro:', error.message);
    return Response.json({error: 'A fonte está indisponível no momento.'}, {status: 502});
  }
}

