import type { WindowLevel } from '../dicom/types';
import { applyWindowLevel } from './windowLevel';

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_wl; // center, width
uniform float u_invert;
uniform float u_flipH;
uniform float u_flipV;
uniform float u_color;
uniform vec2 u_pan;
uniform float u_zoom;
uniform vec2 u_imageSize;
uniform vec2 u_canvasSize;
uniform vec2 u_pixelSpacing;
out vec4 outColor;

void main() {
  vec2 phys = u_imageSize * u_pixelSpacing;
  float fit = min(u_canvasSize.x / phys.x, u_canvasSize.y / phys.y);
  float mmScale = fit * u_zoom;
  vec2 draw = phys * mmScale;
  vec2 origin = (u_canvasSize - draw) * 0.5 + u_pan;
  vec2 mm = (v_uv * u_canvasSize - origin) / mmScale;
  vec2 pixel = mm / u_pixelSpacing;
  if (pixel.x < 0.0 || pixel.y < 0.0 || pixel.x >= u_imageSize.x || pixel.y >= u_imageSize.y) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  if (u_flipH > 0.5) pixel.x = u_imageSize.x - pixel.x;
  if (u_flipV > 0.5) pixel.y = u_imageSize.y - pixel.y;
  vec4 sample = texture(u_tex, (pixel + 0.5) / u_imageSize);
  if (u_color > 0.5) {
    outColor = vec4(sample.rgb, 1.0);
    return;
  }
  float x = sample.r;
  float c = u_wl.x - 0.5;
  float w = max(u_wl.y - 1.0, 1.0);
  float y;
  if (x <= c - 0.5 * w) y = 0.0;
  else if (x > c + 0.5 * w) y = 1.0;
  else y = ((x - c) / w + 0.5);
  if (u_invert > 0.5) y = 1.0 - y;
  outColor = vec4(y, y, y, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log ?? 'shader compile failed');
  }
  return sh;
}

function toFloat32Texture(pixels: Float32Array | Int16Array): Float32Array {
  if (pixels instanceof Float32Array) return pixels;
  const out = new Float32Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) out[i] = pixels[i];
  return out;
}

export type WebGlSliceRenderer = {
  draw: (opts: {
    pixels: Float32Array | Int16Array;
    width: number;
    height: number;
    windowLevel: WindowLevel;
    zoom: number;
    panX: number;
    panY: number;
    invert?: boolean;
    flipH?: boolean;
    flipV?: boolean;
    colorRgba?: Uint8ClampedArray;
    spacingCol?: number;
    spacingRow?: number;
  }) => void;
  resize: (cssWidth: number, cssHeight: number, dpr: number) => void;
  destroy: () => void;
  canvas: HTMLCanvasElement;
};

/**
 * WebGL2 R32F texture slice renderer with VOI LUT in-shader.
 */
export function createWebGlSliceRenderer(canvas: HTMLCanvasElement): WebGlSliceRenderer | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    return null;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Check float texture support
  const ext = gl.getExtension('EXT_color_buffer_float');
  void ext;

  const uTex = gl.getUniformLocation(prog, 'u_tex');
  const uWl = gl.getUniformLocation(prog, 'u_wl');
  const uInvert = gl.getUniformLocation(prog, 'u_invert');
  const uFlipH = gl.getUniformLocation(prog, 'u_flipH');
  const uFlipV = gl.getUniformLocation(prog, 'u_flipV');
  const uColor = gl.getUniformLocation(prog, 'u_color');
  const uPan = gl.getUniformLocation(prog, 'u_pan');
  const uZoom = gl.getUniformLocation(prog, 'u_zoom');
  const uImageSize = gl.getUniformLocation(prog, 'u_imageSize');
  const uCanvasSize = gl.getUniformLocation(prog, 'u_canvasSize');
  const uPixelSpacing = gl.getUniformLocation(prog, 'u_pixelSpacing');

  let texW = 0;
  let texH = 0;
  let texColor = false;
  let floatOk = true;

  // Probe R32F
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([0]));
  } catch {
    floatOk = false;
  }

  const grayScratch = { current: null as Uint8ClampedArray | null };

  return {
    canvas,
    resize(cssWidth, cssHeight, dpr) {
      canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
      canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    draw(opts) {
      const {
        pixels,
        width,
        height,
        windowLevel,
        zoom,
        panX,
        panY,
        invert,
        flipH,
        flipV,
        colorRgba,
        spacingCol = 1,
        spacingRow = 1,
      } = opts;
      const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      if (width > maxTex || height > maxTex) {
        throw new Error(`Image ${width}x${height} exceeds GPU texture limit ${maxTex}`);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindTexture(gl.TEXTURE_2D, tex);

      const useColor =
        !!colorRgba && colorRgba.length >= width * height * 4;

      if (useColor) {
        const rgba = colorRgba!.subarray(0, width * height * 4);
        if (width !== texW || height !== texH || !texColor) {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            width,
            height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            rgba,
          );
          texW = width;
          texH = height;
          texColor = true;
        } else {
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            width,
            height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            rgba,
          );
        }
      } else if (floatOk) {
        const floatPixels = toFloat32Texture(pixels);
        if (width !== texW || height !== texH || texColor) {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.R32F,
            width,
            height,
            0,
            gl.RED,
            gl.FLOAT,
            floatPixels,
          );
          texW = width;
          texH = height;
          texColor = false;
        } else {
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            width,
            height,
            gl.RED,
            gl.FLOAT,
            floatPixels,
          );
        }
      } else {
        // Fallback: upload 8-bit after CPU W/L (shader still applies identity-ish)
        if (!grayScratch.current || grayScratch.current.length !== pixels.length) {
          grayScratch.current = new Uint8ClampedArray(pixels.length);
        }
        applyWindowLevel(pixels, windowLevel, grayScratch.current);
        const rgba = new Uint8Array(width * height * 4);
        for (let i = 0; i < pixels.length; i++) {
          const v = grayScratch.current[i];
          rgba[i * 4] = v;
          rgba[i * 4 + 1] = v;
          rgba[i * 4 + 2] = v;
          rgba[i * 4 + 3] = 255;
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        texW = width;
        texH = height;
        texColor = true;
      }

      gl.uniform1i(uTex, 0);
      gl.uniform2f(uWl, windowLevel.windowCenter, windowLevel.windowWidth);
      gl.uniform1f(uInvert, invert ? 1 : 0);
      gl.uniform1f(uFlipH, flipH ? 1 : 0);
      gl.uniform1f(uFlipV, flipV ? 1 : 0);
      gl.uniform1f(uColor, useColor ? 1 : 0);
      gl.uniform2f(uPan, panX, panY);
      gl.uniform1f(uZoom, zoom);
      gl.uniform2f(uImageSize, width, height);
      gl.uniform2f(uCanvasSize, canvas.width, canvas.height);
      gl.uniform2f(
        uPixelSpacing,
        spacingCol > 0 ? spacingCol : 1,
        spacingRow > 0 ? spacingRow : 1,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    destroy() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
