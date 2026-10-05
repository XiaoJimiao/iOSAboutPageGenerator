/* Pixel-sampled transparent glass. The Python host captures the UI beneath the
   lenses; WebGL refracts those actual pixels instead of painting a frosted fill. */
(() => {
  const vertexSource = `#version 300 es
  in vec2 a_position;
  void main(){ gl_Position = vec4(a_position,0.0,1.0); }`;

  const fragmentSource = `#version 300 es
  precision highp float;
  uniform sampler2D u_backdrop;
  uniform vec2 u_resolution;
  uniform int u_count;
  uniform vec4 u_rects[8];
  uniform vec4 u_states[8];
  out vec4 fragColor;

  float roundedBox(vec2 p,vec2 halfSize,float corner){
    vec2 q=abs(p)-halfSize+vec2(corner);
    return length(max(q,0.0))+min(max(q.x,q.y),0.0)-corner;
  }
  void main(){
    vec2 point=gl_FragCoord.xy;
    vec2 uv=point/u_resolution;
    vec4 result=vec4(0.0);
    for(int i=0;i<8;i++){
      if(i>=u_count) break;
      vec4 rect=u_rects[i];
      vec4 state=u_states[i];
      vec2 center=vec2(rect.x,u_resolution.y-rect.y);
      vec2 halfSize=rect.zw*0.5;
      vec2 p=point-center;
      if(abs(p.x)>halfSize.x+28.0||abs(p.y)>halfSize.y+28.0) continue;
      float corner=state.x;
      float pressure=state.y;
      float magnifier=state.z;
      float baseSdf=roundedBox(p,halfSize,corner);
      float angle=atan(p.y,p.x);
      float fluidWave=pressure*0.18*sin(angle*6.0);
      float sdf=baseSdf+fluidWave;
      float inside=1.0-smoothstep(-0.9,0.9,sdf);
      float shadow=(1.0-inside)*0.105*exp(-max(sdf,0.0)/8.0);
      if(shadow>result.a) result=vec4(vec3(0.18,0.21,0.26),shadow);
      if(inside<0.005) continue;

      float gradX=roundedBox(p+vec2(1.0,0.0),halfSize,corner)-roundedBox(p-vec2(1.0,0.0),halfSize,corner);
      float gradY=roundedBox(p+vec2(0.0,1.0),halfSize,corner)-roundedBox(p-vec2(0.0,1.0),halfSize,corner);
      vec2 normal=normalize(vec2(gradX,gradY)+vec2(0.00001));
      float innerLip=exp(-pow((sdf+5.2)/7.2,2.0));
      float bend=innerLip*(9.0+pressure*2.5+magnifier*4.0);
      vec2 refracted=uv-normal*bend/u_resolution;
      if(magnifier>0.5){
        float radius=max(1.0,min(halfSize.x,halfSize.y));
        float radial=clamp(length(p)/radius,0.0,1.0);
        float zoom=mix(1.54+pressure*0.03,1.015,smoothstep(0.48,1.0,radial));
        refracted=(center+p/zoom-normal*bend)/u_resolution;
      }
      refracted=clamp(refracted,vec2(0.001),vec2(0.999));
      float dispersion=magnifier*innerLip*0.45;
      vec2 split=normal*dispersion/u_resolution;
      vec3 scene=vec3(texture(u_backdrop,clamp(refracted+split,vec2(0.001),vec2(0.999))).r,
                      texture(u_backdrop,refracted).g,
                      texture(u_backdrop,clamp(refracted-split,vec2(0.001),vec2(0.999))).b);
      float lit=max(dot(normal,normalize(vec2(-0.53,0.85))),0.0);
      float dark=max(dot(normal,normalize(vec2(0.53,-0.85))),0.0);
      float brightRim=exp(-pow((sdf+1.0)/2.0,2.0));
      scene=mix(scene,vec3(1.0),clamp(innerLip*(0.025+0.12*lit)+brightRim*(0.12+0.20*lit),0.0,0.38));
      scene*=1.0-innerLip*(0.018+0.07*dark);
      scene=mix(scene,vec3(1.0),0.008);
      result=vec4(scene,inside);
    }
    fragColor=result;
  }`;

  function compile(gl, kind, source) {
    const shader = gl.createShader(kind);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  class LiquidRenderer {
    constructor() {
      this.canvas = null;
      this.gl = null;
      this.program = null;
      this.texture = null;
      this.bridge = null;
      this.lenses = [];
      this.ready = false;
      this.captureTimer = null;
      this.lastFrame = 0;
      this.frameRequested = false;
      this.interacting = false;
      this.status = "uninitialized";
    }

    init() {
      this.canvas = document.querySelector("#liquid-canvas");
      try {
        const gl = this.canvas.getContext("webgl2", {alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true});
        if (!gl) throw new Error("WebGL2 unavailable");
        const program = gl.createProgram();
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        this.gl = gl;
        this.program = program;
        this.uniforms = {
          backdrop:gl.getUniformLocation(program,"u_backdrop"),
          resolution:gl.getUniformLocation(program,"u_resolution"),
          count:gl.getUniformLocation(program,"u_count"),
          rects:gl.getUniformLocation(program,"u_rects[0]"),
          states:gl.getUniformLocation(program,"u_states[0]")
        };
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
        const location = gl.getAttribLocation(program,"a_position");
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D,this.texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        this.status = "waiting-for-backdrop";
      } catch (error) {
        console.error("Liquid Glass shader unavailable:",error);
        this.status = "fallback";
        this.installFallback();
        return;
      }

      this.lenses = [...document.querySelectorAll("[data-liquid]")].slice(0,8).map((element) => ({
        element,
        surface:element.querySelector(".magnifier-glass") || element,
        kind:element.dataset.liquidKind,
        x:0,y:0,anchorX:0,anchorY:0,offsetX:0,offsetY:0,
        vx:0,vy:0,scale:1,targetScale:1,
        pressure:0,targetPressure:0,pointerId:null,
        width:0,height:0,restX:null,restY:null
      }));
      this.lenses.forEach((lens) => this.installInteractions(lens));
      window.addEventListener("resize", () => this.scheduleCapture(180));
      document.querySelector(".inspector-scroll")?.addEventListener("scroll", () => this.scheduleCapture(260), {passive:true});
    }

    installFallback() {
      const magnifier = document.querySelector("#liquid-magnifier");
      if (!magnifier || magnifier.dataset.fallbackInstalled) return;
      magnifier.dataset.fallbackInstalled = "true";
      let startX, startY, offsetX = 0, offsetY = 0;
      magnifier.addEventListener("pointerdown", (event) => {
        magnifier.setPointerCapture(event.pointerId);
        startX = event.clientX - offsetX;
        startY = event.clientY - offsetY;
        magnifier.classList.add("dragging");
      });
      magnifier.addEventListener("pointermove", (event) => {
        if (!magnifier.hasPointerCapture(event.pointerId)) return;
        offsetX = event.clientX - startX;
        offsetY = event.clientY - startY;
        magnifier.style.transform = `translate(${offsetX}px,${offsetY}px)`;
      });
      for (const type of ["pointerup", "pointercancel"]) {
        magnifier.addEventListener(type, () => magnifier.classList.remove("dragging"));
      }
    }

    setBridge(bridge) {
      this.bridge = bridge;
      if (this.status === "fallback") return;
      this.scheduleCapture(120);
    }

    scheduleCapture(delay=180) {
      if (!this.bridge || this.status === "fallback") return;
      clearTimeout(this.captureTimer);
      this.captureTimer = setTimeout(() => {
        if (this.interacting) { this.scheduleCapture(280); return; }
        this.bridge.requestBackdrop();
      }, delay);
    }

    receiveBackdrop(dataUrl) {
      const image = new Image();
      image.onload = () => {
        const gl = this.gl;
        this.canvas.width = image.naturalWidth;
        this.canvas.height = image.naturalHeight;
        gl.viewport(0,0,this.canvas.width,this.canvas.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        this.ready = true;
        this.status = "refracting";
        document.documentElement.classList.add("shader-ready");
        document.documentElement.classList.remove("capture-mode");
        this.invalidate();
      };
      image.onerror = () => {
        this.status = "fallback";
        document.documentElement.classList.remove("capture-mode","shader-ready");
        this.installFallback();
      };
      image.src = dataUrl;
    }

    installInteractions(lens) {
      const element = lens.element;
      if (lens.kind === "magnifier") {
        element.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          element.setPointerCapture(event.pointerId);
          lens.pointerId = event.pointerId;
          lens.startX = event.clientX; lens.startY = event.clientY;
          lens.originX = lens.restX ?? lens.anchorX;
          lens.originY = lens.restY ?? lens.anchorY;
          lens.targetPressure = 1;
          lens.targetScale = 1.04;
          this.interacting = true;
          element.classList.add("dragging");
          this.invalidate();
        });
        const move = (event) => {
          if (lens.pointerId === null || ("pointerId" in event && lens.pointerId !== event.pointerId)) return;
          const dx = event.clientX - lens.startX;
          const dy = event.clientY - lens.startY;
          const root=element.getBoundingClientRect();
          const surface=lens.surface.getBoundingClientRect();
          const cx=surface.left+surface.width*.5, cy=surface.top+surface.height*.5;
          const leftReach=cx-root.left, rightReach=root.right-cx;
          const topReach=cy-root.top, bottomReach=root.bottom-cy;
          lens.pointerTargetX=Math.max(leftReach+12,Math.min(window.innerWidth-rightReach-12,lens.originX+dx));
          lens.pointerTargetY=Math.max(topReach+68,Math.min(window.innerHeight-bottomReach-12,lens.originY+dy));
          this.invalidate();
        };
        element.addEventListener("pointermove", move);
        window.addEventListener("pointermove", move);
        window.addEventListener("mousemove", move);
        const release = (event) => {
          if (lens.pointerId !== event.pointerId) return;
          lens.pointerId = null;
          lens.targetPressure = 0;
          lens.targetScale = 1;
          lens.restX = lens.pointerTargetX ?? lens.x;
          lens.restY = lens.pointerTargetY ?? lens.y;
          element.classList.remove("dragging");
          this.interacting = false;
          this.invalidate();
        };
        element.addEventListener("pointerup", release);
        element.addEventListener("pointercancel", release);
        element.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); });
      } else {
        element.addEventListener("pointerdown", () => { lens.targetPressure=1; lens.targetScale=1.035; this.invalidate(); });
        const release = () => { lens.targetPressure=0; lens.targetScale=1; this.invalidate(); };
        window.addEventListener("pointerup",release);
        window.addEventListener("pointercancel",release);
      }
    }

    step(lens, dt) {
      const rect = lens.surface.getBoundingClientRect();
      if (lens.kind === "magnifier") {
        lens.anchorX = rect.left+rect.width*.5-lens.offsetX;
        lens.anchorY = rect.top+rect.height*.5-lens.offsetY;
        if (!lens.x && !lens.y) { lens.x=lens.anchorX; lens.y=lens.anchorY; }
        if (lens.restX === null) { lens.restX=lens.anchorX; lens.restY=lens.anchorY; }
        const restX=lens.restX;
        const restY=lens.restY;
        const targetX = lens.pointerId === null ? restX : (lens.pointerTargetX ?? restX);
        const targetY = lens.pointerId === null ? restY : (lens.pointerTargetY ?? restY);
        const follow=1-Math.pow(.28,dt);
        const nextX=lens.x+(targetX-lens.x)*follow;
        const nextY=lens.y+(targetY-lens.y)*follow;
        lens.vx=(nextX-lens.x)/dt;
        lens.vy=(nextY-lens.y)/dt;
        lens.x=nextX;
        lens.y=nextY;
        lens.offsetX=lens.x-lens.anchorX;
        lens.offsetY=lens.y-lens.anchorY;
        lens.element.style.transform=`translate(${lens.offsetX}px,${lens.offsetY}px)`;
      } else {
        lens.x=rect.left+rect.width*.5;
        lens.y=rect.top+rect.height*.5;
      }
      lens.width=lens.surface.offsetWidth;
      lens.height=lens.surface.offsetHeight;
      lens.scale+=(lens.targetScale-lens.scale)*(1-Math.pow(.44,dt));
      lens.pressure += (lens.targetPressure-lens.pressure)*(1-Math.pow(.42,dt));
      if (lens.kind === "magnifier") lens.element.style.setProperty("--glass-scale",lens.scale.toFixed(3));
    }

    invalidate() {
      if (this.frameRequested || !this.ready) return;
      this.frameRequested = true;
      requestAnimationFrame((time) => this.draw(time));
    }

    draw(time) {
      this.frameRequested = false;
      if (!this.ready) return;
      const gl=this.gl;
      const dt=Math.min(2.2,Math.max(.1,(time-(this.lastFrame||time))/16.67));
      this.lastFrame=time;
      const sx=this.canvas.width/window.innerWidth, sy=this.canvas.height/window.innerHeight;
      const rects=new Float32Array(32),states=new Float32Array(32);
      let count=0;
      for (const lens of this.lenses) {
        if (lens.element.getClientRects().length===0) continue;
        this.step(lens,dt);
        if (lens.width<4 || lens.height<4 || getComputedStyle(lens.element).opacity === "0") continue;
        const shapeX=lens.width*lens.scale;
        const shapeY=lens.height*lens.scale;
        rects.set([lens.x*sx,lens.y*sy,shapeX*sx,shapeY*sy],count*4);
        const corner=lens.kind==="pill" ? 18 : Math.min(shapeX,shapeY)*.5;
        states.set([corner*Math.min(sx,sy),lens.pressure,lens.kind==="magnifier" ? 1 : 0,0],count*4);
        count++;
      }
      gl.useProgram(this.program);
      gl.viewport(0,0,this.canvas.width,this.canvas.height);
      gl.clearColor(0,0,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D,this.texture);
      gl.uniform1i(this.uniforms.backdrop,0);
      gl.uniform2f(this.uniforms.resolution,this.canvas.width,this.canvas.height);
      gl.uniform1i(this.uniforms.count,count);
      gl.uniform4fv(this.uniforms.rects,rects);
      gl.uniform4fv(this.uniforms.states,states);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      if (this.lenses.some((lens) => Math.abs(lens.scale-lens.targetScale)>.004 || Math.abs(lens.pressure-lens.targetPressure)>.004 || Math.hypot(lens.vx,lens.vy)>.06)) this.invalidate();
    }
  }

  window.LiquidGlass = new LiquidRenderer();
})();
