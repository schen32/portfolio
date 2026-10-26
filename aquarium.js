/* An original, procedural cell aquarium. No images, libraries, or network requests. */
(() => {
  'use strict';
  const root = document.querySelector('.aquarium');
  const canvas = document.querySelector('#aquarium-canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const buffer = document.createElement('canvas');
  const pen = buffer.getContext('2d', { willReadFrequently: true });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const pauseButton = root.querySelector('[data-action="pause"]');
  const lightButton = root.querySelector('[data-action="light"]');
  const counter = root.querySelector('[data-population]');
  let w = 0, h = 0, cell = 8, cols = 0, rows = 0, dpr = 1;
  let time = 0, last = 0, accumulator = 0, raf = 0, paused = motion.matches, visible = true, day = false;
  let animals = [], pellets = [], rings = [], avoid = [];
  let energy, nextEnergy;
  const pointer = { x: -1000, y: -1000, active:false, speed:0, last:0 };
  const school = {x:0,y:0};
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const angleDelta = (a, b) => Math.atan2(Math.sin(b-a), Math.cos(b-a));

  function spawn() {
    const mobile = w < 760;
    // Distributed initial positions keep all six silhouettes visible on arrival.
    const specs = [
      ['ray', .72, .31, 155, 22, .28], ['turtle', .86, .72, 106, 18, -2.7],
      ['jelly', .46, .23, 89, 10, 0], ['jelly', .91, .41, 69, 9, 0],
      ['clown', .20, .30, 100, 27, .12], ['clown', .83, .16, 80, 29, 2.9],
      ['tang', .55, .48, 105, 31, -.24], ['tang', .15, .79, 79, 25, -2.8]
    ];
    animals = specs.map(([kind,x,y,size,speed,angle], i) => ({
      kind, x:x*w, y:y*h, size:size*(mobile?.64:1), speed, angle, phase:i*1.73, turn:0, id:i, depth:rand(.78,1)
    }));
    for (let i=0; i<(mobile?5:9); i++) animals.push({kind:'shoal',x:w*(.60+i*.025),y:h*(.76+Math.sin(i*1.8)*.037),size:rand(28,40)*(mobile?.78:1),speed:37,angle:-2.9,phase:i*.9,id:8+i,depth:.75});
    const scale=clamp(Math.min(w,h)/780,.8,1.35)*(mobile?.78:1);
    for(const a of animals) {
      a.size=(a.kind==='ray'?235:a.kind==='turtle'?155:a.kind==='jelly'?120:a.kind==='shoal'?rand(42,57):a.kind==='clown'?190:175)*scale;
      a.cruise=a.speed; a.velocity=a.speed; a.turn=0; a.wander=0; a.phase=rand(0,TAU); a.depth=.85;
      a.spine=Array.from({length:18},(_,i)=>({x:a.x-Math.cos(a.angle)*a.size*i/21,y:a.y-Math.sin(a.angle)*a.size*i/21}));
    }
    school.x=w*.72;school.y=h*.65;
    counter.textContent = String(animals.length).padStart(2,'0');
  }

  function measure() {
    const rect = root.getBoundingClientRect();
    avoid = [...root.querySelectorAll('[data-aq-avoid]')].map(el => {
      const r=el.getBoundingClientRect();
      return {left:r.left-rect.left-18,top:r.top-rect.top-15,right:r.right-rect.left+18,bottom:r.bottom-rect.top+15};
    });
  }
  function resize() {
    const oldW=w, oldH=h;
    w=root.clientWidth; h=root.clientHeight;
    dpr=Math.min(devicePixelRatio||1,2);
    cell=w<760?6:clamp(Math.round(w/155),8,11);
    cols=Math.ceil(w/cell); rows=Math.ceil(h/cell);
    canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
    buffer.width=cols; buffer.height=rows;
    energy=new Float32Array(cols*rows); nextEnergy=new Float32Array(cols*rows);
    if (!animals.length) spawn();
    else for (const a of animals) {
      a.x=a.x/oldW*w;a.y=a.y/oldH*h;
      for(const n of a.spine){n.x=n.x/oldW*w;n.y=n.y/oldH*h;}
      if((oldW<760)!==(w<760)) a.size*=w<760?(a.kind==='shoal'?.78:.64):1/(a.kind==='shoal'?.78:.64);
    }
    measure(); draw();
  }

  function feed(x,y) {
    if (pellets.length>35) return;
    for(let i=0;i<6;i++) pellets.push({x:x+rand(-22,22),y:y+rand(-17,17),life:13,phase:rand(0,TAU)});
    rings.push({x,y,age:0});
    if(paused) draw();
  }

  function step(dt) {
    time+=dt;pointer.speed*=Math.exp(-dt*5);
    school.x=w*(.54+.28*Math.sin(time*.065+.7));
    school.y=h*(.48+.24*Math.sin(time*.09));
    for(const a of animals) {
      if(a.kind==='jelly') {
        const pulse=Math.max(0,Math.sin(time*1.7+a.phase));
        const targetY=h*(.35+.19*Math.sin(time*.08+a.phase));
        a.y+=(targetY-a.y)*dt*.035-dt*(pulse-.3)*12;
        a.x+=Math.sin(time*.24+a.phase)*dt*7+(w*.65-a.x)*dt*.008;
        continue;
      }
      a.wander+=(Math.sin(time*.53+a.phase)*.45+Math.sin(time*1.17+a.id)*.18-a.wander*.55)*dt;
      let vx=Math.cos(a.angle+a.wander*.8),vy=Math.sin(a.angle+a.wander*.8);
      let food=null,nearest=Math.max(a.size*2,350);
      if(a.kind!=='ray')for(const p of pellets) {
        if(p.life<=0)continue;
        const distance=Math.hypot(p.x-a.x,p.y-a.y);
        if(distance<nearest){nearest=distance;food=p;}
      }
      if(food) {
        vx+=(food.x-a.x)/Math.max(nearest,1)*3;vy+=(food.y-a.y)/Math.max(nearest,1)*3;
        if(nearest<cell*2){food.life=0;rings.push({x:food.x,y:food.y,age:0});}
      } else if(a.kind==='shoal') {
        const dx=school.x-a.x,dy=school.y-a.y,d=Math.hypot(dx,dy)||1;
        vx+=dx/d*1.4;vy+=dy/d*1.4;
      } else if(pointer.active&&pointer.speed<600) {
        const dx=pointer.x-a.x,dy=pointer.y-a.y,d=Math.hypot(dx,dy)||1;
        if(d<250&&d>70){vx+=dx/d*.3;vy+=dy/d*.3;}
      }
      let flee=false;
      if(pointer.active&&pointer.speed>850) {
        const dx=a.x-pointer.x,dy=a.y-pointer.y,d=Math.hypot(dx,dy)||1;
        if(d<a.size*1.2){vx+=dx/d*3;vy+=dy/d*3;flee=true;}
      }
      // Look ahead before reaching the wall; steer continuously instead of clamping positions.
      const look=a.size*.65+a.velocity*1.5,px=a.x+Math.cos(a.angle)*look,py=a.y+Math.sin(a.angle)*look;
      const margin=65;
      vx+=clamp((margin-px)/100,0,3)-clamp((px-w+margin)/100,0,3);
      vy+=clamp((90-py)/100,0,3)-clamp((py-h+80)/100,0,3);
      for(const b of animals) {
        if(a===b||b.kind==='jelly')continue;
        const dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy)||1;
        const range=(a.size+b.size)*(a.kind==='shoal'&&b.kind==='shoal'?.17:.45);
        if(d<range){vx+=dx/d*(1-d/range)*1.6;vy+=dy/d*(1-d/range)*1.6;}
        if(a.kind==='shoal'&&b.kind==='shoal'&&d<160){vx+=Math.cos(b.angle)*.1;vy+=Math.sin(b.angle)*.1;}
      }
      const desired=Math.atan2(vy,vx),maxTurn=(a.kind==='ray'?.52:a.kind==='turtle'?.62:1.05);
      const angular=clamp(angleDelta(a.angle,desired)*1.5,-maxTurn,maxTurn);
      a.turn+=(angular-a.turn)*Math.min(1,dt*3);
      a.angle+=a.turn*dt;
      const burst=1+Math.pow(Math.max(0,Math.sin(time*.65+a.phase)),5)*.55;
      const targetSpeed=a.cruise*burst*(food?1.6:flee?2:1)*(w<760?.8:1);
      a.velocity+=(targetSpeed-a.velocity)*dt*1.4;
      a.phase+=dt*(1.8+a.velocity/a.size*5);
      a.depth=.87+.11*Math.sin(time*.13+a.id*1.3);
      a.x+=Math.cos(a.angle)*a.velocity*dt;a.y+=Math.sin(a.angle)*a.velocity*dt;
      // A constrained spine remembers the path through a turn.
      a.spine[0].x=a.x;a.spine[0].y=a.y;
      let back=a.angle+Math.PI;
      const spacing=a.size*.84/(a.spine.length-1);
      for(let i=1;i<a.spine.length;i++) {
        const prev=a.spine[i-1],n=a.spine[i];
        const raw=Math.atan2(n.y-prev.y,n.x-prev.x);
        back+=clamp(angleDelta(back,raw),-.19,.19);
        n.x=prev.x+Math.cos(back)*spacing;n.y=prev.y+Math.sin(back)*spacing;
      }
      const tail=a.spine[a.spine.length-1],ix=Math.floor(tail.x/cell),iy=Math.floor(tail.y/cell);
      if(ix>=0&&ix<cols&&iy>=0&&iy<rows)energy[iy*cols+ix]=Math.min(1.5,energy[iy*cols+ix]+.24);
    }
    for(const p of pellets){p.life-=dt;p.y+=dt*2;p.x+=Math.sin(time+p.phase)*dt*2;}
    pellets=pellets.filter(p=>p.life>0);
    for(const r of rings)r.age+=dt;
    rings=rings.filter(r=>r.age<3);
    for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++) {
      const i=y*cols+x;
      nextEnergy[i]=(energy[i]*.70+(energy[i-1]+energy[i+1]+energy[i-cols]+energy[i+cols])*.075)*.985;
    }
    [energy,nextEnergy]=[nextEnergy,energy];
  }

  function ellipse(x,y,rx,ry,color) {
    pen.fillStyle=color;pen.beginPath();pen.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,TAU);pen.fill();
  }
  function path(points,color) {
    pen.fillStyle=color;pen.beginPath();pen.moveTo(...points[0]);for(let i=1;i<points.length;i++)pen.lineTo(...points[i]);pen.closePath();pen.fill();
  }
  function curve(points,color,width=1) {
    pen.strokeStyle=color;pen.lineWidth=width;pen.beginPath();pen.moveTo(...points[0]);
    for(let i=1;i<points.length;i++)pen.lineTo(...points[i]);pen.stroke();
  }
  function swimmingFish(a) {
    const small=a.kind==='shoal',clown=a.kind==='clown',N=a.spine.length;
    const centers=a.spine.map((n,i)=>{
      const t=i/(N-1),prev=a.spine[Math.max(0,i-1)],next=a.spine[Math.min(N-1,i+1)];
      const heading=Math.atan2(prev.y-next.y,prev.x-next.x);
      const wave=Math.sin(a.phase-t*5.6)*a.size*.055*t*t;
      return {x:n.x-Math.sin(heading)*wave,y:n.y+Math.cos(heading)*wave,heading};
    });
    const width=t=>a.size*(small?.105:clown?.155:.18)*Math.pow(Math.sin(Math.PI*clamp(t*.98+.018,0,1)),.72)*(1-.58*t);
    function at(t,v=0) {
      const f=clamp(t,0,1)*(N-1),i=Math.min(N-2,Math.floor(f)),u=f-i,p=centers[i],q=centers[i+1];
      const angle=p.heading+angleDelta(p.heading,q.heading)*u;
      return [p.x+(q.x-p.x)*u-Math.sin(angle)*v,p.y+(q.y-p.y)*u+Math.cos(angle)*v];
    }
    function strip(start,end,color,extent=1) {
      const pts=[];
      for(let j=0;j<=20;j++){const t=start+(end-start)*j/20;pts.push(at(t,width(t)*extent));}
      for(let j=20;j>=0;j--){const t=start+(end-start)*j/20;pts.push(at(t,-width(t)*extent));}
      path(pts,color);
    }
    pen.save();pen.setTransform(1/cell,0,0,1/cell,0,0);pen.globalAlpha=a.depth;
    // Paired pectoral fins fan through each stroke.
    for(const side of [-1,1]) {
      const flare=.85+Math.sin(a.phase+side*.6)*.20-a.turn*side*.13;
      path([at(.30,width(.30)*side*.65),at(.44,a.size*.27*side*flare),at(.62,a.size*.17*side),at(.48,width(.48)*side*.6)],clown?'#b56745':small?'#6aa8a2':'#3e7195');
    }
    // A forked, translucent tail follows the last spine tangent.
    const tip=centers[N-1],heading=tip.heading,ca=Math.cos(heading),sa=Math.sin(heading),tailSwing=Math.sin(a.phase-5)*.055*a.size;
    const tailPoint=(x,y)=>[tip.x+ca*x-sa*y,tip.y+sa*x+ca*y];
    path([at(.92,0),tailPoint(-a.size*.22,-a.size*.18+tailSwing),tailPoint(-a.size*.13,tailSwing),tailPoint(-a.size*.22,a.size*.18+tailSwing)],clown?'#ce895c':small?'#6ab0ac':'#dec075');
    strip(0,1,clown?'#d87839':small?'#75b9b4':'#397bb0');
    if(clown)for(const [start,end] of [[.17,.24],[.47,.55],[.77,.84]]) {
      strip(start-.018,end+.018,'#443c30');strip(start,end,'#e3dec8');
    }
    if(!clown&&!small){strip(.22,.73,'#223e64',.66);strip(.31,.61,'#5196c0',.30);}
    // Longitudinal light and subtle scales follow the curved anatomy.
    curve(Array.from({length:24},(_,i)=>at(.08+i/25*.8,width(.08+i/25*.8)*-.35)),clown?'#f2bc7e':small?'#b4dfcf':'#81b9d3',a.size*.025);
    if(!small)for(let j=0;j<36;j++) {
      const t=.1+(j%12)*.065,side=Math.floor(j/12)-1,p=at(t,width(t)*side*.63);
      ellipse(p[0],p[1],a.size*.006,a.size*.006,clown?'#f4bf89':'#93bfd0');
    }
    for(const side of [-1,1]) {
      const eye=at(.10,width(.10)*side*.75);
      ellipse(...eye,a.size*(small?.027:.023),a.size*(small?.027:.023),'#15252b');
      ellipse(eye[0]-a.size*.005,eye[1]-a.size*.005,a.size*.008,a.size*.008,'#e7e4cc');
    }
    pen.restore();
  }
  function ray(a) {
    const flap=Math.sin(time*1.15+a.phase),wing=.72+flap*.13;
    const tail=[];
    for(let i=0;i<24;i++){const t=i/23;tail.push([-.29-t*.92,Math.sin(t*4-time*1.6+a.phase)*.10*t*t-a.turn*t*.07]);}
    curve(tail,'#7f989d',.022);
    const gradient=pen.createLinearGradient(0,-wing,0,wing);
    gradient.addColorStop(0,'#506e7a');gradient.addColorStop(.4,'#a5b6bb');gradient.addColorStop(.6,'#c3ccc7');gradient.addColorStop(1,'#536d78');
    pen.fillStyle=gradient;pen.beginPath();pen.moveTo(.36,-.09);
    pen.bezierCurveTo(.13,-.20,.13,-.58,-.04,-wing);
    pen.bezierCurveTo(-.17,-wing*.7,-.40,-.29,-.41,-.08);
    pen.quadraticCurveTo(-.52,0,-.41,.08);
    pen.bezierCurveTo(-.40,.29,-.17,wing*.7,-.04,wing);
    pen.bezierCurveTo(.13,.58,.13,.20,.36,.09);
    pen.quadraticCurveTo(.44,0,.36,-.09);pen.fill();
    // Curved leading edges and the two cephalic lobes distinguish a manta from a diamond.
    for(const side of [-1,1]) {
      curve([[.28,side*.12],[.15,side*.25],[.07,side*.48],[-.04,side*wing]],'#b9cac7',.018);
      pen.fillStyle='#a7bdbb';pen.beginPath();pen.moveTo(.26,side*.06);
      pen.bezierCurveTo(.52,side*.19,.56,side*.08,.42,side*.055);
      pen.quadraticCurveTo(.35,side*.03,.26,side*.06);pen.fill();
      ellipse(.28,side*.13,.024,.022,'#263b41');
    }
    ellipse(-.01,0,.24,.11,'#8ca6ad');
    for(let i=0;i<34;i++) {
      const x=-.23+(i%7)*.067,y=Math.sin(i*13.37)*.25;
      ellipse(x,y,.009+(i%3)*.003,.009,'#d0d7cd');
    }
  }
  function turtle(a) {
    const flap=Math.sin(time*1.4+a.phase),flipper=.06*flap;
    for(const side of [-1,1]) {
      pen.fillStyle='#91ad83';pen.beginPath();pen.moveTo(.14,side*.16);
      pen.bezierCurveTo(.04,side*(.38+flipper),-.12,side*(.61+flipper),-.29,side*(.53+flipper));
      pen.quadraticCurveTo(-.13,side*.31,-.09,side*.19);pen.fill();
      path([[-.22,side*.16],[-.46,side*(.28-flipper)],[-.39,side*.10]],'#799b74');
      curve([[.02,side*.27],[-.10,side*.43],[-.22,side*.49]],'#bbca9a',.012);
    }
    path([[-.31,-.03],[-.48,0],[-.31,.03]],'#88a378');
    ellipse(.39,0,.15,.095,'#b0c49a');
    ellipse(.43,-.015,.09,.058,'#c1cfa5');
    ellipse(0,0,.365,.265,'#c6c79b');ellipse(-.015,0,.327,.231,'#3e6855');
    const plates=[[-.19,0],[-.03,0],[.13,0],[-.12,-.14],[.05,-.14],[-.12,.14],[.05,.14]];
    for(let i=0;i<plates.length;i++) {
      const [x,y]=plates[i];const points=[];
      for(let j=0;j<6;j++){const angle=j*TAU/6;points.push([x+Math.cos(angle)*.093,y+Math.sin(angle)*.079]);}
      path(points,i%2?'#88a472':'#779766');
      curve([[x-.05,y-.03],[x+.02,y-.04],[x+.05,y]],'#afbd89',.012);
    }
    for(const side of [-1,1]) {
      ellipse(.46,side*.052,.024,.022,'#253d37');ellipse(.466,side*.05,.008,.008,'#e4d8af');
      for(let i=0;i<5;i++)ellipse(.32+i*.025,side*(.045+(i%2)*.015),.009,.009,'#6c8c66');
    }
  }
  function jelly(a) {
    const phase=time*1.7+a.phase,pulse=1+Math.sin(phase)*.12;
    // The arms lag behind each bell contraction and bend in the water current.
    for(let j=0;j<10;j++) {
      const points=[],length=.85+(j%4)*.12,base=(j-4.5)*.054;
      for(let i=0;i<28;i++) {
        const t=i/27,flow=Math.sin(t*6-phase*1.1+j*.7)*.10*t;
        points.push([base+flow+Math.sin(time*.28+a.phase)*t*t*.19,.07+t*length]);
      }
      curve(points,j%3?'#bdb1d2':'#e3bdd4',j%3?.016:.027);
    }
    for(let j=0;j<4;j++) {
      const points=[];for(let i=0;i<20;i++){const t=i/19;points.push([(j-1.5)*.07+Math.sin(t*8-phase+j)*.04*t,.08+t*.65]);}
      curve(points,'#c6a1c7',.046);
    }
    const gradient=pen.createRadialGradient(-.07,-.13,.02,0,0,.43);
    gradient.addColorStop(0,'#ead5e4');gradient.addColorStop(.5,'#bca7cf');gradient.addColorStop(1,'#686b9a');
    pen.fillStyle=gradient;pen.beginPath();pen.ellipse(0,.04,.37*pulse,.32/pulse,0,Math.PI,TAU);
    pen.quadraticCurveTo(.22,.16,0,.11);pen.quadraticCurveTo(-.22,.16,-.37*pulse,.04);pen.fill();
    for(let j=-2;j<=2;j++) {
      pen.strokeStyle='#ddc8e0';pen.lineWidth=.012;pen.beginPath();pen.moveTo(0,-.24/pulse);
      pen.quadraticCurveTo(j*.11,-.13,j*.135*pulse,.065);pen.stroke();
    }
    const rim=[];for(let i=0;i<24;i++){const t=i/23;rim.push([(-.36+.72*t)*pulse,.045+Math.sin(t*Math.PI)*.05+Math.sin(t*TAU*5)*.013]);}
    curve(rim,'#f3d2e4',.028);
    for(let j=0;j<4;j++)ellipse(Math.cos(j*TAU/4)*.06,-.08+Math.sin(j*TAU/4)*.045,.025,.034,'#d8add0');
  }
  function drawCreatures() {
    pen.clearRect(0,0,cols,rows);
    for(const a of animals) {
      if(['clown','tang','shoal'].includes(a.kind)){swimmingFish(a);continue;}
      pen.save();pen.translate(a.x/cell,a.y/cell);pen.rotate(a.kind==='jelly'?Math.sin(time*.3+a.phase)*.13:a.angle);
      pen.scale(a.size/cell,a.size/cell);pen.globalAlpha=a.depth;
      if(a.kind==='ray')ray(a);else if(a.kind==='turtle')turtle(a);else if(a.kind==='jelly')jelly(a);
      pen.restore();
    }
  }
  function dimAt(x,y) {
    let dim=1;
    for(const r of avoid) {
      const distance=Math.hypot(Math.max(r.left-x,0,x-r.right),Math.max(r.top-y,0,y-r.bottom));
      const t=clamp(distance/45,0,1);dim=Math.min(dim,.23+.77*t*t*(3-2*t));
    }
    return dim;
  }
  function draw() {
    if(!w||!energy)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    ctx.font=`${Math.max(6,cell-2)}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    // Sparse drifting plankton and rising bubbles, all aligned to the same grid.
    ctx.fillStyle=day?'#557b78':'#669190';
    for(let i=0;i<75;i++) {
      const x=((i*137.57+Math.sin(time*.1+i)*18)%w+w)%w;
      const y=((i*83.31-time*(2+i%4))%h+h)%h;
      ctx.globalAlpha=(.10+(i%3)*.035)*dimAt(x,y);ctx.fillRect(Math.floor(x/cell)*cell,Math.floor(y/cell)*cell,1,1);
    }
    for(let i=0;i<energy.length;i++)if(energy[i]>.015) {
      const x=i%cols*cell,y=Math.floor(i/cols)*cell;
      ctx.globalAlpha=Math.min(.6,energy[i]*.85)*dimAt(x,y);
      const dx=(energy[i+1]||0)-(energy[i-1]||0),dy=(energy[i+cols]||0)-(energy[i-cols]||0);
      const glyph=energy[i]<.045?'.':Math.abs(dx)>Math.abs(dy)*2?'|':Math.abs(dy)>Math.abs(dx)*2?'-':dx*dy>0?'/':'\\';
      ctx.fillText(glyph,x+cell/2,y+cell/2);
    }
    drawCreatures();
    const pixels=pen.getImageData(0,0,cols,rows).data;
    const glyphs='.:s%xo8';
    for(let i=0;i<cols*rows;i++) {
      const p=i*4,alpha=pixels[p+3]/255;if(alpha<.09)continue;
      const x=i%cols*cell,y=Math.floor(i/cols)*cell;
      const grain=.79+((i*17%11)/11)*.21;
      const dim=dimAt(x,y);
      ctx.globalAlpha=alpha*grain*dim*.94;
      ctx.fillStyle=`rgb(${pixels[p]} ${pixels[p+1]} ${pixels[p+2]})`;
      if(alpha>.30)ctx.fillRect(x+.45,y+.45,cell-.9,cell-.9);
      ctx.globalAlpha=dim*(alpha>.30?.52:Math.min(.85,alpha*3));ctx.fillStyle=alpha>.30?(day?'#f0edda':'#15242a'):`rgb(${pixels[p]} ${pixels[p+1]} ${pixels[p+2]})`;
      ctx.fillText(glyphs[(i*13)%glyphs.length],x+cell/2,y+cell/2+.5);
    }
    ctx.fillStyle=day?'#805c22':'#d3b779';
    for(const p of pellets) {
      ctx.globalAlpha=Math.min(1,p.life)*.9;
      ctx.fillText('o',Math.floor(p.x/cell)*cell+cell/2,Math.floor(p.y/cell)*cell+cell/2);
    }
    ctx.fillStyle=day?'#527f7d':'#8bb8b1';
    for(const r of rings) {
      ctx.globalAlpha=(1-r.age/3)*.4;
      const radius=r.age*27+5;
      for(let a=0;a<TAU;a+=cell/Math.max(radius,1)*1.7) {
        const x=Math.floor((r.x+Math.cos(a)*radius)/cell)*cell;
        const y=Math.floor((r.y+Math.sin(a)*radius)/cell)*cell;
        ctx.fillText('·',x+cell/2,y+cell/2);
      }
    }
    ctx.globalAlpha=1;
  }
  function frame(now) {
    raf=0;if(paused||!visible||document.hidden)return;
    const dt=Math.min((now-last)/1000,.08);last=now;accumulator+=dt;
    let steps=0;while(accumulator>=1/60&&steps<5){step(1/60);accumulator-=1/60;steps++;}
    draw();raf=requestAnimationFrame(frame);
  }
  function schedule() {
    cancelAnimationFrame(raf);raf=0;last=performance.now();accumulator=0;
    if(!paused&&visible&&!document.hidden)raf=requestAnimationFrame(frame);
  }
  function syncPause() {
    pauseButton.setAttribute('aria-pressed',String(paused));pauseButton.textContent=paused?'▷ Resume':'Ⅱ Pause';
    root.querySelector('[data-state]').textContent=paused?'Still waters':'A little living ocean';schedule();
  }
  root.addEventListener('pointermove',e=>{
    const r=root.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    const elapsed=Math.max(16,e.timeStamp-pointer.last)/1000;
    pointer.speed=pointer.active?Math.min(2000,Math.hypot(x-pointer.x,y-pointer.y)/elapsed):0;
    pointer.x=x;pointer.y=y;pointer.last=e.timeStamp;pointer.active=true;
    const ix=Math.floor(x/cell),iy=Math.floor(y/cell);if(ix>=0&&ix<cols&&iy>=0&&iy<rows)energy[iy*cols+ix]=Math.min(1,energy[iy*cols+ix]+.25);
  },{passive:true});
  root.addEventListener('pointerleave',()=>{pointer.active=false;});
  root.addEventListener('click',e=>{
    if(e.target.closest('a,button')||window.getSelection()?.toString())return;
    const r=root.getBoundingClientRect();feed(e.clientX-r.left,e.clientY-r.top);
  });
  root.querySelector('[data-action="feed"]').addEventListener('click',()=>feed(w*.64,h*.43));
  pauseButton.addEventListener('click',()=>{paused=!paused;syncPause();});
  lightButton.addEventListener('click',()=>{day=!day;root.classList.toggle('aq-day',day);lightButton.setAttribute('aria-pressed',String(day));lightButton.textContent=day?'◐ Dim lights':'◑ Raise lights';draw();});
  document.addEventListener('visibilitychange',schedule);
  motion.addEventListener('change',()=>{paused=motion.matches;syncPause();});
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();},{threshold:0}).observe(root);
  new ResizeObserver(resize).observe(root);
  resize();syncPause();
})();
