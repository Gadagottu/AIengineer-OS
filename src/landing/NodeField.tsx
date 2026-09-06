import { useEffect, useRef } from "react";

const MODULES = ["LEARN", "RESEARCH", "INTERVIEW", "PROFILE", "AGENTS", "OBSERVE"];

/**
 * The six disciplines, drawn as nodes that connect one by one into a single core.
 *
 * Canvas rather than SVG: it is a continuous animation over many elements, and it must
 * cost nothing when scrolled away -- the loop stops entirely when the section leaves
 * the viewport, and never starts under prefers-reduced-motion.
 */
export default function NodeField({ sparse = false }: { sparse?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!host || !canvas || !ctx) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let t = 0;
    let visible = false;

    const dust = Array.from({ length: sparse ? 26 : 44 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: 0.35 + Math.random() * 0.9,
      d: 0.00006 + Math.random() * 0.00016,
      p: Math.random() * Math.PI * 2,
    }));

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = host.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * (sparse ? 0.42 : 0.36);

      // Drifting dust gives the black ground depth without reading as "particles".
      dust.forEach((p) => {
        const y = (p.y + t * p.d * 40) % 1;
        ctx.beginPath();
        ctx.arc(p.x * w, y * h, p.s, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(124,139,130,${0.1 + Math.sin(t * 0.001 + p.p) * 0.07})`;
        ctx.fill();
      });

      const points = MODULES.map((label, i) => {
        const a = (i / MODULES.length) * Math.PI * 2 - Math.PI / 2;
        const breathe = still ? 0 : Math.sin(t * 0.0007 + i) * 7;
        return {
          label,
          x: cx + Math.cos(a) * (radius + breathe),
          y: cy + Math.sin(a) * (radius + breathe) * 0.74,
          // Each spoke charges in turn, so the graph assembles rather than just existing.
          on: still ? 1 : Math.min(1, Math.max(0, (t - 400 - i * 380) / 900)),
        };
      });

      points.forEach((p) => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(cx + (p.x - cx) * (1 - p.on), cy + (p.y - cy) * (1 - p.on));
        ctx.strokeStyle = `rgba(43,245,140,${0.1 + p.on * 0.2})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (!still && p.on >= 1) {
          // A charge travelling inward along a settled spoke.
          const k = ((t * 0.00035 + p.x * 0.004) % 1) ** 1.4;
          ctx.beginPath();
          ctx.arc(p.x + (cx - p.x) * k, p.y + (cy - p.y) * k, 1.7, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(92,225,230,.85)";
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(43,245,140,${0.35 + p.on * 0.65})`;
        ctx.fill();

        if (!sparse) {
          ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
          ctx.textAlign = "center";
          ctx.fillStyle = `rgba(232,239,234,${0.22 + p.on * 0.5})`;
          ctx.fillText(p.label, p.x, p.y - 13);
        }
      });

      const core = still ? 1 : Math.min(1, Math.max(0, (t - 2600) / 1100));
      ctx.beginPath();
      ctx.arc(cx, cy, 5 + core * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(43,245,140,${0.4 + core * 0.6})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 16 + core * 12 + (still ? 0 : Math.sin(t * 0.0016) * 3), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(43,245,140,${0.1 + core * 0.22})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (!sparse && core > 0.2) {
        ctx.font = '600 11px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(43,245,140,${(core - 0.2) * 1.1})`;
        ctx.fillText("AI ENGINEER OS", cx, cy + 38);
      }
    };

    const frame = () => {
      t += 16;
      draw();
      raf = requestAnimationFrame(frame);
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(host);

    // Only animate while on screen; a landing page has many of these below the fold.
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible && !raf && !still) raf = requestAnimationFrame(frame);
        if ((!visible || still) && raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        if (still) draw();
      },
      { threshold: 0.01 },
    );
    io.observe(host);
    draw();

    return () => {
      io.disconnect();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sparse]);

  return (
    <div className={`node-field${sparse ? " node-field--sparse" : ""}`} ref={hostRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
