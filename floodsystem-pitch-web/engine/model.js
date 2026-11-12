import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { GEOMETRY } from './physics.mjs';

const V = (x,y,z) => new THREE.Vector3(x,y,z);
export function createModel(canvas, host, labelLayer, settings) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33,1,1,2500);
  camera.position.set(-330,335,790);
  const controls = new OrbitControls(camera,canvas);
  controls.target.set(0,172,0); controls.enableDamping=true; controls.dampingFactor=.075;
  controls.minDistance=300; controls.maxDistance=1400; controls.maxPolarAngle=Math.PI*.50;
  controls.enablePan=true;
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(environment,.04); scene.environment=envTarget.texture;scene.environmentIntensity=.8;
  environment.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff,0xb9c3b6,1.4));
  const key = new THREE.DirectionalLight(0xffffff,2); key.position.set(-220,500,300); key.castShadow=true;
  key.shadow.mapSize.set(2048,2048); key.shadow.camera.left=-350;key.shadow.camera.right=350;key.shadow.camera.top=400;key.shadow.camera.bottom=-300;
  key.shadow.camera.near=1;key.shadow.camera.far=1300;key.shadow.normalBias=.6;key.shadow.bias=-.0001;scene.add(key);
  const rim = new THREE.DirectionalLight(0xe0eeff,1.2);rim.position.set(300,250,-300);scene.add(rim);
  const root=new THREE.Group();scene.add(root);
  const colors={blue:0x2474bc,green:0x226854,steel:0xabb7bb,red:0xba3434,pcb:0x174b3d,black:0x222b2c};
  const materials={
    glass:new THREE.MeshPhysicalMaterial({color:0xd4e7df,metalness:0,roughness:.14,transparent:true,opacity:.14,depthWrite:false,side:THREE.DoubleSide,clearcoat:1,clearcoatRoughness:.12}),
    glassEdge:new THREE.LineBasicMaterial({color:0x62877a,transparent:true,opacity:.65}),
    steel:new THREE.MeshStandardMaterial({color:colors.steel,metalness:.85,roughness:.24}),
    blue:new THREE.MeshStandardMaterial({color:colors.blue,metalness:.12,roughness:.34}),
    red:new THREE.MeshStandardMaterial({color:colors.red,roughness:.36,metalness:.08}),
    black:new THREE.MeshStandardMaterial({color:colors.black,roughness:.55}),
    green:new THREE.MeshStandardMaterial({color:colors.pcb,roughness:.55}),
    water:new THREE.MeshPhysicalMaterial({color:0x4aa5ab,metalness:.03,roughness:.17,transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide,clearcoat:1}),
    lightWater:new THREE.MeshBasicMaterial({color:0x62c0c0,transparent:true,opacity:.5,depthWrite:false}),
    bucket:new THREE.MeshPhysicalMaterial({color:0xd9eae1,roughness:.19,metalness:.05,transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false}),
    white:new THREE.MeshStandardMaterial({color:0xf2f5eb,roughness:.48}),
    led:new THREE.MeshStandardMaterial({color:0xe26b45,emissive:0xd83f1b,emissiveIntensity:1.5,roughness:.3})
  };
  const mesh=(geo,mat,parent=root)=>{const m=new THREE.Mesh(geo,mat);parent.add(m);return m;};
  function box(w,h,d,x,y,z,mat,parent=root){const m=mesh(new THREE.BoxGeometry(w,h,d),mat,parent);m.position.set(x,y,z);m.castShadow=!mat.transparent;m.receiveShadow=!mat.transparent;return m;}
  function cyl(r,h,x,y,z,mat,parent=root,r2=r){const m=mesh(new THREE.CylinderGeometry(r,r2,h,32),mat,parent);m.position.set(x,y,z);m.castShadow=!mat.transparent;return m;}
  function rod(a,b,r,mat,parent=root){const delta=b.clone().sub(a);const m=cyl(r,delta.length(),0,0,0,mat,parent);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());return m;}
  const frontPanels=[];
  function glassBox(w,h,d,x,y,z,{front=true,base=true,top=true,lateralOpening=null}={}){
    const g=new THREE.Group();g.position.set(x,y,z);root.add(g);
    const faces=[];
    if(base)faces.push(box(w,5,d,0,2.5,0,materials.glass,g));
    if(top)faces.push(box(w,5,d,0,h-2.5,0,materials.glass,g));
    const leftWall = (bottom, top, depth, centerZ = 0) =>
      box(5, top - bottom, depth, -w / 2 + 2.5, (top + bottom) / 2, centerZ, materials.glass, g);
    if (lateralOpening) {
      const {width, height, centerY} = lateralOpening;
      const bottom = centerY - height / 2, top = centerY + height / 2;
      const shoulder = (d - width) / 2;
      faces.push(leftWall(5, bottom, d), leftWall(top, h - 5, d));
      for (const side of [-1, 1]) {
        faces.push(leftWall(bottom, top, shoulder, side * (width + shoulder) / 2));
      }
    } else {
      faces.push(leftWall(5, h - 5, d));
    }
    faces.push(box(5,h-10,d,w/2-2.5,h/2,0,materials.glass,g));
    faces.push(box(w-10,h-10,5,0,h/2,-d/2+2.5,materials.glass,g));
    if (front) {
      const panel = box(w - 10, h - 10, 5, 0, h / 2, d / 2 - 2.5, materials.glass, g);
      frontPanels.push(panel);
      faces.push(panel);
    }
    for(const f of faces){f.renderOrder=25;const outline=new THREE.LineSegments(new THREE.EdgesGeometry(f.geometry),new THREE.LineBasicMaterial({color:0x7e9c8c,transparent:true,opacity:.19}));f.add(outline);}
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)),materials.glassEdge);edges.position.y=h/2;g.add(edges);
    // Polished edges and the small fasteners make the actual 5 mm sheet construction visible.
    for(const xx of [-w/2+8,w/2-8])for(const zz of [-d/2+8,d/2-8]){
      if(top)cyl(2.1,2,x+xx,y+h+1,z+zz,materials.steel);
      if(base)cyl(2.1,2,x+xx,y+6,z+zz,materials.steel);
    }
    return g;
  }
  const leftX=-85,rightX=70,baseY=10;
  const structure=new THREE.Group();root.add(structure);
  const platform=box(326,10,182,0,-7,8,materials.white);platform.receiveShadow=true;
  const platformEdges=new THREE.LineSegments(new THREE.EdgesGeometry(platform.geometry),new THREE.LineBasicMaterial({color:0xd0dcd1}));platformEdges.position.copy(platform.position);root.add(platformEdges);
  for(const x of [-128,128])for(const z of [-62,72])cyl(7,4,x,-14,z,materials.black);
  const leftTank = GEOMETRY.left;
  const outlet = leftTank.safetyOutlet;
  const outletLip = outlet.centerY - outlet.height / 2;
  const outsideX = leftX - leftTank.width / 2;
  glassBox(leftTank.width, leftTank.height, leftTank.depth, leftX, 0, 0, {lateralOpening:outlet});
  glassBox(160,97.5,145,rightX,0,0);
  glassBox(160,168,145,rightX,97.5,0);
  // The trim sits outside the clear lateral opening.
  const trimWidth = 0.8;
  const trimMaterial = new THREE.MeshStandardMaterial({color:0x286f62,roughness:0.5});
  for (const side of [-1, 1]) {
    box(1.2, trimWidth, outlet.width + 2 * trimWidth, outsideX - 0.6,
      outlet.centerY + side * (outlet.height + trimWidth) / 2, 0, trimMaterial);
    box(1.2, outlet.height, trimWidth, outsideX - 0.6, outlet.centerY,
      side * (outlet.width + trimWidth) / 2, trimMaterial);
  }
  const outletWater = materials.lightWater.clone();
  const waterAtLip = box(7, 1, outlet.width, outsideX - 2, outletLip + 0.5, 0, outletWater);
  const outletCurtain = box(1, 1, outlet.width, outsideX - 5.5, outletLip - 0.5, 0, outletWater);
  waterAtLip.renderOrder = outletCurtain.renderOrder = 36;
  waterAtLip.visible = outletCurtain.visible = false;
  // External graphic on the reservoir front, held away from the water surface.
  function textPlane(text,w,h,x,y,z,color='#2754a2',font='700 140px Arial'){
    const c=document.createElement('canvas');c.width=512;c.height=Math.round(512*h/w);
    const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=text.length===1?`800 ${c.height*.9}px Arial`:font;ctx.fillText(text,c.width/2,c.height/2,c.width*.9);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const m=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));m.position.set(x,y,z);m.renderOrder=35;return m;
  }
  const logoLetters=[];
  for(const [i,char]of [...'FLOOD'].entries())logoLetters.push(textPlane(char,38,42,leftX,224-i*42,49));
  textPlane('SYSTEM',95,22,leftX,15,49,'#253c34','800 95px Arial');
  // Reservoir and receiving tray have separate water volumes.
  const leftWater=box(118,1,84,leftX,5.5,0,materials.water);leftWater.renderOrder=12;
  const leftSurface=mesh(new THREE.PlaneGeometry(118,84),materials.lightWater);leftSurface.rotation.x=-Math.PI/2;leftSurface.position.set(leftX,6,0);leftSurface.renderOrder=13;
  const rightWater=box(148,1,133,rightX,103,0,materials.water);rightWater.renderOrder=12;
  const rightSurface=mesh(new THREE.PlaneGeometry(148,133),materials.lightWater);rightSurface.rotation.x=-Math.PI/2;rightSurface.position.set(rightX,104,0);rightSurface.renderOrder=13;
  const waterRings=[];
  for(let i=0;i<3;i++){const ring=mesh(new THREE.RingGeometry(7,7.7,64),new THREE.MeshBasicMaterial({color:0xc0e8dd,transparent:true,opacity:.45,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(leftX-22,50,0);ring.renderOrder=15;waterRings.push(ring);}
  // Two downward-facing ultrasonic transducers.
  box(38,3,18,leftX+9,257,0,materials.blue);
  for(const x of [leftX,leftX+19]){cyl(6.5,10,x,250,0,materials.steel);cyl(5.3,.4,x,244.8,0,materials.black);}
  const sonar=new THREE.Group();root.add(sonar);
  const sonarCone=mesh(new THREE.ConeGeometry(21,1,40,1,true),new THREE.MeshBasicMaterial({color:0x5489c6,transparent:true,opacity:.055,side:THREE.DoubleSide,depthWrite:false}),sonar);sonarCone.rotation.z=Math.PI;
  const echoRings=[];
  for(let i=0;i<3;i++){const ring=mesh(new THREE.RingGeometry(9,9.8,48),new THREE.MeshBasicMaterial({color:0x648cc3,transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false}),sonar);ring.rotation.x=-Math.PI/2;echoRings.push(ring);}
  // Funnel from the curved upper section of an inverted PET bottle.
  const funnels=[];
  function funnel(x,z){
    const group=new THREE.Group();group.position.set(x,270,z);root.add(group);
    const curve=[[9,0],[9,10],[10,18],[13,27],[22,42],[34,61],[43,80],[47.5,94]].map(([r,y])=>new THREE.Vector2(r,y));
    const plastic=new THREE.MeshPhysicalMaterial({color:0xc8ded3,metalness:0,roughness:.12,transparent:true,opacity:.4,depthWrite:false,side:THREE.DoubleSide,clearcoat:1});
    const body=mesh(new THREE.LatheGeometry(curve,64),plastic,group);
    const rim=mesh(new THREE.TorusGeometry(47.5,.55,8,80),materials.glassEdge.clone(),group);rim.rotation.x=Math.PI/2;rim.position.y=94;
    // Torus is a mesh: use an actual transparent surface material rather than a line material.
    rim.material=new THREE.MeshStandardMaterial({color:0x84a39d,roughness:.15,transparent:true,opacity:.78,metalness:.25});
    cyl(12.5,12,0,0,0,materials.red,group);
    for(let i=0;i<24;i++){const a=i*Math.PI/12;cyl(.45,9,12.3*Math.cos(a),0,12.3*Math.sin(a),materials.red,group);}
    cyl(10,.8,0,8,0,materials.red,group);
    funnels.push({group,body,rim});return group;
  }
  const leftFunnel=funnel(leftX-37,0),rightFunnel=funnel(rightX+2,-1);
  function tube(points,r=2.5,mat=materials.blue,parent=root){const c=new THREE.CatmullRomCurve3(points.map(p=>V(...p)));const m=mesh(new THREE.TubeGeometry(c,40,r,10,false),mat,parent);return {mesh:m,curve:c};}
  const hoseDimensions = GEOMETRY.hose;
  const hoseBore = materials.blue.clone();
  hoseBore.side = THREE.BackSide;
  hoseBore.color.multiplyScalar(.62);
  function hose(points, outerDiameter) {
    const curve = new THREE.CatmullRomCurve3(points.map(point => V(...point)));
    const outer = outerDiameter / 2;
    const inner = hoseDimensions.innerDiameter / 2;
    const radialSegments = 24;
    mesh(new THREE.TubeGeometry(curve,40,outer,radialSegments,false),materials.blue);
    mesh(new THREE.TubeGeometry(curve,40,inner,radialSegments,false),hoseBore);
    const rim = new THREE.RingGeometry(inner,outer,radialSegments);
    for (const end of [0,1]) {
      const opening = mesh(rim,materials.blue);
      opening.position.copy(curve.getPointAt(end));
      opening.quaternion.setFromUnitVectors(V(0,0,1),curve.getTangentAt(end).multiplyScalar(end ? 1 : -1));
    }
  }
  hose([[leftX-37,265,0],[leftX-37,246,0],[leftX-30,220,0],[leftX-17,203,0]],hoseDimensions.inletOuterDiameter);
  hose([[rightX+2,265,-1],[rightX+2,247,-1],[rightX+2,224,-1]],hoseDimensions.inletOuterDiameter);
  for(const x of [leftX-37,rightX+2]){cyl(5,5,x,264,0,materials.steel);}
  // Left drain and manually adjusted tap, placed outside the sealed electronics bay.
  hose([[leftX-64,19,17],[-170,19,17],[-199,19,17],[-222,15,17]],hoseDimensions.outletOuterDiameter);
  rod(V(-181,19,17),V(-199,19,17),6,materials.steel);
  const leftHandle=box(15,5,7,-190,30,17,materials.black);cyl(2.4,9,-190,25,17,materials.steel);
  cyl(7,2,leftX-65.5,19,17,materials.steel).rotation.z=Math.PI/2;
  // Right drain exits the wet compartment through the right wall; it never traverses the electronics compartment.
  hose([[146,108,-37],[164,108,-37],[179,100,-37],[181,75,-37]],hoseDimensions.outletOuterDiameter);
  rod(V(160,108,-37),V(173,108,-37),5.2,materials.steel);
  const rightHandle=box(14,5,7,166,118,-37,materials.black);cyl(2,7,166,113,-37,materials.steel);
  // Two wide open acrylic trays, a raised divider and fixed clear axle stands.
  const pivot = V(rightX, 159, 0);
  const halfLength = GEOMETRY.bucket.length / 2;
  const halfDepth = GEOMETRY.bucket.width / 2;
  const sideSheet = 2.5;
  const insideDepth = GEOMETRY.bucket.width - 2 * sideSheet;
  const endFloor = 7;
  const centerFloor = -5;
  const dividerTop = centerFloor + GEOMETRY.bucket.height;
  const lip = 12;
  const bucketEdge = new THREE.LineBasicMaterial({color:0x9bb7a9,transparent:true,opacity:.9});
  function edged(part) {
    part.add(new THREE.LineSegments(new THREE.EdgesGeometry(part.geometry), bucketEdge));
    part.renderOrder = 17;
    return part;
  }
  const stand = new THREE.Shape();
  stand.moveTo(-42, 0); stand.lineTo(-7, 55); stand.lineTo(7, 55); stand.lineTo(42, 0); stand.closePath();
  const standGeometry = new THREE.ExtrudeGeometry(stand, {depth:3, bevelEnabled:false});
  for (const z of [-52, 49]) {
    const support = edged(mesh(standGeometry, materials.glass));
    support.position.set(rightX, 108, z);
    edged(box(94, 3, 9, rightX, 109, z + 1.5, materials.bucket));
    for (const x of [-36, 36]) cyl(2.2, 1.6, rightX + x, 111, z + 1.5, materials.steel);
  }
  rod(V(rightX,159,-55), V(rightX,159,55), 2.2, materials.steel);
  const bearing = cyl(5, 3, rightX, 159, 54, materials.steel);
  bearing.rotation.x = Math.PI / 2;
  const bucket = new THREE.Group();
  bucket.position.copy(pivot); root.add(bucket);
  edged(box(3, GEOMETRY.bucket.height, insideDepth, 0, (dividerTop + centerFloor) / 2, 0, materials.bucket, bucket));
  for (const side of [-1, 1]) {
    const cheek = new THREE.Shape();
    cheek.moveTo(0, centerFloor);
    cheek.lineTo(side * halfLength, endFloor);
    cheek.lineTo(side * halfLength, lip);
    cheek.bezierCurveTo(side * 56, 25, side * 28, 32, 0, dividerTop);
    cheek.closePath();
    const cheekGeometry = new THREE.ExtrudeGeometry(cheek, {depth:sideSheet, bevelEnabled:false, curveSegments:12});
    for (const z of [-halfDepth, halfDepth - sideSheet]) {
      edged(mesh(cheekGeometry, materials.bucket, bucket)).position.z = z;
    }
    const floor = edged(box(Math.hypot(halfLength, endFloor - centerFloor), 2.5, insideDepth,
      side * halfLength / 2, (centerFloor + endFloor) / 2 - 1, 0, materials.bucket, bucket));
    floor.rotation.z = side * Math.atan2(endFloor - centerFloor, halfLength);
    edged(box(2.2, lip - endFloor + 1, insideDepth, side * (halfLength - 1.1),
      (lip + endFloor) / 2, 0, materials.bucket, bucket));
  }
  const liquidShape = new THREE.Shape();
  liquidShape.moveTo(0,0); liquidShape.lineTo(1,0); liquidShape.lineTo(0,1); liquidShape.closePath();
  const cupWater = mesh(new THREE.ExtrudeGeometry(liquidShape, {depth:1, bevelEnabled:false}), materials.water, bucket);
  cupWater.renderOrder = 16;
  cupWater.position.z = -insideDepth / 2;
  // Round magnet on the divider and red pickup board by the inlet.
  const magnet = cyl(6, 4, 0, 30, 44, materials.black, bucket);
  magnet.rotation.x = Math.PI / 2;
  box(9, 24, 2, rightX - 7, 192, 42, materials.red);
  box(6, 5, 4, rightX - 7, 185, 44, materials.black);
  const sensorLed = cyl(1.6, 2, rightX - 7, 194, 44, materials.led);
  sensorLed.rotation.x = Math.PI / 2;
  const magnetHalo = mesh(new THREE.TorusGeometry(9,.7,8,48), new THREE.MeshBasicMaterial({color:0xde9b70,transparent:true,opacity:0}));
  magnetHalo.position.set(rightX - 7, 192, 45);
  // ESP32 and terminal board under the dry partition.
  const board=box(93,3,67,rightX+3,25,6,materials.green);
  for(const x of [rightX-34,rightX+40])for(const z of [-18,31])cyl(2.4,11,x,18,z,materials.steel);
  box(32,4,43,rightX,29,-1,materials.black);
  box(26,2,22,rightX,32,0,materials.steel);
  box(9,5,11,rightX,30,27,materials.steel);
  for(const side of [-1,1])for(let i=0;i<14;i++){box(2,3,2,rightX+side*19,31,-21+i*3,materials.steel);}
  for(let i=0;i<7;i++){box(8,9,10,rightX-28+i*9,31,31,materials.green);cyl(1.5,.5,rightX-28+i*9,36,31,materials.steel);}
  cyl(2.5,2,rightX+25,31,9,materials.led);
  const wireColors=[0xd0ab43,0xa44d41,0x367eb7,0x6b9974,0x433f4c];
  for(let i=0;i<5;i++)tube([[rightX-26+i*9,34,34],[rightX-22+i*12,48,39],[rightX+48+i*2,65,17],[rightX+55+i,93,-25],[rightX+35+i,112,-38]],.75,new THREE.MeshStandardMaterial({color:wireColors[i],roughness:.6}));
  // Dashed ground grid and quiet contact shadow.
  const floor=mesh(new THREE.PlaneGeometry(2400,2400),new THREE.MeshStandardMaterial({color:0xd8e2d8,roughness:1}),scene);floor.rotation.x=-Math.PI/2;floor.position.y=-17;floor.receiveShadow=true;
  const grid=new THREE.GridHelper(800,40,0xd4ddd2,0xdce4d9);grid.position.y=-16.9;grid.material.transparent=true;grid.material.opacity=.35;scene.add(grid);
  // Measurement guides use the enclosure dimensions, excluding funnels and the carrying base.
  const dimensionGroup=new THREE.Group();root.add(dimensionGroup);dimensionGroup.visible=false;
  const dimMat=new THREE.LineBasicMaterial({color:0x7d9989,transparent:true,opacity:.75});
  function dimLine(points){const geo=new THREE.BufferGeometry().setFromPoints(points.map(p=>V(...p)));const l=new THREE.Line(geo,dimMat);dimensionGroup.add(l);}
  dimLine([[-150,-1,91],[-150,-1,110],[150,-1,110],[150,-1,91]]);
  dimLine([[161,0,73],[180,0,73],[180,265.5,73],[156,265.5,73]]);
  for(const x of [-150,150])dimLine([[x-3,-4,110],[x+3,2,110]]);
  for(const y of [0,265.5])dimLine([[177,y-3,73],[183,y+3,73]]);
  const labels=[];
  function label(text, position, style = '', technical = false) {
    const el = document.createElement('div');
    el.className = `model-label ${style}`;
    el.textContent = text;
    labelLayer.append(el);
    const item = {el, position: V(...position), dimension: style === 'dim', technical};
    labels.push(item);
    return item;
  }
  label('Sensor ultrassônico',[leftX-3,271,50],'blue',true);
  const waterLabel = label('Nível da água',[leftX-39,45,49]);
  label('Saída lateral · 80 × 5 mm', [outsideX - 2, outlet.centerY, 13], 'safety');
  label('Báscula + ímã',[rightX+60,166,37],'',true);
  label('Sensor magnético',[rightX+18,209,40],'blue',true);
  label('ESP32',[rightX+52,44,45],'blue',true);
  label('300 mm',[0,-2,117],'dim');label('265,5 mm',[193,142,75],'dim');
  const drops=[];
  const dropGeometry=new THREE.SphereGeometry(1.2,7,6);
  const dropMaterial=new THREE.MeshBasicMaterial({color:0x5caaa8,transparent:true,opacity:.72});
  for(let i=0;i<65;i++){const m=mesh(dropGeometry,dropMaterial);m.scale.y=2.3;drops.push({mesh:m,phase:Math.random(),offsetX:(Math.random()-.5)*65,offsetZ:(Math.random()-.5)*55,which:i%2});}
  const streams=[
    {start:V(leftX-17,203,0),end:V(leftX-17,50,0),kind:'inlet'},
    {start:V(rightX+2,224,-1),end:V(rightX+2,180,-1),kind:'inlet'},
    {start:V(-222,15,17),end:V(-222,-16,17),kind:'leftOut'},
    {start:V(181,75,-37),end:V(181,38,-37),kind:'rightOut'},
    {start:V(rightX-55,150,0),end:V(rightX-55,104,0),kind:'dump'}
  ].map(s=>({...s,length:s.start.distanceTo(s.end),mesh:rod(s.start,s.end,.8,materials.lightWater)}));
  let viewTarget=null,labelsVisible=true,technicalLabels=false,cutaway=false,dimensions=false,lastTime=0,visualClock=0,funnelDiameter=95;
  function setView(name){
    const views={perspective:[-330,335,790],front:[0,190,900],side:[-650,320,555],bucket:[335,306,485],top:[0,1010,1]};
    viewTarget=V(...(views[name]||views.perspective));controls.target.set(0,172,0);
    if (name === 'bucket') controls.target.set(rightX, 159, 0);
  }
  function resize(){
    const w=host.clientWidth,h=host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w,h,false);camera.aspect=w/h;
    camera.fov = camera.aspect < 1.24 ? 42 : 33;
    camera.updateProjectionMatrix();
  }
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);resize();
  function update(s,p,r,wallTime,paused){
    if(viewTarget){camera.position.lerp(viewTarget,.08);if(camera.position.distanceTo(viewTarget)<.3){camera.position.copy(viewTarget);viewTarget=null;}}
    controls.update();
    const dt=Math.min(.05,Math.max(0,wallTime-lastTime));lastTime=wallTime;if(!paused)visualClock+=dt;
    leftWater.scale.y=Math.max(.001,r.level);leftWater.position.y=5+r.level/2;leftWater.visible=r.level>.02;
    leftSurface.position.y=5+r.level+.12;leftSurface.visible=r.level>.02;
    rightWater.scale.y=Math.max(.001,r.basinLevel);rightWater.position.y=102.5+r.basinLevel/2;rightWater.visible=r.basinLevel>.02;
    rightSurface.position.y=102.5+r.basinLevel+.1;rightSurface.visible=r.basinLevel>.02;
    const surfaceY=5+r.level;
    waterLabel.position.y = Math.max(14, surfaceY);
    const overflow = r.safetyFlow > 0.01;
    waterAtLip.visible = outletCurtain.visible = overflow;
    if (overflow) {
      const curtainHeight = Math.min(70, 18 + 2.6 * Math.sqrt(r.safetyFlow));
      outletCurtain.scale.y = curtainHeight;
      outletCurtain.position.y = outletLip - curtainHeight / 2;
      outletWater.opacity = 0.35 + 0.08 * Math.sin(visualClock * 9);
    }
    for(let i=0;i<waterRings.length;i++){const t=(visualClock*.65+i/3)%1;waterRings[i].position.y=surfaceY+.25;waterRings[i].scale.setScalar(1+t*2);waterRings[i].material.opacity=(1-t)*.3;waterRings[i].visible=r.input>0&&r.level>.1;}
    const distance=Math.max(1,244-surfaceY);
    sonarCone.scale.y=distance;sonarCone.position.set(leftX+9,surfaceY+distance/2,0);sonarCone.visible=labelsVisible&&technicalLabels&&!cutaway;
    for(let i=0;i<echoRings.length;i++){const t=(visualClock*.65+i/3)%1;echoRings[i].position.set(leftX+9,244-t*distance,0);echoRings[i].scale.setScalar(.6+1.1*t);echoRings[i].material.opacity=.28*(1-t);echoRings[i].visible=labelsVisible&&technicalLabels;}
    if(s.time===0)bucket.rotation.z=s.side*.32;else if(!paused)bucket.rotation.z=THREE.MathUtils.damp(bucket.rotation.z,s.side*.32,8,dt);
    const cupSlope = (endFloor - centerFloor) / halfLength;
    const fill = 13 * Math.sqrt(r.bucketFraction);
    cupWater.position.x = s.side * 1.6;
    cupWater.position.y = centerFloor + 1.5;
    cupWater.scale.set(s.side * Math.min(halfLength - 3, fill / (cupSlope + Math.tan(.32))), fill, insideDepth - 1);
    cupWater.rotation.z = s.side * Math.atan(cupSlope);
    cupWater.visible = r.bucketFraction > .005;
    const sinceTip=s.lastTip===null?Infinity:s.time-s.lastTip;
    const pulse=sinceTip<Math.max(.9,p.speed*.14);
    sensorLed.material.emissiveIntensity=pulse?3:.15;magnetHalo.material.opacity=pulse?.55:0;magnetHalo.scale.setScalar(pulse?1+Math.sin(visualClock*10)*.12:1);
    leftHandle.rotation.y=(1-p.leftValve/100)*Math.PI/2;rightHandle.rotation.y=(1-p.rightValve/100)*Math.PI/2;
    if(funnelDiameter!==p.diameter){const f=p.diameter/95;for(const {body,rim}of funnels){body.scale.x=f;body.scale.z=f;rim.scale.setScalar(f);rim.position.y=94;}funnelDiameter=p.diameter;}
    for(const d of drops){d.mesh.visible=r.input>0;if(!d.mesh.visible)continue;const phase=(visualClock*(p.mode==='direct'?1:1.2)+d.phase)%1;d.mesh.position.set((d.which?rightX+2:leftX-37)+d.offsetX,365+(1-phase)*75,d.offsetZ);d.mesh.scale.y=p.mode==='direct'?4:2.3;}
    for(const st of streams){
      let on=false;
      if(st.kind==='inlet')on=r.input>0;
      if(st.kind==='leftOut')on=r.leftOutput>.1;
      if(st.kind==='rightOut')on=r.rightOutput>.1;
      if(st.kind==='dump'){
        on=pulse;
        st.start.copy(bucket.localToWorld(V(-s.side * (halfLength - 2), lip, 0)));
        st.end.set(st.start.x, 102.5 + r.basinLevel, st.start.z);
      }
      if(st.kind==='inlet' && st.start.x===rightX+2) {
        st.end.copy(bucket.localToWorld(V(s.side * 8, 15, -1)));
      }
      if(st.start.x===leftX-17)st.end.y=surfaceY;
      st.mesh.visible=on;
      if(st.mesh.visible){const delta=st.end.clone().sub(st.start);st.mesh.position.copy(st.start).add(st.end).multiplyScalar(.5);st.mesh.scale.y=Math.max(.01,delta.length()/st.length);st.mesh.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());}
    }
    for(const l of labels){const visible=l.dimension?dimensions:labelsVisible&&(!l.technical||technicalLabels);l.el.hidden=!visible;if(!visible)continue;const pt=l.position.clone().project(camera);l.el.style.left=`${(pt.x*.5+.5)*host.clientWidth}px`;l.el.style.top=`${(-pt.y*.5+.5)*host.clientHeight}px`;l.el.style.visibility=pt.z<1&&pt.z>-1?'visible':'hidden';}
    renderer.render(scene,camera);
  }
  return { update, setView,
    setLabels(value){labelsVisible=value;},
    setTechnicalLabels(value){technicalLabels=value;},
    setDimensions(value){dimensions=value;dimensionGroup.visible=value;},
    setCutaway(value){cutaway=value;frontPanels.forEach(m=>m.visible=!value);logoLetters.forEach(m=>m.visible=!value);},
    dispose(){resizeObserver.disconnect();controls.dispose();envTarget.dispose();renderer.dispose();},
    getInfo(){return {renderer:renderer.info.render,objects:scene.children.length,webgl:true};}
  };
}
