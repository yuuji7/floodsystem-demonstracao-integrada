import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, createState, advance, readings, inflow, leftMlPerMm, leftSafetyLevel, floodWatchLevel, rightMlPerMm, GEOMETRY, tipVolumeForDiameter } from '../dist/physics.mjs';
const near=(actual,expected,tol=1e-6)=>assert.ok(Math.abs(actual-expected)<tol,`${actual} deveria ser ${expected}`);
function conservation(s){
  near(s.initialLeft+s.inputLeft,s.left+s.outputLeft+s.spillLeft,1e-5);
  near(s.inputRight,s.cup+s.right+s.outputRight+s.spillRight,1e-5);
  assert.ok(s.left>=0&&s.right>=0&&s.cup>=0);
}
test('um litro corresponde às 44 viradas do ensaio preliminar, sem perder o residual',()=>{
  const p={...DEFAULTS,tipVolume:1000/44,mode:'direct',directFlow:1000,leftValve:0,rightValve:0,initialLevel:0};
  const s=advance(createState(p),p,60);
  assert.equal(s.tips,44);near(s.cup,0);near(s.representedVolume,1000);conservation(s);
});
test('entrada de chuva usa a área de captação, mantendo a calibração do artigo',()=>{
  const diameter = Math.sqrt(4 * 104.8 / Math.PI) * 10;
  const p={...DEFAULTS,rain:100,diameter,tipVolume:tipVolumeForDiameter(diameter)};
  near(inflow(p),1048/60);near(readings(createState(p),p).mmPerTip,2.17);
  const doubled={...p,diameter:p.diameter*2};near(inflow(doubled),4*inflow(p));
});
test('a primeira e a segunda viradas ocorrem nos múltiplos de 2,17 mm de chuva', () => {
  const p = {...DEFAULTS,rain:60};
  const s = createState(p);
  const interval = 2.17 * 60;
  advance(s,p,interval-.01);
  assert.equal(s.tips,0);
  advance(s,p,.01);
  assert.equal(s.tips,1);
  near(readings(s,p).rainMeasured,2.17);
  advance(s,p,interval);
  assert.equal(s.tips,2);
  near(readings(s,p).rainMeasured,4.34);
  conservation(s);
});
test('conserva água nos dois módulos durante chuva, basculadas e drenagem simultâneas',()=>{
  const p={...DEFAULTS,rain:300};const s=advance(createState(p),p,1800);conservation(s);
  assert.ok(s.outputLeft>0&&s.outputRight>0&&s.tips>0&&s.cup<p.tipVolume);
});
test('a abertura de segurança escoa o excedente com a torneira fechada',()=>{
  const p={...DEFAULTS,mode:'direct',directFlow:500,leftValve:0,rightValve:0};const s=advance(createState(p),p,600);
  near(s.left,leftMlPerMm*195.5);near(s.right,rightMlPerMm*GEOMETRY.right.maxWater);
  assert.equal(s.outputLeft,0);near(readings(s,p).safetyFlow,500);assert.equal(readings(s,p).floodStatus,'alert');
  assert.ok(s.spillLeft>0&&s.spillRight>0);conservation(s);
});
test('atenção antecede a abertura e a saída permanece seca abaixo dela',()=>{
  const p={...DEFAULTS,rain:0,leftValve:0,initialLevel:floodWatchLevel-0.1};
  assert.equal(readings(createState(p),p).floodStatus,'observe');
  p.initialLevel = floodWatchLevel;
  assert.equal(readings(createState(p),p).floodStatus,'watch');
  p.initialLevel=leftSafetyLevel-0.1;
  const s=advance(createState(p),p,60);
  assert.equal(readings(s,p).floodStatus,'warning');
  assert.equal(readings(s,p).safetyFlow,0);
  assert.equal(s.spillLeft,0);
  conservation(s);
});
test('sem chuva a água drena e nunca fica negativa; não são gerados pulsos',()=>{
  const p={...DEFAULTS,rain:0,leftValve:100};const s=advance(createState(p),p,3600);
  near(s.left,0);assert.equal(s.tips,0);assert.equal(s.right,0);conservation(s);
});
test('resultado não depende da velocidade de observação nem do agrupamento dos frames',()=>{
  const p={...DEFAULTS,rain:300};const a=createState(p),b=createState(p);
  for(let i=0;i<1200;i++)advance(a,p,.1);
  for(let i=0;i<120;i++)advance(b,{...p,speed:60},1);
  near(a.left,b.left,1e-5);near(a.right,b.right,1e-5);near(a.cup,b.cup,1e-5);assert.equal(a.tips,b.tips);conservation(a);conservation(b);
});
test('tempo entre pulsos representa a intensidade constante de entrada',()=>{
  const p={...DEFAULTS,rain:240};const s=advance(createState(p),p,300);
  assert.ok(s.tips>=2);near(readings(s,p).pulseIntensity,240,1e-6);
});
test('registra janelas completas de 10 minutos mesmo quando um frame cruza a fronteira', () => {
  const p = {...DEFAULTS, rain: 60};
  const state = createState(p);
  advance(state, p, 599.5);
  assert.equal(state.history.length, 0);
  advance(state, p, 1);
  p.rain = 120;
  advance(state, p, 600);
  assert.deepEqual(state.history.map(sample => sample.time), [600, 1200]);
  near(state.history[0].rain, 10);
  near(state.history[1].rain, 20 - 60 * .5 / 3600);
  assert.equal(state.history[1].totalTips, state.history[0].tips + state.history[1].tips);
  assert.ok(state.history[1].level > state.history[0].level);
  assert.deepEqual(createState(p).history, []);
});
