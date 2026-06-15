import React, { useEffect, useRef } from 'react';

const BackgroundShader = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let animationFrameId;

        // Sync the WebGL drawing-buffer size with the CSS-driven layout size.
        function syncSize() {
            const w = canvas.clientWidth || 1280;
            const h = canvas.clientHeight || 720;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
        }
        
        let resizeObserver;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(syncSize);
            resizeObserver.observe(canvas);
        }
        syncSize();

        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return;
        
        const vs = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
        
        const fs = `precision highp float;
varying vec2 v_texCoord;
uniform float u_time;
uniform vec2 u_resolution;

float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = v_texCoord;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    // Deep space background gradient
    vec3 color1 = vec3(0.02, 0.03, 0.06); // Deep Navy
    vec3 color2 = vec3(0.05, 0.02, 0.08); // Deep Purple
    vec3 bg = mix(color1, color2, uv.y + sin(u_time * 0.2) * 0.1);

    // Subtle technical grid pulse
    float grid = abs(sin(uv.x * 40.0)) * abs(sin(uv.y * 40.0));
    grid = pow(grid, 0.1);
    bg += grid * 0.015 * (0.5 + 0.5 * sin(u_time));

    // Distant "data nodes" (slow moving particles)
    float particles = 0.0;
    for(float i = 1.0; i < 5.0; i++) {
        vec2 pos = vec2(noise(vec2(i, 1.0)), noise(vec2(i, 2.0)));
        pos = 0.5 + 0.4 * sin(u_time * 0.1 * i + pos * 6.28);
        float dist = length(uv - pos);
        particles += 0.001 / (dist * dist * 100.0);
    }
    bg += particles * vec3(0.5, 0.6, 1.0);

    // Vignette
    float vignette = length(p) * 0.5;
    bg *= 1.0 - vignette;

    gl_FragColor = vec4(bg, 1.0);
}`;

        function cs(type, src) {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            return s;
        }

        const prog = gl.createProgram();
        gl.attachShader(prog, cs(gl.VERTEX_SHADER, vs));
        gl.attachShader(prog, cs(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(prog);
        gl.useProgram(prog);
        
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        
        const pos = gl.getAttribLocation(prog, 'a_position');
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
        
        const uTime = gl.getUniformLocation(prog, 'u_time');
        const uRes = gl.getUniformLocation(prog, 'u_resolution');
        
        function render(t) {
            gl.viewport(0, 0, canvas.width, canvas.height);
            if (uTime) gl.uniform1f(uTime, t * 0.001);
            if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            animationFrameId = requestAnimationFrame(render);
        }
        
        render(0);

        return () => {
            cancelAnimationFrame(animationFrameId);
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
        };
    }, []);

    return (
        <canvas 
            ref={canvasRef} 
            style={{ display: 'block', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0 }} 
        />
    );
};

export default BackgroundShader;
