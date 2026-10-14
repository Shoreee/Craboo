const hero = document.querySelector('.hero-intro');
const canvas = document.getElementById('hero-flow');
const cards = [...hero.querySelectorAll('.hero-card')];
const letters = [...hero.querySelectorAll('.hero-type-back span')];
const outlines = [...hero.querySelectorAll('.hero-type-front span')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const letterMotion = letters.map(() => ({ angle: 0, velocity: 0 }));
let phase = -.42;
let targetPhase = phase;
let ambient = 0;
let lastPointer = null;

const flowWidth = 72;
const flowHeight = 48;
let flowX = new Float32Array(flowWidth * flowHeight);
let flowY = new Float32Array(flowWidth * flowHeight);
let nextX = new Float32Array(flowX.length);
let nextY = new Float32Array(flowY.length);
const flowPixels = new Uint8Array(flowX.length * 4);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function stir(x, y, dx, dy) {
  const speed = Math.min(.12, Math.hypot(dx, dy));
  if (!speed) return;
  const reach = 8;
  const gx = x * flowWidth, gy = y * flowHeight;
  for (let j = Math.max(0, Math.floor(gy - reach)); j < Math.min(flowHeight, gy + reach); j++) {
    for (let i = Math.max(0, Math.floor(gx - reach)); i < Math.min(flowWidth, gx + reach); i++) {
      const rx = (i - gx) / reach, ry = (j - gy) / reach;
      const weight = Math.exp(-(rx * rx + ry * ry) * 2.7);
      const at = j * flowWidth + i;
      flowX[at] += (dx * 1.35 - ry * speed * .38) * weight;
      flowY[at] += (dy * 1.35 + rx * speed * .38) * weight;
    }
  }
}

function moveLetters(x, y, dx, dy) {
  letters.forEach((letter, index) => {
    const bounds = letter.getBoundingClientRect();
    const distance = Math.hypot(x - bounds.left - bounds.width / 2, y - bounds.top - bounds.height / 2);
    const proximity = Math.max(0, 1 - distance / Math.max(160, bounds.width * 1.5));
    letterMotion[index].velocity += clamp((dx * .022 - dy * .01) * proximity, -1.1, 1.1);
  });
}

hero.addEventListener('pointermove', (event) => {
  const bounds = hero.getBoundingClientRect();
  const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  const y = clamp(1 - (event.clientY - bounds.top) / bounds.height, 0, 1);
  if (lastPointer) {
    stir(x, y, x - lastPointer.x, y - lastPointer.y);
    moveLetters(event.clientX, event.clientY, event.clientX - lastPointer.clientX, event.clientY - lastPointer.clientY);
  }
  lastPointer = { x, y, clientX: event.clientX, clientY: event.clientY };
}, { passive: true });
hero.addEventListener('pointerleave', () => { lastPointer = null; });
hero.addEventListener('pointerdown', (event) => {
  const bounds = hero.getBoundingClientRect();
  stir((event.clientX - bounds.left) / bounds.width, 1 - (event.clientY - bounds.top) / bounds.height, .04, -.02);
});
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
    let y = .51 + (compact ? .21 : .235) * Math.sin(angle);
    if (x < .36 && y > .5) y -= (y - .5) * .8;
    const depth = Math.sin(angle);
    const scale = .85 + (depth + 1) * .08;
    card.style.transform = `translate(-50%,-50%) translate(${x * hero.clientWidth}px,${y * hero.clientHeight}px) rotate(${Math.sin(angle + .8) * 8}deg) scale(${scale})`;
    card.style.filter = `brightness(${.88 + (depth + 1) * .06})`;
  });
}
positionCards();
new ResizeObserver(positionCards).observe(hero);

function updateLetters() {
  letterMotion.forEach((motion, index) => {
    motion.velocity += -motion.angle * .075;
    motion.velocity *= .82;
    motion.angle = clamp(motion.angle + motion.velocity, -3.5, 3.5);
    const transform = `rotate(${motion.angle}deg) translateY(${Math.abs(motion.angle) * .3}px)`;
    letters[index].style.transform = transform;
    outlines[index].style.transform = transform;
  });
}

function sample(field, x, y) {
  x = clamp(x, 0, flowWidth - 1.001); y = clamp(y, 0, flowHeight - 1.001);
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = y0 * flowWidth + x0;
  return (field[at] * (1 - fx) + field[at + 1] * fx) * (1 - fy)
    + (field[at + flowWidth] * (1 - fx) + field[at + flowWidth + 1] * fx) * fy;
}

