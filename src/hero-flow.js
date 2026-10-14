const hero = document.querySelector('.hero-intro');
const canvas = document.getElementById('hero-flow');
const cards = [...hero.querySelectorAll('.hero-card')];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let phase = -.42;
let targetPhase = phase;
let mx = .5, my = .5, touch = 0, ambient = 0;

hero.addEventListener('pointermove', (event) => {
  const box = hero.getBoundingClientRect();
  mx = (event.clientX - box.left) / box.width;
  my = 1 - (event.clientY - box.top) / box.height;
  touch = Math.max(touch, .42);
}, { passive: true });
hero.addEventListener('pointerdown', () => { touch = 1; });
window.addEventListener('craboo:ambient', ({ detail }) => { ambient = Math.min(1, detail.level / 100); });
hero.querySelectorAll('[data-card-step]').forEach((button) => button.addEventListener('click', () => {
  targetPhase += Number(button.dataset.cardStep) * Math.PI / 3;
}));
cards.forEach((card, index) => {
  card.tabIndex = 0;
  const advance = () => { targetPhase += (index % 2 ? -1 : 1) * Math.PI / 3; };
  card.addEventListener('click', advance);
  card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); advance(); } });
});

function positionCards() {
  const compact = hero.clientWidth < 800;
  cards.forEach((card, index) => {
    const angle = phase + index * Math.PI / 3;
    const x = .5 + (compact ? .365 : .405) * Math.cos(angle);
    const y = .51 + (compact ? .21 : .235) * Math.sin(angle);
    const depth = Math.sin(angle);
    const scale = .85 + (depth + 1) * .08;
    card.style.transform = `translate(-50%,-50%) translate(${x * hero.clientWidth}px,${y * hero.clientHeight}px) rotate(${Math.sin(angle + .8) * 8}deg) scale(${scale})`;
    card.style.filter = `brightness(${.88 + (depth + 1) * .06})`;
  });
}
positionCards();
new ResizeObserver(positionCards).observe(hero);

const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' });
if (gl) {
  const vert = `attribute vec2 a_position; void main(){gl_Position=vec4(a_position,0.,1.);}`;
  const frag = `precision highp float;
uniform vec2 u_resolution,u_mouse;
uniform float u_time,u_touch,u_ambient;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(7.1,3.8);a*=.5;}return v;}
void main(){
 vec2 uv=gl_FragCoord.xy/u_resolution;
 vec2 p=(uv-.5)*vec2(u_resolution.x/u_resolution.y,1.);
 float t=u_time*.15;
 vec2 drift=vec2(fbm(p*2.2+vec2(t,-t*.38)),fbm(p*2.4+vec2(-t*.5,t*.8)))-.5;
 vec2 q=p+drift*.13;
 float lake=exp(-dot(q*vec2(.84,1.35),q*vec2(.84,1.35))*1.8);
 vec3 col=mix(vec3(.56,.47,.40),vec3(.84,.76,.67),smoothstep(-.75,.85,uv.y+drift.x*.35));
 col=mix(col,vec3(.89,.82,.73),lake*.58);
 float filament=sin(q.x*11.+q.y*3.+fbm(q*4.+t)*4.-t*2.6);
 filament+=.35*sin(q.y*18.-q.x*6.+t*2.);
 float light=pow(clamp(filament,0.,1.),11.)*exp(-abs(q.y)*1.5);
 col+=vec3(.27,.23,.17)*light*.32;
 float soft=sin(q.x*4.-q.y*5.+t*1.3+fbm(q*3.)*3.);
 col+=vec3(.14,.12,.10)*smoothstep(.58,1.,soft)*lake*.23;
 float d=length((uv-u_mouse)*vec2(u_resolution.x/u_resolution.y,1.));
 float ripple=sin(d*64.-u_time*5.)*exp(-d*11.)*u_touch;
 col+=vec3(.31,.27,.19)*max(0.,ripple);
 float centerRing=sin(length(q*vec2(.85,1.25))*43.-u_time*1.15+drift.x*4.);
 col+=vec3(.12,.11,.09)*pow(max(0.,centerRing),10.)*lake*(.48+u_ambient*.8);
 vec2 grid=uv*vec2(115.,80.)+drift*3.;vec2 cell=floor(grid),local=fract(grid)-.5;
 float sparkle=step(.987,hash(cell))*(1.-smoothstep(0.,.10,length(local)))*(.45+.55*sin(u_time*2.+hash(cell)*6.28));
 col+=vec3(.95,.87,.70)*sparkle*.35;
 gl_FragColor=vec4(clamp(col,0.,1.),1.);
}`;
  const shader = (type, source) => { const result = gl.createShader(type); gl.shaderSource(result, source); gl.compileShader(result); if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(result)); return result; };
  try {
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vert));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, 'u_resolution');
    const mouse = gl.getUniformLocation(program, 'u_mouse');
    const time = gl.getUniformLocation(program, 'u_time');
    const energy = gl.getUniformLocation(program, 'u_touch');
    const sound = gl.getUniformLocation(program, 'u_ambient');
    let last = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden || document.body.dataset.page !== 'home' || now-last < (reduced ? 100 : 30)) return;
      last = now;
      phase += (targetPhase - phase) * .045;
      if (!reduced) { phase += .00038; targetPhase += .00038; }
      touch *= .94; ambient *= .98;
      positionCards();
      const dpr = Math.min(devicePixelRatio, 1.25);
      const width = Math.max(1, Math.round(canvas.clientWidth*dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight*dpr));
      if (width !== canvas.width || height !== canvas.height) { canvas.width=width; canvas.height=height; gl.viewport(0,0,width,height); }
      gl.uniform2f(resolution,width,height);
      gl.uniform2f(mouse,mx,my);
      gl.uniform1f(time,now*.001);
      gl.uniform1f(energy,touch);
      gl.uniform1f(sound,ambient);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }
    requestAnimationFrame(frame);
  } catch (error) { console.warn('Hero light effect unavailable', error); }
} else {
  hero.classList.add('hero-flow-fallback');
}
