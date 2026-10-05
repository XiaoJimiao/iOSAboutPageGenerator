/* The back control samples an actual render of the phone page.  Only its edge
   bends those pixels; the center stays clear like a transparent lens. */
(() => {
  const canvas = document.querySelector("#phone-glass-canvas");
  const button = document.querySelector("#phone-back");
  const root = document.documentElement;
  const vertex = `#version 300 es
    in vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;
  const fragment = `#version 300 es
    precision highp float;
    uniform sampler2D u_scene;
    uniform vec2 u_resolution;
    uniform vec2 u_center;
    uniform float u_radius;
    uniform float u_pressure;
    uniform vec2 u_tether;
    out vec4 outputColor;

    void main() {
      vec2 point = gl_FragCoord.xy;
      vec2 delta = point - u_center;
      float pixel = u_resolution.x / 430.0;
      vec2 normal = normalize(delta + vec2(0.0001));
      float pull = min(1.0, length(u_tether) / (75.0 * pixel));
      float tail = pow(max(dot(normal, normalize(u_tether + vec2(0.0001))), 0.0), 4.0);
      float distanceToRim = length(delta) - u_radius - tail * pull * u_pressure * 5.0 * pixel;
      float cover = 1.0 - smoothstep(-1.15 * pixel, 1.15 * pixel, distanceToRim);
      float shade = (1.0 - cover) * 0.052 * exp(-max(distanceToRim, 0.0) / (5.0 * pixel));
      if (cover < 0.003) {
        outputColor = vec4(0.13, 0.15, 0.19, shade);
        return;
      }

      float glassWall = exp(-pow((distanceToRim + 3.7 * pixel) / (5.1 * pixel), 2.0));
      float innerRim = exp(-pow((distanceToRim + 0.4 * pixel) / (1.6 * pixel), 2.0));
      float bending = glassWall * (7.5 + 2.0 * u_pressure) * pixel;
      vec2 uv = clamp((point - normal * bending) / u_resolution, vec2(0.001), vec2(0.999));
      vec3 scene = texture(u_scene, uv).rgb;
      float light = max(dot(normal, normalize(vec2(-0.62, 0.78))), 0.0);
      float dark = max(dot(normal, normalize(vec2(0.67, -0.74))), 0.0);
      scene = mix(scene, vec3(1.0), min(0.40, innerRim * (0.10 + 0.22 * light)
                  + glassWall * (0.015 + 0.045 * light)));
      scene *= 1.0 - glassWall * (0.008 + 0.042 * dark);
      outputColor = vec4(scene, cover);
    }`;

  function shader(gl, type, source) {
    const part = gl.createShader(type);
    gl.shaderSource(part, source);
    gl.compileShader(part);
    if (!gl.getShaderParameter(part, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(part));
    return part;
  }

  let gl, program, texture, uniforms;
  try {
    gl = canvas.getContext("webgl2", {alpha:true, antialias:true, premultipliedAlpha:false, preserveDrawingBuffer:true});
    if (!gl) throw new Error("WebGL2 unavailable");
    program = gl.createProgram();
    gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
                               [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) {
      gl.texParameteri(gl.TEXTURE_2D, key, value);
    }
    uniforms = {
      scene:gl.getUniformLocation(program, "u_scene"),
      resolution:gl.getUniformLocation(program, "u_resolution"),
      center:gl.getUniformLocation(program, "u_center"),
      radius:gl.getUniformLocation(program, "u_radius"),
      pressure:gl.getUniformLocation(program, "u_pressure"),
      tether:gl.getUniformLocation(program, "u_tether")
    };
    gl.uniform1i(uniforms.scene, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  } catch (error) {
    console.warn("Phone lens is using its CSS fallback:", error);
    window.PhoneGlass = {requestBackdrop() {}, receiveBackdrop() {}, isReady:() => false,
                         cancelPress() {}, getState:() => ({tetherX:0,tetherY:0,pressure:0})};
    return;
  }

  const glass = {
    ready:false, pointerId:null, startX:0, startY:0, dragged:false,
    x:0, y:0, targetX:0, targetY:0,
    pressure:0, targetPressure:0, requestTimer:null, lastTime:0, framePending:false
  };
  const anchor = {x:41, y:81};

  function requestFrame() {
    if (glass.framePending || !glass.ready) return;
    glass.framePending = true;
    requestAnimationFrame(frame);
  }

  function requestBackdrop(delay=140) {
    if (window.parent === window) return;
    clearTimeout(glass.requestTimer);
    glass.requestTimer = setTimeout(() => {
      window.parent.postMessage({source:"about-phone", type:"glass-backdrop"}, "*");
    }, delay);
  }

  function receiveBackdrop(url) {
    const image = new Image();
    image.onload = () => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      glass.ready = true;
      root.classList.add("phone-glass-ready");
      requestFrame();
    };
    image.src = url;
  }

  function cancelPress() {
    glass.pointerId = null;
    glass.targetX = 0;
    glass.targetY = 0;
    glass.targetPressure = 0;
    button.classList.remove("pressed");
    if (glass.dragged) button.dataset.dragged = "true";
    requestFrame();
  }

  function release(event) {
    if (event.pointerId !== glass.pointerId) return;
    cancelPress();
  }

  button.addEventListener("pointerdown", (event) => {
    glass.pointerId = event.pointerId;
    glass.startX = event.clientX;
    glass.startY = event.clientY;
    glass.dragged = false;
    glass.targetPressure = 1;
    button.dataset.dragged = "false";
    requestFrame();
  });
  const move = (event) => {
    if (glass.pointerId === null) return;
    if ("pointerId" in event && event.pointerId !== glass.pointerId && event.buttons !== 1) return;
    const dx = event.clientX - glass.startX;
    const dy = event.clientY - glass.startY;
    if (Math.hypot(dx, dy) > 6) glass.dragged = true;
    const distance = Math.hypot(dx, dy);
    const limit = Math.min(1, 80 / Math.max(1, distance));
    glass.targetX = dx * limit;
    glass.targetY = dy * limit;
    requestFrame();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("mousemove", move);
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  button.addEventListener("click", (event) => {
    if (button.dataset.dragged === "true") {
      event.preventDefault();
      event.stopImmediatePropagation();
      button.dataset.dragged = "false";
    }
  }, true);
  document.querySelector("#phone-scroll").addEventListener("scroll", () => requestBackdrop(180), {passive:true});

  function frame(now) {
    glass.framePending = false;
    const dt = Math.min(2.5, Math.max(0.45, (now - (glass.lastTime || now)) / 16.67));
    glass.lastTime = now;
    const follow = 1 - Math.pow(0.38, dt);
    glass.x += (glass.targetX - glass.x) * follow;
    glass.y += (glass.targetY - glass.y) * follow;
    glass.pressure += (glass.targetPressure - glass.pressure) * (1 - Math.pow(0.45, dt));

    if (glass.ready) {
      const dpr = Math.min(3.2, Math.max(1, window.devicePixelRatio || 1));
      const width = Math.round(430 * dpr), height = Math.round(935 * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform2f(uniforms.center, anchor.x * dpr, (935 - anchor.y) * dpr);
      gl.uniform1f(uniforms.radius, 22 * (1 + glass.pressure * 0.035) * dpr);
      gl.uniform1f(uniforms.pressure, glass.pressure);
      gl.uniform2f(uniforms.tether, glass.x * dpr, -glass.y * dpr);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (Math.abs(glass.x - glass.targetX) > .02 || Math.abs(glass.y - glass.targetY) > .02 ||
        Math.abs(glass.pressure - glass.targetPressure) > .005) requestFrame();
  }
  window.PhoneGlass = {requestBackdrop, receiveBackdrop, cancelPress, isReady:() => glass.ready,
                       getState:() => ({tetherX:glass.x,tetherY:glass.y,pressure:glass.pressure,
                                        centerX:anchor.x,centerY:anchor.y})};
  requestBackdrop(300);
})();