function advectFlow() {
  for (let y = 0; y < flowHeight; y++) {
    for (let x = 0; x < flowWidth; x++) {
      const at = y * flowWidth + x;
      const sx = x - flowX[at] * flowWidth * .42;
      const sy = y - flowY[at] * flowHeight * .42;
      nextX[at] = clamp(sample(flowX, sx, sy) * .958, -.12, .12);
      nextY[at] = clamp(sample(flowY, sx, sy) * .958, -.12, .12);
      flowPixels[at * 4] = Math.round(clamp(.5 + nextX[at] * 4, 0, 1) * 255);
      flowPixels[at * 4 + 1] = Math.round(clamp(.5 + nextY[at] * 4, 0, 1) * 255);
      flowPixels[at * 4 + 2] = 128;
      flowPixels[at * 4 + 3] = 255;
    }
  }
  [flowX, nextX] = [nextX, flowX];
  [flowY, nextY] = [nextY, flowY];
}

const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' });
if (gl) {
  const vert = `attribute vec2 a_position; void main(){gl_Position=vec4(a_position,0.,1.);}`;
  const frag = `precision highp float;
uniform vec2 u_resolution;
uniform float u_time,u_ambient;
uniform sampler2D u_flow;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(7.1,3.8);a*=.5;}return v;}
void main(){
 vec2 uv=gl_FragCoord.xy/u_resolution;
 vec2 velocity=(texture2D(u_flow,uv).rg-.5)*1.1;
 vec2 p=(uv-.5)*vec2(u_resolution.x/u_resolution.y,1.);
 vec2 q=p+velocity;
 float t=u_time*.11;
 float warp=fbm(q*1.25+vec2(t*.42,-t*.28));
 vec2 surface=q+vec2(warp-.5,fbm(q*1.3+vec2(-t*.24,t*.38))-.5)*.19;
 surface.x+=sin(surface.y*2.4+t*.55)*.045;
 float stream=fbm(vec2(surface.x*1.45+surface.y*.4,surface.y*1.8-surface.x*.25)+vec2(t*.18,-t*.13));
 stream+=sin(surface.x*3.9+surface.y*1.55+warp*2.9-t*.75)*.18;
 float amount=smoothstep(.46,.68,stream);
 vec2 dots=(surface+vec2(t*.045,-t*.017))*42.;
 float circle=length(fract(dots)-.5);
 float radius=mix(.025,.305,amount);
 float dot=1.-smoothstep(radius-.045,radius+.045,circle);
 vec3 paper=vec3(.994,.989,.980);
 vec3 cream=vec3(.95,.72,.49);
 vec3 blush=vec3(.96,.77,.68);
 vec3 pigment=mix(cream,blush,smoothstep(-.5,.5,sin(surface.y*2.5+t*.5))*.28);
 vec3 color=mix(paper,pigment,dot*amount*(.58+u_ambient*.15));
 color=mix(color,vec3(.98,.945,.90),amount*.035);
 gl_FragColor=vec4(clamp(color,0.,1.),1.);
}`;
  const shader = (type, source) => {
    const result = gl.createShader(type);
    gl.shaderSource(result, source); gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(result));
    return result;
  };
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
    const flowTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, flowTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, 'u_flow'), 0);
    const resolution = gl.getUniformLocation(program, 'u_resolution');
    const time = gl.getUniformLocation(program, 'u_time');
    const sound = gl.getUniformLocation(program, 'u_ambient');
    let last = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden || document.body.dataset.page !== 'home' || now - last < (reducedMotion ? 100 : 30)) return;
      last = now;
      phase += (targetPhase - phase) * .045;
      if (!reducedMotion) { phase += .00038; targetPhase += .00038; }
      ambient *= .98;
      positionCards();
      updateLetters();
      advectFlow();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, flowWidth, flowHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, flowPixels);
      const dpr = Math.min(devicePixelRatio, 1.25);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (width !== canvas.width || height !== canvas.height) {
        canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height);
      }
      gl.uniform2f(resolution, width, height);
      gl.uniform1f(time, now * .001);
      gl.uniform1f(sound, ambient);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    requestAnimationFrame(frame);
  } catch (error) { console.warn('Hero light effect unavailable', error); }
} else {
  hero.classList.add('hero-flow-fallback');
}
