import { readFile, writeFile } from 'node:fs/promises';

const file = (path, encoding = 'utf8') => readFile(new URL(path, import.meta.url), encoding);
const escape = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const originalSlides = [
  ['capa', 'FloodSystem', 'Chuva e nível da água no ponto que importa. Monitoramento local para imóveis. Foto do protótipo de bancada.'],
  ['problema', 'Problema e cliente', 'A água está subindo na garagem? Síndicos e administradoras contratam; portaria e manutenção acompanham à distância o ponto que hoje exige inspeção presencial.'],
  ['solucao', 'Solução', 'Duas leituras para o mesmo ponto: chuva registrada pela báscula e altura da água acompanhada por sensor. O painel mostra histórico e origem dos registros.'],
  ['chuva-na-regiao', 'Chuva na região', 'Acumulados divulgados pelo CGE em 17 de janeiro de 2026: 49,2 mm em Cidade Dutra, Capela do Socorro; 38,8 mm no Rodoanel, Parelheiros.'],
  ['regras-do-piloto', 'Regras do piloto', 'Exemplo de limites do piloto: acompanhamento com 20 mm de chuva local na última hora ou nível de 30 mm e subindo; aviso prioritário com nível de 70 mm. Validar em cada imóvel.'],
  ['alternativas', 'Alternativas', 'O monitoramento local em um ponto do condomínio complementa dados de redes de estações e alertas oficiais.'],
  ['evidencia', 'Evidência do TCC', 'Caso-base: 14,50 mm de chuva histórica, seis basculadas sintéticas e 1,48 mm de chuva residual. O piloto vai avaliar as leituras em campo.'],
  null,
  ['modelo-comercial', 'Modelo comercial', 'Preço estimado por ponto: instalação de R$ 990 e mensalidade de R$ 99. Margem direta estimada em 12 meses: R$ 940. Premissas a cotar.'],
  ['proposta', 'Proposta', 'Trinta dias de piloto em um ponto crítico, com instalação, painel e acompanhamento. Próximo passo: agendar uma vistoria com o síndico.'],
  ['perguntas', 'Perguntas', 'Perguntas sobre a previsão de enchentes, a validação das leituras com uma régua e o preço comercial.']
];

const rendered = await Promise.all(originalSlides.map(async (slide, i) => {
  if (!slide) return '';
  const [id, title, description] = slide;
  const png = await file(`assets/slide-${String(i + 1).padStart(2, '0')}.png`, null);
  return `<section class="slide still" id="${id}" aria-label="${escape(title)}" data-title="${escape(title)}" hidden><img width="1600" height="900" alt="${escape(description)}" src="data:image/png;base64,${png.toString('base64')}"></section>`;
}));

// Package the ES modules with the presentation, so opening the HTML from disk needs no server.
// The module list is topologically sorted; each import points to an earlier Blob URL.
const modules = [
  ['engine/vendor/three.core.min.js', {}],
  ['engine/vendor/three.module.min.js', { './three.core.min.js': 0 }],
  ['engine/vendor/OrbitControls.js', { three: 1 }],
  ['engine/vendor/RoomEnvironment.js', { three: 1 }],
  ['engine/risk.mjs', {}],
  ['engine/physics.mjs', { './risk.mjs': 4 }],
  ['engine/model.js', { three: 1, './vendor/OrbitControls.js': 2, './vendor/RoomEnvironment.js': 3, './physics.mjs': 5 }],
  ['lab-telemetry.mjs', {}],
  ['residence.mjs', {}],
  ['pitch.mjs', { './engine/model.js': 6, './engine/physics.mjs': 5, './lab-telemetry.mjs': 7, './residence.mjs': 8 }]
];
const sources = await Promise.all(modules.map(async ([path, imports]) => {
  let src = await file(path);
  for (const [specifier, index] of Object.entries(imports)) {
    const original = src;
    for (const quote of ['"', "'"]) {
      src = src.replaceAll(`${quote}${specifier}${quote}`, `${quote}__PITCH_MODULE_${index}__${quote}`);
    }
    if (src === original) throw new Error(`Import ${specifier} missing in ${path}`);
  }
  return src;
}));
const moduleJSON = JSON.stringify(sources).replaceAll('<', '\\u003c');
const license = (await file('engine/vendor/THREE-LICENSE.txt')).replaceAll('--', '—');
const inline = `<!-- Three.js license\n${license}\n-->
<script id="modules" type="application/json">${moduleJSON}</script>
<script type="module">
  const urls = [];
  const bundle = document.getElementById('modules');
  try {
    for (const source of JSON.parse(bundle.textContent)) {
      const content = source.replace(/__PITCH_MODULE_(\\d+)__/g, (_, index) => urls[index]);
      urls.push(URL.createObjectURL(new Blob([content], { type: 'text/javascript' })));
    }
    await import(urls.at(-1));
  } catch (error) {
    console.error('Não foi possível abrir a apresentação.', error);
    document.querySelector('.slide').hidden = false;
    document.querySelector('.deck-nav').hidden = true;
    const message = document.createElement('p');
    message.textContent = 'Para navegar e usar o 3D, abra o arquivo diretamente no Chrome, Edge ou Firefox.';
    message.style.cssText = 'position:absolute;bottom:0;left:5%;padding:10px;background:white;z-index:3';
    document.querySelector('.deck').append(message);
  } finally {
    urls.forEach(url => URL.revokeObjectURL(url));
    bundle.remove();
  }
</script>`;

const fileStyle = await file('pitch.css');
const html = (await file('pitch.template.html'))
  .replace('/* INSERT_CSS */', () => fileStyle)
  .replace('<!-- SLIDES_BEFORE -->', () => rendered.slice(0, 7).join('\n'))
  .replace('<!-- SLIDES_AFTER -->', () => rendered.slice(8).join('\n'))
  .replace('<!-- INSERT_MODULES -->', () => inline);

await writeFile(new URL('FloodSystem-Pitch.html', import.meta.url), html);
