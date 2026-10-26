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
  const pointer = { x: -1000, y: -1000 };
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const angleDelta = (a, b) => Math.atan2(Math.sin(b-a), Math.cos(b-a));
  const palette = { clown: '#e99754', tang: '#699ac8', turtle: '#91ae78', ray: '#93afbd', jelly: '#ba9fc9', shoal: '#7fccc1' };

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
    cell=w<760?6:8;
    cols=Math.ceil(w/cell); rows=Math.ceil(h/cell);
    canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
    buffer.width=cols; buffer.height=rows;
    energy=new Float32Array(cols*rows); nextEnergy=new Float32Array(cols*rows);
    if (!animals.length) spawn();
    else for (const a of animals) {
      a.x=a.x/oldW*w;a.y=a.y/oldH*h;
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
    time+=dt;
    for(const a of animals) {
      let target=a.angle+Math.sin(time*.47+a.phase)*.017;
      if(a.kind==='jelly') {
        a.y-=a.speed*dt*(.7+.5*Math.sin(time*1.8+a.phase));
        a.x+=Math.sin(time*.32+a.phase)*dt*6;
        if(a.y < -a.size*1.6) {a.y=h+a.size; a.x=rand(.12,.92)*w;}
        continue;
      }
      if(a.kind==='shoal') target=-2.9+Math.sin(time*.3)*.6;
      let food=null, nearest=430;
      if(a.kind!=='ray') for(const p of pellets) {
        const distance=Math.hypot(p.x-a.x,p.y-a.y);
        if(distance<nearest){nearest=distance;food=p;}
      }
      if(food) {
        target=Math.atan2(food.y-a.y,food.x-a.x);
        if(nearest<a.size*.35) {food.life=0;rings.push({x:food.x,y:food.y,age:.4});}
      }
      const margin=a.size*.65;
      let forceX=0,forceY=0;
      if(a.x<margin) forceX+=(margin-a.x)/margin;
      if(a.x>w-margin) forceX-=(a.x-w+margin)/margin;
      if(a.y<100+margin) forceY+=(100+margin-a.y)/margin;
      if(a.y>h-70-margin) forceY-=(a.y-h+70+margin)/margin;
      for(const b of animals) {
        if(a===b || (a.kind==='shoal' && b.kind==='shoal')) continue;
        const dx=a.x-b.x,dy=a.y-b.y,dist=Math.hypot(dx,dy),range=(a.size+b.size)*.44;
        if(dist>0 && dist<range){forceX+=dx/dist*(1-dist/range)*.7;forceY+=dy/dist*(1-dist/range)*.7;}
      }
      if(Math.hypot(forceX,forceY)>.08) target=Math.atan2(Math.sin(target)+forceY*2,Math.cos(target)+forceX*2);
      const change=clamp(angleDelta(a.angle,target),-1.1*dt,1.1*dt);
      a.angle+=change;a.turn=change/dt;
      const speed=a.speed*(food?1.65:1)*(w<760?.76:1);
      a.x+=Math.cos(a.angle)*speed*dt;a.y+=Math.sin(a.angle)*speed*dt;
      a.x=clamp(a.x,-a.size*.3,w+a.size*.3);a.y=clamp(a.y,50,h-35);
      const ix=Math.floor((a.x-Math.cos(a.angle)*a.size*.5)/cell),iy=Math.floor((a.y-Math.sin(a.angle)*a.size*.5)/cell);
      if(ix>=0&&ix<cols&&iy>=0&&iy<rows) energy[iy*cols+ix]=Math.min(1,energy[iy*cols+ix]+.19);
    }
    for(const p of pellets){p.life-=dt;p.y+=dt*2;p.x+=Math.sin(time+p.phase)*dt*2;}
    pellets=pellets.filter(p=>p.life>0);
    for(const r of rings)r.age+=dt;
    rings=rings.filter(r=>r.age<3);
    for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++) {
      const i=y*cols+x;
      nextEnergy[i]=(energy[i]*.8+(energy[i-1]+energy[i+1]+energy[i-cols]+energy[i+cols])*.05)*.975;
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
  function fish(a) {
    const beat=Math.sin(time*4+a.phase),bend=beat*.055;
    const clown=a.kind==='clown';
    const base=clown?'#dc8343':'#467fae',light=clown?'#f5b16b':'#79b7d0',fin=clown?'#ad5b39':'#c6b569';
    // Head faces +x; tail and fins move independently of the body.
    path([[-.35,0],[-.76,-.25+bend],[-.69,bend],[-.76,.25+bend]],fin);
    path([[-.23,-.15],[-.02,-.37],[.18,-.19]],base);
    path([[-.15,.15],[-.30,.34+beat*.025],[.23,.16]],fin);
    ellipse(0,0,.47,clown?.235:.29,base);
    pen.save();pen.beginPath();pen.ellipse(0,0,.47,clown?.235:.29,0,0,TAU);pen.clip();
    ellipse(.03,-.11,.42,.12,light);
    if(clown) {
      for(const x of [-.25,.04,.29]) {
        pen.fillStyle='#383f3b';pen.fillRect(x-.058,-.4,.116,.8);
        pen.fillStyle='#e6e5ca';pen.fillRect(x-.035,-.4,.07,.8);
      }
    } else {
      path([[-.32,-.13],[.14,-.18],[.32,-.01],[-.13,.16],[-.30,.03]],'#253f65');
      ellipse(-.15,-.03,.11,.075,'#5b9cc6');
    }
    pen.restore();
    path([[.02,.05],[-.17,.15+beat*.05],[-.08,-.02]],light);
    ellipse(.34,-.065,.042,.042,'#17272b');ellipse(.353,-.08,.013,.013,'#e5eed8');
  }
  function ray(a) {
    const flap=Math.sin(time*1.8+a.phase),wing=.53+flap*.13;
    curve([[-.25,0],[-.7,.04],[-1.05,.10+Math.sin(time*2+a.phase)*.11]],'#788d94',.025);
    pen.fillStyle='#7c9ba8';pen.beginPath();pen.moveTo(.43,0);
    pen.bezierCurveTo(.25,-.15,.12,-wing,-.06,-wing);
    pen.bezierCurveTo(-.07,-.26,-.4,-.16,-.37,0);
    pen.bezierCurveTo(-.4,.16,-.07,.26,-.06,wing);
    pen.bezierCurveTo(.12,wing,.25,.15,.43,0);pen.fill();
    path([[.35,0],[.01,-.27],[-.17,0],[.01,.27]],'#9bb7bb');
    curve([[-.1,0],[.31,0]],'#b1c8c6',.018);
    ellipse(.24,-.085,.022,.022,'#20373d');ellipse(.24,.085,.022,.022,'#20373d');
    for(let i=0;i<10;i++)ellipse(-.12+Math.sin(i*7)*.2,Math.cos(i*4)*.17,.012,.012,'#c1d0c4');
  }
  function turtle(a) {
    const flap=Math.sin(time*2+a.phase)*.14;
    path([[.14,-.19],[.09,-.5-flap],[-.13,-.61-flap],[-.1,-.22]],'#88a67c');
    path([[.14,.19],[.09,.5+flap],[-.13,.61+flap],[-.1,.22]],'#88a67c');
    path([[-.25,-.17],[-.44,-.33+flap*.5],[-.43,-.11]],'#698d70');
    path([[-.25,.17],[-.44,.33-flap*.5],[-.43,.11]],'#698d70');
    ellipse(.4,0,.15,.105,'#a3b78a');
    ellipse(0,0,.36,.265,'#b0b68a');ellipse(-.015,0,.31,.225,'#4d7662');
    for(let row=-1;row<=1;row++)for(let col=-1;col<=1;col++) {
      const x=col*.17,y=row*.135;
      if(col*col+row*row<2)path([[x-.08,y],[x-.04,y-.06],[x+.04,y-.06],[x+.08,y],[x+.04,y+.06],[x-.04,y+.06]],'#7f9c70');
    }
    ellipse(.46,-.048,.019,.019,'#243936');ellipse(.46,.048,.019,.019,'#243936');
  }
  function jelly(a) {
    const pulse=1+Math.sin(time*2.1+a.phase)*.09;
    for(let j=0;j<7;j++) {
      const points=[];const length=.6+(j%3)*.16;
      for(let i=0;i<18;i++) {
        const t=i/17;points.push([(j-3)*.087+Math.sin(t*6-time*2+a.phase+j*.4)*.065*t,.1+t*length]);
      }
      curve(points,j%2?'#9e8fb7':'#c0a1ba',.024);
    }
    pen.fillStyle='#947aa8';pen.beginPath();pen.ellipse(0,.04,.38*pulse,.31/pulse,0,Math.PI,TAU);pen.quadraticCurveTo(.2,.17,0,.12);pen.quadraticCurveTo(-.2,.17,-.38*pulse,.04);pen.fill();
    pen.fillStyle='#c8b0ce';pen.beginPath();pen.ellipse(0,.01,.28*pulse,.24/pulse,0,Math.PI,TAU);pen.fill();
    ellipse(-.10,-.12,.065,.035,'#e1c6dd');
    curve([[-.33,.05],[-.16,.09],[0,.06],[.16,.09],[.33,.05]],'#ebc4d8',.025);
  }
  function shoal(a) {
    const wag=Math.sin(time*6+a.phase)*.07;
    path([[-.25,0],[-.65,-.22+wag],[-.60,.22+wag]],'#4d9f9f');
    ellipse(0,0,.45,.125,'#82bfbb');curve([[-.22,-.025],[.27,-.025]],'#b2ddce',.04);
    ellipse(.31,-.02,.035,.035,'#183a41');
  }
  function drawCreatures() {
    pen.clearRect(0,0,cols,rows);
    for(const a of animals) {
      pen.save();pen.translate(a.x/cell,a.y/cell);pen.rotate(a.kind==='jelly'?Math.sin(time*.3+a.phase)*.13:a.angle);
      pen.scale(a.size/cell,a.size/cell);pen.globalAlpha=a.depth;
      if(a.kind==='ray')ray(a);else if(a.kind==='turtle')turtle(a);else if(a.kind==='jelly')jelly(a);else if(a.kind==='shoal')shoal(a);else fish(a);
      pen.restore();
    }
  }
  function dimAt(x,y) {
    for(const r of avoid)if(x>r.left&&x<r.right&&y>r.top&&y<r.bottom)return .20;
    return 1;
  }
  function draw() {
    if(!w||!energy)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    ctx.font=`${Math.max(5,cell-3)}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    // Sparse drifting plankton and rising bubbles, all aligned to the same grid.
    ctx.fillStyle=day?'#557b78':'#669190';
    for(let i=0;i<75;i++) {
      const x=((i*137.57+Math.sin(time*.1+i)*18)%w+w)%w;
      const y=((i*83.31-time*(2+i%4))%h+h)%h;
      ctx.globalAlpha=(.10+(i%3)*.035)*dimAt(x,y);ctx.fillRect(Math.floor(x/cell)*cell,Math.floor(y/cell)*cell,1,1);
    }
    for(let i=0;i<energy.length;i++)if(energy[i]>.015) {
      const x=i%cols*cell,y=Math.floor(i/cols)*cell;
      ctx.globalAlpha=energy[i]*.6*dimAt(x,y);ctx.fillText(energy[i]>.12?':':'.',x+cell/2,y+cell/2);
    }
    drawCreatures();
    const pixels=pen.getImageData(0,0,cols,rows).data;
    const glyphs='.:+*o';
    for(let i=0;i<cols*rows;i++) {
      const p=i*4,alpha=pixels[p+3]/255;if(alpha<.09)continue;
      const x=i%cols*cell,y=Math.floor(i/cols)*cell;
      const grain=.86+((i*17%11)/11)*.14;
      const dim=dimAt(x,y);
      ctx.globalAlpha=alpha*grain*dim*(day?.83:.83);
      ctx.fillStyle=`rgb(${pixels[p]} ${pixels[p+1]} ${pixels[p+2]})`;
      ctx.fillRect(x+.55,y+.55,cell-1.1,cell-1.1);
      ctx.globalAlpha=alpha*dim*.34;ctx.fillStyle=day?'#f0edda':'#162c32';
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
        const y=Math.floor((r.y+Math.sin(a)*radius*.45)/cell)*cell;
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
    const r=root.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;
  },{passive:true});
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
